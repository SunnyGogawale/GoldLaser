const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Vendor = require('../models/Vendor');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const PurchasePayment = require('../models/PurchasePayment');
const SaleInvoice = require('../models/SaleInvoice');
const SalePayment = require('../models/SalePayment');
const User = require('../models/User');
const { sendErrorResponse } = require('../utils/errorHandler');

async function getVendorOutstanding(vendorId) {
  try {
    const purchaseInvoiceMatch = {
      $or: [
        { clientId: vendorId, clientType: 'Vendor' },
        { vendorId }
      ]
    }
    const saleInvoiceMatch = {
      clientId: vendorId,
      clientType: 'Vendor'
    }
    const purchasePaymentMatch = {
      $or: [
        { clientId: vendorId, clientType: 'Vendor' },
        { vendorId }
      ]
    }
    const salePaymentMatch = {
      clientId: vendorId,
      clientType: 'Vendor'
    }

    const [purchaseInvoiceAgg, saleInvoiceAgg, purchasePaymentAgg, salePaymentAgg] = await Promise.all([
      PurchaseInvoice.aggregate([
        { $match: purchaseInvoiceMatch },
        { $group: { _id: null, totalInvoiceAmount: { $sum: { $ifNull: ['$totalAmount', 0] } } } }
      ]),
      SaleInvoice.aggregate([
        { $match: saleInvoiceMatch },
        { $group: { _id: null, totalInvoiceAmount: { $sum: { $ifNull: ['$totalAmount', 0] } } } }
      ]),
      PurchasePayment.aggregate([
        { $match: purchasePaymentMatch },
        { $group: { _id: null, totalPaymentAmount: { $sum: { $ifNull: ['$amount', 0] } } } }
      ]),
      SalePayment.aggregate([
        { $match: salePaymentMatch },
        { $group: { _id: null, totalPaymentAmount: { $sum: { $ifNull: ['$amount', 0] } } } }
      ])
    ])

    const totalPurchaseInvoiceAmount = Number(purchaseInvoiceAgg?.[0]?.totalInvoiceAmount || 0)
    const totalSaleInvoiceAmount = Number(saleInvoiceAgg?.[0]?.totalInvoiceAmount || 0)
    const totalPaidAmount = Number(purchasePaymentAgg?.[0]?.totalPaymentAmount || 0)
    const totalReceivedAmount = Number(salePaymentAgg?.[0]?.totalPaymentAmount || 0)

    // Vendor ledger perspective:
    // payableAmount: what we owe the vendor (purchase side).
    // receivableAmount: what vendor owes us (sale side).
    // outstanding/netOutstanding: payable minus receivable.
    const payableAmount = totalPurchaseInvoiceAmount - totalPaidAmount
    const receivableAmount = totalSaleInvoiceAmount - totalReceivedAmount
    const outstanding = payableAmount - receivableAmount

    const totalInvoices = totalPurchaseInvoiceAmount + totalSaleInvoiceAmount
    const totalPayments = totalPaidAmount + totalReceivedAmount

    return {
      totalPurchaseInvoiceAmount,
      totalSaleInvoiceAmount,
      totalPaidAmount,
      totalReceivedAmount,
      payableAmount,
      receivableAmount,
      totalInvoices,
      totalPayments,
      outstanding
    }
  } catch {
    return {
      totalPurchaseInvoiceAmount: 0,
      totalSaleInvoiceAmount: 0,
      totalPaidAmount: 0,
      totalReceivedAmount: 0,
      payableAmount: 0,
      receivableAmount: 0,
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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'vendors.nextId');
  }
});

