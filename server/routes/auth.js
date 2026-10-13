const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendErrorResponse } = require('../utils/errorHandler');
const { requireAuth } = require('../middleware/auth');
const LOGIN_HISTORY_MAX_RECORDS = 30;

// Sign Up Route
router.post('/signup', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    user = new User({
      fullName,
      email,
      password,
      roll: 'user'
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    const sessionId = crypto.randomUUID();
    user.loginHistory = [{ sessionId, loginTime: new Date(), logoutTime: null }];

    await user.save();

    // Create JWT
    const payload = {
      user: {
        id: user.id,
        sessionId
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' },
      (tokenErr, token) => {
        if (tokenErr) {
          return sendErrorResponse(res, tokenErr, 'Something went wrong. Please try again later.', 500, 'auth.signup');
        }
        const userObj = user.toObject();
        const responseData = { 
          token, 
          user: { 
            id: userObj._id, 
            fullName: userObj.fullName, 
            email: userObj.email, 
            roll: userObj.roll || userObj.role || 'user'
          } 
        };
        return res.json(responseData);
      }
    );
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'auth.signup');
  }
});

// Sign In Route
router.post('/signin', async (req, res) => {
  try {
    const { email, password, requiredRole } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: 'Your account is inactive. Please contact the administrator.' });
    }

    // FLAG CHECK: Ensure user has the correct roll for this login type
    const userRoll = String(user.roll || user.role || 'user').toLowerCase();
    const requested = requiredRole ? String(requiredRole).toLowerCase() : '';
    if (requested && userRoll !== requested) {
      const errorMessage = requested === 'admin' 
        ? 'Access Denied: This account does not have Admin privileges.' 
        : 'Access Denied: Please use the Admin Login for this account.';
      return res.status(403).json({ message: errorMessage });
    }

    user.loginHistory = Array.isArray(user.loginHistory) ? user.loginHistory : [];
    const sessionId = crypto.randomUUID();
    user.loginHistory.push({ sessionId, loginTime: new Date(), logoutTime: null });
    user.loginHistory = user.loginHistory.slice(-LOGIN_HISTORY_MAX_RECORDS);
    await user.save();

    const payload = {
      user: {
        id: user.id,
        sessionId
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' },
      (tokenErr, token) => {
        if (tokenErr) {
          return sendErrorResponse(res, tokenErr, 'Something went wrong. Please try again later.', 500, 'auth.signin');
        }
        const userObj = user.toObject();
        const responseData = { 
          token, 
          user: { 
            id: userObj._id, 
            fullName: userObj.fullName, 
            email: userObj.email, 
            roll: userObj.roll || userObj.role || 'user'
          } 
        };
        return res.json(responseData);
      }
    );
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'auth.signin');
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.auth.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const history = Array.isArray(user.loginHistory) ? user.loginHistory : [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        !entry.logoutTime &&
        (!req.auth.sessionId || entry.sessionId === req.auth.sessionId)
      ) {
        entry.logoutTime = new Date();
        break;
      }
    }
    user.loginHistory = history.slice(-LOGIN_HISTORY_MAX_RECORDS);
    await user.save();
    return res.json({ message: 'Logout recorded' });
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'auth.logout');
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const user = await User.findById(userId, { password: 0 });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'auth.me');
  }
});

router.put('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const nextFullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : user.fullName;
    const nextEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : user.email;

    if (!nextFullName) return res.status(400).json({ message: 'Full name is required' });
    if (!nextEmail) return res.status(400).json({ message: 'Email is required' });

    user.fullName = nextFullName;
    user.email = nextEmail;
    await user.save();

    const safe = await User.findById(user._id, { password: 0 });
    return res.json({ user: safe });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ message: 'Email must be unique' });
    }
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'auth.me.update');
  }
});

router.put('/me/password', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword) return res.status(400).json({ message: 'Current password is required' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.json({ message: 'Password updated' });
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'auth.me.password');
  }
});

module.exports = router;
