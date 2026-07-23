const express = require('express')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const jwt = require('jsonwebtoken')
const router = express.Router()
const User = require('../models/User')
const { sendErrorResponse } = require('../utils/errorHandler')

const getBearerToken = (req) => {
  const header = req.headers.authorization || ''
  const [type, token] = header.split(' ')
  if (type !== 'Bearer' || !token) return null
  return token
}

const requireAdmin = async (req, res, next) => {
  try {
    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ message: 'Unauthorized' })

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const userId = decoded?.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const user = await User.findById(userId)
    const roll = String(user?.roll || user?.role || 'user').toLowerCase()
    if (roll !== 'admin') return res.status(403).json({ message: 'Forbidden' })

    req.auth = { userId: String(userId) }
    return next()
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}

const getMongoDumpCommand = () => {
  const configured = process.env.MONGODUMP_PATH
  if (configured) return configured

  const candidates = [
    '/opt/homebrew/bin/mongodump',
    '/usr/local/bin/mongodump',
    'mongodump'
  ]

  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate)
      return true
    } catch {
      return false
    }
  }) || 'mongodump'
}

const getMongoRestoreCommand = () => {
  const configured = process.env.MONGORESTORE_PATH
  if (configured) return configured

  const candidates = [
    '/opt/homebrew/bin/mongorestore',
    '/usr/local/bin/mongorestore',
    'mongorestore'
  ]

  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate)
      return true
    } catch {
      return false
    }
  }) || 'mongorestore'
}

const runCommand = (command, args) => new Promise((resolve, reject) => {
  execFile(command, args, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
    if (error) {
      const message = stderr?.trim() || stdout?.trim() || error.message
      reject(new Error(message))
      return
    }
    resolve({ stdout, stderr })
  })
})

const formatSize = (size) => {
  if (typeof size !== 'number' || Number.isNaN(size)) return '0 KB'
  const kb = size / 1024
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

const getBackupRoot = () => {
  const projectRoot = path.resolve(__dirname, '..', '..')

  if (process.env.BACKUP_STORAGE_PATH) {
    const configuredPath = process.env.BACKUP_STORAGE_PATH.trim()
    return path.isAbsolute(configuredPath)
      ? path.resolve(configuredPath)
      : path.resolve(projectRoot, configuredPath)
  }

  return path.join(projectRoot, 'backups')
}

const getRetentionDays = () => {
  const retentionDays = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '8', 10)
  return Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 8
}

const getKeepLatestBackupsCount = () => {
  const keepLatestBackups = Number.parseInt(process.env.BACKUP_KEEP_LATEST_COUNT || '10', 10)
  return Number.isFinite(keepLatestBackups) && keepLatestBackups > 0 ? keepLatestBackups : 10
}

