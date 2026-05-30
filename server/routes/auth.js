const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
};

const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    req.auth = { userId: String(userId) };
    return next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

// Sign Up Route
router.post('/signup', async (req, res) => {
  try {
    const { fullName, email, password, roll } = req.body;

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
      roll: roll || 'user'
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    console.log('Attempting to save user with roll:', user.roll);
    await user.save();
    console.log('User saved successfully. Saved document:', user);

    // Create JWT
    const payload = {
      user: {
        id: user.id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
      (err, token) => {
        if (err) throw err;
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
        console.log('DEBUG: Final responseData.user:', responseData.user);
        res.json(responseData);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
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

    // FLAG CHECK: Ensure user has the correct roll for this login type
    const userRoll = String(user.roll || user.role || 'user').toLowerCase();
    const requested = requiredRole ? String(requiredRole).toLowerCase() : '';
    if (requested && userRoll !== requested) {
      const errorMessage = requested === 'admin' 
        ? 'Access Denied: This account does not have Admin privileges.' 
        : 'Access Denied: Please use the Admin Login for this account.';
      return res.status(403).json({ message: errorMessage });
    }

    // Create JWT
    const payload = {
      user: {
        id: user.id
      }
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
      (err, token) => {
        if (err) throw err;
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
        console.log('DEBUG: Final responseData.user:', responseData.user);
        res.json(responseData);
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const user = await User.findById(userId, { password: 0 });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ message: err.message });
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
    return res.status(500).json({ message: err.message });
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
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;
