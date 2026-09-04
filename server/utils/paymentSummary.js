const roundMoney = (value) => Math.round((Math.max(0, Number(value) || 0) + Number.EPSILON) * 100) / 100;

const buildPaymentSummary = ({
  paymentAmount = 0,
  availableCredit = 0,
  totalPending = 0,
  selectedPaymentTotal = 0
} = {}) => {
  const credit = roundMoney(availableCredit);
  const selectedTotal = roundMoney(selectedPaymentTotal);
  const usedAmount = Math.min(selectedTotal, credit);
  const remainingAmount = roundMoney(credit - usedAmount);

  return {
    paymentAmount: roundMoney(paymentAmount),
    availableCredit: credit,
    usedAmount,
    remainingAmount,
    adjustedBillAmount: roundMoney(selectedTotal - remainingAmount),
    selectedPaymentTotal: selectedTotal,
    billPaymentAmount: roundMoney(totalPending)
  };
};

module.exports = { buildPaymentSummary };
