import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateMMDDYYYY } from './formatters.js'
import { drawPdfCompanyLogo } from './pdfLogo.js'

const colors = {
  navy: [0, 91, 85],
  teal: [0, 126, 117],
  paleTeal: [225, 244, 241],
  paleBlue: [217, 239, 236],
  page: [255, 255, 255],
  ink: [35, 55, 68],
  muted: [102, 124, 138],
  border: [204, 220, 228],
  white: [255, 255, 255]
}

const valueOrDash = (value) => String(value ?? '').trim() || '-'
const money = (value) => `$${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`

const roundedCard = (doc, x, y, width, height, fill, stroke = colors.border) => {
  doc.setFillColor(...fill)
  doc.setDrawColor(...stroke)
  doc.setLineWidth(0.25)
  doc.roundedRect(x, y, width, height, 3, 3, 'FD')
}

const drawFooter = (doc, companySettings, pageWidth, pageHeight, margin) => {
  const right = pageWidth - margin
  const footerY = pageHeight - 27
  const bank = companySettings.bankDetails || {}
  const bankInfo = [
    bank.bankName && `Bank Name: ${bank.bankName}`,
    bank.accountNumber && `Account Number: ${bank.accountNumber}`,
    bank.ifscCode && `IFSC Code: ${bank.ifscCode}`,
    bank.branch && `Branch: ${bank.branch}`,
    bank.bankAddress
  ].filter(Boolean).join('  |  ')

  doc.setDrawColor(...colors.border)
  doc.setLineWidth(0.3)
  doc.line(margin, footerY, right, footerY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...colors.ink)
  doc.text('Thank you for your business.', margin, footerY + 5)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...colors.muted)
  const bankInfoText = bankInfo || 'Bank details unavailable'
  const bankInfoMaxWidth = right - margin
  const bankInfoFontSize = Math.min(5.8, (5.8 * bankInfoMaxWidth) / doc.getTextWidth(bankInfoText))
  doc.setFontSize(bankInfoFontSize)
  doc.text(bankInfoText, pageWidth / 2, pageHeight - 11, { align: 'center' })
}

export const buildInvoicePdfFileName = (invoiceType, invoice) => {
  const prefix = invoiceType === 'purchase' ? 'purchase_invoice' : 'invoice'
  const number = String(invoice?.invoiceNumber || 'unknown')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown'
  return `${prefix}_${number}.pdf`
}

