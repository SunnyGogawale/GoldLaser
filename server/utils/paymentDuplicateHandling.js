const normalizePaymentItems = (allocations = []) => {
  if (!Array.isArray(allocations)) return [];
  return allocations.map((allocation) => ({
    invoiceId: String(allocation?.invoiceId || ''),
    amount: Number(allocation?.amount) || 0,
    description: String(allocation?.description || '')
  })).filter((allocation) => allocation.invoiceId);
};

const buildPaymentMergeUpdateOps = ({ existingPayment, allocations, description, authUser, amount, paymentDate, attachments }) => {
  const normalizedAllocations = normalizePaymentItems(allocations);
  const nextAmount = Number(existingPayment?.amount || 0) + Number(amount || 0);
  const nextDescription = String(description || existingPayment?.description || '').trim();

  return {
    updateOps: {
      $set: {
        clientId: existingPayment?.clientId,
        clientType: existingPayment?.clientType || 'Customer',
        paymentDate: paymentDate || existingPayment?.paymentDate,
        amount: nextAmount,
        description: nextDescription,
        attachments: Array.isArray(attachments) ? attachments : existingPayment?.attachments || [],
        updatedBy: authUser?.id || existingPayment?.updatedBy || null,
        updatedByName: authUser?.fullName || existingPayment?.updatedByName || '',
        updatedByEmail: authUser?.email || existingPayment?.updatedByEmail || ''
      },
      $push: {
        allocations: { $each: normalizedAllocations },
        activity: {
          action: 'update',
          at: new Date(),
          userId: authUser?.id || null,
          userName: authUser?.fullName || '',
          userEmail: authUser?.email || '',
          changes: [
            {
              field: 'allocations',
              from: '',
              to: JSON.stringify(normalizedAllocations)
            }
          ]
        }
      }
    }
  };
};

module.exports = {
  buildPaymentMergeUpdateOps
};
