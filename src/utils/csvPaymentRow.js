import { normalizeCsvDateValue, parseCsvDateValue, toIsoDateString } from './csvParser.js'

export const prepareCsvPaymentRow = ({
  paymentNumberValue,
  paymentNumberMapped,
  paymentDateValue,
  paymentDateMapped,
  amountValue,
  amountMapped,
  descriptionValue,
  descriptionMapped
}) => {
  const rawPaymentNumber = String(paymentNumberValue ?? '')
  const normalizedPaymentNumber = rawPaymentNumber.trim()
  const blankCsvPaymentNumber = !paymentNumberMapped
    || !normalizedPaymentNumber
    || normalizedPaymentNumber.toLowerCase() === 'null'

  if (!paymentDateMapped) throw new Error('Map a Payment Date column before importing.')
  const rawPaymentDate = String(paymentDateValue ?? '').trim()
  if (!rawPaymentDate) throw new Error('Payment Date is required.')
  if (!parseCsvDateValue(rawPaymentDate)) throw new Error('Payment Date is invalid.')

  if (!amountMapped) throw new Error('Map an Amount column before importing.')
  const rawAmount = String(amountValue ?? '').trim()
  if (!rawAmount) throw new Error('Amount is required.')
  const amount = Number.parseFloat(rawAmount.replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be a valid non-negative number.')
  }

  return {
    paymentNumber: blankCsvPaymentNumber ? undefined : rawPaymentNumber,
    blankCsvPaymentNumber,
    paymentDate: toIsoDateString(normalizeCsvDateValue(rawPaymentDate)).split('T')[0],
    amount,
    description: descriptionMapped ? String(descriptionValue ?? '') : ''
  }
}