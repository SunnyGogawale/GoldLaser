export const calculateUpdatedAvailableCreditAfterDebit = (previousAvailableCredit = 0, debitedAmount = 0) => {
  const previousBalance = Math.max(0, Number(previousAvailableCredit) || 0)
  const debited = Math.max(0, Number(debitedAmount) || 0)
  return Math.max(0, Math.round((previousBalance - debited + Number.EPSILON) * 100) / 100)
}

export const calculateCreditUsedOnSelections = (selectedInvoiceIds = [], invoicePaymentAmounts = {}) => {
  if (!Array.isArray(selectedInvoiceIds) || selectedInvoiceIds.length === 0) return 0

  return selectedInvoiceIds.reduce((total, invoiceId) => {
    const paymentAmount = Number(invoicePaymentAmounts[String(invoiceId)] || 0)
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return total
    return total + paymentAmount
  }, 0)
}

export const calculateRemainingAvailableCredit = (availableCredit = 0, creditUsedOnSelections = 0) => {
  const currentAvailableCredit = Math.max(0, Number(availableCredit) || 0)
  const used = Math.max(0, Number(creditUsedOnSelections) || 0)
  return Math.max(0, Math.round((currentAvailableCredit - used + Number.EPSILON) * 100) / 100)
}

export const calculateAdjustedBillPaymentAmount = (billPaymentAmount = 0, availableCredit = 0) => {
  const bill = Math.max(0, Number(billPaymentAmount) || 0)
  const credit = Math.max(0, Number(availableCredit) || 0)
  return Math.max(0, Math.round((bill - credit + Number.EPSILON) * 100) / 100)
}

export const calculateCashAmountAfterCredit = (billPaymentAmount = 0, availableCredit = 0) => {
  const bill = Math.max(0, Number(billPaymentAmount) || 0)
  const credit = Math.max(0, Number(availableCredit) || 0)
  const creditApplied = Math.min(bill, credit)
  return Math.max(0, Math.round((bill - creditApplied + Number.EPSILON) * 100) / 100)
}

export const calculatePaymentListAmount = (paymentAmount = 0, allocations = [], availableCredit = 0) => {
  const enteredAmount = Math.max(0, Number(paymentAmount) || 0)
  if (enteredAmount > 0) return Math.round((enteredAmount + Number.EPSILON) * 100) / 100

  const selectedTotal = (Array.isArray(allocations) ? allocations : [])
    .reduce((total, allocation) => total + Math.max(0, Number(allocation?.amount) || 0), 0)
  const credit = Math.max(0, Number(availableCredit) || 0)
  const debitedAmount = selectedTotal - Math.min(selectedTotal, credit)
  const displayAmount = debitedAmount > 0 ? debitedAmount : selectedTotal
  return Math.round((displayAmount + Number.EPSILON) * 100) / 100
}
