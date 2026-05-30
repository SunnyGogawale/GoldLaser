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

const customerSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  contactNumber: {
    type: String,
    required: true
  },
  email: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  note: {
    type: String,
    default: ''
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

module.exports = mongoose.model('Customer', customerSchema);
