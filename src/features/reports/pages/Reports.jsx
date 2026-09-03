import React, { useEffect, useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import EmptyDataCard from '../../../components/EmptyDataCard'
import MotionButton from '../../../components/MotionButton'
import { handleApiError } from '../../../utils/toast'
import { formatDateMMDDYYYY } from '../../../utils/formatters'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const REPORTS_API_URL = `${API_BASE_URL}/api/reports`
const CUSTOMERS_API_URL = `${API_BASE_URL}/api/customers`
const VENDORS_API_URL = `${API_BASE_URL}/api/vendors`
const emptyTotals = { totalInvoiceAmount: 0, totalPaymentAmount: 0, totalPendingAmount: 0 }

function Reports() {
  const [activeTab, setActiveTab] = useState('sales')
  const [clients, setClients] = useState([])
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSearchText, setClientSearchText] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [totals, setTotals] = useState(emptyTotals)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)

  const filteredClients = useMemo(() => {
    const query = clientSearchText.trim().toLowerCase()
    if (!query) return []
    const clientType = activeTab === 'sales' ? 'Customer' : 'Vendor'
    return clients
      .filter((client) => client.type === clientType && client.name.toLowerCase().includes(query))
      .slice(0, 20)
  }, [activeTab, clients, clientSearchText])

  const formatMoney = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const fetchClients = async () => {
    try {
      const [customerResponse, vendorResponse] = await Promise.all([
        fetch(`${CUSTOMERS_API_URL}?limit=1000`),
        fetch(`${VENDORS_API_URL}?limit=1000`)
      ])
      const [customerData, vendorData] = await Promise.all([customerResponse.json(), vendorResponse.json()])
      const customers = (customerData.customers || []).map((client) => ({ id: String(client._id), type: 'Customer', name: client.customerName || client.companyName || client.id || 'Customer' }))
      const vendors = (vendorData.vendors || []).map((client) => ({ id: String(client._id), type: 'Vendor', name: client.vendorName || client.companyName || client.id || 'Vendor' }))
      setClients([...customers, ...vendors].sort((a, b) => a.name.localeCompare(b.name)))
    } catch (error) {
      handleApiError(error, 'Error fetching clients')
    }
  }

  const fetchReport = async (nextPage = 1, options = {}) => {
    setLoading(!options.download)
    try {
      const endpoint = activeTab === 'sales' ? 'sales' : 'purchases'
      const reportFromDate = options.fromDate ?? fromDate
      const reportToDate = options.toDate ?? toDate
      const reportClientId = options.clientId ?? clientId
      const url = new URL(`${REPORTS_API_URL}/${endpoint}`)
      url.searchParams.set('page', String(nextPage))
      url.searchParams.set('limit', String(options.limit || 25))
      if (reportFromDate) url.searchParams.set('fromDate', reportFromDate)
      if (reportToDate) url.searchParams.set('toDate', reportToDate)
      if (reportClientId) {
        const selected = clients.find((client) => `${client.type}:${client.id}` === reportClientId)
        if (selected) {
          url.searchParams.set('clientId', selected.id)
          url.searchParams.set('clientType', selected.type)
        }
      }
      const response = await fetch(url.toString())
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Error fetching report')
      if (!options.download) {
        setRows(data.rows || [])
        setTotals(data.totals || emptyTotals)
        setPage(data.page || 1)
        setTotalPages(data.totalPages || 0)
      }
      return data
    } catch (error) {
      if (options.download) throw error
      handleApiError(error, 'Error fetching report')
      setRows([])
      setTotals(emptyTotals)
      setPage(1)
      setTotalPages(0)
    } finally {
      if (!options.download) setLoading(false)
    }
  }

  useEffect(() => { fetchClients() }, [])
  useEffect(() => {
    fetchReport(1)
    // Filters are applied by the Apply Filter button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const applyFilters = () => fetchReport(1)
  const changeReportTab = (tab) => {
    setActiveTab(tab)
    setClientId('')
    setClientSearchText('')
    setClientDropdownOpen(false)
  }

  const clearFilters = () => {
    setFromDate('')
    setToDate('')
    setClientId('')
    setClientSearchText('')
    fetchReport(1, { fromDate: '', toDate: '', clientId: '' })
  }

  const sanitizeFileNamePart = (value) => String(value || '').trim().replace(/[^a-z0-9_-]/gi, '') || 'Report'

  const getReportFileName = (totalRows) => {
    const reportType = activeTab === 'sales' ? 'SaleReport' : 'PurchaseReport'
    const defaultClientName = activeTab === 'sales' ? 'AllCustomers' : 'AllVendors'
    const selectedClient = clients.find((client) => `${client.type}:${client.id}` === clientId)
    const clientName = sanitizeFileNamePart(selectedClient?.name || defaultClientName)
    const now = new Date()
    const dateTime = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0')
    ].join('-')
    return `${clientName}-${Number(totalRows) || 0}-${dateTime}-${reportType}.pdf`
  }

  const downloadPdf = async () => {
    try {
      const data = await fetchReport(1, { limit: 10000, download: true })
      const document = new jsPDF({ orientation: 'landscape' })
      const title = activeTab === 'sales' ? 'Sale Report' : 'Purchase Report'
      document.setFontSize(16)
      document.text(title, 14, 16)
      document.setFontSize(9)
      document.text(`From: ${fromDate || 'All'}    To: ${toDate || 'All'}`, 14, 23)
      document.text(`Total Invoice: $${formatMoney(data.totals?.totalInvoiceAmount)}   Total Payment: $${formatMoney(data.totals?.totalPaymentAmount)}   Total Pending: $${formatMoney(data.totals?.totalPendingAmount)}`, 14, 29)
      autoTable(document, {
        startY: 35,
        head: [['Date', 'Transaction No', 'Transaction Type', 'Description', 'Debit (Invoice)', 'Credit (Payment)', 'Balance']],
        body: (data.rows || []).map((row) => [formatDateMMDDYYYY(row.date), row.transactionNo, row.transactionType, row.description || '-', `$${formatMoney(row.debit)}`, `$${formatMoney(row.credit)}`, `$${formatMoney(row.balance)}`]),
        styles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 25 }, 2: { cellWidth: 45 }, 3: { cellWidth: 55 }, 4: { cellWidth: 25 }, 5: { cellWidth: 25 }, 6: { cellWidth: 25 } }
      })
      document.save(getReportFileName(data.total))
    } catch (error) {
      handleApiError(error, 'Error downloading report')
    }
  }

  const statusStyle = (status) => ({ color: status === 'Paid' ? '#16a34a' : status === 'Partial' ? '#2563eb' : '#ea580c', fontWeight: 700 })

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div className="card" style={{ width: '100%', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div><h2 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1.35rem' }}>Reports</h2><p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Review invoice and payment activity by client and date.</p></div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>{['sales', 'purchases'].map((tab) => <MotionButton key={tab} type="button" onClick={() => changeReportTab(tab)} style={{ padding: '0.55rem 0.9rem', border: '1px solid var(--border)', borderRadius: '6px', background: activeTab === tab ? 'var(--primary)' : 'var(--bg-main)', color: activeTab === tab ? '#fff' : 'var(--text-header)', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><FileText size={15} /> {tab === 'sales' ? 'Sale Report' : 'Purchase Report'}</MotionButton>)}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>
          <label style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.85rem' }}>From Date<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.3rem', padding: '0.55rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-card)', color: 'var(--text-header)' }} /></label>
          <label style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.85rem' }}>To Date<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.3rem', padding: '0.55rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-card)', color: 'var(--text-header)' }} /></label>
          <div style={{ position: 'relative' }}><label style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.85rem' }}>{activeTab === 'sales' ? 'Customer Name' : 'Vendor Name'}<input type="text" value={clientSearchText} placeholder={`Search ${activeTab === 'sales' ? 'customer' : 'vendor'} name`} onChange={(event) => { setClientSearchText(event.target.value); setClientId(''); setClientDropdownOpen(event.target.value.trim().length > 0) }} onFocus={() => { if (clientSearchText.trim()) setClientDropdownOpen(true) }} onBlur={() => setTimeout(() => setClientDropdownOpen(false), 200)} style={{ display: 'block', width: '100%', marginTop: '0.3rem', padding: '0.55rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-card)', color: 'var(--text-header)' }} /></label>{clientDropdownOpen && filteredClients.length > 0 && <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, maxHeight: '220px', overflowY: 'auto', marginTop: '0.25rem', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-card)', boxShadow: '0 8px 20px rgba(0,0,0,0.15)' }}>{filteredClients.map((client) => <button key={`${client.type}:${client.id}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setClientId(`${client.type}:${client.id}`); setClientSearchText(client.name); setClientDropdownOpen(false) }} style={{ display: 'block', width: '100%', padding: '0.55rem 0.7rem', border: 0, borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text-header)', textAlign: 'left', cursor: 'pointer' }}>{client.name}</button>)}</div>}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1rem' }}><MotionButton type="button" onClick={applyFilters} disabled={loading} style={{ padding: '0.55rem 0.9rem', background: 'var(--primary)', color: '#fff', border: 0, borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>Apply Filter</MotionButton><MotionButton type="button" onClick={clearFilters} disabled={loading} style={{ padding: '0.55rem 0.9rem', background: 'var(--bg-main)', color: 'var(--text-header)', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>Clear Filter</MotionButton><MotionButton type="button" onClick={downloadPdf} disabled={loading} style={{ padding: '0.55rem 0.9rem', background: 'var(--bg-main)', color: 'var(--text-header)', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Download size={15} /> Download PDF</MotionButton></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>{[['Total Invoice Amount', totals.totalInvoiceAmount], ['Total Payment Amount', totals.totalPaymentAmount], ['Total Pending Amount', totals.totalPendingAmount]].map(([label, value]) => <div key={label} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.9rem', background: 'var(--bg-main)' }}><div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>{label}</div><div style={{ marginTop: '0.35rem', color: 'var(--text-header)', fontSize: '1.2rem', fontWeight: 900 }}>${formatMoney(value)}</div></div>)}</div>
      </div>
      <div className="card" style={{ width: '100%', padding: '1.5rem', marginTop: '1.25rem' }}>
        {loading ? <div style={{ textAlign: 'center', padding: '2rem' }}>Loading report...</div> : rows.length === 0 ? <EmptyDataCard /> : <><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '0.82rem' }}><colgroup><col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '20%' }} /><col style={{ width: '25%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} /></colgroup><thead><tr style={{ borderBottom: '2px solid var(--border)' }}>{['Date', 'Transaction No', 'Transaction Type', 'Description', 'Debit (Invoice)', 'Credit (Payment)', 'Balance'].map((heading) => <th key={heading} style={{ padding: '0.7rem 0.45rem', textAlign: ['Debit (Invoice)', 'Credit (Payment)', 'Balance'].includes(heading) ? 'right' : 'left', color: 'var(--text-header)' }}>{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row._id} style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: '0.7rem 0.45rem' }}>{formatDateMMDDYYYY(row.date)}</td><td style={{ padding: '0.7rem 0.45rem' }}>{row.transactionNo}</td><td style={{ padding: '0.7rem 0.45rem' }}>{row.transactionType}</td><td style={{ padding: '0.7rem 0.45rem', overflowWrap: 'anywhere' }}>{row.description || '-'}</td><td style={{ padding: '0.7rem 0.45rem', textAlign: 'right' }}>${formatMoney(row.debit)}</td><td style={{ padding: '0.7rem 0.45rem', textAlign: 'right' }}>${formatMoney(row.credit)}</td><td style={{ padding: '0.7rem 0.45rem', textAlign: 'right', ...statusStyle(row.status) }}>${formatMoney(row.balance)}</td></tr>)}</tbody></table></div>{totalPages > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}><MotionButton type="button" onClick={() => fetchReport(page - 1)} disabled={page === 1} style={{ padding: '0.45rem 0.75rem' }}>Previous</MotionButton><span style={{ padding: '0.45rem 0.75rem', color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span><MotionButton type="button" onClick={() => fetchReport(page + 1)} disabled={page === totalPages} style={{ padding: '0.45rem 0.75rem' }}>Next</MotionButton></div>}</>}
      </div>
    </div>
  )
}

export default Reports