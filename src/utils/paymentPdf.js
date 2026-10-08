import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { drawPdfCompanyLogo } from './pdfLogo.js'

const colors = {
  teal: [0, 103, 96],
  accent: [10, 133, 123],
  pale: [231, 246, 243],
  paleHeader: [214, 239, 235],
  ink: [30, 49, 62],
  muted: [111, 133, 145],
  border: [204, 222, 227],
  white: [255, 255, 255]
}

const textOrDash = (value) => String(value ?? '').trim() || '-'
const formatMoney = (value) => `$${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`

const formatDate = (value) => {
  if (!value) return '-'
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${month}-${day}-${date.getUTCFullYear()}`
}

const drawCard = (doc, x, y, width, height, fill, border = colors.border) => {
  doc.setFillColor(...fill)
  doc.setDrawColor(...border)
  doc.setLineWidth(0.25)
  doc.roundedRect(x, y, width, height, 3, 3, 'FD')
}

const drawFooter = (doc, settings, pageWidth, pageHeight, margin) => {
  const right = pageWidth - margin
  const footerY = pageHeight - 37
  const bank = settings.bankDetails || {}
  const bankDetails = [
    bank.bankName && `Bank Name: ${bank.bankName}`,
    bank.bankAddress,
    bank.accountNumber && `Account Number: ${bank.accountNumber}`,
    bank.ifscCode && `IFSC Code: ${bank.ifscCode}`,
    bank.branch && `Branch: ${bank.branch}`
  ].filter(Boolean).join(' | ')

  doc.setDrawColor(...colors.border)
  doc.setLineWidth(0.3)
  doc.line(margin, footerY, right, footerY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.4)
  doc.setTextColor(...colors.teal)
  doc.text('Thank you — we value your business.', margin + 4, footerY + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.8)
  doc.setTextColor(...colors.muted)
  doc.text('Please quote the payment number when arranging settlement.', margin + 4, footerY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.3)
  doc.setTextColor(...colors.muted)
  const bankDetailsText = bankDetails || 'Bank details unavailable'
  const bankDetailsMaxWidth = right - margin
  const bankDetailsFontSize = Math.min(5.3, (5.3 * bankDetailsMaxWidth) / doc.getTextWidth(bankDetailsText))
  doc.setFontSize(bankDetailsFontSize)
  doc.text(bankDetailsText, pageWidth / 2, pageHeight - 11, { align: 'center' })
}

export const buildPaymentPdfFileName = (paymentType = 'sale', payment = {}) => {
  const prefix = paymentType === 'purchase' ? 'purchase_payment' : 'payment'
  const number = String(payment.paymentNumber || 'unknown')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown'
  return `${prefix}_${number}.pdf`
}

export const generatePaymentPdfBlob = ({ paymentType = 'sale', payment = {}, companySettings = {} } = {}) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 12
  const right = pageWidth - margin
  const contentWidth = pageWidth - margin * 2
  const isPurchase = paymentType === 'purchase'
  const client = payment.vendorId || payment.client || {}
  const clientName = client.customerName || client.vendorName || client.name || client.companyName || '-'
  const sellerRows = [
    ['COMPANY NAME', textOrDash(companySettings.companyName)],
    ['ADDRESS', textOrDash(companySettings.companyAddress)],
    ['EMAIL', textOrDash(companySettings.companyEmail)],
    ['CONTACT', textOrDash(companySettings.companyContactNumber)]
  ]
  const clientRows = [
    ['NAME', textOrDash(clientName)],
    ['COMPANY NAME', textOrDash(client.companyName)],
    ['ADDRESS', textOrDash(client.address || client.shippingAddress)],
    ['EMAIL', textOrDash(client.email)],
    ['PHONE NO', textOrDash(client.contactNumber || client.phone)],
    ['ALTERNATE PHONE NO', textOrDash(client.alternateNumber)]
  ]
  const allocations = Array.isArray(payment.allocations) ? payment.allocations : []
  const invoiceTotal = allocations.length
    ? allocations.reduce((total, allocation) => total + (Number(allocation?.amount) || 0), 0)
    : Number(payment.amount) || 0

  doc.setFillColor(...colors.white)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')
  doc.setFillColor(...colors.teal)
  doc.rect(0, 0, pageWidth, 34, 'F')

  const hasCompanyLogo = drawPdfCompanyLogo(doc, companySettings.companyLogo, margin, 8, 22, 18, colors.white)
  const companyTextX = margin + (hasCompanyLogo ? 27 : 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...colors.white)
  doc.text(textOrDash(companySettings.companyName), companyTextX, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.6)
  doc.setTextColor(206, 230, 228)
  const companyHeader = [
    companySettings.companyAddress,
    companySettings.companyEmail,
    companySettings.companyContactNumber
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' | ')
  doc.text(doc.splitTextToSize(companyHeader || 'Business accounts', hasCompanyLogo ? 73 : 87).slice(0, 2), companyTextX, 17)

  const title = isPurchase ? 'PURCHASE PAYMENT' : 'PAYMENT'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(isPurchase ? 16 : 19)
  doc.setTextColor(...colors.white)
  doc.text(title, right, 16, { align: 'right' })

  const cardsY = 41
  const cardGap = 3
  const cardWidth = (contentWidth - cardGap) / 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.7)
  const labelWidth = 29
  const valueWidth = cardWidth - labelWidth - 9
  const rowHeight = (rows) => rows.reduce((height, [, value]) => {
    const lines = doc.splitTextToSize(value, valueWidth)
    return height + Math.max(3.4, lines.length * 2.8)
  }, 0)
  const cardHeight = Math.max(37, 14 + Math.max(rowHeight(sellerRows), rowHeight(clientRows)))
  const drawPartyCard = (x, heading, badge, rows) => {
    drawCard(doc, x, cardsY, cardWidth, cardHeight, colors.pale)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.6)
    doc.setTextColor(...colors.ink)
    doc.text(heading, x + 4, cardsY + 6)
    doc.setFillColor(...colors.pale)
    doc.roundedRect(x + cardWidth - 14, cardsY + 3.2, 10, 5.5, 2.5, 2.5, 'F')
    doc.setFontSize(4.3)
    doc.setTextColor(...colors.teal)
    doc.text(badge, x + cardWidth - 9, cardsY + 6.8, { align: 'center' })
    doc.setDrawColor(...colors.border)
    doc.setLineWidth(0.2)
    doc.line(x + 4, cardsY + 10, x + cardWidth - 4, cardsY + 10)

    let rowY = cardsY + 15
    rows.forEach(([label, value]) => {
      const lines = doc.splitTextToSize(value, valueWidth)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(4.3)
      doc.setTextColor(...colors.teal)
      doc.text(label, x + 4, rowY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.7)
      doc.setTextColor(...colors.ink)
      doc.text(lines, x + 4 + labelWidth, rowY)
      rowY += Math.max(3.4, lines.length * 2.8)
    })
  }

  drawPartyCard(margin, 'Seller details', 'FROM', sellerRows)
  drawPartyCard(margin + cardWidth + cardGap, 'Bill to', 'CLIENT', clientRows)

  const detailsY = cardsY + cardHeight + 8
  drawCard(doc, margin, detailsY, contentWidth, 13, colors.white)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.3)
  doc.setTextColor(...colors.teal)
  doc.text('PAYMENT DETAILS', margin + 4, detailsY + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4.8)
  doc.setTextColor(...colors.muted)
  doc.text(textOrDash(payment.description), margin + 4, detailsY + 9)
  const metadataStart = margin + 57
  const metadataWidth = (contentWidth - 61) / 3
  const metadata = [
    ['PAYMENT NO', textOrDash(payment.paymentNumber)],
    ['PAYMENT DATE', formatDate(payment.paymentDate)],
    ['ISSUE DATE', formatDate(payment.createdAt || payment.paymentDate)]
  ]
  metadata.forEach(([label, value], index) => {
    const x = metadataStart + index * metadataWidth
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(4.8)
    doc.setTextColor(...colors.teal)
    doc.text(label, x, detailsY + 5)
    doc.setFontSize(6.3)
    doc.setTextColor(...colors.ink)
    doc.text(doc.splitTextToSize(value, metadataWidth - 3).slice(0, 2), x, detailsY + 9.5)
  })

  const tableY = detailsY + 21
  autoTable(doc, {
    startY: tableY,
    margin: { left: margin, right: margin, bottom: 43 },
    tableWidth: contentWidth,
    head: [['SR NO', 'INVOICE NUMBER', 'DESCRIPTION', 'AMOUNT']],
    body: allocations.length
      ? allocations.map((allocation, index) => {
          const invoice = allocation.invoiceId && typeof allocation.invoiceId === 'object'
            ? allocation.invoiceId
            : allocation
          const invoiceNumber = invoice.invoiceNumber || allocation.invoiceNumber || allocation.invoice?.invoiceNumber
          return [
            String(index + 1).padStart(2, '0'),
            textOrDash(invoiceNumber),
            textOrDash(allocation.description || invoice.transactionDescription || invoice.description),
            formatMoney(allocation.amount)
          ]
        })
      : [['01', '-', '-', formatMoney(payment.amount)]],
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.3,
      textColor: colors.ink,
      lineColor: colors.border,
      lineWidth: 0.2,
      cellPadding: { top: 3.1, right: 2, bottom: 3.1, left: 2 },
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: colors.paleHeader,
      textColor: colors.teal,
      fontStyle: 'bold',
      fontSize: 5.3,
      minCellHeight: 8
    },
    alternateRowStyles: { fillColor: [251, 253, 253] },
    columnStyles: {
      0: { cellWidth: 13, halign: 'center' },
      1: { cellWidth: 47, fontStyle: 'bold', fontSize: 5.8 },
      2: { cellWidth: 72 },
      3: { cellWidth: contentWidth - 132, halign: 'right', fontStyle: 'bold' }
    }
  })

  let totalY = (doc.lastAutoTable?.finalY || tableY + 16) + 5
  if (totalY + 14 > pageHeight - 41) {
    doc.addPage()
    doc.setFillColor(...colors.white)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')
    totalY = 18
  }
  drawCard(doc, margin, totalY, contentWidth, 14, colors.accent, colors.accent)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(...colors.white)
  doc.text('INVOICE TOTAL', margin + 4, totalY + 8)
  doc.setFontSize(12)
  doc.text(formatMoney(invoiceTotal), right - 4, totalY + 9, { align: 'right' })

  const pageCount = doc.internal.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    drawFooter(doc, companySettings, pageWidth, pageHeight, margin)
  }

  return {
    blob: doc.output('blob'),
    fileName: buildPaymentPdfFileName(paymentType, payment),
    title
  }
}
