import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { inflateSync } from 'node:zlib'

import { buildPdfFileName, generateStatementPdfBlob, getStatementDocumentMeta } from './commonPdf.js'

const extractPdfText = async (blob) => {
  const source = Buffer.from(await blob.arrayBuffer()).toString('latin1')
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      try {
        return inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')
      } catch {
        return ''
      }
    })
    .join(' ')
}

test('buildPdfFileName uses company, transaction count, statement code, and today', () => {
  const fileName = buildPdfFileName({
    entityType: 'customer',
    record: { companyName: 'Mehta Retail Solutions', id: 'C-1001' },
    transactions: [{}, {}, {}]
  })

  assert.match(fileName, /^Mehta_Retail_Solutions_3_CS_\d{8}\.pdf$/)
})

test('buildPdfFileName uses the vendor statement code for vendor statements', () => {
  const fileName = buildPdfFileName({
    entityType: 'vendor',
    record: { companyName: 'Acme Supplies' },
    transactions: [{}]
  })

  assert.match(fileName, /^Acme_Supplies_1_VS_\d{8}\.pdf$/)
})

test('getStatementDocumentMeta uses the correct heading and footer label', () => {
  const meta = getStatementDocumentMeta('vendor')

  assert.equal(meta.title, 'Vendor Statement')
  assert.equal(meta.footerText, 'Vendor statement generated from GoldFlow.')
})

test('generateStatementPdfBlob creates a one-page statement for a typical ledger', async () => {
  const transactions = Array.from({ length: 6 }, (_, index) => ({
    date: `2026-09-${String(index * 5 + 2).padStart(2, '0')}`,
    transactionNo: `SI-260902-${index}`,
    transactionType: index % 2 ? 'Sale Payment' : 'Sale Invoice',
    description: 'POS terminals and thermal printer supplies',
    debit: index % 2 ? 0 : 125000,
    credit: index % 2 ? 50000 : 0,
    balance: 75000
  }))
  const { blob } = await generateStatementPdfBlob({
    entityType: 'customer',
    record: {
      id: 'CUST-10482',
      customerName: 'Aarav Mehta',
      companyName: 'Mehta Retail Solutions',
      contactNumber: '+91 98765 43210',
      email: 'accounts@example.com',
      address: '214, Sunrise Arcade, C.G. Road, Ahmedabad, Gujarat 380009'
    },
    summary: { totalInvoice: 255500, totalPayment: 183500, closingBalance: 72000 },
    transactions,
    companySettings: {
      companyName: 'Northstar Group',
      companyAddress: '88 Hope Road',
      companyEmail: 'accounts@northstar.example',
      companyContactNumber: '+1 555 0100'
    }
  })

  const pdf = await blob.text()
  const pageCount = (pdf.match(/\/Type\s*\/Page\b/g) || []).length

  assert.equal(pdf.startsWith('%PDF-'), true)
  assert.equal(pageCount, 1)
  const pdfText = await extractPdfText(blob)
  assert.ok(pdfText.includes('(Northstar Group) Tj'))
  assert.ok(pdfText.includes('(88 Hope Road | accounts@northstar.example | +1 555 0100) Tj'))
})

test('customer and vendor statements omit the initials badge', async () => {
  for (const entityType of ['customer', 'vendor']) {
    const { blob } = await generateStatementPdfBlob({
      entityType,
      companySettings: {
        companyName: 'Northstar Group',
        companyAddress: '88 Hope Road',
        companyEmail: 'accounts@northstar.example',
        companyContactNumber: '+1 555 0100'
      }
    })

    const pdfText = await extractPdfText(blob)

    assert.ok(!pdfText.includes('(KL) Tj'))
    assert.ok(pdfText.includes('(Northstar Group) Tj'))
    assert.ok(pdfText.includes('(88 Hope Road | accounts@northstar.example | +1 555 0100) Tj'))
    assert.ok(!pdfText.includes('(BUSINESS ACCOUNTS) Tj'))
  }
})

test('customer statement PDF lists invoice products while vendor statements keep descriptions', async () => {
  const base = {
    transactions: [{
      date: '2026-10-01',
      transactionNo: 'SI-1001',
      transactionType: 'Sales Invoice',
      product: 'Pendant, Ring, Chain',
      description: 'Custom jewelry order',
      debit: 100,
      credit: 0,
      balance: 100
    }]
  }

  const customerPdf = await generateStatementPdfBlob({ ...base, entityType: 'customer' })
  const customerText = await extractPdfText(customerPdf.blob)
  assert.ok(customerText.includes('(Product) Tj'))
  assert.ok(customerText.includes('(Pendant, Ring, Chain) Tj'))
  assert.ok(!customerText.includes('(Custom jewelry order) Tj'))

  const vendorPdf = await generateStatementPdfBlob({ ...base, entityType: 'vendor' })
  const vendorText = await extractPdfText(vendorPdf.blob)
  assert.ok(vendorText.includes('(Description) Tj'))
  assert.ok(vendorText.includes('(Custom jewelry order) Tj'))
})

test('customer statement PDF groups NAP transactions at the end and preserves order within groups', async () => {
  const transactions = [
    { date: '2026-10-01', transactionNo: 'SI-1001', transactionType: 'Sales Invoice', product: 'Pendant', debit: 100, balance: 100 },
    { date: '2026-10-02', transactionNo: 'NAP-12345', transactionType: 'Sales Payment', product: '', credit: 10, balance: 90 },
    { date: '2026-10-03', transactionNo: 'SI-1002', transactionType: 'Sales Invoice', product: 'Ring', debit: 200, balance: 290 },
    { date: '2026-10-04', transactionNo: 'nap-67890', transactionType: 'Sales Payment', product: '', credit: 20, balance: 270 }
  ]

  const { blob } = await generateStatementPdfBlob({ entityType: 'customer', transactions })
  const pdfText = await extractPdfText(blob)
  const transactionOrder = ['SI-1001', 'SI-1002', 'NAP-12345', 'nap-67890']
    .map((transactionNo) => pdfText.indexOf(`(${transactionNo}) Tj`))

  assert.ok(transactionOrder.every((position) => position >= 0))
  assert.deepEqual(transactionOrder, [...transactionOrder].sort((a, b) => a - b))
})
