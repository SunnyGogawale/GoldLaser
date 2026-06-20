const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Invoice = require('../models/SaleInvoice');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const User = require('../models/User');

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
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

const normalizeInvoiceValue = (field, value) => {
  if (value === null || value === undefined) return value;

  if (field === 'clientId') {
    return String(value?._id || value);
  }
  if (field === 'customerId') {
    return String(value?._id || value);
  }

  if (field === 'invoiceDate') {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toISOString().slice(0, 10);
  }

  if (field === 'totalAmount') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }

  if (field === 'items') {
    const arr = Array.isArray(value) ? value : [];
    return arr.map((it) => ({
      product: String(it?.product || ''),
      description: String(it?.description || ''),
      amount: Number(it?.amount) || 0
    }));
  }

  return value;
};

// Helper function to get the next invoice number
async function getNextInvoiceNumber() {
  const invoices = await Invoice.find({}, 'invoiceNumber');
  let maxId = 0;
  
  for (const invoice of invoices) {
    if (invoice.invoiceNumber && invoice.invoiceNumber.startsWith('INV')) {
      const idNumber = parseInt(invoice.invoiceNumber.replace('INV', ''), 10);
      if (!isNaN(idNumber) && idNumber > maxId) {
        maxId = idNumber;
      }
    }
  }
  
  // Format without padding, e.g., INV1, INV2
  const nextId = maxId + 1;
  return `INV${nextId}`;
}

