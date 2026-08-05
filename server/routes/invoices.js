const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Invoice = require('../models/SaleInvoice');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const { sendErrorResponse } = require('../utils/errorHandler');

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

  if (field === 'attachments') {
    const arr = Array.isArray(value) ? value : [];
    return arr.map((attachment) => ({
      name: String(attachment?.name || ''),
      type: String(attachment?.type || ''),
      dataUrl: String(attachment?.dataUrl || '')
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'invoices.nextNumber');
  }
});

router.post('/bulk-delete', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) {
      return res.status(400).json({ message: 'No invoice ids were provided.' });
    }

    const deleted = await Invoice.deleteMany({ _id: { $in: ids } });
    res.json({ deletedCount: deleted.deletedCount || 0 });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'invoices.bulkDelete');
  }
});

// Get invoices with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const searchLower = search.toLowerCase();
    const sortColumn = req.query.sortColumn || 'invoiceDate';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    // First fetch all invoices without pagination (since we need to sort after attaching clients)
    let invoices = await Invoice.find()
      .sort({ invoiceDate: 1, createdAt: 1 });

    // Fetch customers and vendors
    const customerIds = invoices.filter(inv => inv.clientType === 'Customer').map(inv => inv.clientId);
    const vendorIds = invoices.filter(inv => inv.clientType === 'Vendor').map(inv => inv.clientId);

    const customers = customerIds.length ? await Customer.find({ _id: { $in: customerIds } }) : [];
    const vendors = vendorIds.length ? await Vendor.find({ _id: { $in: vendorIds } }) : [];

    const customerMap = new Map(customers.map(c => [c._id.toString(), c]));
    const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));

    // Attach client data as vendorId (consistent with purchase invoices)
    const invoicesWithClients = invoices.map(inv => {
      const invObj = inv.toObject();
      if (invObj.clientType === 'Customer') {
        invObj.vendorId = customerMap.get(invObj.clientId?.toString()) || null;
      } else {
        invObj.vendorId = vendorMap.get(invObj.clientId?.toString()) || null;
      }
      return invObj;
    });

    // Filter by search
    let filteredInvoices = invoicesWithClients;
    if (search) {
      filteredInvoices = invoicesWithClients.filter((inv) => {
        const items = Array.isArray(inv.items) ? inv.items : [];
        const itemProducts = items.map((item) => String(item?.product || ''));
        const itemDescriptions = items.map((item) => String(item?.description || ''));
        const itemAmounts = items.map((item) => String(item?.amount || ''));
        const searchableParts = [
          inv.invoiceNumber,
          inv.transactionDescription,
          inv.invoiceDate,
          inv.totalAmount,
          inv.clientType,
          inv.vendorId?.id,
          inv.vendorId?.customerName,
          inv.vendorId?.vendorName,
          inv.vendorId?.companyName,
          inv.vendorId?.contactNumber,
          inv.vendorId?.alternateNumber,
          inv.vendorId?.email,
          inv.vendorId?.address,
          inv.vendorId?.shippingAddress,
          inv.vendorId?.note,
          ...itemProducts,
          ...itemDescriptions,
          ...itemAmounts
        ];

        const searchableText = searchableParts
          .map((part) => String(part || ''))
          .join(' ')
          .toLowerCase();

        return searchableText.includes(searchLower);
      });
    }

    // Sort the filtered invoices
    filteredInvoices.sort((a, b) => {
      let aVal, bVal;
      switch(sortColumn) {
        case 'clientId':
        case 'vendorId':
          // Get client name for sorting
          aVal = (a.vendorId?.vendorName || a.vendorId?.customerName || '').toLowerCase();
          bVal = (b.vendorId?.vendorName || b.vendorId?.customerName || '').toLowerCase();
          break;
        case 'invoiceNumber':
          aVal = a.invoiceNumber || '';
          bVal = b.invoiceNumber || '';
          break;
        case 'invoiceDate':
          aVal = new Date(a.invoiceDate);
          bVal = new Date(b.invoiceDate);
          break;
        case 'totalAmount':
          aVal = a.totalAmount || 0;
          bVal = b.totalAmount || 0;
          break;
        case 'transactionDescription':
          aVal = (a.transactionDescription || '').toLowerCase();
          bVal = (b.transactionDescription || '').toLowerCase();
          break;
        default:
          aVal = new Date(a.invoiceDate);
          bVal = new Date(b.invoiceDate);
      }

      if (aVal < bVal) return -1 * sortOrder;
      if (aVal > bVal) return 1 * sortOrder;
      return 0;
    });

    // Get total count
    const total = search ? filteredInvoices.length : await Invoice.countDocuments();

    // Apply pagination after filtering and sorting
    const paginatedInvoices = filteredInvoices.slice(skip, skip + limit);

    // Fetch user data for createdBy
    const userIds = paginatedInvoices.map(inv => inv.createdBy).filter(Boolean);
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }) : [];
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    // Attach user data
    const finalInvoices = paginatedInvoices.map(inv => {
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'invoices.list');
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
  invoiceObj.vendorId = client;
  return invoiceObj;
};

