const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const SaleInvoice = require('../models/SaleInvoice');
const SalePayment = require('../models/SalePayment');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const PurchasePayment = require('../models/PurchasePayment');
const User = require('../models/User');
const { requireAdmin: requireActiveAdmin } = require('../middleware/adminAuth');
const { sendErrorResponse } = require('../utils/errorHandler');

async function getCustomerOutstanding(customerId) {
  try {
    const saleInvoiceMatch = {
      $or: [
        { clientId: customerId, clientType: 'Customer' },
        { customerId }
      ]
    }
    const purchaseInvoiceMatch = {
      clientId: customerId,
      clientType: 'Customer'
    }
    const salePaymentMatch = {
      $or: [
        { clientId: customerId, clientType: 'Customer' },
        { customerId }
      ],
      paymentNumber: { $not: /NAP/i },
      excludeFromOutstanding: { $ne: true }
    }
    const purchasePaymentMatch = {
      clientId: customerId,
      clientType: 'Customer',
      excludeFromOutstanding: { $ne: true }
    }

    const [saleInvoiceAgg, purchaseInvoiceAgg, salePaymentAgg, purchasePaymentAgg] = await Promise.all([
      SaleInvoice.aggregate([
        { $match: saleInvoiceMatch },
        { $group: { _id: null, totalInvoiceAmount: { $sum: { $ifNull: ['$totalAmount', 0] } } } }
      ]),
      PurchaseInvoice.aggregate([
        { $match: purchaseInvoiceMatch },
        { $group: { _id: null, totalInvoiceAmount: { $sum: { $ifNull: ['$totalAmount', 0] } } } }
      ]),
      SalePayment.aggregate([
        { $match: salePaymentMatch },
        { $group: { _id: null, totalPaymentAmount: { $sum: { $ifNull: ['$amount', 0] } } } }
      ]),
      PurchasePayment.aggregate([
        { $match: purchasePaymentMatch },
        { $group: { _id: null, totalPaymentAmount: { $sum: { $ifNull: ['$amount', 0] } } } }
      ])
    ])

    const totalSaleInvoiceAmount = Number(saleInvoiceAgg?.[0]?.totalInvoiceAmount || 0)
    const totalPurchaseInvoiceAmount = Number(purchaseInvoiceAgg?.[0]?.totalInvoiceAmount || 0)
    const totalReceivedAmount = Number(salePaymentAgg?.[0]?.totalPaymentAmount || 0)
    const totalPaidAmount = Number(purchasePaymentAgg?.[0]?.totalPaymentAmount || 0)

    // Customer Outstanding tracks the sales receivable; purchase-side payable is reported separately.
    const receivableAmount = totalSaleInvoiceAmount - totalReceivedAmount
    const payableAmount = totalPurchaseInvoiceAmount - totalPaidAmount
    const outstanding = receivableAmount

    const totalInvoices = totalSaleInvoiceAmount + totalPurchaseInvoiceAmount
    const totalPayments = totalReceivedAmount + totalPaidAmount

    return {
      totalSaleInvoiceAmount,
      totalPurchaseInvoiceAmount,
      totalReceivedAmount,
      totalPaidAmount,
      receivableAmount,
      payableAmount,
      totalInvoices,
      totalPayments,
      outstanding
    }
  } catch {
    return {
      totalSaleInvoiceAmount: 0,
      totalPurchaseInvoiceAmount: 0,
      totalReceivedAmount: 0,
      totalPaidAmount: 0,
      receivableAmount: 0,
      payableAmount: 0,
      totalInvoices: 0,
      totalPayments: 0,
      outstanding: 0
    }
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'customers.nextId');
  }
});

