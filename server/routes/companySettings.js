const express = require('express');
const router = express.Router();
const CompanySettings = require('../models/CompanySettings');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

// Get company settings
router.get('/', requireAuth, async (req, res) => {
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
      companyLogo,
      bankDetails 
    } = req.body;
    
    if (companyName !== undefined) settings.companyName = companyName;
    if (companyAddress !== undefined) settings.companyAddress = companyAddress;
    if (companyEmail !== undefined) settings.companyEmail = companyEmail;
    if (companyContactNumber !== undefined) settings.companyContactNumber = companyContactNumber;
    if (companyLogo !== undefined) settings.companyLogo = companyLogo;
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
