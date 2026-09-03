const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInvoiceValue } = require('../routes/invoices');

test('normalizeInvoiceValue keeps memo entries with title, description, and memo items intact', () => {
  const normalized = normalizeInvoiceValue('memos', [
    {
      id: 'memo-1',
      title: 'Follow-up',
      description: 'Call customer tomorrow',
      createdAt: '2026-08-29T10:00:00.000Z',
      memoItems: [
        { product: 'Ring', description: 'Repair fee', amount: -1000 }
      ]
    }
  ]);

  assert.deepEqual(normalized, [{
    id: 'memo-1',
    title: 'Follow-up',
    description: 'Call customer tomorrow',
    createdAt: '2026-08-29T10:00:00.000Z',
    memoItems: [{
      product: 'Ring',
      description: 'Repair fee',
      amount: -1000
    }]
  }]);
});
