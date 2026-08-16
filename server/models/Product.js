const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    productCode: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },

    product: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },

    description: {
      type: String,
      required: true,
      trim: true,
      unique: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Product', productSchema);