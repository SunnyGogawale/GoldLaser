const express = require('express');
const mongoose = require('mongoose');
const SaleInvoice = require('../models/SaleInvoice');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const SalePayment = require('../models/SalePayment');
const PurchasePayment = require('../models/PurchasePayment');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const { sendErrorResponse } = require('../utils/errorHandler');

const router = express.Router();

const parseDate = (value, endOfDay = false) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date;
};

const buildMatch = (query, dateField) => {
  const match = {};
  const from = parseDate(query.fromDate);
  const to = parseDate(query.toDate, true);
  if (from || to) {
    match[dateField] = {};
    if (from) match[dateField].$gte = from;
    if (to) match[dateField].$lte = to;
  }
  if (query.clientId && mongoose.isValidObjectId(query.clientId)) {
    match.clientId = new mongoose.Types.ObjectId(query.clientId);
    if (query.clientType === 'Customer' || query.clientType === 'Vendor') match.clientType = query.clientType;
  }
  return match;
};

const getClients = async (records) => {
  const customerIds = records.filter((record) => record.clientType === 'Customer').map((record) => record.clientId);
  const vendorIds = records.filter((record) => record.clientType === 'Vendor').map((record) => record.clientId);
  const [customers, vendors] = await Promise.all([
    customerIds.length ? Customer.find({ _id: { $in: customerIds } }).lean() : [],
    vendorIds.length ? Vendor.find({ _id: { $in: vendorIds } }).lean() : []
  ]);
  return {
    customers: new Map(customers.map((client) => [String(client._id), client])),
    vendors: new Map(vendors.map((client) => [String(client._id), client]))
  };
};

const getClientName = (record, clients) => {
  const clientMap = record.clientType === 'Vendor' ? clients.vendors : clients.customers;
  const client = clientMap.get(String(record.clientId));
  return record.clientType === 'Vendor'
    ? client?.vendorName || client?.companyName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Unknown'
    : client?.customerName || client?.companyName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Unknown';
};

const createReportHandler = ({ Invoice, Payment, type }) => async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const [allInvoices, allPayments] = await Promise.all([
      Invoice.find(buildMatch(req.query, 'invoiceDate')).sort({ invoiceDate: 1, createdAt: 1 }).lean(),
      Payment.find(buildMatch(req.query, 'paymentDate')).sort({ paymentDate: 1, createdAt: 1 }).lean()
    ]);
    const clients = await getClients([...allInvoices, ...allPayments]);
    const paidMap = new Map();
    for (const payment of allPayments) {
      for (const allocation of Array.isArray(payment.allocations) ? payment.allocations : []) {
        const invoiceId = String(allInvoices.some((invoice) => String(invoice._id) === String(allocation.invoiceId)) ? allocation.invoiceId : '');
        if (invoiceId) paidMap.set(invoiceId, (paidMap.get(invoiceId) || 0) + (Number(allocation.amount) || 0));
      }
    }

    const invoiceRows = allInvoices.map((invoice) => {
      const invoiceAmount = Number(invoice.totalAmount) || 0;
      const paymentAmount = Math.min(invoiceAmount, paidMap.get(String(invoice._id)) || 0);
      const pendingAmount = Math.max(0, invoiceAmount - paymentAmount);
      return {
        _id: `invoice-${invoice._id}`,
        date: invoice.invoiceDate,
        transactionNo: invoice.invoiceNumber,
        transactionType: `${type} Invoice`,
        type: `${type} Invoice`,
        invoiceNumber: invoice.invoiceNumber,
        clientType: invoice.clientType,
        clientName: getClientName(invoice, clients),
        description: invoice.transactionDescription || '',
        debit: invoiceAmount,
        credit: 0,
        balance: pendingAmount,
        amount: invoiceAmount,
        invoiceAmount,
        paymentAmount: 0,
        pendingAmount,
        status: pendingAmount === 0 ? 'Paid' : paymentAmount > 0 ? 'Partial' : 'Pending'
      };
    });

    const paymentRows = allPayments.map((payment) => {
      const allocationAmount = (Array.isArray(payment.allocations) ? payment.allocations : [])
        .reduce((total, allocation) => total + (Number(allocation.amount) || 0), 0);
      const creditAmount = Number(payment.amount) || allocationAmount;
      return {
        _id: `payment-${payment._id}`,
        date: payment.paymentDate,
        transactionNo: payment.paymentNumber,
        transactionType: `${type} Payment`,
        type: `${type} Payment`,
        invoiceNumber: payment.paymentNumber,
        clientType: payment.clientType,
        clientName: getClientName(payment, clients),
        description: payment.description || '',
        debit: 0,
        credit: creditAmount,
        balance: 0,
        amount: creditAmount,
        invoiceAmount: 0,
        paymentAmount: creditAmount,
        pendingAmount: 0,
        status: 'Paid'
      };
    });

    const rows = [...invoiceRows, ...paymentRows].sort((a, b) => {
      const dateDifference = new Date(a.date).getTime() - new Date(b.date).getTime();
      return dateDifference || String(a.transactionNo).localeCompare(String(b.transactionNo));
    });

    const totals = {
      totalInvoiceAmount: invoiceRows.reduce((total, row) => total + row.debit, 0),
      totalPaymentAmount: paymentRows.reduce((total, row) => total + row.credit, 0),
      totalPendingAmount: invoiceRows.reduce((total, row) => total + row.balance, 0)
    };

    res.json({ rows: rows.slice((page - 1) * limit, page * limit), totals, total: rows.length, page, totalPages: Math.ceil(rows.length / limit) });
  } catch (error) {
    sendErrorResponse(res, error, 'Something went wrong. Please try again later.', 500, `reports.${type.toLowerCase()}`);
  }
};

router.get('/sales', createReportHandler({ Invoice: SaleInvoice, Payment: SalePayment, type: 'Sale' }));
router.get('/purchases', createReportHandler({ Invoice: PurchaseInvoice, Payment: PurchasePayment, type: 'Purchase' }));
router.get('/invoice-summary', createReportHandler({ Invoice: SaleInvoice, Payment: SalePayment, type: 'Sale' }));

module.exports = router;