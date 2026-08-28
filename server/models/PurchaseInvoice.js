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

const invoiceItemSchema = new mongoose.Schema({
  product: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  }
});

const invoiceAttachmentSchema = new mongoose.Schema({
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

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  transactionDescription: {
    type: String,
    default: ''
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
  invoiceDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  items: [invoiceItemSchema],
  attachments: {
    type: [invoiceAttachmentSchema],
    default: []
  },
  totalAmount: {
    type: Number,
    required: true,
    default: 0
  }
}, {
  timestamps: true
});

// Supports client ledger queries and ordered invoice timelines.
invoiceSchema.index({ clientId: 1, clientType: 1, invoiceDate: 1, createdAt: 1 });
invoiceSchema.index({ invoiceDate: 1, createdAt: 1 });

module.exports = mongoose.model('PurchaseInvoice', invoiceSchema);
