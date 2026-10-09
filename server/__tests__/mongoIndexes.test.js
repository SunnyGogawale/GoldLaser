const test = require('node:test');
const assert = require('node:assert/strict');
const SaleInvoice = require('../models/SaleInvoice');
const SalePayment = require('../models/SalePayment');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const PurchasePayment = require('../models/PurchasePayment');

const statementIndexes = [
  [SaleInvoice, 'customerId', 'invoiceDate'],
  [SalePayment, 'customerId', 'paymentDate'],
  [PurchaseInvoice, 'vendorId', 'invoiceDate'],
  [PurchasePayment, 'vendorId', 'paymentDate']
];

test('legacy statement queries have partial indexes matching their date sort', () => {
  for (const [model, clientField, dateField] of statementIndexes) {
    const index = model.schema.indexes().find(([keys, options]) => (
      keys[clientField] === 1 &&
      keys[dateField] === 1 &&
      keys.createdAt === 1 &&
      options.partialFilterExpression?.[clientField]?.$exists === true
    ));

    assert.ok(index, `${model.modelName} should index ${clientField} with ${dateField}`);
  }
});