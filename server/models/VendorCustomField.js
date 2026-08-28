const mongoose = require('mongoose')

const vendorCustomFieldSchema = new mongoose.Schema({
  fieldName: {
    type: String,
    required: true,
    unique: true
  },
  showInTable: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
})

vendorCustomFieldSchema.index({ createdAt: 1 })

module.exports = mongoose.model('VendorCustomField', vendorCustomFieldSchema)