// Get vendors with pagination
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
          { vendorName: { $regex: search, $options: 'i' } }
        ]
      };
    }

    let total = 0;
    
    // Define sort object
    let sortObj = { createdAt: -1 }; // Default sort
    if (sortColumn && ['companyName', 'vendorName', 'contactNumber', 'email'].includes(sortColumn)) {
      sortObj = { [sortColumn]: sortOrder };
    }

    const vendors = useBroadSearch
      ? await Vendor.find({})
          .populate('createdBy', 'fullName email roll')
          .sort(sortObj)
      : await Vendor.find(query)
          .populate('createdBy', 'fullName email roll')
          .sort(sortObj)
          .skip(skip)
          .limit(limit);

    // Calculate outstanding for each vendor
    let vendorsWithOutstanding = await Promise.all(
      vendors.map(async (vendor) => {
        const vendorObj = vendor.toObject();
        vendorObj.outstanding = await getVendorOutstanding(vendor._id);
        vendorObj.customFields = vendor.customFields || {};
        return vendorObj;
      })
    );

    // If sorting by outstanding, do it client-side after calculation
    if (sortColumn === 'outstanding') {
      vendorsWithOutstanding.sort((a, b) => {
        const valA = a.outstanding?.outstanding || 0;
        const valB = b.outstanding?.outstanding || 0;
        return sortOrder === 1 ? valA - valB : valB - valA;
      });
    }

    if (useBroadSearch) {
      vendorsWithOutstanding = vendorsWithOutstanding.filter((vendor) => {
        const customFieldValues = Object.values(vendor?.customFields || {}).map((value) => String(value || ''));
        const searchableParts = [
          vendor?.id,
          vendor?.vendorName,
          vendor?.companyName,
          vendor?.contactNumber,
          vendor?.alternateNumber,
          vendor?.email,
          vendor?.address,
          vendor?.shippingAddress,
          vendor?.note,
          vendor?.createdBy?.fullName,
          vendor?.createdBy?.email,
          vendor?.outstanding?.outstanding,
          ...customFieldValues
        ];

        const searchableText = searchableParts
          .map((part) => String(part || ''))
          .join(' ')
          .toLowerCase();

        return searchableText.includes(searchLower);
      });
    }

    total = useBroadSearch ? vendorsWithOutstanding.length : await Vendor.countDocuments(query);
    const paginatedVendors = useBroadSearch
      ? vendorsWithOutstanding.slice(skip, skip + limit)
      : vendorsWithOutstanding;
    
    res.json({
      vendors: paginatedVendors,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'vendors.list');
  }
});

router.get('/:id/statement', async (req, res) => {
  try {
    const vendorId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ message: 'Invalid vendor id' });
    }

    const vendor = await Vendor.findById(vendorId)
      .populate('createdBy', 'fullName email roll')
      .populate('updatedBy', 'fullName email roll');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const [invoices, payments] = await Promise.all([
      PurchaseInvoice.find({
        $or: [
          { clientId: vendor._id, clientType: 'Vendor' },
          { vendorId: vendor._id }
        ]
      }).sort({ invoiceDate: 1, createdAt: 1 }),
      PurchasePayment.find({
        $or: [
          { clientId: vendor._id, clientType: 'Vendor' },
          { vendorId: vendor._id }
        ]
      }).sort({ paymentDate: 1, createdAt: 1 })
    ]);

    const statementRows = [
      ...invoices.map((invoice) => ({
        date: invoice.invoiceDate || invoice.createdAt,
        createdAt: invoice.createdAt || invoice.invoiceDate,
        transactionNo: invoice.invoiceNumber || '-',
        transactionType: 'Purchase Invoice',
        description: String(invoice.transactionDescription || '').trim() || 'Purchase Invoice',
        debit: Number(invoice.totalAmount) || 0,
        credit: 0
      })),
      ...payments.map((payment) => ({
        date: payment.paymentDate || payment.createdAt,
        createdAt: payment.createdAt || payment.paymentDate,
        transactionNo: payment.paymentNumber || '-',
        transactionType: 'Purchase Payment',
        description: String(payment.description || '').trim() || 'Payment Made',
        debit: 0,
        credit: Number(payment.amount) || 0
      }))
    ].sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      const typeDiff = (a.credit > 0 ? 1 : 0) - (b.credit > 0 ? 1 : 0);
      if (typeDiff !== 0) return typeDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    let runningBalance = 0;
    const transactions = statementRows.map((row) => {
      runningBalance += row.debit - row.credit;
      return {
        date: row.date,
        transactionNo: row.transactionNo,
        transactionType: row.transactionType,
        description: row.description,
        debit: row.debit,
        credit: row.credit,
        balance: runningBalance
      };
    });

    const totalInvoice = invoices.reduce((sum, invoice) => sum + (Number(invoice.totalAmount) || 0), 0);
    const totalPayment = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const openingBalance = 0;
    const closingBalance = openingBalance + totalInvoice - totalPayment;

    const vendorObj = vendor.toObject();
    vendorObj.outstanding = await getVendorOutstanding(vendor._id);

    res.json({
      vendor: vendorObj,
      summary: {
        openingBalance,
        totalInvoice,
        totalPayment,
        closingBalance
      },
      transactions
    });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'vendors.statement');
  }
});

// Get a single vendor by ID
router.get('/:id', async (req, res) => {
  try {
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
    const vendorObj = vendor.toObject();
    vendorObj.outstanding = await getVendorOutstanding(vendor._id);
    res.json(vendorObj);
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'vendors.get');
  }
});