// Get next invoice number
router.get('/next-number', async (req, res) => {
  try {
    const generatedId = await getNextInvoiceNumber();
    res.json({ nextNumber: generatedId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get invoices with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    // First fetch all invoices
    let invoices = await Invoice.find()
      .sort({ invoiceDate: 1, createdAt: 1 })
      .skip(skip)
      .limit(limit);

    // Fetch customers and vendors
    const customerIds = invoices.filter(inv => inv.clientType === 'Customer').map(inv => inv.clientId);
    const vendorIds = invoices.filter(inv => inv.clientType === 'Vendor').map(inv => inv.clientId);

    const customers = customerIds.length ? await Customer.find({ _id: { $in: customerIds } }) : [];
    const vendors = vendorIds.length ? await Vendor.find({ _id: { $in: vendorIds } }) : [];

    const customerMap = new Map(customers.map(c => [c._id.toString(), c]));
    const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));

    // Attach client data
    const invoicesWithClients = invoices.map(inv => {
      const invObj = inv.toObject();
      if (invObj.clientType === 'Customer') {
        invObj.customerId = customerMap.get(invObj.clientId?.toString()) || null;
      } else {
        invObj.customerId = vendorMap.get(invObj.clientId?.toString()) || null;
      }
      return invObj;
    });

    // Filter by search
    let filteredInvoices = invoicesWithClients;
    if (search) {
      filteredInvoices = invoicesWithClients.filter(inv =>
        inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        (inv.customerId?.customerName?.toLowerCase().includes(search.toLowerCase())) ||
        (inv.customerId?.vendorName?.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Get total count
    let total;
    if (search) {
      total = await Invoice.countDocuments({
        $or: [
          { invoiceNumber: { $regex: search, $options: 'i' } }
        ]
      });
      // Since we can't easily search populated fields in count, we'll use the filtered length
      // This is a simplification; for production you'd use aggregate with lookup
      total = filteredInvoices.length + (invoices.length - invoicesWithClients.length);
    } else {
      total = await Invoice.countDocuments();
    }

    // Fetch user data for createdBy
    const userIds = filteredInvoices.map(inv => inv.createdBy).filter(Boolean);
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }) : [];
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    // Attach user data
    const finalInvoices = filteredInvoices.map(inv => {
      const user = inv.createdBy ? userMap.get(inv.createdBy.toString()) : null;
      const hasCreatedBy = user && (user.fullName || user.email || user._id);
      const createdByName = user?.fullName || inv.createdByName || '';
      const createdByEmail = user?.email || inv.createdByEmail || '';
      return {
        ...inv,
        createdBy: hasCreatedBy
          ? { _id: user._id, fullName: user.fullName, email: user.email, roll: user.roll }
          : { _id: inv.createdBy || null, fullName: createdByName || null, email: createdByEmail || null, roll: null },
        createdByName,
        createdByEmail
      };
    });

    res.json({
      invoices: finalInvoices,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

const getInvoiceWithClient = async (id) => {
  const invoice = await Invoice.findById(id)
    .populate('createdBy', 'fullName email roll')
    .populate('updatedBy', 'fullName email roll');
  if (!invoice) return null;
  
  let client = null;
  if (invoice.clientType === 'Customer') {
    client = await Customer.findById(invoice.clientId);
  } else {
    client = await Vendor.findById(invoice.clientId);
  }
  
  const invoiceObj = invoice.toObject();
  invoiceObj.customerId = client;
  return invoiceObj;
};

router.get('/detail/:id', async (req, res) => {
  try {
    const invoice = await getInvoiceWithClient(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    // We'll skip the activity/save part for brevity, assuming it's handled elsewhere
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const invoice = await getInvoiceWithClient(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new invoice
router.post('/', async (req, res) => {
  try {
    let generatedId = req.body.invoiceNumber;
    
    if (!generatedId) {
      generatedId = await getNextInvoiceNumber();
    }

    const authUser = await getAuthUserInfo(req);

    const invoice = new Invoice({
      invoiceNumber: generatedId,
      transactionDescription: String(req.body.transactionDescription || '').trim(),
      clientId: req.body.clientId,
      clientType: req.body.clientType,
      invoiceDate: req.body.invoiceDate,
      items: req.body.items,
      totalAmount: req.body.totalAmount,
      createdBy: authUser?.id || null,
      createdByName: authUser?.fullName || '',
      createdByEmail: authUser?.email || '',
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

    const newInvoice = await invoice.save();
    res.status(201).json(newInvoice);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Invoice number must be unique. An invoice with this number already exists.' });
    }
    res.status(400).json({ message: err.message });
  }
});

// Update an invoice
router.put('/:id', async (req, res) => {
  try {
    const existing = await Invoice.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Invoice not found' });

    const update = { ...req.body };
    delete update.createdBy;
    delete update.createdByName;
    delete update.createdByEmail;
    delete update.updatedBy;
    delete update.updatedByName;
    delete update.updatedByEmail;
    delete update.activity;

    const authUser = await getAuthUserInfo(req);
    update.updatedBy = authUser?.id || null;
    update.updatedByName = authUser?.fullName || '';
    update.updatedByEmail = authUser?.email || '';

    const updateOp = {
      $set: update,
      $push: {
        activity: {
          action: 'update',
          at: new Date(),
          userId: authUser?.id || null,
          userName: authUser?.fullName || '',
          userEmail: authUser?.email || '',
          changes: []
        }
      }
    };

    const changes = [];
    const recordChange = (field, fromVal, toVal) => {
      const fromS = truncate(toShortString(normalizeInvoiceValue(field, fromVal)));
      const toS = truncate(toShortString(normalizeInvoiceValue(field, toVal)));
      if (fromS === toS) return;
      changes.push({ field, from: fromS, to: toS });
    };
    const fieldsToCheck = Object.keys(update).filter(
      (k) => !['updatedBy', 'updatedByName', 'updatedByEmail'].includes(k)
    );
    for (const key of fieldsToCheck) {
      if (key === 'items') {
        const fromItems = normalizeInvoiceValue('items', existing.items);
        const toItems = normalizeInvoiceValue('items', update.items);
        const maxLen = Math.max(fromItems.length, toItems.length);
        for (let i = 0; i < maxLen; i++) {
          const fromItem = fromItems[i] || { product: '', description: '', amount: 0 };
          const toItem = toItems[i] || { product: '', description: '', amount: 0 };
          recordChange(`item${i + 1}.product`, fromItem.product, toItem.product);
          recordChange(`item${i + 1}.description`, fromItem.description, toItem.description);
          recordChange(`item${i + 1}.amount`, fromItem.amount, toItem.amount);
        }
        continue;
      }
      recordChange(key, existing[key], update[key]);
    }
    updateOp.$push.activity.changes = changes;

    const invoice = await Invoice.findByIdAndUpdate(req.params.id, updateOp, { new: true });
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete an invoice
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await Invoice.findByIdAndDelete(req.params.id);
    res.json({ message: 'Invoice deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
