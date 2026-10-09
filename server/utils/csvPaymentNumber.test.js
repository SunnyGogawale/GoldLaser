const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildNextCsvPaymentNumber,
  getNextCsvPaymentNumber,
  isUnallocatedCsvPayment
} = require('./csvPaymentNumber');

test('buildNextCsvPaymentNumber continues from the highest existing NAP number', () => {
  assert.equal(buildNextCsvPaymentNumber([]), 'NAP-00001');
  assert.equal(buildNextCsvPaymentNumber(['NAP-00001', 'PAY-44', 'NAP-00012']), 'NAP-00013');
  assert.equal(buildNextCsvPaymentNumber(['NAP-99999']), 'NAP-100000');
});

test('getNextCsvPaymentNumber checks both sale and purchase payment collections', async () => {
  const createPaymentModel = (paymentNumbers) => ({
    find: async () => paymentNumbers.map((paymentNumber) => ({ paymentNumber })),
    exists: async ({ paymentNumber }) => paymentNumbers.includes(paymentNumber)
  });

  const paymentNumber = await getNextCsvPaymentNumber([
    createPaymentModel(['NAP-00001', 'NAP-00003']),
    createPaymentModel(['NAP-00002'])
  ]);

  assert.equal(paymentNumber, 'NAP-00004');
});

test('getNextCsvPaymentNumber verifies a candidate is still unused', async () => {
  const Payment = {
    find: async () => [],
    exists: async ({ paymentNumber }) => paymentNumber === 'NAP-00001'
  };

  assert.equal(await getNextCsvPaymentNumber([Payment]), 'NAP-00002');
});

test('only blank mapped CSV payment numbers are marked unallocated', () => {
  assert.equal(isUnallocatedCsvPayment({ blankCsvPaymentNumber: true }), true);
  assert.equal(isUnallocatedCsvPayment({ blankCsvPaymentNumber: true, paymentNumber: '  ' }), true);
  assert.equal(isUnallocatedCsvPayment({ blankCsvPaymentNumber: true, paymentNumber: ' null ' }), true);
  assert.equal(isUnallocatedCsvPayment({ blankCsvPaymentNumber: false }), false);
  assert.equal(isUnallocatedCsvPayment({ blankCsvPaymentNumber: true, paymentNumber: 'PAY-101' }), false);
});