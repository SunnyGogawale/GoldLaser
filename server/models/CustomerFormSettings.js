const mongoose = require('mongoose')

const customerFormSettingsSchema = new mongoose.Schema({
  fieldOrder: {
    type: Array,
    default: [
      'customerName', 
      'companyName',
      'contactNumber', 
      'email',
      'address', 
      'note'
    ]
  }
}, {
  timestamps: true
})

// Always return the first (and only) document
customerFormSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne()
  if (!settings) {
    settings = await this.create({})
  }
  return settings
}

module.exports = mongoose.model('CustomerFormSettings', customerFormSettingsSchema)
