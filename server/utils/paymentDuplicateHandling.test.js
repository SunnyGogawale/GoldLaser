const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPaymentMergeUpdateOps } = require('./paymentDuplicateHandling');

test('buildPaymentMergeUpdateOps appends allocations and updates totals for duplicate payment numbers', () => {
  const existingPayment = { amount: 100, description: 'Original', paymentDate: '2024-01-01', attachments: [] };
  const result = buildPaymentMergeUpdateOps({
    existingPayment,
    allocations: [{ invoiceId: 'inv1', amount: 25, description: 'Imported' }],
    description: 'Updated',
    authUser: { id: 'user1', fullName: 'Admin', email: 'admin@example.com' },
    amount: 25,
    paymentDate: '2024-01-02',
    attachments: []
  });

  assert.equal(result.updateOps.$set.amount, 125);
  assert.equal(result.updateOps.$set.description, 'Updated');
  assert.equal(result.updateOps.$push.allocations.$each[0].invoiceId, 'inv1');
  assert.equal(result.updateOps.$push.allocations.$each[0].amount, 25);
});
