const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const getBearerToken = (req) => {
  const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  return match?.[1] || null;
};

const requireAuth = async (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: 'Authentication is not configured' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userId = decoded?.user?.id;
  if (!mongoose.isValidObjectId(userId)) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const user = await User.findById(userId).select('_id roll role isActive loginHistory');
    if (!user || user.isActive === false) return res.status(401).json({ message: 'Unauthorized' });

    const sessionId = String(decoded?.user?.sessionId || '');
    if (!sessionId) return res.status(401).json({ message: 'Unauthorized' });
    const sessionIsActive = (user.loginHistory || []).some(
      (session) => session?.sessionId === sessionId && !session.logoutTime
    );
    if (!sessionIsActive) return res.status(401).json({ message: 'Unauthorized' });

    req.auth = {
      userId: String(user._id),
      sessionId,
      role: String(user.roll || user.role || 'user').toLowerCase()
    };
    return next();
  } catch (error) {
    return next(error);
  }
};

const requireApiAuth = (req, res, next) => {
  if (req.method === 'GET' && req.path === '/health') return next();
  return requireAuth(req, res, next);
};

module.exports = { getBearerToken, requireAuth, requireApiAuth };
