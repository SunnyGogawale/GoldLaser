const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Invoice = require('../models/SaleInvoice');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const { sendErrorResponse } = require('../utils/errorHandler');

function parseDateStart(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateEnd(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

function buildInvoiceMatch({ fromDate, toDate, customerId }) {
  const match = {};
  const from = parseDateStart(fromDate);
  const to = parseDateEnd(toDate);

  if (from || to) {
    match.invoiceDate = {};
    if (from) match.invoiceDate.$gte = from;
    if (to) match.invoiceDate.$lte = to;
  }

  if (customerId) {
    match.$or = [
      { customerId: new mongoose.Types.ObjectId(customerId) },
      { clientId: new mongoose.Types.ObjectId(customerId), clientType: 'Customer' }
    ];
  }

  return match;
}

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
          { $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: [{ $arrayElemAt: ['$paidAgg.paidAmount', 0] }, 0] }] }
        ]
      },
      numericId: {
        $toInt: {
          $replaceAll: { input: '$invoiceNumber', find: 'INV', replacement: '' }
        }
      }
    }
  };
}

function invoiceStatusStage() {
  return {
    $addFields: {
      status: {
        $switch: {
          branches: [
            { case: { $lte: ['$pendingAmount', 0] }, then: 'Paid' },
            { case: { $gt: ['$paidAmount', 0] }, then: 'Partial' }
          ],
          default: 'Pending'
        }
      }
    }
  };
}

router.get('/invoice-summary', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const match = buildInvoiceMatch({
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      customerId: req.query.customerId
    });

    // Get all invoices first to collect customer/vendor ids
    const invoices = await Invoice.find(match)
      .sort({ invoiceDate: 1, createdAt: 1 })
      .skip(skip)
      .limit(limit);

    if (invoices.length === 0) {
      return res.json({
        rows: [],
        totals: {
          totalInvoiceAmount: 0,
          totalPaidAmount: 0,
          totalPendingAmount: 0
        },
        total: 0,
        page,
        totalPages: 0
      });
    }

    // Collect all client ids
    const customerIds = [];
    const vendorIds = [];
    invoices.forEach(invoice => {
      if (invoice.clientType === 'Customer' && invoice.clientId) {
        customerIds.push(invoice.clientId.toString());
      } else if (invoice.clientType === 'Vendor' && invoice.clientId) {
        vendorIds.push(invoice.clientId.toString());
      } else if (invoice.customerId) {
        customerIds.push(invoice.customerId.toString());
      }
    });

    // Fetch customers and vendors
    const customers = customerIds.length ? await Customer.find({ _id: { $in: customerIds } }) : [];
    const vendors = vendorIds.length ? await Vendor.find({ _id: { $in: vendorIds } }) : [];
    const customerMap = new Map(customers.map(c => [c._id.toString(), c]));
    const vendorMap = new Map(vendors.map(v => [v._id.toString(), v]));

    // Get paid amounts via aggregate
    const invoiceIds = invoices.map(i => i._id);
    const paidAgg = await Invoice.aggregate([
      { $match: { _id: { $in: invoiceIds } } },
      invoicePaidLookupStage(),
      invoiceComputedFieldsStage(),
      invoiceStatusStage(),
      { $project: { _id: 1, paidAmount: 1, pendingAmount: 1, status: 1, totalAmount: 1 } }
    ]);
    const paidMap = new Map(paidAgg.map(a => [a._id.toString(), a]));

    // Build rows
    const rows = invoices.map(invoice => {
      let clientName = 'Unknown';
      let clientIdStr;
      if (invoice.clientType === 'Customer' && invoice.clientId) {
        clientIdStr = invoice.clientId.toString();
        const customer = customerMap.get(clientIdStr);
        clientName = customer?.customerName || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Unknown';
      } else if (invoice.clientType === 'Vendor' && invoice.clientId) {
        clientIdStr = invoice.clientId.toString();
        const vendor = vendorMap.get(clientIdStr);
        clientName = vendor?.vendorName || `${vendor?.firstName || ''} ${vendor?.lastName || ''}`.trim() || 'Unknown';
      } else if (invoice.customerId) {
        clientIdStr = invoice.customerId.toString();
        const customer = customerMap.get(clientIdStr);
        clientName = customer?.customerName || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Unknown';
      }
      const paidData = paidMap.get(invoice._id.toString()) || { paidAmount: 0, pendingAmount: invoice.totalAmount || 0, status: 'Pending' };
      return {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        customerName: clientName,
        invoiceAmount: invoice.totalAmount || 0,
        paidAmount: paidData.paidAmount,
        pendingAmount: paidData.pendingAmount,
        status: paidData.status
      };
    });

    // Get totals
    const totalAgg = await Invoice.aggregate([
      { $match: match },
      invoicePaidLookupStage(),
      invoiceComputedFieldsStage(),
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          totalInvoiceAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
          totalPaidAmount: { $sum: '$paidAmount' },
          totalPendingAmount: { $sum: '$pendingAmount' }
        }
      }
    ]);
    const totals = totalAgg[0] || {
      total: 0,
      totalInvoiceAmount: 0,
      totalPaidAmount: 0,
      totalPendingAmount: 0
    };

    res.json({
      rows,
      totals: {
        totalInvoiceAmount: totals.totalInvoiceAmount,
        totalPaidAmount: totals.totalPaidAmount,
        totalPendingAmount: totals.totalPendingAmount
      },
      total: totals.total,
      page,
      totalPages: Math.ceil(totals.total / limit)
    });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'reports.invoiceSummary');
  }
});

router.get('/sales', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const match = buildInvoiceMatch({
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      customerId: req.query.customerId
    });

    const basePipeline = [
      { $match: match },
      invoicePaidLookupStage(),
      invoiceComputedFieldsStage(),
      invoiceStatusStage()
    ];

    const facet = await Invoice.aggregate([
      ...basePipeline,
      {
        $facet: {
          rows: [
            { $sort: { invoiceDate: 1, numericId: 1, createdAt: 1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                invoiceNumber: 1,
                invoiceDate: 1,
                invoiceAmount: { $ifNull: ['$totalAmount', 0] },
                paidAmount: 1,
                pendingAmount: 1,
                status: 1
              }
            }
          ],
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                totalInvoiceAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
                totalPaidAmount: { $sum: '$paidAmount' },
                totalPendingAmount: { $sum: '$pendingAmount' }
              }
            }
          ]
        }
      }
    ]);

    const result = facet[0] || { rows: [], totals: [] };
    const totals = result.totals[0] || {
      total: 0,
      totalInvoiceAmount: 0,
      totalPaidAmount: 0,
      totalPendingAmount: 0
    };

    res.json({
      rows: result.rows,
      totals: {
        totalInvoiceAmount: totals.totalInvoiceAmount,
        totalPaidAmount: totals.totalPaidAmount,
        totalPendingAmount: totals.totalPendingAmount
      },
      total: totals.total,
      page,
      totalPages: Math.ceil(totals.total / limit)
    });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'reports.sales');
  }
});

module.exports = router;
