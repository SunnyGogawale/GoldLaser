const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const SaleInvoice = require('../models/SaleInvoice');
const SalePayment = require('../models/SalePayment');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const PurchasePayment = require('../models/PurchasePayment');
const { sendErrorResponse } = require('../utils/errorHandler');

function saleInvoicePaidLookupStage() {
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

function purchaseInvoicePaidLookupStage() {
  return {
    $lookup: {
      from: 'purchasepayments',
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
    // Calculate date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const totalCustomers = await Customer.countDocuments();
    const totalVendors = await Vendor.countDocuments();

    // Sales Invoice stats
    const salesInvoiceAgg = await SaleInvoice.aggregate([
      { $match: { invoiceDate: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
    ]);
    const monthlySalesInvoices = salesInvoiceAgg.length > 0 ? salesInvoiceAgg[0].totalAmount : 0;

    // Sales Payment stats
    const salesPaymentAgg = await SalePayment.aggregate([
      { $match: { paymentDate: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
    ]);
    const monthlySalesPayments = salesPaymentAgg.length > 0 ? salesPaymentAgg[0].totalAmount : 0;

    // Sales Outstanding
    const salesOutstandingAgg = await SaleInvoice.aggregate([
      saleInvoicePaidLookupStage(),
      invoiceComputedFieldsStage(),
      { $group: { _id: null, totalOutstanding: { $sum: '$pendingAmount' } } }
    ]);
    const salesOutstanding = salesOutstandingAgg.length > 0 ? salesOutstandingAgg[0].totalOutstanding : 0;

    // Purchase Invoice stats
    const purchaseInvoiceAgg = await PurchaseInvoice.aggregate([
      { $match: { invoiceDate: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, totalAmount: { $sum: '$totalAmount' } } }
    ]);
    const monthlyPurchaseInvoices = purchaseInvoiceAgg.length > 0 ? purchaseInvoiceAgg[0].totalAmount : 0;

    // Purchase Payment stats
    const purchasePaymentAgg = await PurchasePayment.aggregate([
      { $match: { paymentDate: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
    ]);
    const monthlyPurchasePayments = purchasePaymentAgg.length > 0 ? purchasePaymentAgg[0].totalAmount : 0;

    // Purchase Outstanding
    const purchaseOutstandingAgg = await PurchaseInvoice.aggregate([
      purchaseInvoicePaidLookupStage(),
      invoiceComputedFieldsStage(),
      { $group: { _id: null, totalOutstanding: { $sum: '$pendingAmount' } } }
    ]);
    const purchaseOutstanding = purchaseOutstandingAgg.length > 0 ? purchaseOutstandingAgg[0].totalOutstanding : 0;

    const totalPendingAmount = salesOutstanding + purchaseOutstanding;

    res.json({
      totalCustomers,
      totalVendors,
      monthlySalesInvoices,
      monthlySalesPayments,
      salesOutstanding,
      monthlyPurchaseInvoices,
      monthlyPurchasePayments,
      purchaseOutstanding,
      totalPendingAmount
    });
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'dashboard.summary');
  }
});

router.get('/customer-overview', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100
    const search = (req.query.search || '').trim()

    // First get all customers
    let customersQuery = Customer.find()
    if (search) {
      customersQuery = customersQuery.or([
        { id: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } }
      ])
    }
    const customers = await customersQuery.sort({ createdAt: -1 }).limit(limit).lean()

    // Calculate outstanding for each customer
    const rows = []
    for (const customer of customers) {
      const saleInvoiceMatch = {
        $or: [
          { clientId: customer._id, clientType: 'Customer' },
          { customerId: customer._id }
        ]
      }
      const purchaseInvoiceMatch = {
        clientId: customer._id,
        clientType: 'Customer'
      }
      const salePaymentMatch = {
        $or: [
          { clientId: customer._id, clientType: 'Customer' },
          { customerId: customer._id }
        ]
      }
      const purchasePaymentMatch = {
        clientId: customer._id,
        clientType: 'Customer'
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

      const receivableAmount = totalSaleInvoiceAmount - totalReceivedAmount
      const payableAmount = totalPurchaseInvoiceAmount - totalPaidAmount
      const pendingAmount = receivableAmount - payableAmount

      rows.push({
        customerId: customer._id,
        pendingAmount,
        totalSaleInvoiceAmount,
        totalPurchaseInvoiceAmount,
        totalReceivedAmount,
        totalPaidAmount,
        receivableAmount,
        payableAmount,
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        customerName: customer.customerName,
        companyName: customer.companyName,
        contactNumber: customer.contactNumber,
        email: customer.email,
        address: customer.address,
        shippingAddress: customer.shippingAddress,
        note: customer.note,
        createdAt: customer.createdAt
      })
    }

    // Sort by pending amount descending
    rows.sort((a, b) => (b.pendingAmount - a.pendingAmount) || (b.createdAt - a.createdAt))

    res.json({ customers: rows })
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'dashboard.customerOverview');
  }
})

router.get('/vendor-overview', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100
    const search = (req.query.search || '').trim()

    // First get all vendors
    let vendorsQuery = Vendor.find()
    if (search) {
      vendorsQuery = vendorsQuery.or([
        { id: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { vendorName: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } }
      ])
    }
    const vendors = await vendorsQuery.sort({ createdAt: -1 }).limit(limit).lean()

    // Calculate payable for each vendor
    const rows = []
    for (const vendor of vendors) {
      const purchaseInvoiceMatch = {
        $or: [
          { clientId: vendor._id, clientType: 'Vendor' },
          { vendorId: vendor._id }
        ]
      }
      const saleInvoiceMatch = {
        clientId: vendor._id,
        clientType: 'Vendor'
      }
      const purchasePaymentMatch = {
        $or: [
          { clientId: vendor._id, clientType: 'Vendor' },
          { vendorId: vendor._id }
        ]
      }
      const salePaymentMatch = {
        clientId: vendor._id,
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

      const purchasePayableAmount = totalPurchaseInvoiceAmount - totalPaidAmount
      const saleReceivableAmount = totalSaleInvoiceAmount - totalReceivedAmount
      const payableAmount = purchasePayableAmount - saleReceivableAmount

      rows.push({
        vendorId: vendor._id,
        payableAmount,
        totalPurchaseInvoiceAmount,
        totalSaleInvoiceAmount,
        totalPaidAmount,
        totalReceivedAmount,
        purchasePayableAmount,
        saleReceivableAmount,
        id: vendor.id,
        firstName: vendor.firstName,
        lastName: vendor.lastName,
        vendorName: vendor.vendorName,
        companyName: vendor.companyName,
        contactNumber: vendor.contactNumber,
        email: vendor.email,
        address: vendor.address,
        shippingAddress: vendor.shippingAddress,
        note: vendor.note,
        createdAt: vendor.createdAt
      })
    }

    // Sort by payable amount descending
    rows.sort((a, b) => (b.payableAmount - a.payableAmount) || (b.createdAt - a.createdAt))

    res.json({ vendors: rows })
  } catch (err) {
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'dashboard.vendorOverview');
  }
});

module.exports = router;
