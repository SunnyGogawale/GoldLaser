const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInvoiceMergeUpdateOps } = require('./invoiceDuplicateHandling');

test('buildInvoiceMergeUpdateOps appends items and updates totals for duplicate invoice numbers', () => {
  const existingInvoice = { totalAmount: 100, transactionDescription: 'Initial', invoiceDate: '2024-01-01' };
  const result = buildInvoiceMergeUpdateOps({
    existingInvoice,
    incomingItems: [{ product: 'Widget', description: 'Imported', amount: 25 }],
    transactionDescription: 'Updated',
    invoiceDate: '2024-01-02',
    authUser: { id: 'user1', fullName: 'Admin', email: 'admin@example.com' }
  });

  assert.equal(result.appendedAmount, 25);
  assert.equal(result.updateOps.$set.totalAmount, 125);
  assert.equal(result.updateOps.$set.transactionDescription, 'Updated');
  assert.equal(result.appendedItems[0].product, 'Widget');
  assert.equal(result.updateOps.$push.items.$each[0].description, 'Imported');
});
