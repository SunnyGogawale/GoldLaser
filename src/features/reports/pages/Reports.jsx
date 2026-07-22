import React, { useEffect, useMemo, useState } from 'react'
import { FileText, TrendingUp } from 'lucide-react'
import EmptyDataCard from '../../../components/EmptyDataCard'
import MotionButton from '../../../components/MotionButton'
import { handleApiError } from '../../../utils/toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const REPORTS_API_URL = `${API_BASE_URL}/api/reports`
const CUSTOMERS_API_URL = `${API_BASE_URL}/api/customers`

function Reports() {
  const [activeTab, setActiveTab] = useState('invoiceSummary')

  const [customers, setCustomers] = useState([])
  const [customerSearchText, setCustomerSearchText] = useState('')
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')

  const [draftFromDate, setDraftFromDate] = useState(() => new Date().toISOString().split('T')[0])
  const [draftToDate, setDraftToDate] = useState(() => new Date().toISOString().split('T')[0])

  const [appliedFromDate, setAppliedFromDate] = useState(() => new Date().toISOString().split('T')[0])
  const [appliedToDate, setAppliedToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [appliedCustomerId, setAppliedCustomerId] = useState('')

  const [loading, setLoading] = useState(false)

  const [invoiceRows, setInvoiceRows] = useState([])
  const [invoiceTotals, setInvoiceTotals] = useState({
    totalInvoiceAmount: 0,
    totalPaidAmount: 0,
    totalPendingAmount: 0
  })
  const [invoicePage, setInvoicePage] = useState(1)
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(0)

  const [salesRows, setSalesRows] = useState([])
  const [salesTotals, setSalesTotals] = useState({
    totalInvoiceAmount: 0,
    totalPaidAmount: 0,
    totalPendingAmount: 0
  })
  const [salesPage, setSalesPage] = useState(1)
  const [salesTotalPages, setSalesTotalPages] = useState(0)

  const filteredCustomers = useMemo(() => {
    const q = customerSearchText.trim().toLowerCase()
    if (!q) return []
    return customers.filter(c =>
      c.customerName?.toLowerCase().includes(q) || c.id?.toLowerCase().includes(q)
    )
  }, [customers, customerSearchText])

  const fetchCustomersList = async () => {
    try {
      const response = await fetch(`${CUSTOMERS_API_URL}?limit=1000`)
      const data = await response.json()
      setCustomers(data.customers || [])
    } catch (err) {
      handleApiError(err, 'Error fetching customers')
    }
  }

  const formatMoney = (value, fractionDigits = 0) =>
    Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })

  const statusStyles = (status) => {
    if (status === 'Paid') return { background: 'rgba(34,197,94,0.12)', color: 'rgb(34,197,94)' }
    if (status === 'Partial') return { background: 'rgba(59,130,246,0.12)', color: 'rgb(59,130,246)' }
    return { background: 'rgba(249,115,22,0.12)', color: 'rgb(249,115,22)' }
  }

  const fetchInvoiceSummary = async (page = 1) => {
    setLoading(true)
    try {
      const url = new URL(`${REPORTS_API_URL}/invoice-summary`)
      url.searchParams.set('page', String(page))
      url.searchParams.set('limit', '25')
      if (appliedFromDate) url.searchParams.set('fromDate', appliedFromDate)
      if (appliedToDate) url.searchParams.set('toDate', appliedToDate)
      if (appliedCustomerId) url.searchParams.set('customerId', appliedCustomerId)

      const response = await fetch(url.toString())
      const data = await response.json()
      setInvoiceRows(data.rows || [])
      setInvoiceTotals(data.totals || { totalInvoiceAmount: 0, totalPaidAmount: 0, totalPendingAmount: 0 })
      setInvoicePage(data.page || 1)
      setInvoiceTotalPages(data.totalPages || 0)
    } catch (err) {
      handleApiError(err, 'Error fetching invoice summary')
      setInvoiceRows([])
      setInvoiceTotals({ totalInvoiceAmount: 0, totalPaidAmount: 0, totalPendingAmount: 0 })
      setInvoicePage(1)
      setInvoiceTotalPages(0)
    } finally {
      setLoading(false)
    }
  }

  const fetchSalesReport = async (page = 1) => {
    setLoading(true)
    try {
      const url = new URL(`${REPORTS_API_URL}/sales`)
      url.searchParams.set('page', String(page))
      url.searchParams.set('limit', '25')
      if (appliedCustomerId) url.searchParams.set('customerId', appliedCustomerId)

      const response = await fetch(url.toString())
      const data = await response.json()
      setSalesRows(data.rows || [])
      setSalesTotals(data.totals || { totalInvoiceAmount: 0, totalPaidAmount: 0, totalPendingAmount: 0 })
      setSalesPage(data.page || 1)
      setSalesTotalPages(data.totalPages || 0)
    } catch (err) {
      handleApiError(err, 'Error fetching sales report')
      setSalesRows([])
      setSalesTotals({ totalInvoiceAmount: 0, totalPaidAmount: 0, totalPendingAmount: 0 })
      setSalesPage(1)
      setSalesTotalPages(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomersList()
  }, [])

  useEffect(() => {
    if (activeTab === 'invoiceSummary') fetchInvoiceSummary(1)
    if (activeTab === 'salesReport') fetchSalesReport(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, appliedFromDate, appliedToDate, appliedCustomerId])

  const applyFilters = () => {
    if (activeTab === 'invoiceSummary') {
      setAppliedFromDate(draftFromDate)
      setAppliedToDate(draftToDate)
      setAppliedCustomerId(selectedCustomerId)
    } else {
      setAppliedFromDate('')
      setAppliedToDate('')
      setAppliedCustomerId(selectedCustomerId)
    }
    if (activeTab === 'invoiceSummary') setInvoicePage(1)
    if (activeTab === 'salesReport') setSalesPage(1)
  }

  const clearFilters = () => {
    const today = new Date().toISOString().split('T')[0]
    setDraftFromDate(today)
    setDraftToDate(today)
    if (activeTab === 'invoiceSummary') {
      setAppliedFromDate(today)
      setAppliedToDate(today)
    } else {
      setAppliedFromDate('')
      setAppliedToDate('')
    }
    setSelectedCustomerId('')
    setAppliedCustomerId('')
    setCustomerSearchText('')
  }

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div className="card" style={{ margin: '0 auto', width: '100%', padding: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <MotionButton
            type="button"
            onClick={() => setActiveTab('invoiceSummary')}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '999px',
              border: '1px solid var(--border)',
              background: activeTab === 'invoiceSummary' ? 'var(--bg-main)' : 'transparent',
              color: 'var(--text-header)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 700,
              fontSize: '0.875rem'
            }}
          >
            <FileText size={16} /> Invoice Summary
          </MotionButton>
          <MotionButton
            type="button"
            onClick={() => setActiveTab('salesReport')}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '999px',
              border: '1px solid var(--border)',
              background: activeTab === 'salesReport' ? 'var(--bg-main)' : 'transparent',
              color: 'var(--text-header)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 700,
              fontSize: '0.875rem'
            }}
          >
            <TrendingUp size={16} /> Sales Report
          </MotionButton>
        </div>

        <h2 style={{ margin: '0 0 1rem 0', color: 'var(--text-header)', fontSize: '1.25rem' }}>
          {activeTab === 'invoiceSummary' ? 'Invoice Summary Report' : 'Sales Report'}
        </h2>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {activeTab === 'invoiceSummary' && (
            <>
              <div style={{ flex: '1 1 240px' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
                  From Date
                </label>
                <input
                  type="date"
                  value={draftFromDate}
                  onChange={(e) => setDraftFromDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: 'var(--bg-card)',
                    color: 'var(--text-header)'
                  }}
                />
              </div>

              <div style={{ flex: '1 1 240px' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
                  To Date
                </label>
                <input
                  type="date"
                  value={draftToDate}
                  onChange={(e) => setDraftToDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    background: 'var(--bg-card)',
                    color: 'var(--text-header)'
                  }}
                />
              </div>
            </>
          )}

          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
              Customer
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="All customers"
                value={customerSearchText}
                onChange={(e) => {
                  setCustomerSearchText(e.target.value)
                  setIsCustomerDropdownOpen(e.target.value.length > 0)
                  setSelectedCustomerId('')
                }}
                onFocus={(e) => {
                  if (e.target.value.length > 0) setIsCustomerDropdownOpen(true)
                }}
                onBlur={() => setTimeout(() => setIsCustomerDropdownOpen(false), 200)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  background: 'var(--bg-card)',
                  color: 'var(--text-header)',
                  outline: 'none'
                }}
              />
              {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                <ul style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  marginTop: '4px',
                  padding: 0,
                  listStyle: 'none',
                  zIndex: 10,
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                  {filteredCustomers.map(customer => (
                    <li
                      key={customer._id}
                      onClick={() => {
                        setSelectedCustomerId(customer._id)
                        setCustomerSearchText(customer.customerName)
                        setIsCustomerDropdownOpen(false)
                      }}
                      style={{
                        padding: '0.5rem 0.75rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        color: 'var(--text-header)',
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-main)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {customer.customerName} ({customer.id})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <MotionButton
            type="button"
            onClick={applyFilters}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            Apply Filters
          </MotionButton>
          <MotionButton
            type="button"
            onClick={clearFilters}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--bg-main)',
              color: 'var(--text-header)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            Clear Filters
          </MotionButton>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 700 }}>Total Invoice Amount</div>
            <div style={{ color: 'var(--text-header)', fontSize: '1.25rem', fontWeight: 900, marginTop: '0.5rem' }}>₹{formatMoney((activeTab === 'invoiceSummary' ? invoiceTotals.totalInvoiceAmount : salesTotals.totalInvoiceAmount), 0)}</div>
          </div>
          <div style={{ flex: '1 1 200px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 700 }}>Total Paid Amount</div>
            <div style={{ color: 'rgb(34,197,94)', fontSize: '1.25rem', fontWeight: 900, marginTop: '0.5rem' }}>₹{formatMoney((activeTab === 'invoiceSummary' ? invoiceTotals.totalPaidAmount : salesTotals.totalPaidAmount), 0)}</div>
          </div>
          <div style={{ flex: '1 1 200px', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 700 }}>Total Pending Amount</div>
            <div style={{ color: 'rgb(239,68,68)', fontSize: '1.25rem', fontWeight: 900, marginTop: '0.5rem' }}>₹{formatMoney((activeTab === 'invoiceSummary' ? invoiceTotals.totalPendingAmount : salesTotals.totalPendingAmount), 0)}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ margin: '1.5rem auto 0', width: '100%', padding: '1.5rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>Loading report...</div>
        ) : activeTab === 'invoiceSummary' ? (
          invoiceRows.length === 0 ? (
            <EmptyDataCard />
          ) : (
            <div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Invoice Number</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Invoice Date</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Customer Name</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem' }}>Invoice Amount</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem' }}>Paid Amount</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem' }}>Pending Amount</th>
                      <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceRows.map(r => (
                      <tr key={r._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{r.invoiceNumber}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{new Date(r.invoiceDate).toLocaleDateString()}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{r.customerName || 'Unknown'}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>₹{formatMoney(r.invoiceAmount, 0)}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>₹{formatMoney(r.paidAmount, 0)}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>₹{formatMoney(r.pendingAmount, 0)}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            ...statusStyles(r.status)
                          }}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {invoiceTotalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '1.5rem'
                }}>
                  <MotionButton
                    onClick={() => fetchInvoiceSummary(invoicePage - 1)}
                    disabled={invoicePage === 1}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: invoicePage === 1 ? 'not-allowed' : 'pointer',
                      opacity: invoicePage === 1 ? 0.5 : 1
                    }}
                  >
                    Previous
                  </MotionButton>

                  {Array.from({ length: invoiceTotalPages }, (_, i) => i + 1).map(p => (
                    <MotionButton
                      key={p}
                      onClick={() => fetchInvoiceSummary(p)}
                      disabled={p === invoicePage}
                      style={{
                        padding: '0.5rem 1rem',
                        background: p === invoicePage ? 'var(--primary)' : 'var(--bg-main)',
                        color: p === invoicePage ? 'white' : 'var(--text-header)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        cursor: p === invoicePage ? 'not-allowed' : 'pointer',
                        fontWeight: p === invoicePage ? 700 : 400
                      }}
                    >
                      {p}
                    </MotionButton>
                  ))}

                  <MotionButton
                    onClick={() => fetchInvoiceSummary(invoicePage + 1)}
                    disabled={invoicePage === invoiceTotalPages}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: invoicePage === invoiceTotalPages ? 'not-allowed' : 'pointer',
                      opacity: invoicePage === invoiceTotalPages ? 0.5 : 1
                    }}
                  >
                    Next
                  </MotionButton>
                </div>
              )}
            </div>
          )
        ) : (
          salesRows.length === 0 ? (
            <EmptyDataCard />
          ) : (
            <div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Invoice Number</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem' }}>Invoice Date</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem' }}>Invoice Amount</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem' }}>Paid Amount</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem' }}>Pending Amount</th>
                      <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesRows.map(r => (
                      <tr key={r._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{r.invoiceNumber}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>{new Date(r.invoiceDate).toLocaleDateString()}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>₹{formatMoney(r.invoiceAmount, 0)}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>₹{formatMoney(r.paidAmount, 0)}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>₹{formatMoney(r.pendingAmount, 0)}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            ...statusStyles(r.status)
                          }}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {salesTotalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '1.5rem'
                }}>
                  <MotionButton
                    onClick={() => fetchSalesReport(salesPage - 1)}
                    disabled={salesPage === 1}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: salesPage === 1 ? 'not-allowed' : 'pointer',
                      opacity: salesPage === 1 ? 0.5 : 1
                    }}
                  >
                    Previous
                  </MotionButton>

                  {Array.from({ length: salesTotalPages }, (_, i) => i + 1).map(p => (
                    <MotionButton
                      key={p}
                      onClick={() => fetchSalesReport(p)}
                      disabled={p === salesPage}
                      style={{
                        padding: '0.5rem 1rem',
                        background: p === salesPage ? 'var(--primary)' : 'var(--bg-main)',
                        color: p === salesPage ? 'white' : 'var(--text-header)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        cursor: p === salesPage ? 'not-allowed' : 'pointer',
                        fontWeight: p === salesPage ? 700 : 400
                      }}
                    >
                      {p}
                    </MotionButton>
                  ))}

                  <MotionButton
                    onClick={() => fetchSalesReport(salesPage + 1)}
                    disabled={salesPage === salesTotalPages}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: salesPage === salesTotalPages ? 'not-allowed' : 'pointer',
                      opacity: salesPage === salesTotalPages ? 0.5 : 1
                    }}
                  >
                    Next
                  </MotionButton>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}

export default Reports
