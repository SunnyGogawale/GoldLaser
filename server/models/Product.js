const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: true,
    trim: true
  },
  productNameKey: {
    type: String,
    required: true,
    select: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdOn: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, { timestamps: true });

productSchema.pre('validate', function setProductNameKey() {
  if (typeof this.productName === 'string') {
    this.productName = this.productName.trim();
    this.productNameKey = this.productName.toLocaleLowerCase();
  }
});

productSchema.index({ productNameKey: 1 }, { unique: true });
productSchema.index({ isActive: 1, productName: 1 });

module.exports = mongoose.model('Product', productSchema);