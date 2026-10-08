import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

import { generatePaymentPdfBlob } from './paymentPdf.js'

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

const paymentData = {
  paymentNumber: 'PAY-2026-1008',
  paymentDate: '2026-10-05',
  createdAt: '2026-10-05',
  amount: 4850,
  description: 'Payment reference',
  vendorId: {
    customerName: 'Marcus Chen',
    vendorName: 'Marcus Chen',
    companyName: 'Alder & Finch Retail Ltd.',
    address: '21 King Street, Manchester M2 6AW, UK',
    email: 'accounts@example.com',
    contactNumber: '+44 161 555 0148'
  },
  allocations: [
    {
      invoiceId: { invoiceNumber: 'INV-2026-1008-A-REFERENCE-0001', invoiceDate: '2026-09-12' },
      description: 'Advance against scheduled goods delivery',
      amount: 1250
    },
    {
      invoiceId: { invoiceNumber: 'INV-2026-1008-B', invoiceDate: '2026-09-19' },
      description: 'Partial payment',
      amount: 2400
    }
  ]
}

const companySettings = {
  companyName: 'Northstar Studio',
  companyAddress: '48 Clerkenwell Road',
  companyEmail: 'accounts@example.com',
  companyContactNumber: '+44 20 1234 5678',
  bankDetails: {
    bankName: 'Crown Commercial Bank',
    accountNumber: '55790136',
    ifscCode: 'GB29 NWBK 6016'
  }
}

const sampleLogo = `data:image/png;base64,${readFileSync(new URL('../../public/invoice.png', import.meta.url)).toString('base64')}`

test('shared renderer creates Sale and Purchase Payment PDFs', async () => {
  for (const [paymentType, expectedFileName, expectedTitle] of [
    ['sale', 'payment_PAY-2026-1008.pdf', 'PAYMENT'],
    ['purchase', 'purchase_payment_PAY-2026-1008.pdf', 'PURCHASE PAYMENT']
  ]) {
    const generated = generatePaymentPdfBlob({ paymentType, payment: paymentData, companySettings })
    const pdf = await generated.blob.text()
    const pdfText = await extractPdfText(generated.blob)

    assert.equal(generated.fileName, expectedFileName)
    assert.equal(generated.title, expectedTitle)
    assert.equal(pdf.startsWith('%PDF-'), true)
    assert.match(pdf, /\/Type\s*\/Page\b/)
    assert.ok(pdfText.includes('48 Clerkenwell Road'))
    assert.ok(pdfText.includes('accounts@example.com'))
    assert.ok(pdfText.includes('+44 20 1234 5678'))
    assert.ok(pdfText.includes('48 Clerkenwell Road | accounts@example.com | +44 20 1234 5678'))
    assert.ok(pdfText.includes('Bank Name: Crown Commercial Bank | Account Number: 55790136 | IFSC Code: GB29 NWBK 6016'))
    assert.ok(pdfText.includes('$3,650.00'))
    assert.ok(!pdfText.includes('$4,850.00'))
    assert.ok(pdfText.includes('|'))
  }
})

test('shared renderer supports multipage payment allocation tables', async () => {
  const generated = generatePaymentPdfBlob({
    paymentType: 'purchase',
    payment: {
      ...paymentData,
      allocations: Array.from({ length: 80 }, (_, index) => ({
        invoiceId: {
          invoiceNumber: `INV-${index + 1}`,
          invoiceDate: '2026-09-12'
        },
        amount: 125
      }))
    },
    companySettings
  })
  const pdf = await generated.blob.text()
  const pageCount = (pdf.match(/\/Type\s*\/Page\b/g) || []).length

  assert.ok(pageCount > 1)
})

test('payment PDF embeds the company logo when configured', async () => {
  for (const paymentType of ['sale', 'purchase']) {
    const generated = generatePaymentPdfBlob({
      paymentType,
      payment: paymentData,
      companySettings: { ...companySettings, companyLogo: sampleLogo }
    })

    assert.match(await generated.blob.text(), /\/Subtype\s*\/Image/)
  }
})

test('payment PDF omits the initials badge when no logo is configured', async () => {
  const generated = generatePaymentPdfBlob({
    paymentType: 'sale',
    payment: paymentData,
    companySettings: { companyName: 'Studio Point' }
  })
  const pdfText = await extractPdfText(generated.blob)

  assert.ok(!pdfText.includes('(SP) Tj'))
})

test('payment bank details stay on one centered row at the page end', async () => {
  const longBankDetails = {
    bankName: 'Crown Commercial Bank International Services',
    bankAddress: '12 Long Financial District Avenue, Central London, United Kingdom',
    accountNumber: '55790136-2026-ACCOUNT',
    ifscCode: 'GB29 NWBK 6016',
    branch: 'Westminster Central Branch'
  }
  const generated = generatePaymentPdfBlob({
    paymentType: 'sale',
    payment: paymentData,
    companySettings: { ...companySettings, bankDetails: longBankDetails }
  })
  const pdfText = await extractPdfText(generated.blob)
  const expectedRow = 'Bank Name: Crown Commercial Bank International Services | 12 Long Financial District Avenue, Central London, United Kingdom | Account Number: 55790136-2026-ACCOUNT | IFSC Code: GB29 NWBK 6016 | Branch: Westminster Central Branch'

  assert.ok(pdfText.includes(expectedRow))
})

test('payment PDFs omit allocation invoice dates while retaining payment dates', async () => {
  const generated = generatePaymentPdfBlob({
    paymentType: 'sale',
    payment: {
      paymentNumber: 'PAY-DATE',
      paymentDate: '2026-10-05',
      amount: 200,
      allocations: [{
        invoiceId: { invoiceNumber: 'INV-DATE', invoiceDate: '2026-09-12T00:00:00.000Z' },
        amount: 200
      }]
    }
  })
  const pdfText = await extractPdfText(generated.blob)

  assert.doesNotMatch(pdfText, /12-09-2026/)
  assert.match(pdfText, /10-05-2026/)
  assert.doesNotMatch(pdfText, /05 Oct 2026/)
})
