import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileText, Info } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import EmptyDataCard from '../../../components/EmptyDataCard'
import MotionButton from '../../../components/MotionButton'
import { handleApiError } from '../../../utils/toast'
import { formatDateMMDDYYYY } from '../../../utils/formatters'
import { REPORT_COLUMNS, REPORT_AMOUNT_COLUMN_KEYS, REPORT_COLUMN_INFO, getReportPopoverPosition } from '../reportColumns'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const REPORTS_API_URL = `${API_BASE_URL}/api/reports`
const CUSTOMERS_API_URL = `${API_BASE_URL}/api/customers`
const VENDORS_API_URL = `${API_BASE_URL}/api/vendors`
const emptyTotals = { totalInvAmount: 0, totalInvAmountPaid: 0, totalInvBalance: 0 }
function Reports() {
  const [activeTab, setActiveTab] = useState('sales')
  const [clients, setClients] = useState([])
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSearchText, setClientSearchText] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [reportColumns, setReportColumns] = useState(REPORT_COLUMNS)
  const [totals, setTotals] = useState(emptyTotals)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [openColumnInfo, setOpenColumnInfo] = useState(null)
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')

  const filteredClients = useMemo(() => {
    const query = clientSearchText.trim().toLowerCase()
    if (!query) return []
    const clientType = activeTab === 'sales' ? 'Customer' : 'Vendor'
    return clients
      .filter((client) => client.type === clientType && client.name.toLowerCase().includes(query))
      .slice(0, 20)
  }, [activeTab, clients, clientSearchText])

  const formatMoney = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formatSummaryMoney = (label, value) => formatMoney(label === 'Total Inv Amount Paid' ? Math.abs(Number(value) || 0) : value)

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
      url.searchParams.set('sortBy', options.sortBy ?? sortBy)
      url.searchParams.set('sortOrder', options.sortOrder ?? sortOrder)
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
        setReportColumns(REPORT_COLUMNS)
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
  const handleSort = (key) => {
    const direction = sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc'
    setSortBy(key)
    setSortOrder(direction)
    fetchReport(1, { sortBy: key, sortOrder: direction })
  }
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

  const getReportFileName = (totalRows, extension = 'pdf') => {
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
    return `${clientName}-${Number(totalRows) || 0}-${dateTime}-${reportType}.${extension}`
  }

  const downloadPdf = async () => {
    try {
      const data = await fetchReport(1, { limit: 10000, download: true })
      const columns = REPORT_COLUMNS
      const document = new jsPDF({ orientation: 'landscape' })
      const title = activeTab === 'sales' ? 'Sale Report' : 'Purchase Report'
      document.setFontSize(16)
      document.text(title, 14, 16)
      document.setFontSize(9)
      document.text(`From: ${fromDate || 'All'}    To: ${toDate || 'All'}`, 14, 23)
      const summaryCards = [
        ['Total Inv Amount', data.totals?.totalInvAmount],
        ['Total Inv Amount Paid', data.totals?.totalInvAmountPaid],
        ['Total Inv Balance', data.totals?.totalInvBalance]
      ]
      const cardWidth = 88
      const cardHeight = 18
      const cardGap = 7
      summaryCards.forEach(([label, value], index) => {
        const cardX = 14 + index * (cardWidth + cardGap)
        document.setFillColor(248, 250, 252)
        document.setDrawColor(203, 213, 225)
        document.roundedRect(cardX, 28, cardWidth, cardHeight, 2, 2, 'FD')
        document.setTextColor(100, 116, 139)
        document.setFontSize(8)
        document.text(label, cardX + 4, 34)
        document.setTextColor(15, 23, 42)
        document.setFontSize(11)
        document.setFont('helvetica', 'bold')
        document.text(`$${formatSummaryMoney(label, value)}`, cardX + 4, 42)
        document.setFont('helvetica', 'normal')
      })
      document.setTextColor(0, 0, 0)
      autoTable(document, {
        startY: 52,
        head: [columns.map((column) => column.label)],
        body: (data.rows || []).map((row) => columns.map((column) => {
          const value = getReportValue(row, column.key)
          if (column.key === 'date') return formatDateMMDDYYYY(value)
          if (REPORT_AMOUNT_COLUMN_KEYS.has(column.key)) return `$${formatMoney(value)}`
          return value || '-'
        })),
        styles: { fontSize: 8 },
        columnStyles: Object.fromEntries(columns.map((column, index) => [
          index,
          { cellWidth: column.key === 'description' ? 50 : REPORT_AMOUNT_COLUMN_KEYS.has(column.key) ? 24 : 27 }
        ]))
      })
      document.save(getReportFileName(data.total, 'pdf'))
    } catch (error) {
      handleApiError(error, 'Error downloading report')
    }
  }

  const downloadExcel = async () => {
    try {
      const data = await fetchReport(1, { limit: 10000, download: true })
      const columns = REPORT_COLUMNS
      const headers = columns.map((column) => column.label)
      const exportRows = (data.rows || []).map((row) => Object.fromEntries(columns.map((column) => {
        const value = getReportValue(row, column.key)
        if (column.key === 'date') return [column.label, formatDateMMDDYYYY(value)]
        if (REPORT_AMOUNT_COLUMN_KEYS.has(column.key)) return [column.label, Number(value) || 0]
        return [column.label, value || '']
      })))
      const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: headers })
      const worksheetRange = XLSX.utils.decode_range(worksheet['!ref'])
      columns.forEach((column, columnIndex) => {
        if (!REPORT_AMOUNT_COLUMN_KEYS.has(column.key)) return
        const spreadsheetColumn = XLSX.utils.encode_col(columnIndex)
        for (let rowNumber = worksheetRange.s.r + 1; rowNumber <= worksheetRange.e.r; rowNumber += 1) {
          const cell = worksheet[`${spreadsheetColumn}${rowNumber + 1}`]
          if (cell) cell.z = '$#,##0.00'
        }
      })
      worksheet['!cols'] = columns.map((column) => ({ wch: column.key === 'description' ? 40 : column.key === 'companyName' ? 28 : 18 }))
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, activeTab === 'sales' ? 'Sale Report' : 'Purchase Report')
      XLSX.writeFile(workbook, getReportFileName(data.total, 'xlsx'))
    } catch (error) {
      handleApiError(error, 'Error downloading Excel report')
    }
  }

  const statusStyle = (status) => ({ color: status === 'Paid' ? '#16a34a' : status === 'Partial' ? '#2563eb' : '#ea580c', fontWeight: 700 })
  const getReportValue = (row, key) => {
    if (key === 'invoiceAmount') return row.invoiceAmount ?? row.debitInvoice ?? 0
    if (key === 'paidAmount') return row.paidAmount ?? row.creditPayment ?? row.paymentAmount ?? 0
    return row[key]
  }
  const formatReportCell = (row, column) => {
    const value = getReportValue(row, column.key)
    if (column.key === 'date') return formatDateMMDDYYYY(value)
    if (REPORT_AMOUNT_COLUMN_KEYS.has(column.key)) return `$${formatMoney(value)}`
    if (column.key === 'description') return <span style={{ whiteSpace: 'pre-line' }}>{value || '-'}</span>
    return value || '-'
  }
  const toggleColumnInfo = (event, key) => {
    if (openColumnInfo?.key === key) {
      setOpenColumnInfo(null)
      return
    }
    const anchor = event.currentTarget
    setOpenColumnInfo({ key, anchor, ...getReportPopoverPosition(anchor.getBoundingClientRect()) })
  }

  useEffect(() => {
    const anchor = openColumnInfo?.anchor
    if (!anchor) return

    const updatePosition = () => {
      if (!anchor.isConnected) {
        setOpenColumnInfo(null)
        return
      }
      setOpenColumnInfo((current) => current?.anchor === anchor
        ? { ...current, ...getReportPopoverPosition(anchor.getBoundingClientRect()) }
        : current)
    }

    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [openColumnInfo])

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
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1rem' }}><MotionButton type="button" onClick={applyFilters} disabled={loading} style={{ padding: '0.55rem 0.9rem', background: 'var(--primary)', color: '#fff', border: 0, borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>Apply Filter</MotionButton><MotionButton type="button" onClick={clearFilters} disabled={loading} style={{ padding: '0.55rem 0.9rem', background: 'var(--bg-main)', color: 'var(--text-header)', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>Clear Filter</MotionButton><MotionButton type="button" onClick={downloadPdf} disabled={loading} style={{ padding: '0.55rem 0.9rem', background: 'var(--bg-main)', color: 'var(--text-header)', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Download size={15} /> Download PDF</MotionButton><MotionButton type="button" onClick={downloadExcel} disabled={loading} style={{ padding: '0.55rem 0.9rem', background: 'var(--bg-main)', color: 'var(--text-header)', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Download size={15} /> Download Excel</MotionButton></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>{[['Total Inv Amount', totals.totalInvAmount], ['Total Inv Amount Paid', totals.totalInvAmountPaid], ['Total Inv Balance', totals.totalInvBalance]].map(([label, value]) => <div key={label} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.9rem', background: 'var(--bg-main)' }}><div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>{label}</div><div style={{ marginTop: '0.35rem', color: 'var(--text-header)', fontSize: '1.2rem', fontWeight: 900 }}>${formatSummaryMoney(label, value)}</div></div>)}</div>
      </div>
      <div className="card" style={{ width: '100%', padding: '1.5rem', marginTop: '1.25rem', contentVisibility: 'auto', containIntrinsicSize: 'auto 700px' }}>
        {loading ? <div style={{ textAlign: 'center', padding: '2rem' }}>Loading report...</div> : rows.length === 0 ? <EmptyDataCard /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 1050, borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '0.82rem' }}>
                <colgroup>{reportColumns.map((column) => <col key={column.key} style={{ width: column.key === 'companyName' ? '14%' : column.key === 'date' ? '8%' : column.key === 'tnxNo' ? '11%' : column.key === 'tnxType' ? '12%' : column.key === 'description' ? '22%' : column.key === 'status' ? '5%' : '9%' }} />)}</colgroup>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {reportColumns.map((column) => {
                      const isSorted = sortBy === column.key
                      return (
                        <th key={column.key} aria-sort={isSorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ position: 'relative', padding: '0.7rem 0.45rem', textAlign: REPORT_AMOUNT_COLUMN_KEYS.has(column.key) ? 'right' : 'left', color: 'var(--text-header)', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: REPORT_AMOUNT_COLUMN_KEYS.has(column.key) ? 'flex-end' : 'flex-start', gap: '0.2rem' }}>
                            <button type="button" onClick={() => handleSort(column.key)} aria-label={`Sort by ${column.label}${isSorted ? ` ${sortOrder.toUpperCase()}` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: REPORT_AMOUNT_COLUMN_KEYS.has(column.key) ? 'flex-end' : 'flex-start', gap: '0.25rem', padding: 0, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 700, textAlign: 'inherit', cursor: 'pointer' }}>
                              {column.label}{isSorted && <span aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                            </button>
                            {REPORT_COLUMN_INFO[column.key] && <button type="button" aria-label={`Information about ${column.label}`} aria-expanded={openColumnInfo?.key === column.key} onClick={(event) => toggleColumnInfo(event, column.key)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><Info size={14} /></button>}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>{rows.map((row) => <tr key={row._id} style={{ borderBottom: '1px solid var(--border)' }}>{reportColumns.map((column) => <td key={column.key} style={{ padding: '0.7rem 0.45rem', textAlign: REPORT_AMOUNT_COLUMN_KEYS.has(column.key) ? 'right' : 'left', overflowWrap: column.key === 'description' || column.key === 'companyName' ? 'anywhere' : 'normal', ...(column.key === 'status' ? statusStyle(row.status) : {}) }}>{formatReportCell(row, column)}</td>)}</tr>)}</tbody>
              </table>
            </div>
            {openColumnInfo && createPortal(
              <div role="tooltip" style={{ position: 'fixed', left: openColumnInfo.left, top: openColumnInfo.top, zIndex: 100001, width: 240, padding: '0.5rem 0.65rem', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg-card)', color: 'var(--text-main)', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.35, boxShadow: '0 4px 14px rgba(0,0,0,0.16)' }}>
                {REPORT_COLUMN_INFO[openColumnInfo.key]}
              </div>,
              document.body
            )}
            {totalPages > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}><MotionButton type="button" onClick={() => fetchReport(page - 1)} disabled={page === 1} style={{ padding: '0.45rem 0.75rem' }}>Previous</MotionButton><span style={{ padding: '0.45rem 0.75rem', color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span><MotionButton type="button" onClick={() => fetchReport(page + 1)} disabled={page === totalPages} style={{ padding: '0.45rem 0.75rem' }}>Next</MotionButton></div>}
          </>
        )}
      </div>
    </div>
  )
}

export default Reports