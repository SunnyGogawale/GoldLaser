const normalizeInvoiceItems = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    product: String(item?.product || ''),
    description: String(item?.description || ''),
    amount: Number(item?.amount) || 0
  }));
};

const buildInvoiceMergeUpdateOps = ({ existingInvoice, incomingItems, transactionDescription, invoiceDate, authUser }) => {
  const normalizedItems = normalizeInvoiceItems(incomingItems);
  const appendedAmount = normalizedItems.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
  const nextTotal = Number(existingInvoice?.totalAmount || 0) + appendedAmount;

  return {
    updateOps: {
      $set: {
        transactionDescription: String(transactionDescription || existingInvoice?.transactionDescription || '').trim(),
        invoiceDate: invoiceDate || existingInvoice?.invoiceDate,
        totalAmount: nextTotal,
        updatedBy: authUser?.id || existingInvoice?.updatedBy || null,
        updatedByName: authUser?.fullName || existingInvoice?.updatedByName || '',
        updatedByEmail: authUser?.email || existingInvoice?.updatedByEmail || ''
      },
      $push: {
        items: { $each: normalizedItems },
        activity: {
          action: 'update',
          at: new Date(),
          userId: authUser?.id || null,
          userName: authUser?.fullName || '',
          userEmail: authUser?.email || '',
          changes: [
            {
              field: 'items',
              from: '',
              to: JSON.stringify(normalizedItems)
            }
          ]
        }
      }
    },
    appendedItems: normalizedItems,
    appendedAmount
  };
};

module.exports = {
  buildInvoiceMergeUpdateOps
};
