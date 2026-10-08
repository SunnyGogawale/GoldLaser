import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
const formatMoney = (value) =>
  Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

const formatPdfMoney = (value) => `$ ${formatMoney(value)}`

const parseStatementDate = (value) => {
  if (!value) return null

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

const formatStatementDate = (value) => {
  const date = parseStatementDate(value)
  if (!date) return null

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date).replaceAll(' ', '-')
}

const formatLedgerDate = (value) => {
  const date = parseStatementDate(value)
  if (!date) return null

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}-${date.getFullYear()}`
}

const drawRoundedCard = (doc, x, y, width, height, fill, border) => {
  doc.setFillColor(...fill)
  doc.setDrawColor(...border)
  doc.setLineWidth(0.25)
  doc.roundedRect(x, y, width, height, 3, 3, 'FD')
}

export const getStatementDocumentMeta = (entityType = 'customer') => {
  const key = String(entityType).toLowerCase()

  if (key === 'vendor') {
    return {
      title: 'Vendor Statement',
      footerText: 'Vendor statement generated from GoldFlow.',
      entityLabel: 'Vendor',
      filePrefix: 'vendor',
      detailHeading: 'Vendor Details',
      codeLabel: 'Vendor ID',
      nameLabel: 'Name'
    }
  }

  return {
    title: 'Customer Statement',
    footerText: 'Customer statement generated from GoldFlow.',
    entityLabel: 'Customer',
    filePrefix: 'customer',
    detailHeading: 'Customer Details',
    codeLabel: 'Customer ID',
    nameLabel: 'Name'
  }
}

export const buildPdfFileName = ({ entityType = 'customer', record = {}, transactions = [] } = {}) => {
  const sourceValue =
    record?.companyName ||
    record?.customerName ||
    record?.vendorName ||
    record?.id ||
    record?.customerId ||
    record?.vendorId ||
    'record'

  const safeValue = String(sourceValue)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'record'
  const today = new Date()
  const dateStamp = `${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}${today.getFullYear()}`
  const statementCode = String(entityType).toLowerCase() === 'vendor' ? 'VS' : 'CS'
  const transactionCount = Array.isArray(transactions) ? transactions.length : 0

  return `${safeValue}_${transactionCount}_${statementCode}_${dateStamp}.pdf`
}

export const generateStatementPdfBlob = async ({
  entityType = 'customer',
  record = {},
  summary = {},
  transactions = [],
  companySettings = {}
} = {}) => {
  const meta = getStatementDocumentMeta(entityType)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const dark = [27, 62, 60]
  const teal = [10, 126, 116]
  const muted = [112, 135, 132]
  const pale = [233, 245, 243]
  const border = [207, 229, 225]
  const light = [248, 251, 250]
  const recordName = entityType === 'vendor' ? record?.vendorName || '-' : record?.customerName || '-'
  const recordCode = record?.id || record?.customerId || record?.vendorId || '-'
  const transactionsToPrint = Array.isArray(transactions) ? transactions : []
  const dates = transactionsToPrint
    .map((row) => ({ value: row.date, date: new Date(row.date) }))
    .filter((item) => item.value && !Number.isNaN(item.date.getTime()))
    .sort((left, right) => left.date - right.date)
  const period = dates.length
    ? `${formatStatementDate(dates[0].value)} - ${formatStatementDate(dates[dates.length - 1].value)}`
    : 'No transaction dates'
  const generatedAt = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date()).replace(',', '').replace(/\b(am|pm)\b/i, (meridiem) => meridiem.toUpperCase())

  const companyName = String(companySettings.companyName || '').trim()
  const companyContactLine = [
    companySettings.companyAddress,
    companySettings.companyEmail,
    companySettings.companyContactNumber
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' | ')
  doc.setTextColor(...dark)
  doc.setFontSize(8)
  if (companyName) doc.text(companyName, margin, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.setTextColor(...muted)
  if (companyContactLine) doc.text(doc.splitTextToSize(companyContactLine, 100), margin, 18)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(...dark)
  doc.text(`Generated: ${generatedAt}`, pageWidth - margin, 13, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...muted)
  doc.text(`Reference: ${recordCode}`, pageWidth - margin, 17.5, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(21)
  doc.setTextColor(...dark)
  doc.text(meta.title, margin, 34)
  doc.setDrawColor(...teal)
  doc.setLineWidth(1.4)
  doc.line(0, 40, pageWidth, 40)

  drawRoundedCard(doc, margin, 47, contentWidth, 11, light, border)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(...muted)
  doc.text('STATEMENT PERIOD', margin + 4, 53.7)
  doc.setFontSize(7)
  doc.setTextColor(...dark)
  doc.text(period, margin + 31, 53.7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...muted)
  doc.text('Currency: $', pageWidth - margin - 4, 53.7, { align: 'right' })

  const label = meta.entityLabel
  const fieldRows = [
    [
      { label: 'NAME', value: recordName },
      { label: `${label.toUpperCase()} ID`, value: recordCode },
      { label: 'COMPANY', value: record?.companyName || '-' }
    ],
    [
      { label: 'MOBILE', value: record?.contactNumber || '-' },
      { label: 'EMAIL', value: record?.email || '-' },
      { label: 'ADDRESS', value: record?.address || '-' }
    ]
  ]
  const cardGap = 2.5
  const cardWidth = (contentWidth - cardGap * 2) / 3
  const fieldPadding = 3
  const wrapFieldValue = (value) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    return doc.splitTextToSize(String(value), cardWidth - fieldPadding * 2)
  }
  const fieldRowHeights = fieldRows.map((row) => {
    const maxLines = Math.max(...row.map((field) => wrapFieldValue(field.value).length))
    return Math.max(16, 9 + maxLines * 3.2)
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...dark)
  doc.text(`${label} Details`, margin, 67)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(...muted)
  doc.text('Record profile - 6 fields', pageWidth - margin, 67, { align: 'right' })

  let fieldY = 71
  fieldRows.forEach((row, rowIndex) => {
    const rowHeight = fieldRowHeights[rowIndex]
    row.forEach((field, columnIndex) => {
      const x = margin + columnIndex * (cardWidth + cardGap)
      drawRoundedCard(doc, x, fieldY, cardWidth, rowHeight, [255, 255, 255], border)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(5.5)
      doc.setTextColor(...muted)
      doc.text(field.label, x + fieldPadding, fieldY + 4.5)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...dark)
      doc.text(wrapFieldValue(field.value), x + fieldPadding, fieldY + 9)
    })
    fieldY += rowHeight + cardGap
  })

  const summaryHeadingY = fieldY + 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...dark)
  doc.text('Statement Summary', margin, summaryHeadingY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(...muted)
  doc.text('Computed from displayed rows', pageWidth - margin, summaryHeadingY, { align: 'right' })

  const metricGap = 2.5
  const metricWidth = (contentWidth - metricGap * 3) / 4
  const metricY = summaryHeadingY + 4
  const metrics = [
    { label: 'TOTAL INVOICE / DEBIT', value: formatPdfMoney(summary.totalInvoice || 0) },
    { label: 'TOTAL PAYMENT / CREDIT', value: formatPdfMoney(summary.totalPayment || 0) },
    { label: 'CLOSING BALANCE', value: formatPdfMoney(summary.closingBalance || 0), highlight: true },
    { label: 'TRANSACTION COUNT', value: String(transactionsToPrint.length) }
  ]
  metrics.forEach((metric, index) => {
    const x = margin + index * (metricWidth + metricGap)
    const fill = metric.highlight ? teal : pale
    const textColor = metric.highlight ? [255, 255, 255] : dark
    drawRoundedCard(doc, x, metricY, metricWidth, 19, fill, metric.highlight ? teal : border)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.3)
    doc.setTextColor(...(metric.highlight ? [220, 244, 240] : muted))
    doc.text(metric.label, x + 3, metricY + 5)
    doc.setFontSize(7.2)
    doc.setTextColor(...textColor)
    let valueSize = 7.2
    while (doc.getTextWidth(metric.value) > metricWidth - 6 && valueSize > 5.5) {
      valueSize -= 0.3
      doc.setFontSize(valueSize)
    }
    doc.text(metric.value, x + 3, metricY + 12.5)
  })

  const ledgerHeadingY = metricY + 26
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...dark)
  doc.text('Transaction Ledger', margin, ledgerHeadingY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(...muted)
  doc.text('Chronological - oldest first', pageWidth - margin, ledgerHeadingY, { align: 'right' })

  autoTable(doc, {
    startY: ledgerHeadingY + 4,
    margin: { left: margin, right: margin, bottom: 17 },
    tableWidth: contentWidth,
    head: [['Date', 'Transaction No', 'Transaction Type', 'Description', 'Debit\n(Invoice)', 'Credit\n(Payment)', 'Balance']],
    body: transactionsToPrint.length > 0
      ? transactionsToPrint.map((row) => [
          formatLedgerDate(row.date) || '-',
          row.transactionNo || '-',
          row.transactionType || '-',
          row.description || '-',
          row.debit ? formatPdfMoney(row.debit) : '-',
          row.credit ? formatPdfMoney(row.credit) : '-',
          formatPdfMoney(row.balance || 0)
        ])
      : [['-', '-', '-', 'No transactions found', '-', '-', formatPdfMoney(summary.closingBalance || 0)]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.2,
      textColor: dark,
      lineColor: border,
      lineWidth: 0.15,
      cellPadding: { top: 2.2, right: 1.2, bottom: 2.2, left: 1.2 },
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: pale,
      textColor: dark,
      fontStyle: 'bold',
      fontSize: 5.8,
      halign: 'center',
      minCellHeight: 9
    },
    alternateRowStyles: { fillColor: light },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 27, halign: 'center' },
      2: { cellWidth: 27, halign: 'left' },
      3: { cellWidth: 47, halign: 'left' },
      4: { cellWidth: 23, halign: 'right' },
      5: { cellWidth: 23, halign: 'right' },
      6: { cellWidth: 21, halign: 'right', fontStyle: 'bold' }
    }
  })

  let reconciliationY = (doc.lastAutoTable?.finalY || ledgerHeadingY + 20) + 6
  if (reconciliationY + 18 > pageHeight - 16) {
    doc.addPage()
    reconciliationY = 20
  }
  drawRoundedCard(doc, margin, reconciliationY, contentWidth, 18, light, border)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...dark)
  doc.text('Reconciliation check', margin + 4, reconciliationY + 6)
  doc.setFontSize(5.5)
  doc.setTextColor(...muted)
  doc.text(
    `Closing balance reflects the statement totals. ${transactionsToPrint.length} displayed transactions are included.`,
    margin + 4,
    reconciliationY + 11
  )
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.3)
  doc.text(entityType === 'vendor' ? 'BALANCE PAYABLE' : 'AMOUNT DUE', pageWidth - margin - 4, reconciliationY + 6, { align: 'right' })
  doc.setFontSize(10)
  doc.setTextColor(...teal)
  doc.text(formatPdfMoney(summary.closingBalance || 0), pageWidth - margin - 4, reconciliationY + 13, { align: 'right' })

  const totalPages = doc.internal.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...border)
    doc.setLineWidth(0.3)
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    doc.setTextColor(...muted)
    doc.text('This is a system-generated statement and does not require a signature.', margin, pageHeight - 7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...dark)
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' })
  }

  const blob = doc.output('blob')
  const fileName = buildPdfFileName({ entityType, record, transactions: transactionsToPrint })

  return {
    blob,
    fileName,
    title: meta.title
  }
}
