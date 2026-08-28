const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Payment = require('../models/PurchasePayment');
const Invoice = require('../models/PurchaseInvoice');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const { sendErrorResponse } = require('../utils/errorHandler');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token;
};

const requireAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.user?.id || decoded?.id || decoded?.userId || decoded?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.user?.id || decoded?.id || decoded?.userId || decoded?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await User.findById(userId);
    const role = String(user?.roll || user?.role || 'user').toLowerCase();
    if (role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

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
  if (field === 'vendorId') {
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

async function getNextPaymentNumber() {
  const payments = await Payment.find({}, 'paymentNumber');
  let maxId = 0;

  for (const payment of payments) {
    if (payment.paymentNumber && payment.paymentNumber.startsWith('PPAY')) {
      const idNumber = parseInt(payment.paymentNumber.replace('PPAY', ''), 10);
      if (!isNaN(idNumber) && idNumber > maxId) {
        maxId = idNumber;
      }
    }
  }

  const nextId = maxId + 1;
  return `PPAY${nextId}`;
}

async function getPaidAmountMapByInvoiceIds(invoiceIds, excludePaymentId) {
  const match = { 'allocations.invoiceId': { $in: invoiceIds } };
  if (excludePaymentId) {
    if (!isObjectId(excludePaymentId)) throw new Error('Invalid payment id');
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

async function getClientCreditBalance(clientId, clientType, excludePaymentId) {
  const query = { clientId, clientType };
  if (excludePaymentId) {
    if (!isObjectId(excludePaymentId)) throw new Error('Invalid payment id');
    query._id = { $ne: new mongoose.Types.ObjectId(excludePaymentId) };
  }

  const rows = await Payment.find(query).select('amount allocations');
  let balance = 0;

  for (const row of rows) {
    const paymentAmount = Number(row?.amount) || 0;
    const allocationTotal = Array.isArray(row?.allocations)
      ? row.allocations.reduce((sum, allocation) => sum + (Number(allocation?.amount) || 0), 0)
      : 0;
    balance += paymentAmount - allocationTotal;
  }

  return Math.round((balance + Number.EPSILON) * 100) / 100;
}

async function buildPendingInvoices(clientId, clientType, excludePaymentId) {
  const invoices = await Invoice.find({ clientId, clientType }).sort({ invoiceDate: 1, createdAt: 1 });
  const creditBalance = await getClientCreditBalance(clientId, clientType, excludePaymentId);
  const availableCredit = Math.max(0, creditBalance);
  if (invoices.length === 0) {
    return { invoices: [], totalPending: 0, availableCredit };
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
      description: inv.transactionDescription || '',
      status
    });
  }

  return { invoices: result, totalPending, availableCredit };
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

const normalizeRequestedAllocations = (rawAllocations) => {
  if (!Array.isArray(rawAllocations)) return [];
  return rawAllocations
    .map((row) => {
      const invoiceId = String(row?.invoiceId || '').trim();
      const amount = Number(row?.amount);
      const description = String(row?.description || '').trim();
      return { invoiceId, amount, description };
    })
    .filter((row) => row.invoiceId && row.amount > 0);
};

async function allocatePaymentByRequestedAmounts({ clientId, clientType, requestedAllocations, excludePaymentId }) {
  const { invoices: pendingInvoices, totalPending } = await buildPendingInvoices(clientId, clientType, excludePaymentId);
  const pendingById = new Map(pendingInvoices.map((inv) => [String(inv._id), inv]));

  const merged = new Map();
  for (const row of requestedAllocations) {
    const key = String(row.invoiceId || '');
    const amount = Number(row.amount);
    const description = String(row.description || '').trim();
    if (!key) continue;
    if (!description) {
      throw new Error('Each selected invoice must have description.');
    }

    if (!merged.has(key)) {
      merged.set(key, { amount: 0, description });
    }
    const current = merged.get(key);
    current.amount += amount;
    if (description) current.description = description;
    merged.set(key, current);
  }

  const allocations = [];
  let appliedAmount = 0;

  for (const [invoiceId, mergedRow] of merged.entries()) {
    const pending = pendingById.get(invoiceId);
    if (!pending) {
      throw new Error(`Invoice ${invoiceId} is not pending for this client.`);
    }

    const amount = Math.round((Number(mergedRow.amount) + Number.EPSILON) * 100) / 100;
    const description = String(mergedRow.description || '').trim();
    const maxAllowed = Math.max(0, Number(pending.pendingAmount) || 0);
    if (!description) {
      throw new Error('Each selected invoice must have description.');
    }
    if (description.length > 250) {
      throw new Error('Description cannot exceed 250 characters per selected invoice.');
    }
    if (amount > maxAllowed) {
      throw new Error(`Payment amount for invoice ${pending.invoiceNumber || invoiceId} cannot exceed its balance.`);
    }

    allocations.push({ invoiceId: pending._id, amount, description });
    appliedAmount += amount;
  }

  const roundedAppliedAmount = Math.round((appliedAmount + Number.EPSILON) * 100) / 100;
  return {
    allocations,
    appliedAmount: roundedAppliedAmount,
    totalPending
  };
}

router.get('/next-number', async (req, res) => {
  try {
    const nextNumber = await getNextPaymentNumber();
    res.json({ nextNumber });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'purchasePayments.nextNumber');
  }
});

router.get('/pending', async (req, res) => {
  try {
    const clientId = req.query.clientId;
    const clientType = req.query.clientType || 'Vendor';
    const excludePaymentId = req.query.excludePaymentId;
    if (!clientId) {
      return res.status(400).json({ message: 'clientId is required' });
    }
    if (!isObjectId(clientId)) {
      return res.status(400).json({ message: 'Invalid client id' });
    }
    if (excludePaymentId && !isObjectId(excludePaymentId)) {
      return res.status(400).json({ message: 'Invalid payment id' });
    }

    const data = await buildPendingInvoices(clientId, clientType, excludePaymentId);
    res.json(data);
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'purchasePayments.pending');
  }
});

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const searchLower = search.toLowerCase();
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

    // Attach client data as vendorId
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
      filteredPayments = paymentsWithClients.filter((p) => {
        const allocations = Array.isArray(p.allocations) ? p.allocations : [];
        const allocationInvoiceNumbers = allocations.map((row) => String(row?.invoiceId?.invoiceNumber || row?.invoiceId || ''));
        const allocationDescriptions = allocations.map((row) => String(row?.description || ''));
        const allocationAmounts = allocations.map((row) => String(row?.amount || ''));
        const searchableParts = [
          p.paymentNumber,
          p.paymentDate,
          p.amount,
          p.description,
          p.clientType,
          p.vendorId?.id,
          p.vendorId?.customerName,
          p.vendorId?.vendorName,
          p.vendorId?.companyName,
          p.vendorId?.contactNumber,
          p.vendorId?.alternateNumber,
          p.vendorId?.email,
          p.vendorId?.address,
          p.vendorId?.shippingAddress,
          p.vendorId?.note,
          ...allocationInvoiceNumbers,
          ...allocationDescriptions,
          ...allocationAmounts
        ];

        const searchableText = searchableParts
          .map((part) => String(part || ''))
          .join(' ')
          .toLowerCase();

        return searchableText.includes(searchLower);
      });
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
    const total = search ? filteredPayments.length : await Payment.countDocuments();

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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'purchasePayments.list');
  }
});

