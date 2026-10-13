const getAvailableCreditContribution = (payment) => {
  if (/NAP/i.test(String(payment?.paymentNumber || ''))) return 0;

  const paymentAmount = Number(payment?.amount) || 0;
  const allocationTotal = Array.isArray(payment?.allocations)
    ? payment.allocations.reduce((sum, allocation) => sum + (Number(allocation?.amount) || 0), 0)
    : 0;
  return paymentAmount - allocationTotal;
};

module.exports = {
  getAvailableCreditContribution
};
