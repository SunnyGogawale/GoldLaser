import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateUpdatedAvailableCreditAfterDebit,
  calculateCreditUsedOnSelections,
  calculateRemainingAvailableCredit,
  calculateAdjustedBillPaymentAmount,
  calculateCashAmountAfterCredit,
  calculatePaymentListAmount
} from './creditCalculation.js'

test('calculateUpdatedAvailableCreditAfterDebit subtracts the debited amount once', () => {
  assert.equal(calculateUpdatedAvailableCreditAfterDebit(1000, 300), 700)
  assert.equal(calculateUpdatedAvailableCreditAfterDebit(1000, 1200), 0)
})

test('calculateCreditUsedOnSelections sums each selected invoice allocation only once', () => {
  assert.equal(
    calculateCreditUsedOnSelections(['a', 'b', 'c'], { a: '300', b: '500', c: '200' }),
    1000
  )
  assert.equal(
    calculateCreditUsedOnSelections(['a', 'b'], { a: '300', b: '0' }),
    300
  )
})

test('calculateRemainingAvailableCredit uses previous balance minus total used', () => {
  assert.equal(calculateRemainingAvailableCredit(1000, 300), 700)
  assert.equal(calculateRemainingAvailableCredit(700, 500), 200)
  assert.equal(calculateRemainingAvailableCredit(1000, 1500), 0)
  assert.equal(calculateRemainingAvailableCredit(11000, 5000), 6000)
})

test('calculateAdjustedBillPaymentAmount uses remaining credit rather than the original balance', () => {
  assert.equal(calculateAdjustedBillPaymentAmount(8000, 6000), 2000)
  assert.equal(calculateAdjustedBillPaymentAmount(12000, 11000), 1000)
})

test('calculateCashAmountAfterCredit records only the cash portion when credit is used', () => {
  assert.equal(calculateCashAmountAfterCredit(5000, 11000), 0)
  assert.equal(calculateCashAmountAfterCredit(8000, 6000), 2000)
  assert.equal(calculateCashAmountAfterCredit(3000, 500), 2500)
})

test('calculatePaymentListAmount keeps valid amounts and debits credit for blank amounts', () => {
  const allocations = [{ amount: 11000 }]
  assert.equal(calculatePaymentListAmount(5000, allocations, 11000), 5000)
  assert.equal(calculatePaymentListAmount(0, allocations, 1000), 10000)
  assert.equal(calculatePaymentListAmount(null, allocations, 11000), 11000)
  assert.equal(calculatePaymentListAmount('', allocations, 12000), 11000)
})
