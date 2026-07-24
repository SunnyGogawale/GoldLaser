import React, { useEffect, useRef, useState } from 'react'
import { Archive, DatabaseBackup, RotateCcw, Upload, CircleDot, Circle } from 'lucide-react'
import { getAuthToken } from '../../../utils/authStorage'
import { showErrorToast, showSuccessToast } from '../../../utils/toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const BACKUP_REFRESH_MS = Number(import.meta.env.VITE_BACKUP_REFRESH_MS || 15000)

function Backup() {
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState('')
  const [deletingBackup, setDeletingBackup] = useState('')
  const [lastBackup, setLastBackup] = useState(() => {
    try {
      const saved = window.localStorage.getItem('goldlaser-last-backup')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [lastRestore, setLastRestore] = useState(() => {
    try {
      const saved = window.localStorage.getItem('goldlaser-last-restore')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [backupItems, setBackupItems] = useState(() => {
    try {
      const saved = window.localStorage.getItem('goldlaser-backup-items')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [storagePath, setStoragePath] = useState('')
  const [retentionDays, setRetentionDays] = useState(8)
  const [keepLatestBackups, setKeepLatestBackups] = useState(10)
  const [backupCountInput, setBackupCountInput] = useState(10)
  const [backupScheduleHours, setBackupScheduleHours] = useState(0)
  const [backupScheduleMinutes, setBackupScheduleMinutes] = useState(0)
  const [backupScheduleHoursInput, setBackupScheduleHoursInput] = useState(0)
  const [backupScheduleMinutesInput, setBackupScheduleMinutesInput] = useState(0)
  const [savingBackupConfig, setSavingBackupConfig] = useState(false)
  const [savingBackupSchedule, setSavingBackupSchedule] = useState(false)
  const [showSummaryCards, setShowSummaryCards] = useState(false)
  const [uploadingExternalBackup, setUploadingExternalBackup] = useState(false)
  const summaryTimeoutRef = useRef(null)
  const externalRestoreInputRef = useRef(null)

  const restartSummaryCardsTimer = () => {
    setShowSummaryCards(true)
    window.clearTimeout(summaryTimeoutRef.current)
    summaryTimeoutRef.current = window.setTimeout(() => {
      setShowSummaryCards(false)
    }, 10000)
  }

  const fetchBackups = async () => {
    const token = getAuthToken()
    if (!token) return

    setLoadingBackups(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/backups/list`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load backups')
      }

      const backups = Array.isArray(data?.backups) ? data.backups : []
      const configuredRetentionDays = Number.parseInt(data?.retentionDays || '8', 10)
      const configuredKeepLatestBackups = Number.parseInt(data?.keepLatestBackups || '10', 10)
      const configuredBackupScheduleHours = Number.parseInt(data?.backupScheduleHours || '0', 10)
      const configuredBackupScheduleMinutes = Number.parseInt(data?.backupScheduleMinutes || '0', 10)
      setBackupItems(backups)
      setStoragePath(data?.storagePath || '')
      setRetentionDays(Number.isFinite(configuredRetentionDays) && configuredRetentionDays > 0 ? configuredRetentionDays : 8)
      setKeepLatestBackups(Number.isFinite(configuredKeepLatestBackups) && configuredKeepLatestBackups > 0 ? configuredKeepLatestBackups : 10)
      setBackupCountInput(Number.isFinite(configuredKeepLatestBackups) && configuredKeepLatestBackups > 0 ? configuredKeepLatestBackups : 10)
      setBackupScheduleHours(Number.isFinite(configuredBackupScheduleHours) && configuredBackupScheduleHours > 0 ? configuredBackupScheduleHours : 0)
      setBackupScheduleMinutes(Number.isFinite(configuredBackupScheduleMinutes) && configuredBackupScheduleMinutes > 0 ? configuredBackupScheduleMinutes : 0)
      setBackupScheduleHoursInput(Number.isFinite(configuredBackupScheduleHours) && configuredBackupScheduleHours > 0 ? configuredBackupScheduleHours : 0)
      setBackupScheduleMinutesInput(Number.isFinite(configuredBackupScheduleMinutes) && configuredBackupScheduleMinutes > 0 ? configuredBackupScheduleMinutes : 0)
      if (backups.length > 0) {
        setLastBackup(backups[0])
      }
    } catch (error) {
      showErrorToast(error?.message || 'Failed to load backups')
    } finally {
      setLoadingBackups(false)
    }
  }

  useEffect(() => {
    fetchBackups()

    const refreshTimer = window.setInterval(() => {
      const token = getAuthToken()
      if (token) {
        fetchBackups()
      }
    }, BACKUP_REFRESH_MS)

    return () => {
      window.clearInterval(refreshTimer)
    }
  }, [])

  useEffect(() => {
    try {
      if (backupItems.length > 0) {
        window.localStorage.setItem('goldlaser-backup-items', JSON.stringify(backupItems))
      } else {
        window.localStorage.removeItem('goldlaser-backup-items')
      }
    } catch {
      // ignore local-storage write issues in restricted environments
    }
  }, [backupItems])

  useEffect(() => {
    try {
      if (lastBackup) {
        window.localStorage.setItem('goldlaser-last-backup', JSON.stringify(lastBackup))
      } else {
        window.localStorage.removeItem('goldlaser-last-backup')
      }
    } catch {
      // ignore local-storage write issues in restricted environments
    }
  }, [lastBackup])

  useEffect(() => {
    try {
      if (lastRestore) {
        window.localStorage.setItem('goldlaser-last-restore', JSON.stringify(lastRestore))
      } else {
        window.localStorage.removeItem('goldlaser-last-restore')
      }
    } catch {
      // ignore local-storage write issues in restricted environments
    }
  }, [lastRestore])

  useEffect(() => () => {
    window.clearTimeout(summaryTimeoutRef.current)
  }, [])

  const handleOpenStorageFolder = () => {
    if (!storagePath) return

    const fileUrl = `file://${encodeURI(storagePath)}`
    if (typeof window !== 'undefined' && window.open) {
      window.open(fileUrl, '_blank')
    }
  }

  const handleDownloadBackup = async (fileName) => {
    const token = getAuthToken()
    if (!token) {
      showErrorToast('You must be logged in to download a backup.')
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/backups/download/${encodeURIComponent(fileName)}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.message || 'Failed to download backup')
      }

      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      showErrorToast(error?.message || 'Failed to download backup')
    }
  }

  const handleRestoreBackup = async (fileName) => {
    const confirmed = window.confirm(`Restore backup "${fileName}" into the current MongoDB database? This will overwrite the existing data.`)
    if (!confirmed) return

    const token = getAuthToken()
    if (!token) {
      showErrorToast('You must be logged in to restore a backup.')
      return
    }

    setRestoringBackup(fileName)
    try {
      const response = await fetch(`${API_BASE_URL}/api/backups/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fileName })
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to restore backup')
      }

      setLastRestore({
        name: data?.fileName || fileName,
        restoredAt: data?.restoredAt || new Date().toISOString()
      })
      restartSummaryCardsTimer()
      showSuccessToast(data?.message || `Backup ${fileName} restored successfully.`)
    } catch (error) {
      showErrorToast(error?.message || 'Failed to restore backup')
    } finally {
      setRestoringBackup('')
    }
  }

  const handleUploadAndRestoreBackup = async (file) => {
    if (!file) return

    const token = getAuthToken()
    if (!token) {
      showErrorToast('You must be logged in to restore an external backup.')
      return
    }

    if (!/\.archive\.gz$/i.test(file.name)) {
      showErrorToast('Please upload a valid backup archive file (.archive.gz).')
      return
    }

    const confirmed = window.confirm(`Upload and restore backup "${file.name}" into the current MongoDB database? This will overwrite the existing data.`)
    if (!confirmed) return

    setUploadingExternalBackup(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/backups/restore-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'x-backup-filename': file.name
        },
        body: await file.arrayBuffer()
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to upload and restore backup')
      }

      setLastRestore({
        name: data?.fileName || file.name,
        restoredAt: data?.restoredAt || new Date().toISOString()
      })
      restartSummaryCardsTimer()
      showSuccessToast(data?.message || `External backup ${file.name} restored successfully.`)
    } catch (error) {
      showErrorToast(error?.message || 'Failed to upload and restore backup')
    } finally {
      setUploadingExternalBackup(false)
    }
  }

  const handleDeleteBackup = async (fileName) => {
    const confirmed = window.confirm(`Delete backup "${fileName}" from the backup storage folder? This action cannot be undone.`)
    if (!confirmed) return

    const token = getAuthToken()
    if (!token) {
      showErrorToast('You must be logged in to delete a backup.')
      return
    }

    setDeletingBackup(fileName)
    try {
      const response = await fetch(`${API_BASE_URL}/api/backups/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fileName })
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to delete backup')
      }

      setBackupItems((prev) => prev.filter((item) => item.name !== fileName))
      if (lastBackup?.name === fileName) {
        setLastBackup(null)
      }
      showSuccessToast(data?.message || `Backup ${fileName} deleted successfully.`)
    } catch (error) {
      showErrorToast(error?.message || 'Failed to delete backup')
    } finally {
      setDeletingBackup('')
    }
  }

  const handleSaveBackupCount = async () => {
    const token = getAuthToken()
    if (!token) {
      showErrorToast('You must be logged in to update backup retention.')
      return
    }

    const parsedCount = Number.parseInt(backupCountInput, 10)
    if (!Number.isFinite(parsedCount) || parsedCount < 1) {
      showErrorToast('Backup keep count must be at least 1.')
      return
    }

    setSavingBackupConfig(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/backups/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ keepLatestBackups: parsedCount })
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to update backup count')
      }

      setKeepLatestBackups(Number.parseInt(data?.keepLatestBackups || String(parsedCount), 10) || parsedCount)
      setBackupCountInput(Number.parseInt(data?.keepLatestBackups || String(parsedCount), 10) || parsedCount)
      showSuccessToast(data?.message || 'Backup retention count updated successfully.')
      await fetchBackups()
    } catch (error) {
      showErrorToast(error?.message || 'Failed to update backup count')
    } finally {
      setSavingBackupConfig(false)
    }
  }

  const handleSaveBackupSchedule = async () => {
    const token = getAuthToken()
    if (!token) {
      showErrorToast('You must be logged in to update the backup schedule.')
      return
    }

    const parsedHours = Number.parseInt(backupScheduleHoursInput, 10)
    const parsedMinutes = Number.parseInt(backupScheduleMinutesInput, 10)
    const normalizedHours = Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 0
    const normalizedMinutes = Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : 0
    const totalMinutes = (normalizedHours * 60) + normalizedMinutes

    if (!Number.isFinite(totalMinutes) || totalMinutes < 1) {
      showErrorToast('Backup interval must be at least 1 minute.')
      return
    }

    setSavingBackupSchedule(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/backups/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          backupIntervalHours: normalizedHours,
          backupIntervalMinutes: normalizedMinutes
        })
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to update backup schedule')
      }

      setBackupScheduleHours(Number.parseInt(data?.backupScheduleHours || String(normalizedHours), 10) || normalizedHours)
      setBackupScheduleMinutes(Number.parseInt(data?.backupScheduleMinutes || String(normalizedMinutes), 10) || normalizedMinutes)
      setBackupScheduleHoursInput(Number.parseInt(data?.backupScheduleHours || String(normalizedHours), 10) || normalizedHours)
      setBackupScheduleMinutesInput(Number.parseInt(data?.backupScheduleMinutes || String(normalizedMinutes), 10) || normalizedMinutes)
      showSuccessToast(data?.message || 'Backup schedule updated successfully.')
      await fetchBackups()
    } catch (error) {
      showErrorToast(error?.message || 'Failed to update backup schedule')
    } finally {
      setSavingBackupSchedule(false)
    }
  }

  const handleCreateBackup = async () => {
    const token = getAuthToken()
    if (!token) {
      showErrorToast('You must be logged in to create a backup.')
      return
    }

    setCreatingBackup(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/backups/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to create backup')
      }

      const backupMeta = {
        name: data?.backupFile || (data?.backupDir ? String(data.backupDir).split('/').pop() : 'latest-backup'),
        createdAt: new Date().toLocaleString(),
        size: data?.size ? `${Math.max(1, Math.round(Number(data.size) / (1024 * 1024)))} MB` : 'Pending',
        status: 'Completed',
        path: data?.backupPath || data?.backupDir || ''
      }
      setStoragePath(data?.storagePath || '')
      setLastBackup(backupMeta)
      setBackupItems((prev) => [backupMeta, ...prev])
      restartSummaryCardsTimer()
      showSuccessToast(`Backup created successfully at ${data?.backupPath || data?.backupDir || 'backup folder'}.`)
    } catch (error) {
      showErrorToast(error?.message || 'Failed to create backup')
    } finally {
      setCreatingBackup(false)
    }
  }
  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div className="card" style={{ margin: '0 auto', width: '100%', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(59,130,246,0.12)', color: 'var(--primary)' }}>
            <Archive size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-header)' }}>Backup</div>
            <div style={{ marginTop: '0.25rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Manage backups and restore previous snapshots.
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={creatingBackup}
            style={{
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1rem',
              background: 'var(--bg-card)',
              textAlign: 'left',
              cursor: creatingBackup ? 'not-allowed' : 'pointer',
              color: 'var(--text-header)',
              opacity: creatingBackup ? 0.7 : 1
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                <DatabaseBackup size={18} />
              </div>
              <div style={{ fontWeight: 800 }}>Create Backup</div>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{creatingBackup ? 'Creating backup...' : 'Create a new database snapshot for the current system state.'}</div>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!lastBackup?.name) {
                showErrorToast('Create or load a backup before attempting a restore.')
                return
              }

              handleRestoreBackup(lastBackup.name)
            }}
            disabled={!lastBackup?.name || restoringBackup === lastBackup?.name}
            style={{
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1rem',
              background: 'var(--bg-card)',
              textAlign: 'left',
              cursor: !lastBackup?.name || restoringBackup === lastBackup?.name ? 'not-allowed' : 'pointer',
              color: 'var(--text-header)',
              opacity: !lastBackup?.name || restoringBackup === lastBackup?.name ? 0.7 : 1
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                <RotateCcw size={18} />
              </div>
              <div style={{ fontWeight: 800 }}>Restore from Internal Backup</div>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {restoringBackup === lastBackup?.name ? 'Restoring latest backup...' : 'Restore the newest internal snapshot stored on the server.'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => externalRestoreInputRef.current?.click()}
            disabled={uploadingExternalBackup}
            style={{
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1rem',
              background: 'var(--bg-card)',
              textAlign: 'left',
              cursor: uploadingExternalBackup ? 'not-allowed' : 'pointer',
              color: 'var(--text-header)',
              opacity: uploadingExternalBackup ? 0.7 : 1
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
                <Upload size={18} />
              </div>
              <div style={{ fontWeight: 800 }}>Upload and Restore External Backup</div>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {uploadingExternalBackup ? 'Uploading and restoring external backup...' : 'Choose a .archive.gz file from your device and restore it directly.'}
            </div>
            <input
              ref={externalRestoreInputRef}
              type="file"
              accept=".archive.gz"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  handleUploadAndRestoreBackup(file)
                }
                event.target.value = ''
              }}
            />
          </button>
        </div>

        {showSummaryCards && storagePath && (
          <div style={{ marginTop: '1.25rem', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.9rem 1rem', background: 'rgba(59,130,246,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.35rem' }}>Backup Storage</div>
                <div style={{ color: 'var(--text-main)', overflowWrap: 'anywhere', fontSize: '0.9rem' }}>{storagePath}</div>
              </div>
              <button
                type="button"
                onClick={handleOpenStorageFolder}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '0.55rem 0.85rem',
                  background: 'var(--bg-card)',
                  color: 'var(--text-header)',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                Open Folder
              </button>
            </div>
          </div>
        )}

        {showSummaryCards && lastRestore && (
          <div style={{ marginTop: '1.25rem', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.9rem 1rem', background: 'rgba(245,158,11,0.08)' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.45rem' }}>Last Restore</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.2rem' }}>Backup</div>
                <div style={{ color: 'var(--text-header)', fontWeight: 700 }}>{lastRestore.name}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.2rem' }}>Restored At</div>
                <div style={{ color: 'var(--text-main)' }}>{new Date(lastRestore.restoredAt).toLocaleString()}</div>
              </div>
            </div>
          </div>
        )}

        {showSummaryCards && lastBackup && (
          <div style={{ marginTop: '1.25rem', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', background: 'rgba(16,185,129,0.06)' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.6rem' }}>Last Backup</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.2rem' }}>Name</div>
                <div style={{ color: 'var(--text-header)', fontWeight: 700 }}>{lastBackup.name}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.2rem' }}>Created</div>
                <div style={{ color: 'var(--text-main)' }}>{lastBackup.createdAt}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.2rem' }}>Size</div>
                <div style={{ color: 'var(--text-main)' }}>{lastBackup.size}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.2rem' }}>Path</div>
                <div style={{ color: 'var(--text-main)', overflowWrap: 'anywhere' }}>{lastBackup.path}</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', background: 'var(--bg-card)' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.85rem' }}>Backup Schedule</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
              Interval (hours)
              <input
                type="number"
                min="0"
                value={backupScheduleHoursInput}
                onChange={(event) => setBackupScheduleHoursInput(Number.parseInt(event.target.value || '0', 10))}
                style={{
                  width: '92px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.4rem 0.55rem',
                  background: 'var(--bg-card)',
                  color: 'var(--text-header)',
                  fontWeight: 700
                }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
              Interval (mins)
              <input
                type="number"
                min="0"
                value={backupScheduleMinutesInput}
                onChange={(event) => setBackupScheduleMinutesInput(Number.parseInt(event.target.value || '0', 10))}
                style={{
                  width: '92px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.4rem 0.55rem',
                  background: 'var(--bg-card)',
                  color: 'var(--text-header)',
                  fontWeight: 700
                }}
              />
            </label>
            <button
              type="button"
              onClick={handleSaveBackupSchedule}
              disabled={savingBackupSchedule}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '0.55rem 0.85rem',
                background: 'var(--bg-card)',
                color: 'var(--text-header)',
                cursor: savingBackupSchedule ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                opacity: savingBackupSchedule ? 0.7 : 1
              }}
            >
              {savingBackupSchedule ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
            <div style={{ color: 'var(--text-header)', fontSize: '0.84rem', fontWeight: 700 }}>
              {backupScheduleHours > 0 || backupScheduleMinutes > 0
                ? `Automatic backups every ${backupScheduleHours > 0 ? `${backupScheduleHours} hour${backupScheduleHours === 1 ? '' : 's'}` : ''}${backupScheduleHours > 0 && backupScheduleMinutes > 0 ? ' ' : ''}${backupScheduleMinutes > 0 ? `${backupScheduleMinutes} minute${backupScheduleMinutes === 1 ? '' : 's'}` : ''}.`
                : 'Automatic backup scheduling is disabled.'}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                borderRadius: '999px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.77rem',
                fontWeight: 900,
                border: `1px solid ${backupScheduleHours > 0 || backupScheduleMinutes > 0 ? 'rgba(16,185,129,0.5)' : 'var(--border)'}`,
                background: backupScheduleHours > 0 || backupScheduleMinutes > 0 ? 'rgba(16,185,129,0.18)' : 'rgba(148,163,184,0.14)',
                color: backupScheduleHours > 0 || backupScheduleMinutes > 0 ? '#0f9f6e' : 'var(--text-muted)'
              }}
            >
              {backupScheduleHours > 0 || backupScheduleMinutes > 0 ? <CircleDot size={12} /> : <Circle size={12} />}
              {backupScheduleHours > 0 || backupScheduleMinutes > 0 ? 'Active' : 'Inactive'}
            </div>
          </div>
          <div style={{ marginTop: '0.8rem', color: 'var(--text-header)', fontSize: '0.82rem', fontWeight: 700 }}>
            Use hours and minutes together to define the automatic backup frequency.
          </div>
          <div style={{ marginTop: '0.45rem', color: 'var(--text-header)', fontSize: '0.82rem', fontWeight: 700 }}>
            Last scheduled backup: {lastBackup?.createdAt || 'No backup created yet.'}
          </div>
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-header)' }}>Backup List</div>
              <div style={{ marginTop: '0.2rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Retention window: {retentionDays} day{retentionDays === 1 ? '' : 's'} · Keep latest {keepLatestBackups}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
                Keep
                <input
                  type="number"
                  min="1"
                  value={backupCountInput}
                  onChange={(event) => setBackupCountInput(Number.parseInt(event.target.value || '1', 10))}
                  style={{
                    width: '78px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.4rem 0.55rem',
                    background: 'var(--bg-card)',
                    color: 'var(--text-header)',
                    fontWeight: 700
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleSaveBackupCount}
                disabled={savingBackupConfig}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '0.55rem 0.85rem',
                  background: 'var(--bg-card)',
                  color: 'var(--text-header)',
                  cursor: savingBackupConfig ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  opacity: savingBackupConfig ? 0.7 : 1
                }}
              >
                {savingBackupConfig ? 'Saving...' : 'Save Count'}
              </button>
            </div>
            <button
              type="button"
              onClick={fetchBackups}
              disabled={loadingBackups}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '0.55rem 0.85rem',
                background: 'var(--bg-card)',
                color: 'var(--text-header)',
                cursor: loadingBackups ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                opacity: loadingBackups ? 0.7 : 1
              }}
            >
              {loadingBackups ? 'Refreshing...' : 'Refresh List'}
            </button>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 0.8fr 1.2fr', padding: '0.8rem 1rem', background: 'var(--bg-main)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <div>Name</div>
              <div>Created</div>
              <div>Size</div>
              <div>Status</div>
              <div>Action</div>
            </div>
            {loadingBackups ? (
              <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading backups...</div>
            ) : backupItems.length === 0 ? (
              <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>No backups found yet.</div>
            ) : (
              backupItems.map((item) => (
                <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 0.8fr 1.2fr', padding: '0.85rem 1rem', borderTop: '1px solid var(--border)', alignItems: 'center', fontSize: '0.9rem' }}>
                  <div style={{ color: 'var(--text-header)', fontWeight: 600 }}>{item.name}</div>
                  <div style={{ color: 'var(--text-main)' }}>{item.createdAt}</div>
                  <div style={{ color: 'var(--text-main)' }}>{item.size}</div>
                  <div style={{ color: '#10b981', fontWeight: 700 }}>{item.status}</div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleDownloadBackup(item.name)}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '0.45rem 0.7rem',
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)',
                        cursor: 'pointer',
                        fontWeight: 700
                      }}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestoreBackup(item.name)}
                      disabled={restoringBackup === item.name}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '0.45rem 0.7rem',
                        background: restoringBackup === item.name ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.12)',
                        color: '#f59e0b',
                        cursor: restoringBackup === item.name ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        opacity: restoringBackup === item.name ? 0.85 : 1
                      }}
                    >
                      {restoringBackup === item.name ? 'Restoring...' : 'Restore'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBackup(item.name)}
                      disabled={deletingBackup === item.name}
                      style={{
                        border: '1px solid rgba(239,68,68,0.35)',
                        borderRadius: '8px',
                        padding: '0.45rem 0.7rem',
                        background: deletingBackup === item.name ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)',
                        color: '#ef4444',
                        cursor: deletingBackup === item.name ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        opacity: deletingBackup === item.name ? 0.85 : 1
                      }}
                    >
                      {deletingBackup === item.name ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Backup