const pruneOldBackups = (backupRoot) => {
  if (!fs.existsSync(backupRoot)) return

  const files = fs.readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.archive\.gz$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(backupRoot, entry.name)
      const stats = fs.statSync(fullPath)
      return { entry, fullPath, mtimeMs: stats.mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  const keepLatestBackups = getKeepLatestBackupsCount()
  const filesToDelete = files.slice(keepLatestBackups)
  filesToDelete.forEach(({ fullPath }) => fs.rmSync(fullPath, { force: true }))
}

const deleteBackupFile = (fileName) => {
  const backupRoot = getBackupRoot()
  const filePath = path.join(backupRoot, fileName)

  if (!fs.existsSync(filePath)) {
    throw new Error('Backup file not found')
  }

  fs.rmSync(filePath, { force: true })
  return fileName
}

router.get('/list', requireAdmin, async (req, res) => {
  try {
    const backupRoot = getBackupRoot()
    fs.mkdirSync(backupRoot, { recursive: true })
    pruneOldBackups(backupRoot)

    const files = fs.readdirSync(backupRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.archive\.gz$/i.test(entry.name))
      .map((entry) => {
        const fullPath = path.join(backupRoot, entry.name)
        const stats = fs.statSync(fullPath)
        return {
          name: entry.name,
          createdAt: new Date(stats.mtimeMs).toLocaleString(),
          size: formatSize(stats.size),
          status: 'Completed',
          path: fullPath
        }
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, getKeepLatestBackupsCount())

    const extraFiles = fs.readdirSync(backupRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.archive\.gz$/i.test(entry.name))
      .map((entry) => path.join(backupRoot, entry.name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
      .slice(getKeepLatestBackupsCount())

    extraFiles.forEach((fullPath) => fs.rmSync(fullPath, { force: true }))

    return res.json({
      storagePath: backupRoot,
      retentionDays: getRetentionDays(),
      keepLatestBackups: getKeepLatestBackupsCount(),
      backups: files
    })
  } catch (err) {
    return sendErrorResponse(res, err, 'Failed to list backups', 500, 'backups.list')
  }
})

router.post('/config', requireAdmin, async (req, res) => {
  try {
    const keepLatestBackups = Number.parseInt(req.body?.keepLatestBackups, 10)
    if (!Number.isFinite(keepLatestBackups) || keepLatestBackups < 1) {
      return res.status(400).json({ message: 'Invalid backup keep count' })
    }

    const envFilePath = path.join(__dirname, '..', '.env')
    const envContents = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : ''
    const normalizedCount = String(keepLatestBackups)
    const updatedContents = envContents.match(/^BACKUP_KEEP_LATEST_COUNT=.*$/m)
      ? envContents.replace(/^BACKUP_KEEP_LATEST_COUNT=.*$/m, `BACKUP_KEEP_LATEST_COUNT=${normalizedCount}`)
      : `${envContents.trim() ? `${envContents.trim()}\n` : ''}BACKUP_KEEP_LATEST_COUNT=${normalizedCount}\n`

    fs.writeFileSync(envFilePath, updatedContents)
    process.env.BACKUP_KEEP_LATEST_COUNT = normalizedCount

    const backupRoot = getBackupRoot()
    fs.mkdirSync(backupRoot, { recursive: true })
    pruneOldBackups(backupRoot)

    return res.json({
      message: 'Backup retention count updated successfully',
      keepLatestBackups: keepLatestBackups,
      retentionDays: getRetentionDays()
    })
  } catch (err) {
    return sendErrorResponse(res, err, 'Failed to update backup retention count', 500, 'backups.config')
  }
})

router.post('/create', requireAdmin, async (req, res) => {
  try {
    const backupRoot = getBackupRoot()
    fs.mkdirSync(backupRoot, { recursive: true })
    pruneOldBackups(backupRoot)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const archiveFile = path.join(backupRoot, `mongodb-${timestamp}.archive.gz`)
    if (fs.existsSync(archiveFile)) {
      fs.rmSync(archiveFile, { force: true })
    }

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/goldflow'
    const command = getMongoDumpCommand()
    const args = ['--uri=' + mongoUri, '--archive=' + archiveFile, '--gzip']

    await runCommand(command, args)

    const stats = fs.statSync(archiveFile)
    return res.json({
      message: 'Backup created successfully',
      storagePath: backupRoot,
      backupFile: path.basename(archiveFile),
      backupDir: backupRoot,
      backupPath: archiveFile,
      createdAt: new Date().toISOString(),
      size: stats.size
    })
  } catch (err) {
    return sendErrorResponse(res, err, 'Failed to create backup', 500, 'backups.create')
  }
})

router.get('/download/:fileName', requireAdmin, async (req, res) => {
  try {
    const fileName = path.basename(req.params.fileName || '')
    if (!fileName || !/\.archive\.gz$/i.test(fileName)) {
      return res.status(400).json({ message: 'Invalid backup file name' })
    }

    const backupRoot = getBackupRoot()
    const filePath = path.join(backupRoot, fileName)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Backup file not found' })
    }

    return res.download(filePath, fileName)
  } catch (err) {
    return sendErrorResponse(res, err, 'Failed to download backup', 500, 'backups.download')
  }
})

router.post('/restore', requireAdmin, async (req, res) => {
  try {
    const fileName = path.basename(req.body?.fileName || '')
    if (!fileName || !/\.archive\.gz$/i.test(fileName)) {
      return res.status(400).json({ message: 'Invalid backup file name' })
    }

    const backupRoot = getBackupRoot()
    const archiveFile = path.join(backupRoot, fileName)
    if (!fs.existsSync(archiveFile)) {
      return res.status(404).json({ message: 'Backup file not found' })
    }

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/goldflow'
    const command = getMongoRestoreCommand()
    const args = ['--uri=' + mongoUri, '--archive=' + archiveFile, '--gzip']

    await runCommand(command, args)

    return res.json({
      message: 'Backup restored successfully',
      fileName,
      restoredAt: new Date().toISOString()
    })
  } catch (err) {
    return sendErrorResponse(res, err, 'Failed to restore backup', 500, 'backups.restore')
  }
})

router.delete('/delete', requireAdmin, async (req, res) => {
  try {
    const fileName = path.basename(req.body?.fileName || '')
    if (!fileName || !/\.archive\.gz$/i.test(fileName)) {
      return res.status(400).json({ message: 'Invalid backup file name' })
    }

    deleteBackupFile(fileName)

    return res.json({
      message: 'Backup deleted successfully',
      fileName
    })
  } catch (err) {
    return sendErrorResponse(res, err, 'Failed to delete backup', 500, 'backups.delete')
  }
})

router.delete('/delete/:fileName', requireAdmin, async (req, res) => {
  try {
    const fileName = path.basename(req.params.fileName || '')
    if (!fileName || !/\.archive\.gz$/i.test(fileName)) {
      return res.status(400).json({ message: 'Invalid backup file name' })
    }

    deleteBackupFile(fileName)

    return res.json({
      message: 'Backup deleted successfully',
      fileName
    })
  } catch (err) {
    return sendErrorResponse(res, err, 'Failed to delete backup', 500, 'backups.delete')
  }
})

module.exports = router
