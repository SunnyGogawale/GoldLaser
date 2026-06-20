const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Payment = require('../models/SalePayment');
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

const normalizePaymentValue = (field, value) => {
  if (value === null || value === undefined) return value;

  if (field === 'clientId') {
    return String(value?._id || value);
  }
  if (field === 'customerId') {
    return String(value?._id || value);
  }

  if (field === 'paymentDate') {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toISOString().slice(0, 10);
  }

  if (field === 'amount') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }

  return value;
};

async function getNextPaymentNumber() {
  const payments = await Payment.find({}, 'paymentNumber');
  let maxId = 0;

  for (const payment of payments) {
    if (payment.paymentNumber && payment.paymentNumber.startsWith('PAY')) {
      const idNumber = parseInt(payment.paymentNumber.replace('PAY', ''), 10);
      if (!isNaN(idNumber) && idNumber > maxId) {
        maxId = idNumber;
      }
    }
  }

  const nextId = maxId + 1;
  return `PAY${nextId}`;
}

async function getPaidAmountMapByInvoiceIds(invoiceIds, excludePaymentId) {
  const match = { 'allocations.invoiceId': { $in: invoiceIds } };
  if (excludePaymentId) {
    match._id = { $ne: new mongoose.Types.ObjectId(excludePaymentId) };
  }

  const rows = await Payment.aggregate([
    { $unwind: '$allocations' },
    { $match: match },
    {
      $group: {
        _id: '$allocations.invoiceId',
        paidAmount: { $sum: '$allocations.amount' }
      }
    }
  ]);

  const map = new Map();
  for (const row of rows) {
    map.set(String(row._id), row.paidAmount);
  }
  return map;
}

async function buildPendingInvoices(clientId, clientType, excludePaymentId) {
  const invoices = await Invoice.find({ clientId, clientType }).sort({ invoiceDate: 1, createdAt: 1 });
  if (invoices.length === 0) {
    return { invoices: [], totalPending: 0 };
  }

  const invoiceIds = invoices.map(i => i._id);
  const paidMap = await getPaidAmountMapByInvoiceIds(invoiceIds, excludePaymentId);

  const result = [];
  let totalPending = 0;

  for (const inv of invoices) {
    const paidAmount = paidMap.get(String(inv._id)) || 0;
    const pendingAmount = Math.max(0, (inv.totalAmount || 0) - paidAmount);
    if (pendingAmount <= 0) continue;

    let status = 'Pending';
    if (paidAmount > 0 && pendingAmount > 0) status = 'Partial';
    if (pendingAmount === 0) status = 'Paid';

    totalPending += pendingAmount;
    result.push({
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      invoiceAmount: inv.totalAmount || 0,
      paidAmount,
      pendingAmount,
      status
    });
  }

  return { invoices: result, totalPending };
}

async function allocatePaymentToInvoices({ clientId, clientType, amount, excludePaymentId, invoiceOrder }) {
  const { invoices: pendingInvoices, totalPending } = await buildPendingInvoices(clientId, clientType, excludePaymentId);

  let orderedInvoices = pendingInvoices;
  if (Array.isArray(invoiceOrder) && invoiceOrder.length > 0) {
    const orderMap = new Map(invoiceOrder.map((id, idx) => [String(id), idx]));
    orderedInvoices = [...pendingInvoices].sort((a, b) => {
      const aKey = String(a._id);
      const bKey = String(b._id);
      const ai = orderMap.has(aKey) ? orderMap.get(aKey) : Number.MAX_SAFE_INTEGER;
      const bi = orderMap.has(bKey) ? orderMap.get(bKey) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;

      const da = new Date(a.invoiceDate).getTime();
      const db = new Date(b.invoiceDate).getTime();
      if (da !== db) return da - db;
      return aKey.localeCompare(bKey);
    });
  }

  const normalizedAmount = Math.max(0, Number(amount) || 0);
  const effectiveAmount = Math.min(normalizedAmount, Math.max(0, Number(totalPending) || 0));
  let remaining = effectiveAmount;
  const allocations = [];

  for (const inv of orderedInvoices) {
    if (remaining <= 0) break;
    const toAllocate = Math.min(inv.pendingAmount, remaining);
    if (toAllocate > 0) {
      allocations.push({ invoiceId: inv._id, amount: toAllocate });
      remaining -= toAllocate;
    }
  }

  const appliedAmount = effectiveAmount - Math.max(0, remaining);
  return {
    allocations,
    appliedAmount,
    totalPending
  };
}

