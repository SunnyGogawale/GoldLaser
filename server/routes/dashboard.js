const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');

function invoicePaidLookupStage() {
  return {
    $lookup: {
      from: 'payments',
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

router.get('/summary', async (req, res) => {
  try {
    const totalCustomers = await Customer.countDocuments();

    const pendingAgg = await Invoice.aggregate([
      invoicePaidLookupStage(),
      invoiceComputedFieldsStage(),
      { $group: { _id: null, totalPendingAmount: { $sum: '$pendingAmount' } } }
    ]);

    const totalPendingAmount = pendingAgg.length > 0 ? pendingAgg[0].totalPendingAmount : 0;

    res.json({
      totalCustomers,
      totalPendingAmount
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/customer-overview', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const search = (req.query.search || '').trim();

    const pipeline = [
      invoicePaidLookupStage(),
      invoiceComputedFieldsStage(),
      { $match: { pendingAmount: { $gt: 0 } } },
      {
        $group: {
          _id: '$customerId',
          pendingAmount: { $sum: '$pendingAmount' }
        }
      },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: false } }
    ];

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { 'customer.id': { $regex: search, $options: 'i' } },
            { 'customer.firstName': { $regex: search, $options: 'i' } },
            { 'customer.lastName': { $regex: search, $options: 'i' } },
            { 'customer.customerName': { $regex: search, $options: 'i' } }
          ]
        }
      });
    }

    pipeline.push({ $sort: { pendingAmount: -1, 'customer.createdAt': -1 } });
    pipeline.push({ $limit: limit });
    pipeline.push({
      $project: {
        _id: 0,
        customerId: '$_id',
        pendingAmount: 1,
        id: '$customer.id',
        firstName: '$customer.firstName',
        lastName: '$customer.lastName',
        customerName: '$customer.customerName',
        contactNumber: '$customer.contactNumber'
      }
    });

    const rows = await Invoice.aggregate(pipeline);
    res.json({ customers: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

