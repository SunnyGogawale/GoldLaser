const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Invoice = require('../models/SaleInvoice');
const SalePayment = require('../models/SalePayment');
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

async function getPaidAmountMapByInvoiceIds(invoiceIds) {
  const rows = await SalePayment.aggregate([
    { $unwind: '$allocations' },
    { $match: { 'allocations.invoiceId': { $in: invoiceIds } } },
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

    const allInvoices = await Invoice.find(match)
      .sort({ invoiceDate: 1, createdAt: 1 });

    const invoiceIds = allInvoices.map(invoice => invoice._id);
    const paidMap = await getPaidAmountMapByInvoiceIds(invoiceIds);

    const invoices = allInvoices.slice(skip, skip + limit);

    if (invoices.length === 0) {
      return res.json({
        rows: [],
        totals: {
          totalInvoiceAmount: 0,
          totalPaidAmount: 0,
          totalPendingAmount: 0
        },
        total: allInvoices.length,
        page,
        totalPages: Math.ceil(allInvoices.length / limit)
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
      const invoiceAmount = Number(invoice.totalAmount || 0);
      const paidAmount = paidMap.get(String(invoice._id)) || 0;
      const pendingAmount = Math.max(0, invoiceAmount - paidAmount);
      const status = paidAmount >= invoiceAmount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending';

      return {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        customerName: clientName,
        invoiceAmount,
        paidAmount,
        paymentAmount: paidAmount,
        pendingAmount,
        status
      };
    });

    const totals = allInvoices.reduce((acc, invoice) => {
      const invoiceAmount = Number(invoice.totalAmount || 0);
      const paidAmount = paidMap.get(String(invoice._id)) || 0;
      const pendingAmount = Math.max(0, invoiceAmount - paidAmount);

      acc.totalInvoiceAmount += invoiceAmount;
      acc.totalPaidAmount += paidAmount;
      acc.totalPendingAmount += pendingAmount;
      acc.total += 1;

      return acc;
    }, {
      total: 0,
      totalInvoiceAmount: 0,
      totalPaidAmount: 0,
      totalPendingAmount: 0
    });

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

    const allInvoices = await Invoice.find(match)
      .sort({ invoiceDate: 1, createdAt: 1 });

    const invoiceIds = allInvoices.map(invoice => invoice._id);
    const paidMap = await getPaidAmountMapByInvoiceIds(invoiceIds);

    const invoices = allInvoices.slice(skip, skip + limit);
    const rows = invoices.map(invoice => {
      const invoiceAmount = Number(invoice.totalAmount || 0);
      const paidAmount = paidMap.get(String(invoice._id)) || 0;
      const pendingAmount = Math.max(0, invoiceAmount - paidAmount);
      const status = paidAmount >= invoiceAmount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending';

      return {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        invoiceAmount,
        paidAmount,
        paymentAmount: paidAmount,
        pendingAmount,
        status
      };
    });

    const totals = allInvoices.reduce((acc, invoice) => {
      const invoiceAmount = Number(invoice.totalAmount || 0);
      const paidAmount = paidMap.get(String(invoice._id)) || 0;
      const pendingAmount = Math.max(0, invoiceAmount - paidAmount);

      acc.totalInvoiceAmount += invoiceAmount;
      acc.totalPaidAmount += paidAmount;
      acc.totalPendingAmount += pendingAmount;
      acc.total += 1;

      return acc;
    }, {
      total: 0,
      totalInvoiceAmount: 0,
      totalPaidAmount: 0,
      totalPendingAmount: 0
    });

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
    sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'reports.sales');
  }
});

module.exports = router;
