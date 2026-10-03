const REPORT_COLUMNS = Object.freeze([
	Object.freeze({ key: 'companyName', label: 'Company Name' }),
	Object.freeze({ key: 'date', label: 'Date' }),
	Object.freeze({ key: 'tnxNo', label: 'Tnx No' }),
	Object.freeze({ key: 'tnxType', label: 'Tnx Type' }),
	Object.freeze({ key: 'description', label: 'Description' }),
	Object.freeze({ key: 'invoiceAmount', label: 'Amount' }),
	Object.freeze({ key: 'paidAmount', label: 'Paid' }),
	Object.freeze({ key: 'balance', label: 'Balance' }),
	Object.freeze({ key: 'status', label: 'Status' })
]);

const getInvoiceItemDescription = (invoice) => {
	const descriptions = (Array.isArray(invoice?.items) ? invoice.items : [])
		.map((item) => String(item?.description || '').trim())
		.filter(Boolean);

	return descriptions.map((description, index) => `${index + 1}. ${description}`).join('\n');
};

const buildInvoiceReportRow = ({ invoice, type, companyName, paidAmount }) => {
	const invoiceAmount = Number(invoice.totalAmount) || 0;
	const paid = Math.min(invoiceAmount, Math.max(0, Number(paidAmount) || 0));
	const balance = Math.max(0, invoiceAmount - paid);

	return {
		_id: `invoice-${invoice._id}`,
		companyName,
		date: invoice.invoiceDate,
		tnxNo: invoice.invoiceNumber,
		tnxType: `${type} Invoice`,
		description: type === 'Sale'
			? getInvoiceItemDescription(invoice)
			: String(invoice.transactionDescription || '').trim() || getInvoiceItemDescription(invoice),
		invoiceAmount,
		paidAmount: paid,
		balance,
		status: balance === 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending'
	};
};

const buildPaymentReportRow = ({ payment, type, companyName, allocationAmount }) => {
	const paidAmount = Number(payment.amount) || Number(allocationAmount) || 0;

	return {
		_id: `payment-${payment._id}`,
		companyName,
		date: payment.paymentDate,
		tnxNo: payment.paymentNumber,
		tnxType: `${type} Payment`,
		description: payment.description || '',
		invoiceAmount: 0,
		paidAmount,
		balance: 0,
		status: 'Paid'
	};
};

const calculateReportTotals = (invoiceRows) => ({
	totalInvAmount: invoiceRows.reduce((total, row) => total + row.invoiceAmount, 0),
	totalInvAmountPaid: invoiceRows.reduce((total, row) => total + row.paidAmount, 0),
	totalInvBalance: invoiceRows.reduce((total, row) => total + row.balance, 0)
});

const sortReportRows = (rows, sortBy = 'date', sortOrder = 'desc') => rows.sort((a, b) => {
	let difference;
	if (sortBy === 'date') difference = new Date(a.date).getTime() - new Date(b.date).getTime();
	else if (['invoiceAmount', 'paidAmount', 'balance'].includes(sortBy)) {
		difference = (Number(a[sortBy]) || 0) - (Number(b[sortBy]) || 0);
	} else {
		difference = String(a[sortBy] ?? '').localeCompare(String(b[sortBy] ?? ''), undefined, { numeric: true, sensitivity: 'base' });
	}
	if (sortOrder === 'desc') difference *= -1;
	return difference || String(a.tnxNo).localeCompare(String(b.tnxNo), undefined, { numeric: true, sensitivity: 'base' });
});

module.exports = { REPORT_COLUMNS, buildInvoiceReportRow, buildPaymentReportRow, calculateReportTotals, sortReportRows };
