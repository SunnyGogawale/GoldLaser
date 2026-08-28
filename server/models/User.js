const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  roll: {
    type: String,
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  loginHistory: {
    type: [Date],
    default: []
  }
});

userSchema.index({ createdAt: -1 });
userSchema.index({ roll: 1 });

module.exports = mongoose.model('User', userSchema);
