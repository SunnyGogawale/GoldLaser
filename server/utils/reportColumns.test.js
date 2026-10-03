const test = require('node:test');
const assert = require('node:assert/strict');
const { REPORT_COLUMNS, buildInvoiceReportRow, buildPaymentReportRow, calculateReportTotals, sortReportRows } = require('./reportColumns');

test('report columns use the required names and order', () => {
	assert.deepEqual(REPORT_COLUMNS.map(({ label }) => label), [
		'Company Name',
		'Date',
		'Tnx No',
		'Tnx Type',
		'Description',
		'Amount',
		'Paid',
		'Balance',
		'Status'
	]);
});

test('invoice and payment rows use the canonical report keys and mapping', () => {
	const invoiceRow = buildInvoiceReportRow({
		invoice: {
			_id: 'invoice-1',
			invoiceDate: '2026-01-01',
			invoiceNumber: 'INV-1',
			totalAmount: 100,
			transactionDescription: 'Not the list description',
			items: [{ description: 'First item' }, { description: '  ' }, { description: 'Third item' }]
		},
		type: 'Sale',
		companyName: 'Acme',
		paidAmount: 40
	});
	const paymentRow = buildPaymentReportRow({
		payment: { _id: 'payment-1', paymentDate: '2026-01-02', paymentNumber: 'PAY-1', amount: 40, description: 'Payment' },
		type: 'Sale',
		companyName: 'Acme',
		allocationAmount: 40
	});
	const purchaseInvoiceRow = buildInvoiceReportRow({
		invoice: {
			_id: 'purchase-invoice-1',
			invoiceDate: '2026-01-03',
			invoiceNumber: 'PUR-1',
			totalAmount: 80,
			transactionDescription: 'Purchase description',
			items: [{ description: 'Do not use for purchase report' }]
		},
		type: 'Purchase',
		companyName: 'Acme Supplies',
		paidAmount: 0
	});
	const purchaseInvoiceWithItemFallback = buildInvoiceReportRow({
		invoice: {
			_id: 'purchase-invoice-2',
			invoiceDate: '2026-01-04',
			invoiceNumber: 'PUR-2',
			totalAmount: 35,
			transactionDescription: '',
			items: [{ description: 'First purchase item' }, { description: 'Second purchase item' }]
		},
		type: 'Purchase',
		companyName: 'Acme Supplies',
		paidAmount: 0
	});
	const expectedKeys = REPORT_COLUMNS.map(({ key }) => key);

	assert.deepEqual(Object.keys(invoiceRow).filter((key) => key !== '_id'), expectedKeys);
	assert.deepEqual(Object.keys(paymentRow).filter((key) => key !== '_id'), expectedKeys);
	assert.equal(purchaseInvoiceRow.description, 'Purchase description');
	assert.equal(purchaseInvoiceRow.tnxType, 'Purchase Invoice');
	assert.equal(purchaseInvoiceWithItemFallback.description, '1. First purchase item\n2. Second purchase item');
	assert.deepEqual([
		invoiceRow.companyName,
		invoiceRow.tnxNo,
		invoiceRow.description,
		invoiceRow.invoiceAmount,
		invoiceRow.paidAmount,
		invoiceRow.balance,
		invoiceRow.status
	], ['Acme', 'INV-1', '1. First item\n2. Third item', 100, 40, 60, 'Partial']);
	assert.deepEqual([
		paymentRow.companyName,
		paymentRow.tnxNo,
		paymentRow.invoiceAmount,
		paymentRow.paidAmount,
		paymentRow.balance,
		paymentRow.status
	], ['Acme', 'PAY-1', 0, 40, 0, 'Paid']);
});

test('invoice totals include invoice amount, allocations paid, and outstanding balance', () => {
	assert.deepEqual(calculateReportTotals([
		{ invoiceAmount: 100, paidAmount: 40, balance: 60 },
		{ invoiceAmount: 50, paidAmount: 50, balance: 0 }
	]), {
		totalInvAmount: 150,
		totalInvAmountPaid: 90,
		totalInvBalance: 60
	});
});

test('report rows sort newest first with transaction number as a stable tie-breaker', () => {
	const rows = [
		{ date: '2026-10-01', tnxNo: 'INV-103' },
		{ date: '2026-10-02', tnxNo: 'INV-105' },
		{ date: '2026-10-02', tnxNo: 'INV-104' }
	];

	assert.deepEqual(sortReportRows(rows).map(({ tnxNo }) => tnxNo), ['INV-104', 'INV-105', 'INV-103']);
});

test('report rows sort by selected text and numeric columns in either direction', () => {
	const rows = [
		{ date: '2026-10-01', tnxNo: 'INV-103', companyName: 'Bravo', invoiceAmount: 40 },
		{ date: '2026-10-02', tnxNo: 'INV-105', companyName: 'Alpha', invoiceAmount: 20 },
		{ date: '2026-10-02', tnxNo: 'INV-104', companyName: 'Charlie', invoiceAmount: 60 }
	];

	assert.deepEqual(sortReportRows([...rows], 'companyName', 'asc').map(({ companyName }) => companyName), ['Alpha', 'Bravo', 'Charlie']);
	assert.deepEqual(sortReportRows([...rows], 'invoiceAmount', 'desc').map(({ tnxNo }) => tnxNo), ['INV-104', 'INV-103', 'INV-105']);
});

