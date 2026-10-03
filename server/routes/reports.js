const express = require('express');
const mongoose = require('mongoose');
const SaleInvoice = require('../models/SaleInvoice');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const SalePayment = require('../models/SalePayment');
const PurchasePayment = require('../models/PurchasePayment');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const { sendErrorResponse } = require('../utils/errorHandler');
const { REPORT_COLUMNS, buildInvoiceReportRow, buildPaymentReportRow, calculateReportTotals, sortReportRows } = require('../utils/reportColumns');

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
  const clientId = query.clientId || query.customerId;
  if (clientId && mongoose.isValidObjectId(clientId)) {
    match.clientId = new mongoose.Types.ObjectId(clientId);
    if (query.customerId && !query.clientType) match.clientType = 'Customer';
    else if (query.clientType === 'Customer' || query.clientType === 'Vendor') match.clientType = query.clientType;
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
    ? client?.companyName || client?.vendorName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Unknown'
    : client?.companyName || client?.customerName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || 'Unknown';
};

const createReportHandler = ({ Invoice, Payment, type }) => async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const sortBy = REPORT_COLUMNS.some(({ key }) => key === req.query.sortBy) ? req.query.sortBy : 'date';
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
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
      return buildInvoiceReportRow({
        invoice,
        type,
        companyName: getClientName(invoice, clients),
        paidAmount: paidMap.get(String(invoice._id)) || 0
      });
    });

    const paymentRows = allPayments.map((payment) => {
      const allocationAmount = (Array.isArray(payment.allocations) ? payment.allocations : [])
        .reduce((total, allocation) => total + (Number(allocation.amount) || 0), 0);
      return buildPaymentReportRow({
        payment,
        type,
        companyName: getClientName(payment, clients),
        allocationAmount
      });
    });

    const rows = sortReportRows([...invoiceRows, ...paymentRows], sortBy, sortOrder);

    const totals = calculateReportTotals(invoiceRows);

    res.json({ columns: REPORT_COLUMNS, rows: rows.slice((page - 1) * limit, page * limit), totals, total: rows.length, page, totalPages: Math.ceil(rows.length / limit) });
  } catch (error) {
    sendErrorResponse(res, error, 'Something went wrong. Please try again later.', 500, `reports.${type.toLowerCase()}`);
  }
};

router.get('/sales', createReportHandler({ Invoice: SaleInvoice, Payment: SalePayment, type: 'Sale' }));
router.get('/purchases', createReportHandler({ Invoice: PurchaseInvoice, Payment: PurchasePayment, type: 'Purchase' }));
router.get('/invoice-summary', createReportHandler({ Invoice: SaleInvoice, Payment: SalePayment, type: 'Sale' }));

module.exports = router;