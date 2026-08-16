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

const paymentAllocationSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SaleInvoice',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    default: ''
  }
}, { _id: false });

const paymentAttachmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  dataUrl: {
    type: String,
    required: true
  }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  paymentNumber: {
    type: String,
    required: true,
    unique: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  clientType: {
    type: String,
    enum: ['Customer', 'Vendor'],
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdByName: {
    type: String,
    default: ''
  },
  createdByEmail: {
    type: String,
    default: ''
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
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  // Credit created by a normal payment when the payment is larger than
  // the amount allocated to invoices.
  availableCreditGenerated: {
    type: Number,
    min: 0,
    default: 0
  },

  // Existing Available Credit consumed by this payment.
  availableCreditApplied: {
    type: Number,
    min: 0,
    default: 0
  },

  // Current Available Credit balance after this payment is posted.
  // The dedicated paymentcreditbalances collection is the live source of truth.
  availableCreditBalance: {
    type: Number,
    min: 0,
    default: 0
  },

  description: {
    type: String,
    default: ''
  },
  allocations: {
    type: [paymentAllocationSchema],
    default: []
  },
  attachments: {
    type: [paymentAttachmentSchema],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SalePayment', paymentSchema, 'salepayments');