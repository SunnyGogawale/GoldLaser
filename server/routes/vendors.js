const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Vendor = require('../models/Vendor');
const Invoice = require('../models/PurchaseInvoice');
const Payment = require('../models/PurchasePayment');
const User = require('../models/User');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
};

const getAuthUserId = (req) => {
  try {
    const token = getBearerToken(req);
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.user?.id || decoded?.id || decoded?.userId || decoded?._id;
    return userId ? String(userId) : null;
  } catch {
    return null;
  }
};

const getAuthUserInfo = async (req) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return null;
    const user = await User.findById(userId).select('fullName email');
    return {
      id: userId,
      fullName: user?.fullName || '',
      email: user?.email || ''
    };
  } catch {
    return null;
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findById(userId);
    const roll = String(user?.roll || user?.role || 'user').toLowerCase();
    if (roll !== 'admin') return res.status(403).json({ message: 'Forbidden' });

    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

const toShortString = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        const s = value.toString();
        if (typeof s === 'string' && s !== '[object Object]') return s;
      }
      return String(value);
    }
  }
  return String(value);
};

const truncate = (s, max = 140) => {
  const str = String(s || '');
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
};

// Helper function to get the next vendor ID
async function getNextVendorId() {
  const vendors = await Vendor.find({}, 'id');
  let maxId = 0;
  
  for (const vendor of vendors) {
    if (vendor.id && vendor.id.startsWith('VEND')) {
      const idNumber = parseInt(vendor.id.replace('VEND', ''), 10);
      if (!isNaN(idNumber) && idNumber > maxId) {
        maxId = idNumber;
      }
    }
  }
  
  return `VEND${maxId + 1}`;
}

// Get next vendor ID
router.get('/next-id', async (req, res) => {
  try {
    const generatedId = await getNextVendorId();
    res.json({ nextId: generatedId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get vendors with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    let query = {};
    if (search) {
      query = {
        $or: [
          { id: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { vendorName: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const total = await Vendor.countDocuments(query);
    const vendors = await Vendor.find(query)
      .populate('createdBy', 'fullName email roll')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      vendors,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get a single vendor by ID
router.get('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid vendor id' });
    const vendor = await Vendor.findById(req.params.id)
      .populate('createdBy', 'fullName email roll')
      .populate('updatedBy', 'fullName email roll');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    if (vendor.updatedBy && (!vendor.updatedByName || !vendor.updatedByEmail)) {
      vendor.updatedByName = vendor.updatedByName || vendor.updatedBy?.fullName || '';
      vendor.updatedByEmail = vendor.updatedByEmail || vendor.updatedBy?.email || '';
      await vendor.save();
    }
    if (!Array.isArray(vendor.activity) || vendor.activity.length === 0) {
      const activity = [];
      activity.push({
        action: 'create',
        at: vendor.createdAt || new Date(),
        userId: vendor.createdBy?._id || vendor.createdBy || null,
        userName: vendor.createdBy?.fullName || '',
        userEmail: vendor.createdBy?.email || ''
      });
      if (
        vendor.updatedAt &&
        vendor.createdAt &&
        new Date(vendor.updatedAt).getTime() !== new Date(vendor.createdAt).getTime() &&
        (vendor.updatedBy || vendor.updatedByName || vendor.updatedByEmail)
      ) {
        activity.unshift({
          action: 'update',
          at: vendor.updatedAt,
          userId: vendor.updatedBy?._id || vendor.updatedBy || null,
          userName: vendor.updatedBy?.fullName || vendor.updatedByName || '',
          userEmail: vendor.updatedBy?.email || vendor.updatedByEmail || ''
        });
      }
      vendor.activity = activity;
      await vendor.save();
    }
    res.json(vendor);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new vendor
router.post('/', async (req, res) => {
  try {
    let generatedId = req.body.id;
    
    if (!generatedId) {
      generatedId = await getNextVendorId();
    }

    const firstName = (req.body.firstName || '').trim();
    const lastName = (req.body.lastName || '').trim();
    const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();

    const authUser = await getAuthUserInfo(req);

    const vendor = new Vendor({
      id: generatedId,
      firstName,
      lastName,
      vendorName: fullName,
      contactNumber: req.body.contactNumber,
      email: req.body.email,
      address: req.body.address,
      note: req.body.note,
      createdBy: authUser?.id || null,
      activity: [
        {
          action: 'create',
          at: new Date(),
          userId: authUser?.id || null,
          userName: authUser?.fullName || '',
          userEmail: authUser?.email || ''
        }
      ]
    });

    const newVendor = await vendor.save();
    res.status(201).json(newVendor);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Vendor ID must be unique. A vendor with this ID already exists.' });
    }
    res.status(400).json({ message: err.message });
  }
});

// Update a vendor
router.put('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid vendor id' });
    const existing = await Vendor.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Vendor not found' });

    const update = { ...req.body };
    delete update.createdBy;
    delete update.updatedBy;
    delete update.updatedByName;
    delete update.updatedByEmail;
    delete update.activity;

    if (typeof update.firstName === 'string' || typeof update.lastName === 'string') {
      const firstName = (update.firstName || '').trim();
      const lastName = (update.lastName || '').trim();
      update.firstName = firstName;
      update.lastName = lastName;
      update.vendorName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();
    }

    const authUser = await getAuthUserInfo(req);
    update.updatedBy = authUser?.id || null;
    update.updatedByName = authUser?.fullName || '';
    update.updatedByEmail = authUser?.email || '';

    const changes = [];
    const recordChange = (field, fromVal, toVal) => {
      const fromS = truncate(toShortString(fromVal));
      const toS = truncate(toShortString(toVal));
      if (fromS === toS) return;
      changes.push({ field, from: fromS, to: toS });
    };

    const fieldsToCheck = Object.keys(update).filter(
      (k) => !['updatedBy', 'updatedByName', 'updatedByEmail'].includes(k)
    );
    for (const key of fieldsToCheck) {
      recordChange(key, existing[key], update[key]);
    }

    const updateOp = {
      $set: update,
      $push: {
        activity: {
          action: 'update',
          at: new Date(),
          userId: authUser?.id || null,
          userName: authUser?.fullName || '',
          userEmail: authUser?.email || '',
          changes
        }
      }
    };

    const vendor = await Vendor.findByIdAndUpdate(req.params.id, updateOp, { new: true });
    res.json(vendor);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a vendor
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid vendor id' });
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const [invoiceResult, paymentResult] = await Promise.all([
      Invoice.deleteMany({ vendorId: vendor._id }),
      Payment.deleteMany({ vendorId: vendor._id })
    ]);

    await Vendor.findByIdAndDelete(vendor._id);

    const existingVendorIds = (await Vendor.find({}, { _id: 1 }).lean()).map((c) => c._id);
    const [orphanInvoiceResult, orphanPaymentResult] = await Promise.all([
      Invoice.deleteMany({
        $or: [
          { vendorId: { $exists: false } },
          { vendorId: null },
          { vendorId: { $nin: existingVendorIds } }
        ]
      }),
      Payment.deleteMany({
        $or: [
          { vendorId: { $exists: false } },
          { vendorId: null },
          { vendorId: { $nin: existingVendorIds } }
        ]
      })
    ]);

    res.json({
      message: 'Vendor deleted',
      deleted: {
        vendors: 1,
        invoices: invoiceResult?.deletedCount || 0,
        payments: paymentResult?.deletedCount || 0,
        orphanInvoices: orphanInvoiceResult?.deletedCount || 0,
        orphanPayments: orphanPaymentResult?.deletedCount || 0
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
