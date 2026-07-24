const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
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

const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req)
    if (!token) return res.status(401).json({ message: 'Unauthorized' })

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const userId = decoded?.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    req.auth = { userId: String(userId) }
    return next()
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId
    const user = await User.findById(userId, { password: 0 })
    if (!user) return res.status(404).json({ message: 'User not found' })
    return res.json({ user })
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'users.me')
  }
})

router.put('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId
    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ message: 'User not found' })

    const nextFullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : user.fullName
    const nextEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : user.email

    if (!nextFullName) return res.status(400).json({ message: 'Full name is required' })
    if (!nextEmail) return res.status(400).json({ message: 'Email is required' })

    user.fullName = nextFullName
    user.email = nextEmail
    await user.save()

    const safe = await User.findById(user._id, { password: 0 })
    return res.json({ user: safe })
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ message: 'Email must be unique' })
    }
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'users.me.update')
  }
})

router.put('/me/password', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId
    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : ''
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : ''

    if (!currentPassword) return res.status(400).json({ message: 'Current password is required' })
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })

    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ message: 'User not found' })

    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' })

    const salt = await bcrypt.genSalt(10)
    user.password = await bcrypt.hash(newPassword, salt)
    await user.save()

    return res.json({ message: 'Password updated' })
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'users.me.password')
  }
})

router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 })
    res.json({ users })
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'users.list')
  }
})

router.get('/:id/login-history', requireAdmin, async (req, res) => {
  try {
    const targetId = String(req.params.id || '')
    if (!targetId) return res.status(400).json({ message: 'Invalid user id' })

    const target = await User.findById(targetId, { password: 0 })
    if (!target) return res.status(404).json({ message: 'User not found' })

    const loginHistory = Array.isArray(target.loginHistory)
      ? [...target.loginHistory].sort((a, b) => new Date(b) - new Date(a))
      : []

    return res.json({ loginHistory })
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'users.login-history')
  }
})

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const targetId = String(req.params.id || '')
    const requestorId = req.auth?.userId
    if (!targetId) return res.status(400).json({ message: 'Invalid user id' })

    const target = await User.findById(targetId)
    if (!target) return res.status(404).json({ message: 'User not found' })

    const currentRoll = String(target.roll || target.role || 'user').toLowerCase()
    const nextFullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : target.fullName
    const nextEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : target.email
    const rawNextRoll = typeof req.body.roll === 'string' ? req.body.roll : currentRoll
    const nextRoll = String(rawNextRoll || currentRoll).toLowerCase() === 'admin' ? 'admin' : 'user'

    if (currentRoll === 'admin' && nextRoll !== 'admin') {
      const adminCount = await User.countDocuments({ roll: { $regex: /^admin$/i } })
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'At least one admin must remain' })
      }
    }

    target.fullName = nextFullName
    target.email = nextEmail
    target.roll = nextRoll
    await target.save()

    const safe = await User.findById(target._id, { password: 0 })
    return res.json({ user: safe })
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ message: 'Email must be unique' })
    }
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'users.update')
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const targetId = String(req.params.id || '')
    const requestorId = req.auth?.userId
    if (!targetId) return res.status(400).json({ message: 'Invalid user id' })
    if (requestorId && targetId === String(requestorId)) {
      return res.status(400).json({ message: 'Admin cannot delete own account' })
    }

    const target = await User.findById(targetId)
    if (!target) return res.status(404).json({ message: 'User not found' })

    const roll = String(target.roll || target.role || 'user').toLowerCase()
    if (roll === 'admin') {
      const adminCount = await User.countDocuments({ roll: { $regex: /^admin$/i } })
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'At least one admin must remain' })
      }
    }

    await User.findByIdAndDelete(targetId)
    return res.json({ message: 'User deleted' })
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'users.delete')
  }
})

router.put('/:id/password', requireAdmin, async (req, res) => {
  try {
    const targetId = String(req.params.id || '')
    const requestorId = req.auth?.userId
    const nextPassword = typeof req.body.password === 'string' ? req.body.password : ''
    if (!targetId) return res.status(400).json({ message: 'Invalid user id' })
    if (!nextPassword || nextPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })

    const target = await User.findById(targetId)
    if (!target) return res.status(404).json({ message: 'User not found' })

    if (requestorId && String(targetId) === String(requestorId)) {
      return res.status(400).json({ message: 'Use profile settings to change your own password' })
    }

    const salt = await bcrypt.genSalt(10)
    target.password = await bcrypt.hash(nextPassword, salt)
    await target.save()

    return res.json({ message: 'Password updated' })
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'users.password')
  }
})

module.exports = router