// Add a new vendor
router.post('/', async (req, res) => {
  try {
    let generatedId = req.body.id;
    
    if (!generatedId) {
      generatedId = await getNextVendorId();
    }

    const vendorName = (req.body.vendorName || '').trim();
    const companyName = (req.body.companyName || '').trim();

    const authUser = await getAuthUserInfo(req);

    const vendor = new Vendor({
      id: generatedId,
      vendorName,
      companyName,
      contactNumber: req.body.contactNumber,
      alternateNumber: req.body.alternateNumber,
      email: req.body.email,
      address: req.body.address,
      shippingAddress: req.body.shippingAddress,
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

    const newVendor = await vendor.save();
    res.status(201).json(newVendor);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Vendor ID must be unique. A vendor with this ID already exists.' });
    }
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'vendors.create');
  }
});

// Update a vendor
router.put('/:id', async (req, res) => {
  try {
    const existing = await Vendor.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Vendor not found' });

    const update = { ...req.body };
    delete update.createdBy;
    delete update.updatedBy;
    delete update.updatedByName;
    delete update.updatedByEmail;
    delete update.activity;

    if (typeof update.vendorName === 'string') {
      update.vendorName = update.vendorName.trim();
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

    const vendor = await Vendor.findByIdAndUpdate(req.params.id, updateOp, { new: true });
    res.json(vendor);
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 400, 'vendors.update');
  }
});

// Delete a vendor
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const [invoiceResult, paymentResult, saleInvoiceResult, salePaymentResult] = await Promise.all([
      PurchaseInvoice.deleteMany({ $or: [{ vendorId: vendor._id }, { clientId: vendor._id, clientType: 'Vendor' }] }),
      PurchasePayment.deleteMany({ $or: [{ vendorId: vendor._id }, { clientId: vendor._id, clientType: 'Vendor' }] }),
      SaleInvoice.deleteMany({ clientId: vendor._id, clientType: 'Vendor' }),
      SalePayment.deleteMany({ clientId: vendor._id, clientType: 'Vendor' })
    ]);

    await Vendor.findByIdAndDelete(vendor._id);

    const existingVendorIds = (await Vendor.find({}, { _id: 1 }).lean()).map((c) => c._id);
    const [orphanInvoiceResult, orphanPaymentResult, orphanSaleInvoiceResult, orphanSalePaymentResult] = await Promise.all([
      PurchaseInvoice.deleteMany({
        $or: [
          { vendorId: { $exists: false } },
          { vendorId: null },
          { vendorId: { $nin: existingVendorIds } },
          { 
            $and: [
              { clientType: 'Vendor' },
              { $or: [
                { clientId: { $exists: false } },
                { clientId: null },
                { clientId: { $nin: existingVendorIds } }
              ]}
            ]
          }
        ]
      }),
      PurchasePayment.deleteMany({
        $or: [
          { vendorId: { $exists: false } },
          { vendorId: null },
          { vendorId: { $nin: existingVendorIds } },
          { 
            $and: [
              { clientType: 'Vendor' },
              { $or: [
                { clientId: { $exists: false } },
                { clientId: null },
                { clientId: { $nin: existingVendorIds } }
              ]}
            ]
          }
        ]
      }),
      SaleInvoice.deleteMany({
        $and: [
          { clientType: 'Vendor' },
          { $or: [
            { clientId: { $exists: false } },
            { clientId: null },
            { clientId: { $nin: existingVendorIds } }
          ]}
        ]
      }),
      SalePayment.deleteMany({
        $and: [
          { clientType: 'Vendor' },
          { $or: [
            { clientId: { $exists: false } },
            { clientId: null },
            { clientId: { $nin: existingVendorIds } }
          ]}
        ]
      })
    ]);

    res.json({
      message: 'Vendor deleted',
      deleted: {
        vendors: 1,
        purchaseInvoices: invoiceResult?.deletedCount || 0,
        purchasePayments: paymentResult?.deletedCount || 0,
        saleInvoices: saleInvoiceResult?.deletedCount || 0,
        salePayments: salePaymentResult?.deletedCount || 0,
        orphanPurchaseInvoices: orphanInvoiceResult?.deletedCount || 0,
        orphanPurchasePayments: orphanPaymentResult?.deletedCount || 0,
        orphanSaleInvoices: orphanSaleInvoiceResult?.deletedCount || 0,
        orphanSalePayments: orphanSalePaymentResult?.deletedCount || 0
      }
    });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'vendors.delete');
  }
});

module.exports = router;