const getPurchasePaymentWithClient = async (id) => {
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
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid payment id' });
    const payment = await getPurchasePaymentWithClient(req.params.id);
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'purchasePayments.detail');
  }
});

router.get('/:id/history', requireAdmin, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .select('paymentNumber createdBy createdByName createdAt updatedBy updatedByName updatedAt activity')
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email');

    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    let activity = Array.isArray(payment.activity) ? payment.activity : [];
    if (activity.length === 0) {
      activity = [{
        action: 'create',
        at: payment.createdAt,
        userName: payment.createdBy?.fullName || payment.createdByName || '',
        userEmail: payment.createdBy?.email || ''
      }];
      if (payment.updatedAt && payment.createdAt && new Date(payment.updatedAt).getTime() !== new Date(payment.createdAt).getTime()) {
        activity.unshift({
          action: 'update',
          at: payment.updatedAt,
          userName: payment.updatedBy?.fullName || payment.updatedByName || '',
          userEmail: payment.updatedBy?.email || ''
        });
      }
    }

    return res.json({
      paymentNumber: payment.paymentNumber,
      createdBy: payment.createdBy?.fullName || payment.createdByName || '-',
      createdAt: payment.createdAt,
      updatedBy: payment.updatedBy?.fullName || payment.updatedByName || '-',
      updatedAt: payment.updatedAt,
      activity
    });
  } catch (err) {
    return sendErrorResponse(res, err, 'Failed to load payment history', 500, 'purchasePayments.history');
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid payment id' });
    const payment = await getPurchasePaymentWithClient(req.params.id);
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'purchasePayments.get');
  }
});