export const generateInvoicePdfBlob = ({ invoiceType = 'sale', invoice = {}, companySettings = {} } = {}) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const right = pageWidth - margin
  const contentWidth = pageWidth - margin * 2
  const isPurchase = invoiceType === 'purchase'
  const title = isPurchase ? 'PURCHASE INVOICE' : 'INVOICE'
  const client = invoice.vendorId || invoice.client || {}
  const clientName = client.customerName || client.vendorName || client.name || client.companyName || '-'

  doc.setFillColor(...colors.page)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')
  doc.setFillColor(...colors.navy)
  doc.rect(0, 0, pageWidth, 34, 'F')

  const hasCompanyLogo = drawPdfCompanyLogo(doc, companySettings.companyLogo, margin, 8, 22, 18, colors.white)
  const companyTextX = margin + (hasCompanyLogo ? 27 : 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...colors.white)
  doc.text(valueOrDash(companySettings.companyName), companyTextX, 15)
  const companyContactLine = [
    companySettings.companyAddress,
    companySettings.companyEmail,
    companySettings.companyContactNumber
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' | ')
  doc.setTextColor(192, 209, 216)
  const companyContactMaxWidth = hasCompanyLogo ? 79 : 91
  const companyContactFontSize = Math.min(6.5, (6.5 * companyContactMaxWidth) / doc.getTextWidth(companyContactLine))
  doc.setFontSize(companyContactFontSize)
  doc.text(companyContactLine, companyTextX, 20)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(isPurchase ? 15 : 19)
  doc.setTextColor(...colors.white)
  doc.text(title, right, 17, { align: 'right' })

  const cardY = 41
  const gap = 3
  const billWidth = (contentWidth - gap) / 2
  const sellerRows = [
    ['COMPANY NAME', valueOrDash(companySettings.companyName)],
    ['ADDRESS', valueOrDash(companySettings.companyAddress)],
    ['EMAIL', valueOrDash(companySettings.companyEmail)],
    ['CONTACT', valueOrDash(companySettings.companyContactNumber)]
  ]
  const clientRows = [
    ['NAME', valueOrDash(clientName)],
    ['COMPANY NAME', valueOrDash(client.companyName)],
    ['ADDRESS', valueOrDash(client.address || client.shippingAddress)],
    ['EMAIL', valueOrDash(client.email)],
    ['PHONE NO', valueOrDash(client.contactNumber || client.phone)],
    ['ALTERNATE PHONE', valueOrDash(client.alternateNumber)]
  ]

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.7)
  const getRowsHeight = (rows, width) => rows.reduce((height, [, value]) => {
    const wrapped = doc.splitTextToSize(value, width - 38)
    return height + Math.max(4, wrapped.length * 2.8)
  }, 0)
  const partyCardHeight = Math.max(35, 12 + Math.max(getRowsHeight(sellerRows, billWidth), getRowsHeight(clientRows, billWidth)))
  const drawPartyCard = (x, heading, rows) => {
    roundedCard(doc, x, cardY, billWidth, partyCardHeight, colors.paleTeal, [205, 232, 227])
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...colors.ink)
    doc.text(heading, x + 4, cardY + 6)

    let rowY = cardY + 12
    rows.forEach(([label, value]) => {
      const wrapped = doc.splitTextToSize(value, billWidth - 38)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(4.7)
      doc.setTextColor(...colors.teal)
      doc.text(label, x + 4, rowY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.8)
      doc.setTextColor(...colors.ink)
      doc.text(wrapped, x + 32, rowY)
      rowY += Math.max(4, wrapped.length * 2.8)
    })
  }

  drawPartyCard(margin, 'Seller details', sellerRows)
  drawPartyCard(margin + billWidth + gap, isPurchase ? 'Bill to · Vendor' : 'Bill to · Client', clientRows)

  const detailsY = cardY + partyCardHeight + 6
  const infoWidth = contentWidth / 3
  roundedCard(doc, margin, detailsY, contentWidth, 13, colors.white)
  const invoiceMeta = [
    ['INVOICE NO', valueOrDash(invoice.invoiceNumber)],
    ['INVOICE DATE', formatDateMMDDYYYY(invoice.invoiceDate) || '-'],
    ['ISSUE DATE', formatDateMMDDYYYY(invoice.createdAt || invoice.invoiceDate) || '-']
  ]
  invoiceMeta.forEach(([label, value], index) => {
    const x = margin + 4 + index * infoWidth
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.1)
    doc.setTextColor(...colors.teal)
    doc.text(label, x, detailsY + 5)
    doc.setFontSize(6.6)
    doc.setTextColor(...colors.ink)
    doc.text(doc.splitTextToSize(value, infoWidth - 8).slice(0, 2), x, detailsY + 9.5)
  })

  const invoiceNumber = valueOrDash(invoice.invoiceNumber)
  const items = Array.isArray(invoice.items) ? invoice.items : []
  const tableY = detailsY + 21
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...colors.ink)
  doc.text('Services & deliverables', margin + 4, tableY + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.5)
  doc.setTextColor(...colors.teal)
  doc.text(`${items.length} LINE ITEMS`, right - 4, tableY + 5, { align: 'right' })

  const tableBody = items.length
    ? items.map((item, index) => [
        String(index + 1).padStart(2, '0'),
        valueOrDash(item.product),
        valueOrDash(item.description),
        money(item.amount)
      ])
    : [['01', '-', 'No invoice items', money(0)]]

  autoTable(doc, {
    startY: tableY + 9,
    margin: { left: margin, right: margin, bottom: 44 },
    tableWidth: contentWidth,
    head: [['SR NO', 'PRODUCT', 'DESCRIPTION', 'AMOUNT']],
    body: tableBody,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.5,
      textColor: colors.ink,
      lineColor: colors.border,
      lineWidth: 0.2,
      cellPadding: { top: 3.2, right: 2, bottom: 3.2, left: 2 },
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: colors.paleBlue,
      textColor: colors.teal,
      fontStyle: 'normal',
      fontSize: 5.5,
      minCellHeight: 8
    },
    alternateRowStyles: { fillColor: [250, 252, 253] },
    columnStyles: {
      0: { cellWidth: 13, halign: 'center' },
      1: { cellWidth: 39, fontStyle: 'bold' },
      2: { cellWidth: contentWidth - 13 - 39 - 33 },
      3: { cellWidth: 33, halign: 'right' }
    }
  })

  let totalY = (doc.lastAutoTable?.finalY || tableY + 30) + 20
  if (totalY + 22 > pageHeight - 42) {
    doc.addPage()
    doc.setFillColor(...colors.page)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')
    totalY = 18
  }
  doc.setFillColor(...colors.teal)
  doc.roundedRect(margin, totalY, contentWidth, 20, 4, 4, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(203, 219, 225)
  doc.text('FINAL INVOICE TOTAL', margin + 5, totalY + 8)
  doc.setFontSize(5.5)
  doc.text(`${isPurchase ? 'Purchase' : 'Invoice'} ${invoiceNumber}`, margin + 5, totalY + 13)
  roundedCard(doc, right - 39, totalY + 3, 36, 14, colors.paleTeal, colors.paleTeal)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(...colors.navy)
  doc.text(money(invoice.totalAmount), right - 5, totalY + 12, { align: 'right' })

  const pageCount = doc.internal.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    drawFooter(doc, companySettings, pageWidth, pageHeight, margin)
  }

  return {
    blob: doc.output('blob'),
    fileName: buildInvoicePdfFileName(invoiceType, invoice),
    title
  }
}
