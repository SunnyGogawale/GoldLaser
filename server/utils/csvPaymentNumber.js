const buildNextCsvPaymentNumber = (paymentNumbers = []) => {
  const highestSequence = paymentNumbers
    .map((paymentNumber) => /^NAP-(\d+)$/i.exec(String(paymentNumber || '')))
    .filter(Boolean)
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isSafeInteger)
    .reduce((highest, current) => Math.max(highest, current), 0)

  return `NAP-${String(highestSequence + 1).padStart(5, '0')}`
}

const getNextCsvPaymentNumber = async (paymentModels) => {
  const existingPayments = await Promise.all(
    paymentModels.map((Payment) => Payment.find({ paymentNumber: /^NAP-\d+$/i }, 'paymentNumber'))
  )
  const existingNumbers = existingPayments.flat().map((payment) => payment.paymentNumber)
  let candidate = buildNextCsvPaymentNumber(existingNumbers)

  while ((await Promise.all(
    paymentModels.map((Payment) => Payment.exists({ paymentNumber: candidate }))
  )).some(Boolean)) {
    existingNumbers.push(candidate)
    candidate = buildNextCsvPaymentNumber(existingNumbers)
  }

  return candidate
}

const isUnallocatedCsvPayment = (request) => {
  const paymentNumber = String(request?.paymentNumber ?? '').trim()
  return request?.blankCsvPaymentNumber === true
    && (!paymentNumber || paymentNumber.toLowerCase() === 'null')
}

module.exports = { buildNextCsvPaymentNumber, getNextCsvPaymentNumber, isUnallocatedCsvPayment };