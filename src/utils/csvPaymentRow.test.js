import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareCsvPaymentRow } from './csvPaymentRow.js'

const requiredFields = {
  paymentDateMapped: true,
  paymentDateValue: '2026-10-09',
  amountMapped: true,
  amountValue: '125.50'
}

test('preserves nonblank payment numbers and mapped descriptions exactly', () => {
  const row = prepareCsvPaymentRow({
    ...requiredFields,
    paymentNumberMapped: true,
    paymentNumberValue: ' PAY-0091 ',
    descriptionMapped: true,
    descriptionValue: '  Bank transfer  '
  })

  assert.equal(row.paymentNumber, ' PAY-0091 ')
  assert.equal(row.blankCsvPaymentNumber, false)
  assert.equal(row.description, '  Bank transfer  ')
})

test('marks empty, null, blank, and unmapped payment numbers for generation', () => {
  for (const value of ['', '   ', null, ' null ']) {
    const row = prepareCsvPaymentRow({
      ...requiredFields,
      paymentNumberMapped: true,
      paymentNumberValue: value
    })
    assert.equal(row.paymentNumber, undefined)
    assert.equal(row.blankCsvPaymentNumber, true)
  }

  assert.equal(prepareCsvPaymentRow({ ...requiredFields, paymentNumberMapped: false }).blankCsvPaymentNumber, true)
})

test('rejects missing required mappings and values instead of creating defaults', () => {
  assert.throws(() => prepareCsvPaymentRow({
    ...requiredFields,
    paymentNumberMapped: false,
    paymentDateMapped: false
  }), /Map a Payment Date column/)
  assert.throws(() => prepareCsvPaymentRow({
    ...requiredFields,
    paymentNumberMapped: false,
    paymentDateValue: ''
  }), /Payment Date is required/)
  assert.throws(() => prepareCsvPaymentRow({
    ...requiredFields,
    paymentNumberMapped: false,
    amountMapped: false
  }), /Map an Amount column/)
  assert.throws(() => prepareCsvPaymentRow({
    ...requiredFields,
    paymentNumberMapped: false,
    amountValue: ''
  }), /Amount is required/)
  assert.throws(() => prepareCsvPaymentRow({
    ...requiredFields,
    paymentNumberMapped: false,
    paymentDateValue: 'not-a-date'
  }), /Payment Date is invalid/)
})

test('accepts explicit zero amount and leaves unmapped descriptions empty', () => {
  const row = prepareCsvPaymentRow({
    ...requiredFields,
    paymentNumberMapped: false,
    amountValue: '0',
    descriptionMapped: false,
    descriptionValue: 'unmapped value'
  })

  assert.equal(row.amount, 0)
  assert.equal(row.description, '')
})