router.post('/', async (req, res) => {
  try {
    let paymentNumber = req.body.paymentNumber;
    if (!paymentNumber) {
      paymentNumber = await getNextPaymentNumber();
    }

    const clientId = req.body.clientId;
    const clientType = req.body.clientType || 'Vendor';
    const paymentDate = req.body.paymentDate;
    const amount = Number(req.body.amount) || 0;
    const description = req.body.description || '';
    const requestedAllocations = normalizeRequestedAllocations(req.body.allocations);
    const attachments = normalizePaymentValue('attachments', req.body.attachments);

    if (!clientId) return res.status(400).json({ message: 'Client is required' });
    if (!isObjectId(clientId)) return res.status(400).json({ message: 'Invalid client id' });
    if (!paymentDate) return res.status(400).json({ message: 'Payment date is required' });
    const allocationResult = requestedAllocations.length > 0
      ? await allocatePaymentByRequestedAmounts({
          clientId,
          clientType,
          requestedAllocations
        })
      : { allocations: [], appliedAmount: 0 };
    const { allocations, appliedAmount } = allocationResult;
    if (requestedAllocations.length > 0 && !(appliedAmount > 0)) {
      return res.status(400).json({ message: 'No pending invoices available to apply this payment.' });
    }

    const creditBalance = await getClientCreditBalance(clientId, clientType);
    const availableCredit = Math.max(0, creditBalance);
    const roundedEnteredAmount = Math.round((amount + Number.EPSILON) * 100) / 100;
    const finalAmount = roundedEnteredAmount;
    if (requestedAllocations.length > 0) {
      const minRequiredAmount = Math.max(0, Math.round((appliedAmount - availableCredit + Number.EPSILON) * 100) / 100);
      if (finalAmount < minRequiredAmount) {
        return res.status(400).json({ message: 'Payment amount cannot be less than adjusted bill amount after available credit' });
      }
    }

    const authUser = await getAuthUserInfo(req);

    const payment = new Payment({
      paymentNumber,
      clientId,
      clientType,
      paymentDate,
      amount: finalAmount,
      description,
      allocations,
      attachments,
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'purchasePayments.create');
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid payment id' });
    const existing = await Payment.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const clientId = req.body.clientId || existing.clientId;
    const clientType = req.body.clientType || existing.clientType || 'Vendor';
    const paymentDate = req.body.paymentDate || existing.paymentDate;
    const amount = Number(req.body.amount ?? existing.amount) || 0;
    const description = req.body.description ?? existing.description;
    const requestedAllocations = normalizeRequestedAllocations(req.body.allocations);
    const attachments = normalizePaymentValue('attachments', req.body.attachments ?? existing.attachments);

    if (!clientId) return res.status(400).json({ message: 'Client is required' });
    if (!isObjectId(clientId)) return res.status(400).json({ message: 'Invalid client id' });
    if (!paymentDate) return res.status(400).json({ message: 'Payment date is required' });
    const allocationResult = requestedAllocations.length > 0
      ? await allocatePaymentByRequestedAmounts({
          clientId,
          clientType,
          requestedAllocations,
          excludePaymentId: existing._id
        })
      : { allocations: [], appliedAmount: 0 };
    const { allocations, appliedAmount } = allocationResult;
    if (requestedAllocations.length > 0 && !(appliedAmount > 0)) {
      return res.status(400).json({ message: 'No pending invoices available to apply this payment.' });
    }

    const creditBalance = await getClientCreditBalance(clientId, clientType, existing._id);
    const availableCredit = Math.max(0, creditBalance);
    const roundedEnteredAmount = Math.round((amount + Number.EPSILON) * 100) / 100;
    const finalAmount = roundedEnteredAmount;
    if (requestedAllocations.length > 0) {
      const minRequiredAmount = Math.max(0, Math.round((appliedAmount - availableCredit + Number.EPSILON) * 100) / 100);
      if (finalAmount < minRequiredAmount) {
        return res.status(400).json({ message: 'Payment amount cannot be less than adjusted bill amount after available credit' });
      }
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
    recordChange('amount', existing.amount, finalAmount);
    recordChange('description', existing.description, description);
    recordChange('attachments', existing.attachments, attachments);

    existing.clientId = clientId;
    existing.clientType = clientType;
    existing.paymentDate = paymentDate;
    existing.amount = finalAmount;
    existing.description = description;
    existing.allocations = allocations;
    existing.attachments = attachments;
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'purchasePayments.update');
  }
});

router.post('/bulk-delete', requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    const validIds = ids.filter((id) => isObjectId(id));
    if (validIds.length === 0) {
      return res.status(400).json({ message: 'Select at least one payment to delete.' });
    }

    await Payment.deleteMany({ _id: { $in: validIds } });
    res.json({ message: 'Payments deleted', deletedCount: validIds.length });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'purchasePayments.bulkDelete');
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid payment id' });
    await Payment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Payment deleted' });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'purchasePayments.delete');
  }
});

module.exports = router;
