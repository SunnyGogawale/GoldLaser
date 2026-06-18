const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Invoice = require('../models/SaleInvoice');

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
    match.customerId = new mongoose.Types.ObjectId(customerId);
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

    const basePipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
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
                customerName: '$customer.customerName',
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
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
