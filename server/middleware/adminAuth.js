const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const getBearerToken = (req) => {
  const [type, token] = String(req.headers.authorization || '').split(' ');
  return type === 'Bearer' && token ? token : null;
};

const requireAdmin = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.user?.id;
    if (!mongoose.isValidObjectId(userId)) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findById(userId).select('_id roll role isActive');
    if (!user || user.isActive === false) return res.status(401).json({ message: 'Unauthorized' });
    if (String(user.roll || user.role || 'user').toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    req.auth = { userId: String(user._id) };
    return next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

module.exports = { requireAdmin };