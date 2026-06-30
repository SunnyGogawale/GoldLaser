import React, { useEffect, useMemo, useState, useRef } from 'react'
import { Save, RotateCcw, Trash2, Edit2, X, Search, Info, Eye, MoreVertical } from 'lucide-react'
import EmptyDataCard from '../components/EmptyDataCard'
import { clearAuthSession, getAuthToken, getAuthValue } from '../utils/authStorage'
import { readJsonResponse } from '../utils/api'
import MotionButton from '../components/MotionButton'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const API_URL = `${API_BASE_URL}/api/payments`
const CUSTOMERS_API_URL = `${API_BASE_URL}/api/customers`
const VENDORS_API_URL = `${API_BASE_URL}/api/vendors`

function Payment() {
  // Responsive state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [paymentForm, setPaymentForm] = useState({
    paymentNumber: '',
    clientId: '',
    clientType: 'Customer',
    paymentDate: new Date().toISOString().split('T')[0],
    amount: 0,
    description: ''
  })

  const [errors, setErrors] = useState({})
  const [formSubmitted, setFormSubmitted] = useState(false)
  const [editingPaymentId, setEditingPaymentId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)

  const [customers, setCustomers] = useState([])
  const [vendors, setVendors] = useState([])
  const [clientSearchText, setClientSearchText] = useState('')
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false)

  const [pendingInvoices, setPendingInvoices] = useState([])
  const [totalPending, setTotalPending] = useState(0)
  const [pendingInvoiceOrder, setPendingInvoiceOrder] = useState([])
  const [dragInvoiceId, setDragInvoiceId] = useState(null)

  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortColumn, setSortColumn] = useState('')
  const [sortOrder, setSortOrder] = useState('asc')

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortOrder('asc')
    }
  }
  const isAdmin = (getAuthValue('userRole') || '').toLowerCase() === 'admin'
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoPayment, setInfoPayment] = useState(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoNowMs, setInfoNowMs] = useState(0)
  const [openDropdownId, setOpenDropdownId] = useState(null)
  const [dropdownPayment, setDropdownPayment] = useState(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [dropdownUp, setDropdownUp] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdownId && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdownId(null);
        setDropdownPayment(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdownId])

  const formatTimeAgo = (dateValue) => {
    const d = dateValue ? new Date(dateValue) : null
    if (!d || Number.isNaN(d.getTime())) return ''
    if (!infoNowMs) return ''
    const diffMs = infoNowMs - d.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 10) return 'just now'
    if (diffSec < 60) return `${diffSec} seconds ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} minutes ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr} hours ago`
    const diffDay = Math.floor(diffHr / 24)
    return `${diffDay} days ago`
  }

  const truncateText = (value, max = 15) => {
    const s = String(value ?? '')
    if (s.length <= max) return s
    return s.slice(0, max) + '...'
  }

  const allClients = useMemo(() => [
    ...customers.map(c => ({ ...c, type: 'Customer', name: c.customerName })),
    ...vendors.map(v => ({ ...v, type: 'Vendor', name: v.vendorName }))
  ], [customers, vendors])
  
  const filteredClients = useMemo(() => {
    const q = clientSearchText.trim().toLowerCase()
    if (!q) return []
    return allClients.filter(c =>
      c.name?.toLowerCase().includes(q) || c.id?.toLowerCase().includes(q)
    )
  }, [allClients, clientSearchText])

  useEffect(() => {
    if (!paymentForm.clientId) {
      setPendingInvoiceOrder([])
      return
    }
    setPendingInvoiceOrder((prev) => {
      const ids = pendingInvoices.map((i) => String(i._id))
      if (!Array.isArray(prev) || prev.length === 0) return ids
      const idSet = new Set(ids)
      const next = prev.filter((id) => idSet.has(String(id)))
      for (const id of ids) {
        if (!next.includes(id)) next.push(id)
      }
      return next
    })
  }, [pendingInvoices, paymentForm.clientId])

  const orderedPendingInvoices = useMemo(() => {
    if (!Array.isArray(pendingInvoiceOrder) || pendingInvoiceOrder.length === 0) {
      return [...pendingInvoices].sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime())
    }
    const map = new Map(pendingInvoices.map((i) => [String(i._id), i]))
    const ordered = pendingInvoiceOrder.map((id) => map.get(String(id))).filter(Boolean)
    for (const inv of pendingInvoices) {
      const key = String(inv._id)
      if (!pendingInvoiceOrder.includes(key)) ordered.push(inv)
    }
    return ordered
  }, [pendingInvoices, pendingInvoiceOrder])

  const moveInvoiceBefore = (dragId, hoverId) => {
    const fromId = String(dragId || '')
    const toId = String(hoverId || '')
    if (!fromId || !toId || fromId === toId) return
    setPendingInvoiceOrder((prev) => {
      const list = Array.isArray(prev) ? [...prev] : []
      const fromIndex = list.indexOf(fromId)
      const toIndex = list.indexOf(toId)
      if (fromIndex === -1 || toIndex === -1) return list
      list.splice(fromIndex, 1)
      const nextIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
      list.splice(nextIndex, 0, fromId)
      return list
    })
  }

  const allocationPreview = useMemo(() => {
    const inputAmount = Math.max(0, Number(paymentForm.amount) || 0)
    const amount = Math.min(inputAmount, Math.max(0, Number(totalPending) || 0))
    let remaining = amount
    const allocationMap = new Map()
    for (const inv of orderedPendingInvoices) {
      if (remaining <= 0) break
      const pending = Math.max(0, Number(inv.pendingAmount) || 0)
      const payNow = Math.min(pending, remaining)
      allocationMap.set(String(inv._id), payNow)
      remaining -= payNow
    }
    const allocatedTotal = amount - Math.max(0, remaining)
    return { allocationMap, allocatedTotal, remaining: 0 }
  }, [orderedPendingInvoices, paymentForm.amount, totalPending])



  const fetchNextPaymentNumber = async () => {
    try {
      const response = await fetch(`${API_URL}/next-number`)
      const data = await readJsonResponse(response, 'Error fetching next payment number')
      setPaymentForm(prev => ({ ...prev, paymentNumber: data.nextNumber }))
    } catch (err) {
      console.error('Error fetching next payment number:', err)
    }
  }

  const fetchCustomersList = async () => {
    try {
      const response = await fetch(`${CUSTOMERS_API_URL}?limit=1000`)
      const data = await readJsonResponse(response, 'Error fetching customers')
      setCustomers(data.customers || [])
    } catch (err) {
      console.error('Error fetching customers:', err)
    }
  }
  
  const fetchVendorsList = async () => {
    try {
      const response = await fetch(`${VENDORS_API_URL}?limit=1000`)
      const data = await readJsonResponse(response, 'Error fetching vendors')
      setVendors(data.vendors || [])
    } catch (err) {
      console.error('Error fetching vendors:', err)
    }
  }

  const fetchPayments = async (page = 1, search = searchQuery, column = sortColumn, order = sortOrder) => {
    setListLoading(true)
    try {
      let url = `${API_URL}?page=${page}&limit=25&search=${encodeURIComponent(search)}`
      if (column) {
        url += `&sortColumn=${encodeURIComponent(column)}&sortOrder=${encodeURIComponent(order)}`
      }
      const response = await fetch(url)
      const data = await readJsonResponse(response, 'Error fetching payments')
      setPayments(data.payments || [])
      setTotalPages(data.totalPages || 0)
      setCurrentPage(page)
    } catch (err) {
      console.error('Error fetching payments:', err)
    } finally {
      setListLoading(false)
    }
  }

  const fetchPendingInvoices = async (clientId, clientType, excludePaymentId) => {
    if (!clientId) {
      setPendingInvoices([])
      setTotalPending(0)
      return
    }

    try {
      const url = new URL(`${API_URL}/pending`)
      url.searchParams.set('clientId', clientId)
      url.searchParams.set('clientType', clientType)
      if (excludePaymentId) url.searchParams.set('excludePaymentId', excludePaymentId)
      const response = await fetch(url.toString())
      const data = await readJsonResponse(response, 'Error fetching pending invoices')
      setPendingInvoices(data.invoices || [])
      setTotalPending(Number(data.totalPending) || 0)
    } catch (err) {
      console.error('Error fetching pending invoices:', err)
      setPendingInvoices([])
      setTotalPending(0)
    }
  }

  useEffect(() => {
    fetchCustomersList()
    fetchVendorsList()
    fetchNextPaymentNumber()
  }, [])

  useEffect(() => {
    fetchPayments(1, searchQuery, sortColumn, sortOrder)
  }, [searchQuery, sortColumn, sortOrder])

  useEffect(() => {
    if (!paymentForm.clientId) {
      setPendingInvoices([])
      setTotalPending(0)
      return
    }
    fetchPendingInvoices(paymentForm.clientId, paymentForm.clientType, editingPaymentId)
  }, [paymentForm.clientId, paymentForm.clientType, editingPaymentId])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenDropdownId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const validateForm = () => {
    const newErrors = {}

    if (!paymentForm.clientId) newErrors.clientId = 'Please select a client'
    if (!paymentForm.paymentDate) newErrors.paymentDate = 'Payment date is required'
    const amount = Number(paymentForm.amount) || 0
    if (!(amount > 0)) newErrors.amount = 'Payment amount must be greater than 0'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handlePaymentSubmit = async (e) => {
    e.preventDefault()
    setFormSubmitted(true)
    if (!validateForm()) return

    setLoading(true)
    try {
      const token = getAuthToken()
      const payload = {
        paymentNumber: paymentForm.paymentNumber,
        clientId: paymentForm.clientId,
        clientType: paymentForm.clientType,
        paymentDate: paymentForm.paymentDate,
        amount: Math.min(Math.max(0, Number(paymentForm.amount) || 0), Math.max(0, Number(totalPending) || 0)),
        description: paymentForm.description || '',
        invoiceOrder: orderedPendingInvoices.map((inv) => String(inv._id))
      }

      const url = editingPaymentId ? `${API_URL}/${editingPaymentId}` : API_URL
      const method = editingPaymentId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.message || 'Error saving payment')
      }

      alert(editingPaymentId ? 'Payment updated successfully!' : 'Payment created successfully!')

      setEditingPaymentId(null)
      setPaymentForm({
        paymentNumber: '',
        clientId: '',
        clientType: 'Customer',
        paymentDate: new Date().toISOString().split('T')[0],
        amount: 0,
        description: ''
      })
      setPendingInvoiceOrder([])
      setDragInvoiceId(null)
      setClientSearchText('')
      setErrors({})
      setFormSubmitted(false)
      setFormOpen(false)
      await fetchNextPaymentNumber()
      await fetchPayments(1, searchQuery)
    } catch (err) {
      console.error('Error saving payment:', err)
      alert(err.message || 'Error saving payment!')
    } finally {
      setLoading(false)
    }
  }

  const openInfo = async (payment) => {
    setInfoOpen(true)
    setInfoPayment(payment || null)
    const id = payment?._id
    if (!id) return
    setInfoLoading(true)
    setInfoNowMs(Date.now())
    try {
      const token = getAuthToken()
      const response = await fetch(`${API_URL}/detail/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      const data = await readJsonResponse(response, 'Error fetching payment info')
      setInfoPayment(data || null)
    } catch (err) {
      console.error('Error fetching payment info:', err)
    } finally {
      setInfoLoading(false)
    }
  }

  const refreshInfo = async () => {
    const id = infoPayment?._id
    if (!id) return
    setInfoLoading(true)
    setInfoNowMs(Date.now())
    try {
      const token = getAuthToken()
      const response = await fetch(`${API_URL}/detail/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      const data = await readJsonResponse(response, 'Error refreshing payment info')
      setInfoPayment(data || null)
    } catch (err) {
      console.error('Error refreshing payment info:', err)
    } finally {
      setInfoLoading(false)
    }
  }

  const closeInfo = () => {
    setInfoOpen(false)
    setInfoPayment(null)
  }

  const handleCancelEdit = async () => {
    setEditingPaymentId(null)
    setPaymentForm({
      paymentNumber: '',
      clientId: '',
      clientType: 'Customer',
      paymentDate: new Date().toISOString().split('T')[0],
      amount: 0,
      description: ''
    })
    setPendingInvoiceOrder([])
    setDragInvoiceId(null)
    setClientSearchText('')
    setErrors({})
    setFormSubmitted(false)
    await fetchNextPaymentNumber()
    setFormOpen(false)
  }

  const handleEditPayment = async (payment) => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/${payment._id}`)
      const data = await readJsonResponse(response, 'Error loading payment')
      const clientType = data.clientType || 'Customer'
      const clientId = data.clientId || data.vendorId?._id || data.vendorId
    const client = data.vendorId
      const clientName = client?.customerName || client?.vendorName || ''
      const clientIdStr = client?.id || ''

      setPaymentForm({
        paymentNumber: data.paymentNumber,
        clientId: clientId,
        clientType: clientType,
        paymentDate: new Date(data.paymentDate).toISOString().split('T')[0],
        amount: data.amount || 0,
        description: data.description || ''
      })
      setClientSearchText(clientName ? `${clientName} (${clientIdStr}) - ${clientType}` : '')
      setEditingPaymentId(data._id)
      setErrors({})
      setFormSubmitted(false)
      setFormOpen(true)
    } catch (err) {
      console.error('Error loading payment:', err)
      alert('Error loading payment!')
    } finally {
      setLoading(false)
    }
  }

  const openCreatePayment = async () => {
    if (loading) return
    setEditingPaymentId(null)
    setPaymentForm({
      paymentNumber: '',
      clientId: '',
      clientType: 'Customer',
      paymentDate: new Date().toISOString().split('T')[0],
      amount: 0,
      description: ''
    })
    setPendingInvoiceOrder([])
    setDragInvoiceId(null)
    setClientSearchText('')
    setIsClientDropdownOpen(false)
    setErrors({})
    setFormSubmitted(false)
    await fetchNextPaymentNumber()
    setFormOpen(true)
  }

  const closePaymentForm = () => {
    if (loading) return
    setFormOpen(false)
  }

  const handleDeletePayment = async (id) => {
    if (!isAdmin) {
      alert('Only admin can delete.')
      return
    }
    if (!window.confirm('Are you sure you want to delete this payment?')) return
    try {
      const token = getAuthToken()
      if (!token) {
        alert('Please login again.')
        return
      }
      const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) {
        if (response.status === 401) {
          clearAuthSession()
          alert('Session expired. Please login again.')
          window.location.href = '/login'
          return
        }
        let message = 'Error deleting payment!'
        try {
          const errorData = await response.json().catch(() => null)
          if (errorData?.message) message = errorData.message
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      if (editingPaymentId === id) {
        await handleCancelEdit()
      }
      if (infoPayment?._id === id) {
        closeInfo()
      }

      const nextPage = payments.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage
      await fetchPayments(nextPage, searchQuery)
      if (paymentForm.clientId) {
        await fetchPendingInvoices(paymentForm.clientId, paymentForm.clientType, editingPaymentId)
      }
      alert('Payment deleted successfully!')
    } catch (err) {
      console.error('Error deleting payment:', err)
      alert(err.message || 'Error deleting payment!')
    }
  }

  const formatMoney = (value) =>
    Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const statusStyles = (status) => {
    if (status === 'Paid') return { background: 'rgba(34,197,94,0.12)', color: 'rgb(34,197,94)' }
    if (status === 'Partial') return { background: 'rgba(59,130,246,0.12)', color: 'rgb(59,130,246)' }
    return { background: 'rgba(249,115,22,0.12)', color: 'rgb(249,115,22)' }
  }

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0 }}>
        <MotionButton
          type="button"
          onClick={openCreatePayment}
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9375rem',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            opacity: loading ? 0.7 : 1
          }}
        >
          Add Payment
        </MotionButton>
      </div>

      {formOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePaymentForm()
          }}
        >
          <div className="card" style={{ width: 'min(1100px, 96vw)', maxHeight: '88vh', overflow: 'auto', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1.25rem' }}>
                {editingPaymentId ? 'Edit Payment' : 'New Payment'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>
                <div
                  style={{
                    padding: '0.4rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    background: 'var(--bg-main)',
                    color: 'var(--text-muted)',
                    fontSize: '0.875rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap'
                  }}
                >
                  Payment No : {paymentForm.paymentNumber || 'xxxx'}
                </div>
                {/* {editingPaymentId && (
                  <MotionButton
                    onClick={handleCancelEdit}
                    disabled={loading}
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <X size={16} />
                    Cancel
                  </MotionButton>
                )} */}
                <MotionButton
                  type="button"
                  onClick={closePaymentForm}
                  disabled={loading}
                  className="btn btn-secondary"
                  style={{ 
                    padding: '0.5rem 1rem',
                    // background: 'var(--bg-main)',
                    color: 'var(--text-header)',
                    // border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  <X size={16} />
                  {/* Close */}
                </MotionButton>
              </div>
            </div>

            <form onSubmit={handlePaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px', position: 'relative' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
                    Select Client <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Search client (customer or vendor)..."
                      value={clientSearchText}
                      onChange={(e) => {
                        setClientSearchText(e.target.value)
                        setIsClientDropdownOpen(e.target.value.length > 0)
                        if (paymentForm.clientId) {
                          setPaymentForm(prev => ({ ...prev, clientId: '', clientType: 'Customer' }))
                        }
                        if (formSubmitted && errors.clientId) {
                          setErrors(prev => {
                            const newE = { ...prev }
                            delete newE.clientId
                            return newE
                          })
                        }
                      }}
                      onFocus={(e) => {
                        if (e.target.value.length > 0) setIsClientDropdownOpen(true)
                      }}
                      onBlur={() => setTimeout(() => setIsClientDropdownOpen(false), 200)}
                      disabled={loading}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: `1px solid ${errors.clientId ? 'var(--danger)' : 'var(--border)'}`,
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)',
                        outline: 'none'
                      }}
                    />
                    {isClientDropdownOpen && (
                      <ul style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '250px',
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
                        {filteredClients.map(client => (
                          <li
                            key={client._id + client.type}
                            onClick={() => {
                              setPaymentForm(prev => ({ ...prev, clientId: client._id, clientType: client.type }))
                              setClientSearchText(`${client.name} (${client.id}) - ${client.type}`)
                              setIsClientDropdownOpen(false)
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
                            {client.name} ({client.id}) - {client.type}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {formSubmitted && errors.clientId && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.clientId}</p>
                  )}
                </div>

                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
                    Payment Date <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="date"
                    name="paymentDate"
                    value={paymentForm.paymentDate}
                    onChange={(e) => {
                      setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))
                      if (formSubmitted && errors.paymentDate) {
                        setErrors(prev => {
                          const ne = { ...prev }
                          delete ne.paymentDate
                          return ne
                        })
                      }
                    }}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: `1px solid ${errors.paymentDate ? 'var(--danger)' : 'var(--border)'}`,
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)'
                    }}
                  />
                  {formSubmitted && errors.paymentDate && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.paymentDate}</p>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
                    Payment Amount (₹) <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => {
                      setPaymentForm(prev => ({ ...prev, amount: e.target.value }))
                      if (formSubmitted && errors.amount) {
                        setErrors(prev => {
                          const ne = { ...prev }
                          delete ne.amount
                          return ne
                        })
                      }
                    }}
                    min="0"
                    step="0.01"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: `1px solid ${errors.amount ? 'var(--danger)' : 'var(--border)'}`,
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)'
                    }}
                  />
                  {formSubmitted && errors.amount && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.amount}</p>
                  )}
                </div>
                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={paymentForm.description}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, description: e.target.value }))}
                    disabled={loading}
                    placeholder="Enter payment description or notes"
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
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: 'var(--text-header)' }}>Pending Invoices</h3>
                <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead style={{ background: 'var(--bg-main)' }}>
                      <tr>
                        <th style={{ padding: '0.5rem', textAlign: 'center', width: 70 }}>Priority</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Invoice Number</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Invoice Date</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Invoice Amount</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Paid Amount</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Pending Amount</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Will Pay</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedPendingInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            {paymentForm.clientId ? 'No pending invoices for this client.' : 'Select a client to view pending invoices.'}
                          </td>
                        </tr>
                      ) : (
                        orderedPendingInvoices.map((inv, idx) => (
                          <tr
                            key={inv._id}
                            style={{
                              borderTop: '1px solid var(--border)',
                              background: dragInvoiceId && String(inv._id) === String(dragInvoiceId) ? 'rgba(59,130,246,0.10)' : 'transparent'
                            }}
                            onDragOver={(e) => {
                              if (!dragInvoiceId) return
                              e.preventDefault()
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (!dragInvoiceId) return
                              moveInvoiceBefore(dragInvoiceId, inv._id)
                              setDragInvoiceId(null)
                            }}
                          >
                            <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                              <div
                                draggable
                                onDragStart={(e) => {
                                  setDragInvoiceId(String(inv._id))
                                  e.dataTransfer.effectAllowed = 'move'
                                }}
                                onDragEnd={() => setDragInvoiceId(null)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 34,
                                  height: 30,
                                  border: '1px solid var(--border)',
                                  borderRadius: 10,
                                  background: 'var(--bg-card)',
                                  cursor: 'grab',
                                  userSelect: 'none',
                                  fontWeight: 900,
                                  color: 'var(--text-muted)'
                                }}
                                title="Drag to change priority"
                              >
                                {idx + 1}
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>{inv.invoiceNumber}</td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>₹{formatMoney(inv.invoiceAmount)}</td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                              ₹{formatMoney((Number(inv.paidAmount) || 0) + (allocationPreview.allocationMap.get(String(inv._id)) || 0))}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'rgb(249, 115, 22)', fontWeight: 700 }}>
                              ₹{formatMoney(Math.max(0, (Number(inv.pendingAmount) || 0) - (allocationPreview.allocationMap.get(String(inv._id)) || 0)))}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--text-header)' }}>
                              ₹{formatMoney(allocationPreview.allocationMap.get(String(inv._id)) || 0)}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '999px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                ...statusStyles(inv.status)
                              }}>
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '1px solid var(--border)', background: 'rgba(59,130,246,0.08)' }}>
                        <td colSpan={5} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-header)' }}>
                          Total Pending:
                        </td>
                        <td colSpan={3} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                          ₹{formatMoney(totalPending)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div style={{
                  marginTop: '0.75rem',
                  border: '1px solid rgba(59,130,246,0.25)',
                  background: 'rgba(59,130,246,0.08)',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: 'var(--text-header)'
                }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Payment Logic:</span> Money will deduct by priority (Priority 1 first). If payment amount is more, remaining will go to Priority 2, Priority 3, etc. Allocated now ₹{formatMoney(allocationPreview.allocatedTotal)}.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                {!editingPaymentId && (
                  <MotionButton
                    type="button"
                    onClick={async () => {
                      setPaymentForm({
                        paymentNumber: '',
                        clientId: '',
                        clientType: 'Customer',
                        paymentDate: new Date().toISOString().split('T')[0],
                        amount: 0,
                        description: ''
                      })
                      setPendingInvoiceOrder([])
                      setDragInvoiceId(null)
                      setClientSearchText('')
                      setErrors({})
                      setFormSubmitted(false)
                      await fetchNextPaymentNumber()
                    }}
                    disabled={loading}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    <RotateCcw size={14} /> Reset
                  </MotionButton>
                )}
                <MotionButton
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <Save size={14} />
                  {loading ? 'Saving...' : editingPaymentId ? 'Update Payment' : 'Save Payment'}
                </MotionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {(
        <div className="card" style={{ margin: '0 auto 0', width: '100%', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1.25rem' }}>Payment List</h2>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '0.35rem 0.6rem',
              width: 'min(420px, 100%)',
              flex: '0 0 auto',
              marginLeft: 'auto'
            }}>
              <Search size={14} color="var(--text-muted)" style={{ marginRight: '0.4rem' }} />
              <input
                type="text"
                placeholder="Search by payment no or client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  width: '100%',
                  fontSize: '0.8125rem',
                  color: 'var(--text-header)'
                }}
              />
            </div>
          </div>

          {listLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading payments...</div>
          ) : payments.length === 0 ? (
            <EmptyDataCard />
          ) : (
            <div>
              {/* Mobile/Tablet Card View */}
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {payments.map((payment) => {
                    const name =
                      payment.vendorId?.customerName ||
                      payment.vendorId?.vendorName ||
                      `${payment.vendorId?.firstName || ''} ${payment.vendorId?.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
                      'Unknown'
                    const customerLabel = payment.vendorId?.id ? `${name} (${payment.vendorId.id})` : name
                    const dateLabel = new Date(payment.paymentDate).toLocaleDateString()
                    const amountLabel = `₹${formatMoney(payment.amount)}`
                    const descriptionLabel = payment.description ? String(payment.description) : '-'

                    return (
                      <div 
                        key={payment._id} 
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                          padding: '1rem',
                          background: 'var(--bg-card)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ 
                              fontSize: '1rem', 
                              fontWeight: 800, 
                              color: 'var(--text-header)',
                              marginBottom: '0.25rem'
                            }}>
                              {payment.paymentNumber || '-'}
                            </div>
                            <div style={{ 
                              fontSize: '0.875rem', 
                              color: 'var(--text-muted)',
                              fontWeight: 600
                            }}>
                              {customerLabel}
                            </div>
                          </div>
                          <div style={{ position: 'relative' }}>
                            <MotionButton
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openDropdownId === payment._id) {
                                  setOpenDropdownId(null);
                                  setDropdownPayment(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const dropdownHeight = isAdmin ? 160 : 120;
                                  const shouldOpenUp = rect.bottom + dropdownHeight > window.innerHeight;
                                  setDropdownPosition({
                                    top: shouldOpenUp ? rect.top - 4 - dropdownHeight : rect.bottom + 4,
                                    left: rect.right - 140
                                  });
                                  setDropdownUp(shouldOpenUp);
                                  setDropdownPayment(payment);
                                  setOpenDropdownId(payment._id);
                                }
                              }}
                              style={{
                                padding: '0.25rem',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                transition: 'all 0.2s'
                              }}
                              title="Actions"
                            >
                              <MoreVertical size={16} />
                            </MotionButton>

                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Date:</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600 }}>{dateLabel}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Amount:</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--danger)', fontWeight: 800 }}>{amountLabel}</div>
                          </div>
                          {descriptionLabel !== '-' && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Description:</div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600 }}>{descriptionLabel}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Desktop Table View */
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th
                          onClick={() => handleSort('paymentNumber')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Payment No {sortColumn === 'paymentNumber' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('vendorId')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Client {sortColumn === 'vendorId' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('paymentDate')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Date {sortColumn === 'paymentDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('description')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Description {sortColumn === 'description' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('amount')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Amount {sortColumn === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => {
                        const name =
                          payment.vendorId?.customerName ||
                          payment.vendorId?.vendorName ||
                          `${payment.vendorId?.firstName || ''} ${payment.vendorId?.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
                          'Unknown'
                        const customerLabel = payment.vendorId?.id ? `${name} (${payment.vendorId.id})` : name
                        const dateLabel = new Date(payment.paymentDate).toLocaleDateString()
                        const amountLabel = `₹${formatMoney(payment.amount)}`
                        const descriptionLabel = payment.description ? String(payment.description) : '-'
                        
                        return (
                          <tr key={payment._id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(payment.paymentNumber || '')}>
                              {truncateText(payment.paymentNumber || '')}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(customerLabel)}>
                              {truncateText(customerLabel)}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(dateLabel)}>
                              {truncateText(dateLabel)}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(descriptionLabel === '-' ? '' : descriptionLabel)}>
                              {descriptionLabel === '-' ? '-' : truncateText(descriptionLabel)}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={amountLabel}>
                              {amountLabel}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem' }}>
                              <div style={{ position: 'relative' }}>
                                <MotionButton
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (openDropdownId === payment._id) {
                                      setOpenDropdownId(null);
                                      setDropdownPayment(null);
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const dropdownHeight = isAdmin ? 160 : 120;
                                      const shouldOpenUp = rect.bottom + dropdownHeight > window.innerHeight;
                                      setDropdownPosition({
                                        top: shouldOpenUp ? rect.top - 4 - dropdownHeight : rect.bottom + 4,
                                        left: rect.right - 140
                                      });
                                      setDropdownUp(shouldOpenUp);
                                      setDropdownPayment(payment);
                                      setOpenDropdownId(payment._id);
                                    }
                                  }}
                                  style={{
                                    padding: '0.25rem',
                                    background: 'transparent',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    transition: 'all 0.2s'
                                  }}
                                  title="Actions"
                                >
                                  <MoreVertical size={16} />
                                </MotionButton>

                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '1.5rem',
                  flexWrap: 'wrap'
                }}>
                  <MotionButton
                    onClick={() => fetchPayments(currentPage - 1, searchQuery)}
                    disabled={currentPage === 1}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      opacity: currentPage === 1 ? 0.5 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    Previous
                  </MotionButton>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <MotionButton
                      key={page}
                      onClick={() => fetchPayments(page, searchQuery)}
                      disabled={page === currentPage}
                      style={{
                        padding: '0.5rem 1rem',
                        background: page === currentPage ? 'var(--primary)' : 'var(--bg-main)',
                        color: page === currentPage ? 'white' : 'var(--text-header)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        cursor: page === currentPage ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        fontWeight: page === currentPage ? 700 : 400
                      }}
                    >
                      {page}
                    </MotionButton>
                  ))}

                  <MotionButton
                    onClick={() => fetchPayments(currentPage + 1, searchQuery)}
                    disabled={currentPage === totalPages}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                      opacity: currentPage === totalPages ? 0.5 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    Next
                  </MotionButton>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {infoOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeInfo()
          }}
        >
          <div
            className="card"
            style={{
              width: 'min(520px, 96vw)',
              maxHeight: '88vh',
              overflow: 'auto',
              padding: '1.25rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-header)' }}>Payment Details</div>
                <div style={{ marginTop: 2, fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {infoPayment?.paymentNumber ? `Payment • ${infoPayment.paymentNumber}` : 'Payment'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MotionButton
                  type="button"
                  onClick={refreshInfo}
                  disabled={infoLoading}
                  style={{
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    borderRadius: 10,
                    padding: '0.45rem',
                    cursor: infoLoading ? 'not-allowed' : 'pointer',
                    color: 'var(--text-muted)',
                    opacity: infoLoading ? 0.6 : 1
                  }}
                  title="Refresh"
                >
                  <RotateCcw size={18} />
                </MotionButton>
                <MotionButton
                  type="button"
                  onClick={closeInfo}
                  style={{ border: '1px solid var(--border)', background: 'transparent', borderRadius: 10, padding: '0.45rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                  title="Close"
                >
                  <X size={18} />
                </MotionButton>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              {/* Client Details */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.75rem' }}>Client Details</div>
                <div style={{ background: 'var(--bg-main)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {(() => {
                      const client = infoPayment?.vendorId;
                      const paymentDate = infoPayment?.paymentDate ? new Date(infoPayment.paymentDate).toLocaleDateString() : '-';
                      const description = infoPayment?.description || '-';

                      return (
                        <>
                          {client?.customerName && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Name</span>
                              <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>{client.customerName}</span>
                            </div>
                          )}
                          {client?.vendorName && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Name</span>
                              <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>{client.vendorName}</span>
                            </div>
                          )}
                          {client?.id && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Client ID</span>
                              <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>{client.id}</span>
                            </div>
                          )}
                          {infoPayment?.clientType && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Type</span>
                              <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem', textTransform: 'capitalize' }}>{infoPayment.clientType}</span>
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Payment Date</span>
                            <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>{paymentDate}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Description</span>
                            <span style={{ color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>{description}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>Amount</span>
                            <span style={{ color: 'var(--danger)', fontWeight: 900, fontSize: '0.95rem' }}>
                              ₹{infoPayment?.amount ? infoPayment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                            </span>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              </div>

              {/* Allocations (Invoice Items) Table */}
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.75rem' }}>Invoice Allocations</div>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-main)' }}>
                        <th style={{ textAlign: 'left', padding: '0.75rem', color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>Invoice No</th>
                        <th style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>Invoice Amount</th>
                        <th style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>Paid Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const allocations = infoPayment?.allocations || [];
                        let totalPaidAmount = 0;
                        allocations.forEach(alloc => totalPaidAmount += alloc.amount || 0);

                        return (
                          <>
                            {allocations.length === 0 ? (
                              <tr>
                                <td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No invoice allocations found</td>
                              </tr>
                            ) : (
                              <>
                                {allocations.map((alloc, idx) => (
                                  <tr key={idx} style={{ borderBottom: idx < allocations.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                    <td style={{ padding: '0.75rem', color: 'var(--text-main)', fontSize: '0.875rem' }}>
                                      {alloc.invoiceId?.invoiceNumber || 'Unknown Invoice'}
                                    </td>
                                    <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-main)', fontSize: '0.875rem' }}>
                                      ₹{alloc.invoiceId?.totalAmount ? alloc.invoiceId.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                                    </td>
                                    <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-main)', fontSize: '0.875rem' }}>
                                      ₹{alloc.amount ? alloc.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                                    </td>
                                  </tr>
                                ))}
                                <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-main)' }}>
                                  <td style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-header)', fontWeight: 800, fontSize: '0.9rem' }}>Total</td>
                                  <td style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--text-header)', fontWeight: 800, fontSize: '0.9rem' }}></td>
                                  <td style={{ textAlign: 'right', padding: '0.75rem', color: 'var(--danger)', fontWeight: 900, fontSize: '0.95rem' }}>
                                    ₹{totalPaidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              </>
                            )}
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown Menu */}
      {openDropdownId && dropdownPayment && (
        <div 
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 99999,
            minWidth: '140px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MotionButton
            onClick={(e) => {
              e.stopPropagation();
              setInfoPayment(dropdownPayment);
              setInfoOpen(true);
              setOpenDropdownId(null);
              setDropdownPayment(null);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '0.375rem 0.75rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-header)',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <Eye size={14} />
            View
          </MotionButton>
          <MotionButton
            onClick={(e) => {
              e.stopPropagation();
              handleEditPayment(dropdownPayment);
              setOpenDropdownId(null);
              setDropdownPayment(null);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '0.375rem 0.75rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-header)',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <Edit2 size={14} />
            Edit
          </MotionButton>
          <MotionButton
            onClick={(e) => {
              e.stopPropagation();
              alert('PDF feature coming soon!');
              setOpenDropdownId(null);
              setDropdownPayment(null);
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '0.375rem 0.75rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-header)',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <span>📄</span>
            PDF
          </MotionButton>
          {isAdmin && (
            <MotionButton
              onClick={(e) => {
                e.stopPropagation();
                handleDeletePayment(dropdownPayment._id);
                setOpenDropdownId(null);
                setDropdownPayment(null);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.375rem 0.75rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--danger)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <Trash2 size={14} />
              Delete
            </MotionButton>
          )}
        </div>
      )}
    </div>
  );
}

export default Payment