// Get customers with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const searchLower = search.toLowerCase();
    const sortColumn = req.query.sortColumn || '';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
    const useBroadSearch = !!search;

    let query = {};
    if (!useBroadSearch && search) {
      query = {
        $or: [
          { companyName: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } }
        ]
      };
    }

    let total = 0;
    
    // Define sort object
    let sortObj = { createdAt: -1 }; // Default sort
    if (sortColumn && ['companyName', 'customerName', 'contactNumber', 'email'].includes(sortColumn)) {
      sortObj = { [sortColumn]: sortOrder };
    }

    const customers = useBroadSearch
      ? await Customer.find({})
          .populate('createdBy', 'fullName email roll')
          .sort(sortObj)
      : await Customer.find(query)
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
        const valA = a.outstanding?.outstanding || 0;
        const valB = b.outstanding?.outstanding || 0;
        return sortOrder === 1 ? valA - valB : valB - valA;
      });
    }

    if (useBroadSearch) {
      customersWithOutstanding = customersWithOutstanding.filter((customer) => {
        const customFieldValues = Object.values(customer?.customFields || {}).map((value) => String(value || ''));
        const searchableParts = [
          customer?.id,
          customer?.customerName,
          customer?.companyName,
          customer?.contactNumber,
          customer?.alternateNumber,
          customer?.email,
          customer?.address,
          customer?.shippingAddress,
          customer?.note,
          customer?.createdBy?.fullName,
          customer?.createdBy?.email,
          customer?.outstanding?.outstanding,
          ...customFieldValues
        ];

        const searchableText = searchableParts
          .map((part) => String(part || ''))
          .join(' ')
          .toLowerCase();

        return searchableText.includes(searchLower);
      });
    }

    total = useBroadSearch ? customersWithOutstanding.length : await Customer.countDocuments(query);
    const paginatedCustomers = useBroadSearch
      ? customersWithOutstanding.slice(skip, skip + limit)
      : customersWithOutstanding;
    
    res.json({
      customers: paginatedCustomers,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'customers.list');
  }
});

router.get('/:id/statement', async (req, res) => {
  try {
    const customerId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ message: 'Invalid customer id' });
    }

    const customer = await Customer.findById(customerId)
      .populate('createdBy', 'fullName email roll')
      .populate('updatedBy', 'fullName email roll');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const [invoices, payments] = await Promise.all([
      SaleInvoice.find({
        $or: [
          { clientId: customer._id, clientType: 'Customer' },
          { customerId: customer._id }
        ]
      }).sort({ invoiceDate: 1, createdAt: 1 }),
      SalePayment.find({
        $or: [
          { clientId: customer._id, clientType: 'Customer' },
          { customerId: customer._id }
        ]
      }).sort({ paymentDate: 1, createdAt: 1 })
    ]);

    const statementRows = [
      ...invoices.map((invoice) => ({
        date: invoice.invoiceDate || invoice.createdAt,
        createdAt: invoice.createdAt || invoice.invoiceDate,
        transactionNo: invoice.invoiceNumber || '-',
        transactionType: 'Sales Invoice',
        product: (Array.isArray(invoice.items) ? invoice.items : [])
          .map((item) => String(item?.product || '').trim())
          .filter(Boolean)
          .join(', '),
        description: String(invoice.transactionDescription || '').trim() || 'Invoice',
        debit: Number(invoice.totalAmount) || 0,
        credit: 0
      })),
      ...payments.map((payment) => ({
        date: payment.paymentDate || payment.createdAt,
        createdAt: payment.createdAt || payment.paymentDate,
        transactionNo: payment.paymentNumber || '-',
        transactionType: 'Sales Payment',
        description: String(payment.description || '').trim() || 'Payment Received',
        debit: 0,
        credit: Number(payment.amount) || 0,
        balanceCredit: payment.excludeFromOutstanding || /NAP/i.test(String(payment.paymentNumber || ''))
          ? 0
          : Number(payment.amount) || 0
      }))
    ]
      .sort((a, b) => {
        const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        const typeDiff = (a.credit > 0 ? 1 : 0) - (b.credit > 0 ? 1 : 0);
        if (typeDiff !== 0) return typeDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
      .map((row) => {
        return row;
      });

    let runningBalance = 0;
    const transactions = statementRows.map((row) => {
      runningBalance += row.debit - (row.balanceCredit ?? row.credit);
      return {
        date: row.date,
        transactionNo: row.transactionNo,
        transactionType: row.transactionType,
        product: row.product,
        description: row.description,
        debit: row.debit,
        credit: row.credit,
        balance: runningBalance
      };
    });

    const totalInvoice = invoices.reduce((sum, invoice) => sum + (Number(invoice.totalAmount) || 0), 0);
    const totalPayment = payments.reduce((sum, payment) => {
      if (payment.excludeFromOutstanding || /NAP/i.test(String(payment.paymentNumber || ''))) return sum;
      return sum + (Number(payment.amount) || 0);
    }, 0);
    const openingBalance = 0;
    const closingBalance = openingBalance + totalInvoice - totalPayment;

    const customerObj = customer.toObject();
    customerObj.outstanding = await getCustomerOutstanding(customer._id);

    res.json({
      customer: customerObj,
      summary: {
        openingBalance,
        totalInvoice,
        totalPayment,
        closingBalance
      },
      transactions
    });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'customers.statement');
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'customers.get');
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
      shippingAddress: req.body.shippingAddress || '',
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'customers.create');
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'customers.update');
  }
});

