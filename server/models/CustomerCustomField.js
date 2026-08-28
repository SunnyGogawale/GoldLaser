const mongoose = require('mongoose')

const customerCustomFieldSchema = new mongoose.Schema({
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

customerCustomFieldSchema.index({ createdAt: 1 })

module.exports = mongoose.model('CustomerCustomField', customerCustomFieldSchema)