router.get('/detail/:id', async (req, res) => {
  try {
    const invoice = await getInvoiceWithClient(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    // We'll skip the activity/save part for brevity, assuming it's handled elsewhere
    res.json(invoice);
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'invoices.detail');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const invoice = await getInvoiceWithClient(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'invoices.get');
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
    const normalizedItems = normalizeInvoiceValue('items', req.body.items || []);
    const normalizedAttachments = normalizeInvoiceValue('attachments', req.body.attachments);
    const requestedTotal = Number(req.body.totalAmount || 0);

    const existingInvoice = generatedId
      ? await Invoice.findOne({ invoiceNumber: generatedId, clientId: req.body.clientId, clientType: req.body.clientType })
      : null;

    if (existingInvoice) {
      const newItem = normalizedItems[0];
      const updatedTotal = Number(existingInvoice.totalAmount || 0) + (Number(newItem?.amount) || 0);
      const updateOps = {
        $set: {
          transactionDescription: String(req.body.transactionDescription || existingInvoice.transactionDescription || '').trim(),
          invoiceDate: req.body.invoiceDate || existingInvoice.invoiceDate,
          totalAmount: updatedTotal,
          updatedBy: authUser?.id || existingInvoice.updatedBy || null,
          updatedByName: authUser?.fullName || existingInvoice.updatedByName || '',
          updatedByEmail: authUser?.email || existingInvoice.updatedByEmail || ''
        },
        $push: {
          activity: {
            action: 'update',
            at: new Date(),
            userId: authUser?.id || null,
            userName: authUser?.fullName || '',
            userEmail: authUser?.email || '',
            changes: [
              {
                field: 'items',
                from: '',
                to: newItem ? JSON.stringify(newItem) : ''
              }
            ]
          }
        }
      };

      if (newItem) {
        updateOps.$push.items = { $each: [newItem] };
      }

      const updatedInvoice = await Invoice.findByIdAndUpdate(existingInvoice._id, updateOps, { new: true });
      return res.status(200).json(updatedInvoice);
    }

    const invoice = new Invoice({
      invoiceNumber: generatedId,
      transactionDescription: String(req.body.transactionDescription || '').trim(),
      clientId: req.body.clientId,
      clientType: req.body.clientType,
      invoiceDate: req.body.invoiceDate,
      items: normalizedItems,
      attachments: normalizedAttachments,
      totalAmount: requestedTotal || normalizedItems.reduce((sum, item) => sum + Number(item?.amount || 0), 0),
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'invoices.create');
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'invoices.update');
  }
});

// Delete an invoice
router.delete('/:id', async (req, res) => {
  try {
    await Invoice.findByIdAndDelete(req.params.id);
    res.json({ message: 'Invoice deleted' });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'invoices.delete');
  }
});

module.exports = router;
