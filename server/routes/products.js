const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const { sendErrorResponse } = require('../utils/errorHandler');

const router = express.Router();

const getBearerToken = (req) => {
  const [type, token] = String(req.headers.authorization || '').split(' ');
  return type === 'Bearer' && token ? token : null;
};

const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.user?.id;
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId).select('_id roll role');
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    req.auth = {
      userId: user._id,
      isAdmin: String(user.roll || user.role || 'user').toLowerCase() === 'admin'
    };
    return next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.auth?.isAdmin) return res.status(403).json({ message: 'Forbidden' });
  return next();
};

const normalizeProductName = (value) => String(value || '').trim();

const duplicateProductResponse = (res) => res.status(400).json({
  message: 'Product name must be unique, ignoring letter case.'
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const query = {};
    if (!req.auth.isAdmin || String(req.query.activeOnly).toLowerCase() === 'true') query.isActive = true;
    if (req.query.search) {
      query.productName = { $regex: String(req.query.search).trim(), $options: 'i' };
    }

    const products = await Product.find(query)
      .populate('createdBy', 'fullName email roll')
      .sort({ productName: 1 });
    return res.json({ products });
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'products.list');
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const query = { _id: req.params.id };
    if (!req.auth.isAdmin) query.isActive = true;
    const product = await Product.findOne(query).populate('createdBy', 'fullName email roll');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json(product);
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'products.get');
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const productName = normalizeProductName(req.body.productName);
    if (!productName) return res.status(400).json({ message: 'Product name is required' });

    const product = await Product.create({
      productName,
      isActive: req.body.isActive === undefined ? true : Boolean(req.body.isActive),
      createdBy: req.auth.userId,
      createdOn: new Date()
    });
    return res.status(201).json(product);
  } catch (err) {
    if (err.code === 11000) return duplicateProductResponse(res);
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'products.create');
  }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const update = {};
    if (req.body.productName !== undefined) {
      const productName = normalizeProductName(req.body.productName);
      if (!productName) return res.status(400).json({ message: 'Product name is required' });
      update.productName = productName;
      update.productNameKey = productName.toLocaleLowerCase();
    }
    if (req.body.isActive !== undefined) update.isActive = Boolean(req.body.isActive);

    const product = await Product.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json(product);
  } catch (err) {
    if (err.code === 11000) return duplicateProductResponse(res);
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'products.update');
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'products.delete');
  }
});

module.exports = router;