const express = require('express');
const router = express.Router();
const CompanySettings = require('../models/CompanySettings');
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

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    req.auth = { userId: String(userId) };
    return next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

// Get company settings (public or authenticated)
router.get('/', async (req, res) => {
  try {
    let settings = await CompanySettings.findOne();
    if (!settings) {
      settings = new CompanySettings();
      await settings.save();
    }
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get company settings' });
  }
});

// Update company settings (only admin)
router.put('/', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId;
    const user = await User.findById(userId);
    const userRole = String(user?.roll || user?.role || 'user').toLowerCase();
    
    if (userRole !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    let settings = await CompanySettings.findOne();
    if (!settings) {
      settings = new CompanySettings();
    }
    
    const { 
      companyName, 
      companyAddress, 
      companyEmail, 
      companyContactNumber,
      bankDetails 
    } = req.body;
    
    if (companyName !== undefined) settings.companyName = companyName;
    if (companyAddress !== undefined) settings.companyAddress = companyAddress;
    if (companyEmail !== undefined) settings.companyEmail = companyEmail;
    if (companyContactNumber !== undefined) settings.companyContactNumber = companyContactNumber;
    if (bankDetails !== undefined) {
      settings.bankDetails = {
        ...settings.bankDetails,
        ...bankDetails
      };
    }
    
    const savedSettings = await settings.save();
    res.json({ settings: savedSettings });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update company settings' });
  }
});

module.exports = router;
