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
