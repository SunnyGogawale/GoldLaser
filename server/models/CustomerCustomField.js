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

module.exports = mongoose.model('CustomerCustomField', customerCustomFieldSchema)