export const REPORT_COLUMNS = [
	{ key: 'companyName', label: 'Company Name' },
	{ key: 'date', label: 'Date' },
	{ key: 'tnxNo', label: 'Tnx No' },
	{ key: 'tnxType', label: 'Tnx Type' },
	{ key: 'description', label: 'Description' },
	{ key: 'invoiceAmount', label: 'Amount' },
	{ key: 'paidAmount', label: 'Paid' },
	{ key: 'balance', label: 'Balance' },
	{ key: 'status', label: 'Status' }
]

export const REPORT_AMOUNT_COLUMN_KEYS = new Set(['invoiceAmount', 'paidAmount', 'balance'])

export const REPORT_COLUMN_INFO = {
	invoiceAmount: 'Total Invoice Amount',
	paidAmount: 'Total Invoice Paid Amount',
	balance: 'Total Invoice Balance Amount'
}


export const getReportPopoverPosition = (iconRect) => {
	const popoverWidth = 240
	const gap = 8
	const rightSideLeft = iconRect.right + gap
	const left = rightSideLeft + popoverWidth <= window.innerWidth - 8
		? rightSideLeft
		: Math.max(8, iconRect.left - popoverWidth - gap)
	const top = Math.max(8, Math.min(iconRect.top, window.innerHeight - 80))

	return { left, top }
}

