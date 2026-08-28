const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['create', 'update'],
    required: true
  },
  at: {
    type: Date,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  userName: {
    type: String,
    default: ''
  },
  userEmail: {
    type: String,
    default: ''
  },
  changes: {
    type: [
      {
        field: { type: String, required: true },
        from: { type: String, default: '' },
        to: { type: String, default: '' }
      }
    ],
    default: []
  }
}, { _id: false });

const vendorSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  vendorName: {
    type: String,
    required: true
  },
  companyName: {
    type: String,
    default: ''
  },
  contactNumber: {
    type: String,
    required: true
  },
  alternateNumber: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  shippingAddress: {
    type: String,
    default: ''
  },
  note: {
    type: String,
    default: ''
  },
  customFields: {
    type: Map,
    of: String,
    default: {}
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedByName: {
    type: String,
    default: ''
  },
  updatedByEmail: {
    type: String,
    default: ''
  },
  activity: {
    type: [activitySchema],
    default: []
  }
}, {
  timestamps: true
});

vendorSchema.index({ createdAt: -1 });
vendorSchema.index({ vendorName: 1 });
vendorSchema.index({ companyName: 1 });
vendorSchema.index({ contactNumber: 1 });
vendorSchema.index({ email: 1 });

module.exports = mongoose.model('Vendor', vendorSchema);