const isTransactionUnsupported = (error) => {
  const unsupportedTransactionMessages = [
    'transaction numbers are only allowed',
    'transactions are not supported',
    'transaction is not supported',
    'does not support transactions'
  ];
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 20 && unsupportedTransactionMessages.some((text) => message.includes(text));
};

async function deleteCustomerData(customerId, scope, session) {
  const options = session ? { session } : undefined;
  const deleteInvoices = scope === 'full' || scope === 'invoices';
  const deletePayments = scope === 'full' || scope === 'payments';
  const deleted = {
    customers: 0,
    saleInvoices: 0,
    salePayments: 0,
    purchaseInvoices: 0,
    purchasePayments: 0,
    orphanSaleInvoices: 0,
    orphanSalePayments: 0,
    orphanPurchaseInvoices: 0,
    orphanPurchasePayments: 0
  };

  if (deleteInvoices) {
    const saleInvoices = await SaleInvoice.deleteMany(
      { $or: [{ customerId }, { clientId: customerId, clientType: 'Customer' }] },
      options
    );
    const purchaseInvoices = await PurchaseInvoice.deleteMany(
      { clientId: customerId, clientType: 'Customer' },
      options
    );
    deleted.saleInvoices = saleInvoices.deletedCount || 0;
    deleted.purchaseInvoices = purchaseInvoices.deletedCount || 0;
  }

  if (deletePayments) {
    const salePayments = await SalePayment.deleteMany(
      { $or: [{ customerId }, { clientId: customerId, clientType: 'Customer' }] },
      options
    );
    const purchasePayments = await PurchasePayment.deleteMany(
      { clientId: customerId, clientType: 'Customer' },
      options
    );
    deleted.salePayments = salePayments.deletedCount || 0;
    deleted.purchasePayments = purchasePayments.deletedCount || 0;
  }

  if (scope === 'full') {
    const customerResult = await Customer.deleteOne({ _id: customerId }, options);
    deleted.customers = customerResult.deletedCount || 0;
  }

  return deleted;
}

async function executeCustomerDeletion(customerId, scope, session) {
  const customerQuery = Customer.findById(customerId);
  if (session) customerQuery.session(session);
  const customer = await customerQuery;
  if (!customer) {
    const error = new Error('Customer not found');
    error.status = 404;
    throw error;
  }

  return deleteCustomerData(customer._id, scope, session);
}

async function deleteCustomerWithTransaction(customerId, scope) {
  const session = await mongoose.startSession();
  try {
    let deleted;
    try {
      await session.withTransaction(async () => {
        deleted = await executeCustomerDeletion(customerId, scope, session);
      });
    } catch (error) {
      if (!isTransactionUnsupported(error)) throw error;
      deleted = await executeCustomerDeletion(customerId, scope, null);
    }
    return deleted;
  } finally {
    await session.endSession();
  }
}

async function handleCustomerDeletion(req, res, scope) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid customer ID' });
    }

    const deleted = await deleteCustomerWithTransaction(req.params.id, scope);
    return res.json({
      message: scope === 'full' ? 'Customer deleted' : 'Customer records deleted',
      deleted
    });
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ message: error.message });
    return sendErrorResponse(
      res,
      error,
      'Something went wrong. Please try again later.',
      500,
      `customers.delete.${scope}`
    );
  }
}

router.delete('/:id/:scope', requireActiveAdmin, async (req, res) => {
  const { scope } = req.params;
  if (!['full', 'invoices', 'payments'].includes(scope)) {
    return res.status(400).json({ message: 'Invalid customer deletion scope' });
  }
  return handleCustomerDeletion(req, res, scope);
});

// Keep the existing endpoint contract: deleting by customer ID removes all related records.
router.delete('/:id', requireActiveAdmin, (req, res) => handleCustomerDeletion(req, res, 'full'));

module.exports = router;
