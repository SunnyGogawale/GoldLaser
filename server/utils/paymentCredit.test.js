const test = require('node:test');
const assert = require('node:assert/strict');
const { getAvailableCreditContribution } = require('./paymentCredit');

test('excludes payment records whose payment number contains NAP regardless of case or position', () => {
  for (const paymentNumber of ['NAP-12345', 'ABC-NAP-12345', '12345-NAP-ABC', 'nap-12345', 'Abc-Nap-12345']) {
    assert.equal(
      getAvailableCreditContribution({ paymentNumber, amount: 100, allocations: [] }),
      0,
      `${paymentNumber} should not contribute to available credit`
    );
  }
});

test('preserves the existing available credit contribution for other payment numbers', () => {
  assert.equal(
    getAvailableCreditContribution({
      paymentNumber: 'INV-12345',
      amount: 100,
      allocations: [{ amount: 35 }]
    }),
    65
  );
});
