const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Invoice = require('../models/SaleInvoice');
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

    let pipeline = [
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customerId'
        }
      },
      {
        $unwind: {
          path: "$customerId",
          preserveNullAndEmptyArrays: true
        }
      }
    ];

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { invoiceNumber: { $regex: search, $options: 'i' } },
            { 'customerId.customerName': { $regex: search, $options: 'i' } }
          ]
        }
      });
    }

    // Get total count after match
    let total = 0;
    if (search) {
      const countPipeline = [...pipeline, { $count: 'total' }];
      const countResult = await Invoice.aggregate(countPipeline);
      total = countResult.length > 0 ? countResult[0].total : 0;
    } else {
      total = await Invoice.countDocuments();
    }

    // Continue with sort and pagination
    pipeline.push({
      $addFields: {
        numericId: {
          $toInt: {
            $replaceAll: { input: "$invoiceNumber", find: "INV", replacement: "" }
          }
        }
      }
    });
    
    pipeline.push({ $sort: { invoiceDate: 1, numericId: 1, createdAt: 1 } }); // Old -> New (ascending)
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    pipeline.push({
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'createdBy'
      }
    });
    pipeline.push({ $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } });
    pipeline.push({
      $addFields: {
        createdBy: {
          _id: '$createdBy._id',
          fullName: '$createdBy.fullName',
          email: '$createdBy.email',
          roll: '$createdBy.roll'
        }
      }
    });

    const invoicesRaw = await Invoice.aggregate(pipeline);
    const invoices = (invoicesRaw || []).map((inv) => {
      const hasCreatedBy =
        inv?.createdBy &&
        (inv.createdBy.fullName || inv.createdBy.email || inv.createdBy._id);
      const createdByName = inv?.createdBy?.fullName || inv?.createdByName || '';
      const createdByEmail = inv?.createdBy?.email || inv?.createdByEmail || '';
      const createdBy = hasCreatedBy
        ? inv.createdBy
        : {
            _id: inv?.createdBy?._id || inv?.createdBy || null,
            fullName: createdByName || null,
            email: createdByEmail || null,
            roll: null
          };
      return {
        ...inv,
        createdBy,
        createdByName,
        createdByEmail
      };
    });

    res.json({
      invoices,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/detail/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('customerId')
      .populate('createdBy', 'fullName email roll')
      .populate('updatedBy', 'fullName email roll');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    if (invoice.createdBy && (!invoice.createdByName || !invoice.createdByEmail)) {
      invoice.createdByName = invoice.createdByName || invoice.createdBy?.fullName || '';
      invoice.createdByEmail = invoice.createdByEmail || invoice.createdBy?.email || '';
      await invoice.save();
    }
    if (invoice.updatedBy && (!invoice.updatedByName || !invoice.updatedByEmail)) {
      invoice.updatedByName = invoice.updatedByName || invoice.updatedBy?.fullName || '';
      invoice.updatedByEmail = invoice.updatedByEmail || invoice.updatedBy?.email || '';
      await invoice.save();
    }
    if (!Array.isArray(invoice.activity) || invoice.activity.length === 0) {
      const activity = [];
      activity.push({
        action: 'create',
        at: invoice.createdAt || new Date(),
        userId: invoice.createdBy?._id || invoice.createdBy || null,
        userName: invoice.createdBy?.fullName || invoice.createdByName || '',
        userEmail: invoice.createdBy?.email || invoice.createdByEmail || ''
      });
      if (
        invoice.updatedAt &&
        invoice.createdAt &&
        new Date(invoice.updatedAt).getTime() !== new Date(invoice.createdAt).getTime() &&
        (invoice.updatedBy || invoice.updatedByName || invoice.updatedByEmail)
      ) {
        activity.unshift({
          action: 'update',
          at: invoice.updatedAt,
          userId: invoice.updatedBy?._id || invoice.updatedBy || null,
          userName: invoice.updatedBy?.fullName || invoice.updatedByName || '',
          userEmail: invoice.updatedBy?.email || invoice.updatedByEmail || ''
        });
      }
      invoice.activity = activity;
      await invoice.save();
    }
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('customerId')
      .populate('createdBy', 'fullName email roll')
      .populate('updatedBy', 'fullName email roll');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    if (invoice.createdBy && (!invoice.createdByName || !invoice.createdByEmail)) {
      invoice.createdByName = invoice.createdByName || invoice.createdBy?.fullName || '';
      invoice.createdByEmail = invoice.createdByEmail || invoice.createdBy?.email || '';
      await invoice.save();
    }
    if (invoice.updatedBy && (!invoice.updatedByName || !invoice.updatedByEmail)) {
      invoice.updatedByName = invoice.updatedByName || invoice.updatedBy?.fullName || '';
      invoice.updatedByEmail = invoice.updatedByEmail || invoice.updatedBy?.email || '';
      await invoice.save();
    }
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
      customerId: req.body.customerId,
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
