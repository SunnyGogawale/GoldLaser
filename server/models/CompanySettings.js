const mongoose = require('mongoose');

const companySettingsSchema = new mongoose.Schema({
  companyName: {
    type: String,
    default: 'Your Company Name'
  },
  companyAddress: {
    type: String,
    default: '123 Company Street, City, Country'
  },
  companyEmail: {
    type: String,
    default: 'info@company.com'
  },
  companyContactNumber: {
    type: String,
    default: '+1234567890'
  },
  bankDetails: {
    bankName: {
      type: String,
      default: 'Your Bank Name'
    },
    bankAddress: {
      type: String,
      default: 'Bank Address'
    },
    accountNumber: {
      type: String,
      default: '1234567890'
    },
    ifscCode: {
      type: String,
      default: 'ABCD0123456'
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CompanySettings', companySettingsSchema);
