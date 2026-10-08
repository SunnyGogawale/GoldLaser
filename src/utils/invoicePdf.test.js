import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

import { generateInvoicePdfBlob } from './invoicePdf.js'

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

const sampleInvoice = (invoiceType) => generateInvoicePdfBlob({
  invoiceType,
  invoice: {
    invoiceNumber: invoiceType === 'purchase' ? 'PI-1002' : 'SI-1001',
    invoiceDate: '2026-10-05',
    totalAmount: 125,
    vendorId: {
      customerName: 'Aarav Mehta',
      vendorName: 'Example Supplier',
      companyName: 'Mehta Retail Solutions',
      address: '214 Sunrise Arcade, Ahmedabad',
      contactNumber: '+1 555 0100',
      email: 'billing@example.com'
    },
    items: [{ product: 'Product A', description: 'Invoice line item', amount: 125 }]
  },
  companySettings: {
    companyName: 'Northline Studio Ltd',
    companyAddress: '48 Clerkenwell Road',
    companyEmail: 'accounts@example.com',
    companyContactNumber: '+1 555 0101',
    bankDetails: {
      bankName: 'Example Bank',
      accountNumber: '1234567890',
      ifscCode: 'EXAMPLE001'
    }
  }
})

const sampleLogo = `data:image/png;base64,${readFileSync(new URL('../../public/invoice.png', import.meta.url)).toString('base64')}`

test('shared renderer produces sale and purchase invoice PDFs', async () => {
  for (const [invoiceType, expectedTitle, expectedFile] of [
    ['sale', 'INVOICE', 'invoice_SI-1001.pdf'],
    ['purchase', 'PURCHASE INVOICE', 'purchase_invoice_PI-1002.pdf']
  ]) {
    const generated = sampleInvoice(invoiceType)
    const pdf = await generated.blob.text()
    const pdfText = await extractPdfText(generated.blob)

    assert.equal(generated.title, expectedTitle)
    assert.equal(generated.fileName, expectedFile)
    assert.equal(pdf.startsWith('%PDF-'), true)
    assert.match(pdf, /\/Type\s*\/Page\b/)
    assert.match(pdfText, /10-05-2026/)
    assert.ok(pdfText.indexOf('(Northline Studio Ltd) Tj') < pdfText.indexOf('(Seller details) Tj'))
    assert.ok(pdfText.includes('(48 Clerkenwell Road | accounts@example.com | +1 555 0101) Tj'))
  }
})

test('shared renderer supports multipage invoice item tables', async () => {
  const generated = generateInvoicePdfBlob({
    invoiceType: 'purchase',
    invoice: {
      invoiceNumber: 'PI-LONG',
      invoiceDate: '2026-10-05',
      totalAmount: 40500,
      vendorId: { vendorName: 'Example Supplier' },
      items: Array.from({ length: 80 }, (_, index) => ({
        product: `Product ${index + 1}`,
        description: 'Replacement equipment and installation service for business use',
        amount: (index + 1) * 12.5
      }))
    },
    companySettings: { companyName: 'Northline Studio Ltd' }
  })
  const pdf = await generated.blob.text()
  const pageCount = (pdf.match(/\/Type\s*\/Page\b/g) || []).length

  assert.ok(pageCount > 1)
})

test('invoice PDF embeds the company logo when configured', async () => {
  for (const invoiceType of ['sale', 'purchase']) {
    const generated = generateInvoicePdfBlob({
      invoiceType,
      invoice: { invoiceNumber: 'INV-LOGO', invoiceDate: '2026-10-05', totalAmount: 0 },
      companySettings: { companyName: 'Northline Studio Ltd', companyLogo: sampleLogo }
    })

    assert.match(await generated.blob.text(), /\/Subtype\s*\/Image/)
  }
})

test('invoice PDF omits the initials badge when no logo is configured', async () => {
  const generated = generateInvoicePdfBlob({
    invoiceType: 'sale',
    invoice: { invoiceNumber: 'SI-NO-LOGO', invoiceDate: '2026-10-05', totalAmount: 0 },
    companySettings: { companyName: 'Studio Point' }
  })
  const pdfText = await extractPdfText(generated.blob)

  assert.ok(!pdfText.includes('(SP) Tj'))
})

test('invoice bank details render together on one footer row', async () => {
  const generated = sampleInvoice('sale')
  const pdfText = await extractPdfText(generated.blob)

  assert.ok(!pdfText.includes('(BANK DETAILS)'))
  assert.ok(pdfText.includes('(Bank Name: Example Bank  |  Account Number: 1234567890  |  IFSC Code: EXAMPLE001) Tj'))
})