router.get('/next-number', async (req, res) => {
  try {
    const nextNumber = await getNextPaymentNumber();
    res.json({ nextNumber });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/pending', async (req, res) => {
  try {
    const clientId = req.query.clientId;
    const clientType = req.query.clientType || 'Customer';
    const excludePaymentId = req.query.excludePaymentId;
    if (!clientId) {
      return res.status(400).json({ message: 'clientId is required' });
    }

    const data = await buildPendingInvoices(clientId, clientType, excludePaymentId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const sortColumn = req.query.sortColumn || 'paymentNumber';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    // First fetch all payments without pagination
    let payments = await Payment.find()
      .sort({ paymentNumber: -1 });

    // Fetch customers and vendors
    const customerIds = payments.filter(p => p.clientType === 'Customer').map(p => p.clientId);
    const vendorIds = payments.filter(p => p.clientType === 'Vendor').map(p => p.clientId);

    const customers = customerIds.length ? await Customer.find({ _id: { $in: customerIds } }) : [];
    const vendors = vendorIds.length ? await Vendor.find({ _id: { $in: vendorIds } }) : [];

    const customerMap = new Map(customers.map(c => [c._id.toString(), c]));
    const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));

    // Attach client data as vendorId (same as sale/purchase invoices)
    const paymentsWithClients = payments.map(p => {
      const pObj = p.toObject();
      if (pObj.clientType === 'Customer') {
        pObj.vendorId = customerMap.get(pObj.clientId?.toString()) || null;
      } else {
        pObj.vendorId = vendorMap.get(pObj.clientId?.toString()) || null;
      }
      return pObj;
    });

    // Filter by search
    let filteredPayments = paymentsWithClients;
    if (search) {
      filteredPayments = paymentsWithClients.filter(p =>
        p.paymentNumber.toLowerCase().includes(search.toLowerCase()) ||
        (p.vendorId?.customerName?.toLowerCase().includes(search.toLowerCase())) ||
        (p.vendorId?.vendorName?.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Sort the filtered payments
    filteredPayments.sort((a, b) => {
      let aVal, bVal;
      switch(sortColumn) {
        case 'clientId':
        case 'vendorId':
          // Get client name for sorting
          aVal = (a.vendorId?.vendorName || a.vendorId?.customerName || '').toLowerCase();
          bVal = (b.vendorId?.vendorName || b.vendorId?.customerName || '').toLowerCase();
          break;
        case 'paymentNumber':
          aVal = a.paymentNumber || '';
          bVal = b.paymentNumber || '';
          break;
        case 'paymentDate':
          aVal = new Date(a.paymentDate);
          bVal = new Date(b.paymentDate);
          break;
        case 'amount':
          aVal = a.amount || 0;
          bVal = b.amount || 0;
          break;
        case 'description':
          aVal = (a.description || '').toLowerCase();
          bVal = (b.description || '').toLowerCase();
          break;
        default:
          aVal = a.paymentNumber || '';
          bVal = b.paymentNumber || '';
      }

      if (aVal < bVal) return -1 * sortOrder;
      if (aVal > bVal) return 1 * sortOrder;
      return 0;
    });

    // Get total count
    let total;
    if (search) {
      total = await Payment.countDocuments({
        $or: [
          { paymentNumber: { $regex: search, $options: 'i' } }
        ]
      });
      // Since we can't easily search populated fields in count, use filtered length
      total = filteredPayments.length;
    } else {
      total = await Payment.countDocuments();
    }

    // Apply pagination after filtering and sorting
    const paginatedPayments = filteredPayments.slice(skip, skip + limit);

    // Fetch user data for createdBy
    const userIds = paginatedPayments.map(p => p.createdBy).filter(Boolean);
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }) : [];
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    // Attach user data
    const finalPayments = paginatedPayments.map(p => {
      const user = p.createdBy ? userMap.get(p.createdBy.toString()) : null;
      const hasCreatedBy = user && (user.fullName || user.email || user._id);
      const createdByName = user?.fullName || p?.createdByName || '';
      const createdByEmail = user?.email || p?.createdByEmail || '';
      return {
        ...p,
        createdBy: hasCreatedBy
          ? { _id: user._id, fullName: user.fullName, email: user.email, roll: user.roll }
          : { _id: p?.createdBy || null, fullName: createdByName || null, email: createdByEmail || null, roll: null },
        createdByName,
        createdByEmail
      };
    });

    res.json({
      payments: finalPayments,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const getPaymentWithClient = async (id) => {
  const payment = await Payment.findById(id)
    .populate('createdBy', 'fullName email roll')
    .populate('updatedBy', 'fullName email roll')
    .populate('allocations.invoiceId', 'invoiceNumber totalAmount');
  if (!payment) return null;
  
  let client = null;
  if (payment.clientType === 'Customer') {
    client = await Customer.findById(payment.clientId);
  } else {
    client = await Vendor.findById(payment.clientId);
  }
  
  const paymentObj = payment.toObject();
  paymentObj.vendorId = client;
  return paymentObj;
};

router.get('/detail/:id', async (req, res) => {
  try {
    const payment = await getPaymentWithClient(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    if (payment.createdBy && (!payment.createdByName || !payment.createdByEmail)) {
      payment.createdByName = payment.createdByName || payment.createdBy?.fullName || '';
      payment.createdByEmail = payment.createdByEmail || payment.createdBy?.email || '';
      await payment.save();
    }
    if (payment.updatedBy && (!payment.updatedByName || !payment.updatedByEmail)) {
      payment.updatedByName = payment.updatedByName || payment.updatedBy?.fullName || '';
      payment.updatedByEmail = payment.updatedByEmail || payment.updatedBy?.email || '';
      await payment.save();
    }
    if (!Array.isArray(payment.activity) || payment.activity.length === 0) {
      const activity = [];
      activity.push({
        action: 'create',
        at: payment.createdAt || new Date(),
        userId: payment.createdBy?._id || payment.createdBy || null,
        userName: payment.createdBy?.fullName || payment.createdByName || '',
        userEmail: payment.createdBy?.email || payment.createdByEmail || ''
      });
      if (
        payment.updatedAt &&
        payment.createdAt &&
        new Date(payment.updatedAt).getTime() !== new Date(payment.createdAt).getTime() &&
        (payment.updatedBy || payment.updatedByName || payment.updatedByEmail)
      ) {
        activity.unshift({
          action: 'update',
          at: payment.updatedAt,
          userId: payment.updatedBy?._id || payment.updatedBy || null,
          userName: payment.updatedBy?.fullName || payment.updatedByName || '',
          userEmail: payment.updatedBy?.email || payment.updatedByEmail || ''
        });
      }
      payment.activity = activity;
      await payment.save();
    }
    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const payment = await getPaymentWithClient(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    if (payment.createdBy && (!payment.createdByName || !payment.createdByEmail)) {
      payment.createdByName = payment.createdByName || payment.createdBy?.fullName || '';
      payment.createdByEmail = payment.createdByEmail || payment.createdBy?.email || '';
      await payment.save();
    }
    if (payment.updatedBy && (!payment.updatedByName || !payment.updatedByEmail)) {
      payment.updatedByName = payment.updatedByName || payment.updatedBy?.fullName || '';
      payment.updatedByEmail = payment.updatedByEmail || payment.updatedBy?.email || '';
      await payment.save();
    }
    if (!Array.isArray(payment.activity) || payment.activity.length === 0) {
      const activity = [];
      activity.push({
        action: 'create',
        at: payment.createdAt || new Date(),
        userId: payment.createdBy?._id || payment.createdBy || null,
        userName: payment.createdBy?.fullName || payment.createdByName || '',
        userEmail: payment.createdBy?.email || payment.createdByEmail || ''
      });
      if (
        payment.updatedAt &&
        payment.createdAt &&
        new Date(payment.updatedAt).getTime() !== new Date(payment.createdAt).getTime() &&
        (payment.updatedBy || payment.updatedByName || payment.updatedByEmail)
      ) {
        activity.unshift({
          action: 'update',
          at: payment.updatedAt,
          userId: payment.updatedBy?._id || payment.updatedBy || null,
          userName: payment.updatedBy?.fullName || payment.updatedByName || '',
          userEmail: payment.updatedBy?.email || payment.updatedByEmail || ''
        });
      }
      payment.activity = activity;
      await payment.save();
    }
    res.json(payment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    let paymentNumber = req.body.paymentNumber;
    if (!paymentNumber) {
      paymentNumber = await getNextPaymentNumber();
    }

    const clientId = req.body.clientId;
    const clientType = req.body.clientType || 'Customer';
    const paymentDate = req.body.paymentDate;
    const amount = Number(req.body.amount) || 0;
    const description = req.body.description || '';
    const invoiceOrder = Array.isArray(req.body.invoiceOrder) ? req.body.invoiceOrder.map(String) : undefined;

    if (!clientId) return res.status(400).json({ message: 'Client is required' });
    if (!paymentDate) return res.status(400).json({ message: 'Payment date is required' });
    if (!(amount > 0)) return res.status(400).json({ message: 'Payment amount must be greater than 0' });

    const { allocations, appliedAmount } = await allocatePaymentToInvoices({ clientId, clientType, amount, invoiceOrder });
    if (!(appliedAmount > 0)) {
      return res.status(400).json({ message: 'No pending invoices available to apply this payment.' });
    }

    const authUser = await getAuthUserInfo(req);

    const payment = new Payment({
      paymentNumber,
      clientId,
      clientType,
      paymentDate,
      amount: appliedAmount,
      description,
      allocations,
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

    const saved = await payment.save();
    res.status(201).json(saved);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Payment number must be unique. A payment with this number already exists.' });
    }
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await Payment.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const clientId = req.body.clientId || existing.clientId;
    const clientType = req.body.clientType || existing.clientType || 'Customer';
    const paymentDate = req.body.paymentDate || existing.paymentDate;
    const amount = Number(req.body.amount ?? existing.amount) || 0;
    const description = req.body.description ?? existing.description;
    const invoiceOrder = Array.isArray(req.body.invoiceOrder) ? req.body.invoiceOrder.map(String) : undefined;

    if (!clientId) return res.status(400).json({ message: 'Client is required' });
    if (!paymentDate) return res.status(400).json({ message: 'Payment date is required' });
    if (!(amount > 0)) return res.status(400).json({ message: 'Payment amount must be greater than 0' });

    const { allocations, appliedAmount } = await allocatePaymentToInvoices({
      clientId,
      clientType,
      amount,
      excludePaymentId: existing._id,
      invoiceOrder
    });
    if (!(appliedAmount > 0)) {
      return res.status(400).json({ message: 'No pending invoices available to apply this payment.' });
    }

    const changes = [];
    const recordChange = (field, fromVal, toVal) => {
      const fromS = truncate(toShortString(normalizePaymentValue(field, fromVal)));
      const toS = truncate(toShortString(normalizePaymentValue(field, toVal)));
      if (fromS === toS) return;
      changes.push({ field, from: fromS, to: toS });
    };
    recordChange('clientId', existing.clientId, clientId);
    recordChange('clientType', existing.clientType, clientType);
    recordChange('paymentDate', existing.paymentDate, paymentDate);
    recordChange('amount', existing.amount, appliedAmount);
    recordChange('description', existing.description, description);

    existing.clientId = clientId;
    existing.clientType = clientType;
    existing.paymentDate = paymentDate;
    existing.amount = appliedAmount;
    existing.description = description;
    existing.allocations = allocations;
    const authUser = await getAuthUserInfo(req);
    existing.updatedBy = authUser?.id || null;
    existing.updatedByName = authUser?.fullName || '';
    existing.updatedByEmail = authUser?.email || '';
    if (!Array.isArray(existing.activity)) existing.activity = [];
    existing.activity.push({
      action: 'update',
      at: new Date(),
      userId: authUser?.id || null,
      userName: authUser?.fullName || '',
      userEmail: authUser?.email || '',
      changes
    });

    const updated = await existing.save();
    res.json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Payment number must be unique. A payment with this number already exists.' });
    }
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await Payment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Payment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
