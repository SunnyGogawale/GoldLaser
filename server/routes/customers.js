const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const Invoice = require('../models/SaleInvoice');
const Payment = require('../models/SalePayment');
const User = require('../models/User');

function invoicePaidLookupStage() {
  return {
    $lookup: {
      from: 'salepayments',
      let: { invoiceId: '$_id' },
      pipeline: [
        { $unwind: '$allocations' },
        { $match: { $expr: { $eq: ['$allocations.invoiceId', '$$invoiceId'] } } },
        { $group: { _id: null, paidAmount: { $sum: '$allocations.amount' } } }
      ],
      as: 'paidAgg'
    }
  };
}

function invoiceComputedFieldsStage() {
  return {
    $addFields: {
      paidAmount: { $ifNull: [{ $arrayElemAt: ['$paidAgg.paidAmount', 0] }, 0] },
      pendingAmount: {
        $max: [
          0,
          {
            $subtract: [
              { $ifNull: ['$totalAmount', 0] },
              { $ifNull: [{ $arrayElemAt: ['$paidAgg.paidAmount', 0] }, 0] }
            ]
          }
        ]
      }
    }
  };
}

async function getCustomerOutstanding(customerId) {
  try {
    const pendingAgg = await Invoice.aggregate([
      { $match: { customerId } },
      invoicePaidLookupStage(),
      invoiceComputedFieldsStage(),
      { $group: { _id: null, totalPendingAmount: { $sum: '$pendingAmount' } } }
    ]);
    return pendingAgg.length > 0 ? pendingAgg[0].totalPendingAmount : 0;
  } catch {
    return 0;
  }
}

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

// Helper function to get the next customer ID
async function getNextCustomerId() {
  const customers = await Customer.find({}, 'id');
  let maxId = 0;
  
  for (const customer of customers) {
    if (customer.id && customer.id.startsWith('CUST')) {
      const idNumber = parseInt(customer.id.replace('CUST', ''), 10);
      if (!isNaN(idNumber) && idNumber > maxId) {
        maxId = idNumber;
      }
    }
  }
  
  return `CUST${maxId + 1}`;
}

// Get next customer ID
router.get('/next-id', async (req, res) => {
  try {
    const generatedId = await getNextCustomerId();
    res.json({ nextId: generatedId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get customers with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const sortColumn = req.query.sortColumn || '';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    let query = {};
    if (search) {
      query = {
        $or: [
          { companyName: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const total = await Customer.countDocuments(query);
    
    // Define sort object
    let sortObj = { createdAt: -1 }; // Default sort
    if (sortColumn && ['companyName', 'customerName', 'contactNumber', 'email'].includes(sortColumn)) {
      sortObj = { [sortColumn]: sortOrder };
    }

    const customers = await Customer.find(query)
      .populate('createdBy', 'fullName email roll')
      .sort(sortObj)
      .skip(skip)
      .limit(limit);

    // Calculate outstanding for each customer
    let customersWithOutstanding = await Promise.all(
      customers.map(async (customer) => {
        const customerObj = customer.toObject();
        customerObj.outstanding = await getCustomerOutstanding(customer._id);
        customerObj.customFields = customer.customFields || {};
        return customerObj;
      })
    );

    // If sorting by outstanding, do it client-side after calculation
    if (sortColumn === 'outstanding') {
      customersWithOutstanding.sort((a, b) => {
        const valA = a.outstanding || 0;
        const valB = b.outstanding || 0;
        return sortOrder === 1 ? valA - valB : valB - valA;
      });
    }
    
    res.json({
      customers: customersWithOutstanding,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get a single customer by ID
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate('createdBy', 'fullName email roll')
      .populate('updatedBy', 'fullName email roll');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    if (customer.updatedBy && (!customer.updatedByName || !customer.updatedByEmail)) {
      customer.updatedByName = customer.updatedByName || customer.updatedBy?.fullName || '';
      customer.updatedByEmail = customer.updatedByEmail || customer.updatedBy?.email || '';
      await customer.save();
    }
    if (!Array.isArray(customer.activity) || customer.activity.length === 0) {
      const activity = [];
      activity.push({
        action: 'create',
        at: customer.createdAt || new Date(),
        userId: customer.createdBy?._id || customer.createdBy || null,
        userName: customer.createdBy?.fullName || '',
        userEmail: customer.createdBy?.email || ''
      });
      if (
        customer.updatedAt &&
        customer.createdAt &&
        new Date(customer.updatedAt).getTime() !== new Date(customer.createdAt).getTime() &&
        (customer.updatedBy || customer.updatedByName || customer.updatedByEmail)
      ) {
        activity.unshift({
          action: 'update',
          at: customer.updatedAt,
          userId: customer.updatedBy?._id || customer.updatedBy || null,
          userName: customer.updatedBy?.fullName || customer.updatedByName || '',
          userEmail: customer.updatedBy?.email || customer.updatedByEmail || ''
        });
      }
      customer.activity = activity;
      await customer.save();
    }
    const customerObj = customer.toObject();
    customerObj.outstanding = await getCustomerOutstanding(customer._id);
    res.json(customerObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new customer
router.post('/', async (req, res) => {
  try {
    let generatedId = req.body.id;
    
    if (!generatedId) {
      generatedId = await getNextCustomerId();
    }

    const customerName = (req.body.customerName || '').trim();
    const companyName = (req.body.companyName || '').trim();

    const authUser = await getAuthUserInfo(req);

    const customer = new Customer({
      id: generatedId,
      customerName,
      companyName,
      contactNumber: req.body.contactNumber,
      alternateNumber: req.body.alternateNumber || '',
      email: req.body.email,
      address: req.body.address,
      note: req.body.note,
      customFields: req.body.customFields || {},
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

    const newCustomer = await customer.save();
    res.status(201).json(newCustomer);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Customer ID must be unique. A customer with this ID already exists.' });
    }
    res.status(400).json({ message: err.message });
  }
});

// Update a customer
router.put('/:id', async (req, res) => {
  try {
    const existing = await Customer.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Customer not found' });

    const update = { ...req.body };
    delete update.createdBy;
    delete update.updatedBy;
    delete update.updatedByName;
    delete update.updatedByEmail;
    delete update.activity;

    if (typeof update.customerName === 'string') {
      update.customerName = update.customerName.trim();
    }
    if (typeof update.companyName === 'string') {
      update.companyName = update.companyName.trim();
    }
    // Ensure customFields is an object
    if (update.customFields !== undefined && typeof update.customFields !== 'object') {
      update.customFields = {};
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

    const customer = await Customer.findByIdAndUpdate(req.params.id, updateOp, { new: true });
    res.json(customer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a customer
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const [invoiceResult, paymentResult] = await Promise.all([
      Invoice.deleteMany({ customerId: customer._id }),
      Payment.deleteMany({ customerId: customer._id })
    ]);

    await Customer.findByIdAndDelete(customer._id);

    const existingCustomerIds = (await Customer.find({}, { _id: 1 }).lean()).map((c) => c._id);
    const [orphanInvoiceResult, orphanPaymentResult] = await Promise.all([
      Invoice.deleteMany({
        $or: [
          { customerId: { $exists: false } },
          { customerId: null },
          { customerId: { $nin: existingCustomerIds } }
        ]
      }),
      Payment.deleteMany({
        $or: [
          { customerId: { $exists: false } },
          { customerId: null },
          { customerId: { $nin: existingCustomerIds } }
        ]
      })
    ]);

    res.json({
      message: 'Customer deleted',
      deleted: {
        customers: 1,
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
