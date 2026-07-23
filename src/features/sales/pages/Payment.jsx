import React, { useEffect, useMemo, useState, useRef } from 'react'
import { Save, RotateCcw, Trash2, Edit2, X, Search, Info, Eye, MoreVertical, FileText, Image as ImageIcon, MoreHorizontal, Download, UploadCloud } from 'lucide-react'
import EmptyDataCard from '../../../components/EmptyDataCard'
import { clearAuthSession, getAuthToken, getAuthValue } from '../../../utils/authStorage'
import { readJsonResponse } from '../../../utils/api'
import { parseCsvText, parseCsvData, getSuggestedCsvHeader, toIsoDateString } from '../../../utils/csvParser'
import MotionButton from '../../../components/MotionButton'
import ActionMenuPortal from '../../../components/ActionMenuPortal'
import { getActionDropdownPosition } from '../../../utils/dropdownPosition'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { handleApiError, showSuccessToast, showErrorToast } from '../../../utils/toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const API_URL = `${API_BASE_URL}/api/payments`
const CUSTOMERS_API_URL = `${API_BASE_URL}/api/customers`
const VENDORS_API_URL = `${API_BASE_URL}/api/vendors`
const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024
const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf'
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf'
])
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf'])
const CSV_IMPORT_MAX_SIZE_BYTES = 5 * 1024 * 1024

const isAllowedAttachmentFile = (file) => {
  const fileType = String(file?.type || '').toLowerCase()
  if (ALLOWED_ATTACHMENT_MIME_TYPES.has(fileType)) return true

  const fileName = String(file?.name || '')
  const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : ''
  return ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)
}

const getAttachmentMimeType = (attachment) => {
  const fileType = String(attachment?.type || '').toLowerCase()
  if (fileType) return fileType

  const dataUrl = String(attachment?.dataUrl || '')
  const mimeMatch = dataUrl.match(/^data:([^;]+);/i)
  return String(mimeMatch?.[1] || '').toLowerCase()
}

const isImageAttachment = (attachment) => getAttachmentMimeType(attachment).startsWith('image/')

const isPdfAttachment = (attachment) => getAttachmentMimeType(attachment) === 'application/pdf'

const getAttachmentMenuItems = (attachments = []) => {
  let imageIndex = 0
  let pdfIndex = 0
  let attachmentIndex = 0

  return attachments
    .filter((attachment) => attachment?.dataUrl)
    .map((attachment) => {
      if (isImageAttachment(attachment)) {
        imageIndex += 1
        return { attachment, label: `Image ${imageIndex}` }
      }

      if (isPdfAttachment(attachment)) {
        pdfIndex += 1
        return { attachment, label: `PDF ${pdfIndex}` }
      }

      attachmentIndex += 1
      return { attachment, label: `Attachment ${attachmentIndex}` }
    })
}

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
    description: '',
    attachments: []
  })
  const [isPaymentAmountManuallyEdited, setIsPaymentAmountManuallyEdited] = useState(false)

  const [errors, setErrors] = useState({})
  const [formSubmitted, setFormSubmitted] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [isAttachmentDragging, setIsAttachmentDragging] = useState(false)
  const [editingPaymentId, setEditingPaymentId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvImportError, setCsvImportError] = useState('')
  const [csvImportFileName, setCsvImportFileName] = useState('')
  const [csvHeaders, setCsvHeaders] = useState([])
  const [csvDataRows, setCsvDataRows] = useState([])
  const [csvPreviewRows, setCsvPreviewRows] = useState([])
  const [csvFieldMapping, setCsvFieldMapping] = useState({ paymentNumber: '', paymentDate: '', amount: '', description: '' })
  const [csvClientSearchText, setCsvClientSearchText] = useState('')
  const [csvSelectedClientId, setCsvSelectedClientId] = useState('')
  const [csvSelectedClientName, setCsvSelectedClientName] = useState('')
  const [isCsvClientDropdownOpen, setIsCsvClientDropdownOpen] = useState(false)

  const [customers, setCustomers] = useState([])
  const [vendors, setVendors] = useState([])
  const [clientSearchText, setClientSearchText] = useState('')
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false)

  const [pendingInvoices, setPendingInvoices] = useState([])
  const [totalPending, setTotalPending] = useState(0)
  const [availableCredit, setAvailableCredit] = useState(0)
  const [pendingInvoiceOrder, setPendingInvoiceOrder] = useState([])
  const [invoiceSearchText, setInvoiceSearchText] = useState('')
  const [invoiceInput, setInvoiceInput] = useState('')
  const [invoiceInputFocused, setInvoiceInputFocused] = useState(false)
  const [isInvoiceDropdownOpen, setIsInvoiceDropdownOpen] = useState(false)
  const [autoAllocateOnSelect, setAutoAllocateOnSelect] = useState(false)
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([])
  const [invoicePaymentAmounts, setInvoicePaymentAmounts] = useState({})
  const [invoiceDescriptions, setInvoiceDescriptions] = useState({})

  const [payments, setPayments] = useState([])
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([])
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
  const [attachmentsMenuOpen, setAttachmentsMenuOpen] = useState(false)
  const dropdownRef = useRef(null)
  const attachmentInputRef = useRef(null)
  const csvImportInputRef = useRef(null)
  const [companySettings, setCompanySettings] = useState({
    companyName: '',
    companyAddress: '',
    companyEmail: '',
    companyContactNumber: '',
    bankDetails: {
      bankName: '',
      bankAddress: '',
      accountNumber: '',
      ifscCode: ''
    }
  })
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null)
  const [pdfFileName, setPdfFileName] = useState('payment.pdf')
  const [attachmentViewerOpen, setAttachmentViewerOpen] = useState(false)
  const [selectedAttachment, setSelectedAttachment] = useState(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdownId && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdownId(null);
        setDropdownPayment(null);
        setAttachmentsMenuOpen(false)
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

  const formatDateDDMMMYYYY = (value) => {
    const d = value ? new Date(value) : null
    if (!d || Number.isNaN(d.getTime())) return '-'
    const day = String(d.getDate()).padStart(2, '0')
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = monthNames[d.getMonth()]
    const year = d.getFullYear()
    return `${day}-${month}-${year}`
  }

  const formatFileSize = (sizeBytes) => {
    const size = Number(sizeBytes || 0)
    if (!size || Number.isNaN(size)) return '-'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`
    return `${(size / (1024 * 1024)).toFixed(2)} MB`
  }

  const allClients = useMemo(() => [
    ...customers.map(c => ({
      ...c,
      type: 'Customer',
      name: c.customerName,
      displayName: c.customerName ? (c.companyName ? `${c.customerName} - ${c.companyName}` : c.customerName) : (c.companyName || '')
    }))
  ], [customers])

  const filteredClients = useMemo(() => {
    const q = clientSearchText.trim().toLowerCase()
    if (!q) return []
    return allClients.filter(c =>
      (c.displayName || '').toLowerCase().includes(q) || String(c.id || '').toLowerCase().includes(q)
    )
  }, [allClients, clientSearchText])

  const filteredCsvClients = useMemo(() => {
    const q = csvClientSearchText.trim().toLowerCase()
    if (!q) return allClients.slice(0, 20)
    return allClients.filter(c =>
      (c.displayName || '').toLowerCase().includes(q) || String(c.id || '').toLowerCase().includes(q)
    )
  }, [allClients, csvClientSearchText])

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

  const parseInvoiceTokens = (text) => String(text || '').split(/[;,\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
  const parseInvoiceRawTokens = (text) => String(text || '').split(/[;,\s]+/).map(t => t.trim()).filter(Boolean)

  const getInvoiceInputFragment = (value) => {
    const input = String(value || '')
    if (/[;,\s]$/.test(input)) return ''
    const parts = input.split(/[;,\s]+/)
    return String(parts.pop() || '').trim()
  }

  const getInvoiceInputSelectedTokens = (value) => {
    const input = String(value || '')
    const tokens = parseInvoiceRawTokens(input)
    if (/[;,\s]$/.test(input)) return tokens
    return tokens.slice(0, -1)
  }

  const buildInvoiceInputValue = (selectedTokens, fragment) => {
    const tokens = (Array.isArray(selectedTokens) ? selectedTokens : []).filter(Boolean)
    if (!tokens.length) return String(fragment || '')
    if (!String(fragment || '').trim()) return `${tokens.join(', ')}, `
    return `${tokens.join(', ')}, ${fragment}`
  }

  const invoiceInputParts = useMemo(() => {
    const selectedTokens = getInvoiceInputSelectedTokens(invoiceInput)
    const fragment = getInvoiceInputFragment(invoiceInput)
    return { selectedTokens, fragment }
  }, [invoiceInput])

  const filteredPendingInvoices = useMemo(() => {
    const tokens = parseInvoiceTokens(invoiceInput)
    if (tokens.length === 0) return orderedPendingInvoices
    return orderedPendingInvoices.filter((inv) => {
      const invoiceNumber = String(inv.invoiceNumber || '').toLowerCase()
      return tokens.some(t => invoiceNumber.includes(t))
    })
  }, [invoiceInput, orderedPendingInvoices])

  const invoiceSuggestions = useMemo(() => {
    const last = String(invoiceInputParts.fragment || '').trim().toLowerCase()
    if (!last) return []
    return orderedPendingInvoices.filter((inv) => String(inv.invoiceNumber || '').toLowerCase().includes(last)).slice(0, 10)
  }, [invoiceInputParts.fragment, orderedPendingInvoices])

  const selectedInvoiceSet = useMemo(() => new Set(parseInvoiceTokens(invoiceInput)), [invoiceInput])

  const selectedInvoiceIdSet = useMemo(() => new Set((selectedInvoiceIds || []).map((id) => String(id))), [selectedInvoiceIds])

  const selectedAllocations = useMemo(() => {
    const rows = []
    for (const inv of orderedPendingInvoices) {
      const id = String(inv._id)
      if (!selectedInvoiceIdSet.has(id)) continue
      const enteredAmount = Number(invoicePaymentAmounts[id])
      if (!(enteredAmount > 0)) continue
      const description = String(invoiceDescriptions[id] ?? '').trim()
      rows.push({
        invoiceId: id,
        amount: Math.round((enteredAmount + Number.EPSILON) * 100) / 100,
        description
      })
    }
    return rows
  }, [orderedPendingInvoices, selectedInvoiceIdSet, invoicePaymentAmounts, invoiceDescriptions])

  const selectedAllocationTotal = useMemo(() => {
    return selectedAllocations.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  }, [selectedAllocations])

  const billPaymentAmount = Math.round((selectedAllocationTotal + Number.EPSILON) * 100) / 100
  const netAmountToPay = Math.max(0, Math.round((billPaymentAmount - (Number(availableCredit) || 0) + Number.EPSILON) * 100) / 100)
  const adjustedBillPaymentAmount = netAmountToPay
  const enteredPaymentAmount = Math.max(0, Number(paymentForm.amount) || 0)
  const outstandingAmount = Math.round((enteredPaymentAmount - adjustedBillPaymentAmount + Number.EPSILON) * 100) / 100

  const handleInvoiceSelectionToggle = (invoiceId, checked, pendingAmount, defaultDescription = '') => {
    const id = String(invoiceId)
    setSelectedInvoiceIds((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev
        return [...prev, id]
      }
      return prev.filter((x) => x !== id)
    })

    setInvoicePaymentAmounts((prev) => {
      const next = { ...prev }
      if (checked) {
        if (!(Number(next[id]) > 0)) {
          const normalizedPending = Math.max(0, Number(pendingAmount) || 0)
          next[id] = normalizedPending ? String(normalizedPending) : ''
        }
      } else {
        delete next[id]
      }
      return next
    })

    setInvoiceDescriptions((prev) => {
      const next = { ...prev }
      if (checked) {
        if (next[id] === undefined) {
          next[id] = String(defaultDescription || '')
        }
      } else {
        delete next[id]
      }
      return next
    })

    if (formSubmitted && (errors.allocations || errors.amount || errors.allocationDescription)) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next.allocations
        delete next.amount
        delete next.allocationDescription
        return next
      })
    }
  }

  const handleInvoicePaymentAmountChange = (invoiceId, value) => {
    const id = String(invoiceId)
    const sanitized = String(value || '').replace(/[^0-9.]/g, '')
    const dotCount = (sanitized.match(/\./g) || []).length
    const normalized = dotCount > 1
      ? sanitized.split('.').slice(0, 2).join('.')
      : sanitized
    setInvoicePaymentAmounts((prev) => ({ ...prev, [id]: normalized }))

    if (formSubmitted && (errors.allocations || errors.amount || errors.allocationDescription)) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next.allocations
        delete next.amount
        delete next.allocationDescription
        return next
      })
    }
  }

  const handleInvoiceDescriptionChange = (invoiceId, value) => {
    const id = String(invoiceId)
    const nextValue = String(value || '').slice(0, 250)
    setInvoiceDescriptions((prev) => ({ ...prev, [id]: nextValue }))

    if (formSubmitted && (errors.allocations || errors.allocationDescription)) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next.allocations
        delete next.allocationDescription
        return next
      })
    }
  }



  const fetchNextPaymentNumber = async () => {
    try {
      const response = await fetch(`${API_URL}/next-number`)
      const data = await readJsonResponse(response, 'Error fetching next payment number')
      setPaymentForm(prev => ({ ...prev, paymentNumber: data.nextNumber }))
    } catch (err) {
      handleApiError(err, 'Error fetching next payment number')
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
      handleApiError(err, 'Error fetching vendors')
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
      setAvailableCredit(Math.max(0, Number(data.availableCredit) || 0))
    } catch (err) {
      console.error('Error fetching pending invoices:', err)
      setPendingInvoices([])
      setTotalPending(0)
      setAvailableCredit(0)
    }
  }

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/company-settings`)
        if (res.ok) {
          const data = await res.json()
          setCompanySettings(data.settings)
        }
      } catch (err) {
        console.error('Error fetching company settings:', err)
      }
    }
    fetchSettings()
  }, [])

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
      setAvailableCredit(0)
      setSelectedInvoiceIds([])
      setInvoicePaymentAmounts({})
      setInvoiceDescriptions({})
      return
    }
    fetchPendingInvoices(paymentForm.clientId, paymentForm.clientType, editingPaymentId)
  }, [paymentForm.clientId, paymentForm.clientType, editingPaymentId])

  useEffect(() => {
    const validIds = new Set((pendingInvoices || []).map((inv) => String(inv._id)))
    setSelectedInvoiceIds((prev) => prev.filter((id) => validIds.has(String(id))))
    setInvoicePaymentAmounts((prev) => {
      const next = {}
      for (const [id, value] of Object.entries(prev || {})) {
        if (validIds.has(String(id))) next[id] = value
      }
      return next
    })
    setInvoiceDescriptions((prev) => {
      const next = {}
      for (const [id, value] of Object.entries(prev || {})) {
        if (validIds.has(String(id))) next[id] = value
      }
      return next
    })
  }, [pendingInvoices])

  useEffect(() => {
    if (isPaymentAmountManuallyEdited) return
    const nextAmount = netAmountToPay
    if ((Number(paymentForm.amount) || 0) === nextAmount) return
    setPaymentForm((prev) => ({ ...prev, amount: nextAmount }))
  }, [netAmountToPay, isPaymentAmountManuallyEdited, paymentForm.amount])

  const validateForm = () => {
    const newErrors = {}

    if (!paymentForm.clientId) newErrors.clientId = 'Please select a client'
    if (!paymentForm.paymentDate) newErrors.paymentDate = 'Payment date is required'
    const amount = Number(paymentForm.amount) || 0
    if (!(amount > 0)) {
      newErrors.amount = 'Payment amount must be greater than 0'
    } else {
      const roundedAmount = Math.round((amount + Number.EPSILON) * 100) / 100
      const minimumRequiredAmount = netAmountToPay
      if (roundedAmount < minimumRequiredAmount) {
        newErrors.amount = 'Payment amount cannot be less than adjusted bill amount after available credit'
      }
    }

    const pendingById = new Map(orderedPendingInvoices.map((inv) => [String(inv._id), inv]))
    const selectedIds = Array.from(selectedInvoiceIdSet)
    if (selectedIds.length === 0) {
      newErrors.allocations = 'Select at least one invoice'
    } else {
      for (const invoiceId of selectedIds) {
        const inv = pendingById.get(String(invoiceId))
        if (!inv) {
          newErrors.allocations = 'One or more selected invoices are no longer available'
          break
        }
        const enteredAmount = Number(invoicePaymentAmounts[String(invoiceId)])
        const pendingAmount = Math.max(0, Number(inv.pendingAmount) || 0)
        const rowDescription = String(invoiceDescriptions[String(invoiceId)] || '').trim()
        if (!(enteredAmount > 0)) {
          newErrors.allocations = `Enter payment amount for invoice ${inv.invoiceNumber}`
          break
        }
        if (enteredAmount > pendingAmount) {
          newErrors.allocations = `Payment amount cannot exceed balance for invoice ${inv.invoiceNumber}`
          break
        }
        if (!rowDescription) {
          newErrors.allocationDescription = `Enter description for invoice ${inv.invoiceNumber}`
          break
        }
      }
    }

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
        amount: Math.round(((Number(paymentForm.amount) || 0) + Number.EPSILON) * 100) / 100,
        description: paymentForm.description || '',
        attachments: Array.isArray(paymentForm.attachments) ? paymentForm.attachments : [],
        invoiceOrder: orderedPendingInvoices.map((inv) => String(inv._id)),
        allocations: selectedAllocations
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

      showSuccessToast(editingPaymentId ? 'Payment updated successfully!' : 'Payment created successfully!');

      setEditingPaymentId(null)
      setPaymentForm({
        paymentNumber: '',
        clientId: '',
        clientType: 'Customer',
        paymentDate: new Date().toISOString().split('T')[0],
        amount: 0,
        description: '',
        attachments: []
      })
      setIsPaymentAmountManuallyEdited(false)
      setPendingInvoiceOrder([])
      setSelectedInvoiceIds([])
      setInvoicePaymentAmounts({})
      setInvoiceDescriptions({})
      setClientSearchText('')
      setInvoiceSearchText('')
      setInvoiceInput('')
      setAttachmentError('')
      setErrors({})
      setFormSubmitted(false)
      setFormOpen(false)

      // Fetch latest data in background, don't fail if this errors
      try {
        await fetchNextPaymentNumber()
        await fetchPayments(1, searchQuery)
      } catch (fetchErr) {
        // Silent fail for background refresh - user has already seen success message
        console.error('Error refreshing payment list:', fetchErr)
      }
    } catch (err) {
      handleApiError(err, 'Error saving payment')
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
      description: '',
      attachments: []
    })
    setIsPaymentAmountManuallyEdited(false)
    setPendingInvoiceOrder([])
    setSelectedInvoiceIds([])
    setInvoicePaymentAmounts({})
    setInvoiceDescriptions({})
    setClientSearchText('')
    setInvoiceSearchText('')
    setInvoiceInput('')
    setAttachmentError('')
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
      const companyName = client?.companyName || ''

      setPaymentForm({
        paymentNumber: data.paymentNumber,
        clientId: clientId,
        clientType: clientType,
        paymentDate: new Date(data.paymentDate).toISOString().split('T')[0],
        amount: data.amount || 0,
        description: data.description || '',
        attachments: Array.isArray(data.attachments) ? data.attachments : []
      })
      setIsPaymentAmountManuallyEdited(true)
      setClientSearchText(clientName ? (companyName ? `${clientName} - ${companyName}` : clientName) : '')
      const allocs = Array.isArray(data.allocations) ? data.allocations : []
      const nextSelectedIds = []
      const nextAmounts = {}
      const nextDescriptions = {}
      for (const row of allocs) {
        const id = String(row?.invoiceId?._id || row?.invoiceId || '').trim()
        const amount = Number(row?.amount)
        if (!id || !(amount > 0)) continue
        if (!nextSelectedIds.includes(id)) nextSelectedIds.push(id)
        nextAmounts[id] = String(amount)
        nextDescriptions[id] = String(row?.description || '')
      }
      setSelectedInvoiceIds(nextSelectedIds)
      setInvoicePaymentAmounts(nextAmounts)
      setInvoiceDescriptions(nextDescriptions)
      setEditingPaymentId(data._id)
      setErrors({})
      setFormSubmitted(false)
      setFormOpen(true)
    } catch (err) {
      handleApiError(err, 'Error loading payment')
      // alert removed - using toast instead
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
      description: '',
      attachments: []
    })
    setIsPaymentAmountManuallyEdited(false)
    setPendingInvoiceOrder([])
    setSelectedInvoiceIds([])
    setInvoicePaymentAmounts({})
    setInvoiceDescriptions({})
    setClientSearchText('')
    setInvoiceSearchText('')
    setInvoiceInput('')
    setIsClientDropdownOpen(false)
    setAttachmentError('')
    setErrors({})
    setFormSubmitted(false)
    await fetchNextPaymentNumber()
    setFormOpen(true)
  }

  const handleAttachmentChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const currentAttachments = Array.isArray(paymentForm.attachments) ? paymentForm.attachments : []
    const remainingSlots = Math.max(0, 5 - currentAttachments.length)

    if (remainingSlots === 0) {
      setAttachmentError('You can upload up to 5 files only.')
      event.target.value = ''
      return
    }

    const supportedFiles = files.filter(isAllowedAttachmentFile)
    const sizeAllowedFiles = supportedFiles.filter((file) => Number(file?.size || 0) <= MAX_ATTACHMENT_SIZE_BYTES)
    const selectedFiles = sizeAllowedFiles.slice(0, remainingSlots)
    const hasUnsupportedFiles = supportedFiles.length !== files.length
    const hasOversizedFiles = sizeAllowedFiles.length !== supportedFiles.length

    if (selectedFiles.length === 0) {
      const blockingMessages = []
      if (hasUnsupportedFiles) {
        blockingMessages.push('Only JPEG, JPG, PNG, GIF, WebP, SVG, and PDF files are supported.')
      }
      if (hasOversizedFiles) {
        blockingMessages.push('Each uploaded file must be 25 MB or smaller.')
      }
      setAttachmentError(blockingMessages.join(' ') || 'No valid files were selected.')
      event.target.value = ''
      return
    }

    const errorMessages = []
    if (hasUnsupportedFiles) {
      errorMessages.push('Only JPEG, JPG, PNG, GIF, WebP, SVG, and PDF files are supported.')
    }
    if (hasOversizedFiles) {
      errorMessages.push('Each uploaded file must be 25 MB or smaller.')
    }
    if (sizeAllowedFiles.length > remainingSlots) {
      errorMessages.push('Only 5 files are allowed. Extra files were ignored.')
    }
    setAttachmentError(errorMessages.join(' '))

    const toDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || '') })
      reader.onerror = () => reject(new Error(`Unable to read file ${file.name}`))
      reader.readAsDataURL(file)
    })

    try {
      const attachments = await Promise.all(selectedFiles.map(toDataUrl))
      setPaymentForm(prev => ({
        ...prev,
        attachments: [...(Array.isArray(prev.attachments) ? prev.attachments : []), ...attachments]
      }))
    } catch (err) {
      console.error('Error reading attachment files:', err)
      setAttachmentError('Could not read one or more photos.')
    } finally {
      event.target.value = ''
    }
  }

  const handleAttachmentDrop = async (event) => {
    event.preventDefault()
    setIsAttachmentDragging(false)
    const files = Array.from(event.dataTransfer?.files || [])
    if (files.length === 0) return

    const currentAttachments = Array.isArray(paymentForm.attachments) ? paymentForm.attachments : []
    const remainingSlots = Math.max(0, 5 - currentAttachments.length)

    if (remainingSlots === 0) {
      setAttachmentError('You can upload up to 5 files only.')
      return
    }

    const supportedFiles = files.filter(isAllowedAttachmentFile)
    const sizeAllowedFiles = supportedFiles.filter((file) => Number(file?.size || 0) <= MAX_ATTACHMENT_SIZE_BYTES)
    const selectedFiles = sizeAllowedFiles.slice(0, remainingSlots)
    const hasUnsupportedFiles = supportedFiles.length !== files.length
    const hasOversizedFiles = sizeAllowedFiles.length !== supportedFiles.length

    if (selectedFiles.length === 0) {
      const blockingMessages = []
      if (hasUnsupportedFiles) {
        blockingMessages.push('Only JPEG, JPG, PNG, GIF, WebP, SVG, and PDF files are supported.')
      }
      if (hasOversizedFiles) {
        blockingMessages.push('Each uploaded file must be 25 MB or smaller.')
      }
      setAttachmentError(blockingMessages.join(' ') || 'No valid files were selected.')
      return
    }

    const errorMessages = []
    if (hasUnsupportedFiles) {
      errorMessages.push('Only JPEG, JPG, PNG, GIF, WebP, SVG, and PDF files are supported.')
    }
    if (hasOversizedFiles) {
      errorMessages.push('Each uploaded file must be 25 MB or smaller.')
    }
    if (sizeAllowedFiles.length > remainingSlots) {
      errorMessages.push('Only 5 files are allowed. Extra files were ignored.')
    }
    setAttachmentError(errorMessages.join(' '))

    const toDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result || '') })
      reader.onerror = () => reject(new Error(`Unable to read file ${file.name}`))
      reader.readAsDataURL(file)
    })

    try {
      const attachments = await Promise.all(selectedFiles.map(toDataUrl))
      setPaymentForm(prev => ({
        ...prev,
        attachments: [...(Array.isArray(prev.attachments) ? prev.attachments : []), ...attachments]
      }))
    } catch (err) {
      console.error('Error reading attachment files:', err)
      setAttachmentError('Could not read one or more photos.')
    }
  }

  const handleAttachmentDragOver = (event) => {
    event.preventDefault()
    if (!loading) setIsAttachmentDragging(true)
  }

  const handleAttachmentDragLeave = (event) => {
    event.preventDefault()
    setIsAttachmentDragging(false)
  }

  const removeAttachment = (index) => {
    setPaymentForm(prev => ({
      ...prev,
      attachments: (Array.isArray(prev.attachments) ? prev.attachments : []).filter((_, i) => i !== index)
    }))
    setAttachmentError('')
  }

  const closePaymentForm = () => {
    if (loading) return
    setFormOpen(false)
  }

  const togglePaymentSelection = (id) => {
    setSelectedPaymentIds(prev => {
      if (prev.includes(id)) {
        return prev.filter((selectedId) => selectedId !== id)
      }
      return [...prev, id]
    })
  }

  const toggleSelectAllVisiblePayments = () => {
    const visibleIds = payments.map((payment) => payment._id)
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedPaymentIds.includes(id))
    if (allVisibleSelected) {
      setSelectedPaymentIds(prev => prev.filter((id) => !visibleIds.includes(id)))
    } else {
      setSelectedPaymentIds(prev => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  const handleBulkDeletePayments = async () => {
    if (selectedPaymentIds.length === 0) return
    if (!window.confirm(`Delete ${selectedPaymentIds.length} selected payment(s)?`)) return

    try {
      const token = getAuthToken()
      if (!token) {
        showErrorToast('Please login again.')
        return
      }

      const response = await fetch(`${API_URL}/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selectedPaymentIds })
      })

      if (!response.ok) {
        if (response.status === 401) {
          clearAuthSession()
          showErrorToast('Session expired. Please login again.')
          window.location.href = '/login'
          return
        }
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.message || 'Error deleting selected payments')
      }

      setSelectedPaymentIds([])
      await fetchPayments(Math.max(1, currentPage), searchQuery, sortColumn, sortOrder)
      if (paymentForm.clientId) {
        await fetchPendingInvoices(paymentForm.clientId, paymentForm.clientType, editingPaymentId)
      }
      showSuccessToast(`Deleted ${selectedPaymentIds.length} payment(s) successfully.`)
    } catch (err) {
      console.error('Error deleting selected payments:', err)
      alert(err.message || 'Error deleting selected payments!')
    }
  }

  const handleDeletePayment = async (id) => {
    if (!window.confirm('Are you sure you want to delete this payment?')) return
    try {
      const token = getAuthToken()
      if (!token) {
        showErrorToast('Please login again.')
        return
      }
      const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) {
        if (response.status === 401) {
          clearAuthSession()
          showErrorToast('Session expired. Please login again.')
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
      setSelectedPaymentIds(prev => prev.filter((selectedId) => selectedId !== id))

      const nextPage = payments.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage
      await fetchPayments(nextPage, searchQuery)
      if (paymentForm.clientId) {
        await fetchPendingInvoices(paymentForm.clientId, paymentForm.clientType, editingPaymentId)
      }
      showSuccessToast('Payment deleted successfully!')
    } catch (err) {
      console.error('Error deleting payment:', err)
      alert(err.message || 'Error deleting payment!')
    }
  }

  const generatePaymentPDF = (payment) => {
    const doc = new jsPDF({
      unit: 'mm',
      format: 'a4',
      compress: true
    })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const marginLeft = 15
    const marginRight = 15
    let y = 20

    // --- Header ---
    doc.setLineWidth(0.5)
    doc.setDrawColor(0, 0, 0) // Black border
    doc.setFillColor(255, 255, 255)
    doc.setTextColor(0, 0, 0)

    // --- Top Section (Company Info & Logo) ---
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('PAYMENT', marginLeft, y)

    // Company Info (Left)
    y += 8
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(companySettings.companyName || 'Company Name', marginLeft, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.text(companySettings.companyAddress || 'Company Address', marginLeft, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.text(companySettings.companyEmail || 'Email', marginLeft, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.text(companySettings.companyContactNumber || 'Contact No', marginLeft, y)

    // Logo Placeholder (Right)
    const logoX = pageWidth - marginRight - 50
    doc.setLineWidth(0.5)
    doc.setDrawColor(0, 0, 0)
    doc.rect(logoX, 20, 50, 30) // Logo box
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Company', logoX + 25, 32, { align: 'center' })
    doc.text('Logo', logoX + 25, 42, { align: 'center' })

    // --- Bill To Section ---
    y = 65
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Bill To:', marginLeft, y)
    y += 6
    const client = payment.vendorId
    const isCustomer = client?.customerName

    const rightColX = pageWidth - marginRight - 80
    // Client Name
    doc.setFont('helvetica', 'bold')
    doc.text('Name:', marginLeft, y)
    doc.setFont('helvetica', 'normal')
    doc.text(isCustomer ? client.customerName : (client?.vendorName || 'N/A'), marginLeft + 20, y)

    // Email in the same row on the right
    if (isCustomer && client.email || !isCustomer && client?.email) {
      doc.setFont('helvetica', 'bold')
      doc.text('Email:', rightColX, y)
      doc.setFont('helvetica', 'normal')
      doc.text(isCustomer ? client.email : (client?.email || ''), rightColX + 15, y)
    }
    y += 5

    if (isCustomer) {
      // Display customer details with bold titles
      let hasCompanyOrPhone = false
      if (client.companyName) {
        doc.setFont('helvetica', 'bold')
        doc.text('Company:', marginLeft, y)
        doc.setFont('helvetica', 'normal')
        doc.text(client.companyName, marginLeft + 20, y)
        hasCompanyOrPhone = true
      }
      if (client.contactNumber) {
        doc.setFont('helvetica', 'bold')
        doc.text('Phone:', rightColX, y)
        doc.setFont('helvetica', 'normal')
        doc.text(client.contactNumber, rightColX + 15, y)
        hasCompanyOrPhone = true
      }
      if (hasCompanyOrPhone) y += 5

      if (client.address) {
        doc.setFont('helvetica', 'bold')
        doc.text('Address:', marginLeft, y)
        doc.setFont('helvetica', 'normal')
        doc.text(client.address, marginLeft + 20, y)
        y += 5
      }

      if (client.alternateNumber) {
        doc.setFont('helvetica', 'bold')
        doc.text('Alt:', marginLeft, y)
        doc.setFont('helvetica', 'normal')
        doc.text(client.alternateNumber, marginLeft + 10, y)
        y += 5
      }
    } else {
      // Display vendor details with bold titles
      let hasCompanyOrPhone = false
      if (client?.companyName) {
        doc.setFont('helvetica', 'bold')
        doc.text('Company:', marginLeft, y)
        doc.setFont('helvetica', 'normal')
        doc.text(client.companyName, marginLeft + 20, y)
        hasCompanyOrPhone = true
      }
      if (client?.contactNumber) {
        doc.setFont('helvetica', 'bold')
        doc.text('Phone:', rightColX, y)
        doc.setFont('helvetica', 'normal')
        doc.text(client.contactNumber, rightColX + 10, y)
        hasCompanyOrPhone = true
      }
      if (hasCompanyOrPhone) y += 5

      if (client?.address) {
        doc.setFont('helvetica', 'bold')
        doc.text('Address:', marginLeft, y)
        doc.setFont('helvetica', 'normal')
        doc.text(client.address, marginLeft + 20, y)
        y += 5
      }
    }

    // --- Payment Details ---
    y += 5 // Add space before payment details
    doc.setLineWidth(0.3)
    doc.setDrawColor(150, 150, 150)
    doc.line(marginLeft, y, pageWidth - marginRight, y)
    y += 8
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Payment Details', marginLeft, y)

    const paymentNo = payment.paymentNumber || 'SP00001'
    const formatDate = (dateStr) => {
      const date = new Date(dateStr)
      const day = String(date.getDate()).padStart(2, '0')
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const month = monthNames[date.getMonth()]
      const year = date.getFullYear()
      return `${day}-${month}-${year}`
    }

    const paymentDate = payment.paymentDate
      ? formatDate(payment.paymentDate)
      : '05-Nov-2026'

    // Payment No
    doc.setFont('helvetica', 'bold')
    doc.text('Payment No:', marginLeft, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.text(paymentNo, marginLeft + 25, y + 6)

    // Payment Date on next line
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.text('Payment Date:', marginLeft, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.text(paymentDate, marginLeft + 25, y + 6)

    // --- Allocations Table ---
    y += 15
    const allocations = payment.allocations || []
    const tableData = allocations.map((alloc, idx) => [
      idx + 1,
      alloc.invoiceNumber || '-',
      (alloc.invoiceDate ? formatDate(alloc.invoiceDate) : '-'),
      `${(parseFloat(alloc.amount) || 0).toLocaleString('en-IN')}/-`
    ])

    autoTable(doc, {
      startY: y,
      head: [['Sr No', 'Invoice Number', 'Invoice Date', 'Amount']],
      body: tableData,
      theme: 'grid',
      margin: { left: marginLeft, right: marginRight },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 9,
        cellPadding: 3,
        lineColor: [0, 0, 0],
        lineWidth: 0.3
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 3,
        lineColor: [0, 0, 0],
        lineWidth: 0.3
      },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 45, halign: 'left' },
        2: { cellWidth: 45, halign: 'left' },
        3: { cellWidth: 35, halign: 'right' }
      }
    })

    // --- Total ---
    const finalY = doc.lastAutoTable?.finalY || y + 40
    y = finalY + 5
    const totalAmt = parseFloat(payment.amount) || 0
    const totalAmtStr = totalAmt.toLocaleString('en-IN')

    doc.setLineWidth(0.5)
    doc.setDrawColor(0, 0, 0)
    doc.line(marginLeft, y, pageWidth - marginRight, y)
    y += 8
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Total', pageWidth - marginRight - 60, y)
    doc.text(`${totalAmtStr}/-`, pageWidth - marginRight, y, { align: 'right' })

    // --- Company Footer ---
    y += 20
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(companySettings.companyName || 'Company Name', marginLeft, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.text(companySettings.companyAddress || 'Company Address', marginLeft, y)

    // --- Bank Details ---
    y += 20
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Bank Details', marginLeft, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.text(companySettings.bankDetails?.bankName || 'Bank Name', marginLeft, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.text(companySettings.bankDetails?.bankAddress || 'Bank Address', marginLeft, y)
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.text(companySettings.bankDetails?.accountNumber || 'A/c Number', marginLeft, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.text(companySettings.bankDetails?.ifscCode || 'IFSC Code', marginLeft, y)

    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    setPdfBlobUrl(url)
    setPdfFileName(`payment_${payment.paymentNumber || 'unknown'}.pdf`)
    setPdfViewerOpen(true)
  }

  const handleDownloadPdf = () => {
    const a = document.createElement('a')
    a.href = pdfBlobUrl
    a.download = pdfFileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const closeActionDropdown = () => {
    setOpenDropdownId(null)
    setDropdownPayment(null)
    setAttachmentsMenuOpen(false)
  }

  const openAttachmentPreview = (attachment) => {
    setSelectedAttachment(attachment)
    setAttachmentViewerOpen(true)
    closeActionDropdown()
  }

  const closeAttachmentPreview = () => {
    setAttachmentViewerOpen(false)
    setSelectedAttachment(null)
  }

  const openAttachmentPicker = () => {
    if (loading || (paymentForm.attachments?.length || 0) >= 5) return
    attachmentInputRef.current?.click()
  }

  const openCsvImportModal = () => {
    setCsvImportOpen(true)
    setCsvImportError('')
    setCsvImportFileName('')
    setCsvHeaders([])
    setCsvDataRows([])
    setCsvPreviewRows([])
    setCsvFieldMapping({ paymentNumber: '', paymentDate: '', amount: '', description: '' })
    setCsvClientSearchText('')
    setCsvSelectedClientId('')
    setCsvSelectedClientName('')
    setIsCsvClientDropdownOpen(false)
  }

  const closeCsvImportModal = () => {
    setCsvImportOpen(false)
    setCsvImportError('')
    setCsvImportFileName('')
    setCsvHeaders([])
    setCsvDataRows([])
    setCsvPreviewRows([])
    setCsvFieldMapping({ paymentNumber: '', paymentDate: '', amount: '', description: '' })
    setCsvImporting(false)
    setCsvClientSearchText('')
    setCsvSelectedClientId('')
    setCsvSelectedClientName('')
    setIsCsvClientDropdownOpen(false)
    if (csvImportInputRef.current) {
      csvImportInputRef.current.value = ''
    }
  }

  const handleCsvFileSelection = async (event) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    if (!csvSelectedClientId) {
      setCsvImportError('Please select a client before uploading a CSV file.')
      setCsvImportFileName('')
      setCsvPreviewRows([])
      event.target.value = ''
      return
    }

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setCsvImportError('Only .csv files are allowed.')
      setCsvImportFileName('')
      setCsvPreviewRows([])
      event.target.value = ''
      return
    }

    if (selectedFile.size > CSV_IMPORT_MAX_SIZE_BYTES) {
      setCsvImportError('CSV file must be 5 MB or smaller.')
      setCsvImportFileName('')
      setCsvPreviewRows([])
      event.target.value = ''
      return
    }

    try {
      setCsvImporting(true)
      setCsvImportError('')
      const text = await selectedFile.text()
      const parsedRows = parseCsvText(text).filter((row) => row.some((value) => String(value).trim() !== ''))

      if (parsedRows.length === 0) {
        throw new Error('The selected file does not contain any usable rows.')
      }

      const parsedData = parseCsvData(text)
      const suggestedMapping = {
        paymentNumber: getSuggestedCsvHeader(parsedData.headers, ['payment number', 'payment no', 'payment']) || '',
        paymentDate: getSuggestedCsvHeader(parsedData.headers, ['payment date', 'date']) || '',
        amount: getSuggestedCsvHeader(parsedData.headers, ['amount', 'amount due', 'total']) || '',
        description: getSuggestedCsvHeader(parsedData.headers, ['description', 'narration', 'remarks', 'note']) || ''
      }

      setCsvImportFileName(selectedFile.name)
      setCsvHeaders(parsedData.headers)
      setCsvDataRows(parsedData.dataRows)
      setCsvPreviewRows(parsedData.dataRows.slice(0, 5))
      setCsvFieldMapping(suggestedMapping)
      showSuccessToast(`Loaded ${parsedData.dataRows.length} row(s) from ${selectedFile.name}`)
    } catch (err) {
      setCsvImportError(err.message || 'Unable to read the selected CSV file.')
      setCsvImportFileName('')
      setCsvPreviewRows([])
    } finally {
      setCsvImporting(false)
    }
  }

  const handleCsvImportSubmit = async () => {
    if (!csvSelectedClientId) {
      setCsvImportError('Please select a client before importing the CSV file.')
      return
    }

    if (!csvImportFileName) {
      setCsvImportError('Please choose a CSV file first.')
      return
    }

    try {
      setCsvImporting(true)
      setCsvImportError('')

      const token = getAuthToken()
      const headers = csvHeaders
      const createdPayments = []

      for (let index = 0; index < csvDataRows.length; index += 1) {
        const row = csvDataRows[index]
        const paymentNumberIndex = headers.indexOf(csvFieldMapping.paymentNumber)
        const paymentDateIndex = headers.indexOf(csvFieldMapping.paymentDate)
        const amountIndex = headers.indexOf(csvFieldMapping.amount)
        const descriptionIndex = headers.indexOf(csvFieldMapping.description)

        const paymentNumber = String(row[paymentNumberIndex] ?? '').trim()
        const paymentDateValue = String(row[paymentDateIndex] ?? '').trim()
        const amountValue = String(row[amountIndex] ?? '').trim()
        const descriptionValue = String(row[descriptionIndex] ?? '').trim()
        const parsedAmount = Number.parseFloat(String(amountValue).replace(/[^0-9.-]/g, ''))

        const payload = {
          paymentNumber: paymentNumber || undefined,
          clientId: csvSelectedClientId,
          clientType: 'Customer',
          paymentDate: paymentDateValue ? toIsoDateString(paymentDateValue).split('T')[0] : new Date().toISOString().split('T')[0],
          amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
          description: descriptionValue || 'Imported from CSV',
          allocations: [],
          attachments: []
        }

        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        })
        await readJsonResponse(response, 'Error importing CSV payment')
        createdPayments.push(payload)
      }

      showSuccessToast(`Imported ${createdPayments.length} payment(s) from CSV.`)
      closeCsvImportModal()
      await fetchPayments(1, searchQuery, sortColumn, sortOrder)
    } catch (err) {
      setCsvImportError(err.message || 'Unable to import the CSV file.')
    } finally {
      setCsvImporting(false)
    }
  }

  const formatMoney = (value) =>
    Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0, gap: '0.75rem', flexWrap: 'wrap' }}>
        {isAdmin && (
          <MotionButton
            type="button"
            onClick={openCsvImportModal}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--bg-main)',
              color: 'var(--text-header)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '0.9375rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <UploadCloud size={16} />
            Upload CSV
          </MotionButton>
        )}
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

      {csvImportOpen && (
        <ActionMenuPortal>
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
              if (e.target === e.currentTarget) closeCsvImportModal()
            }}
          >
            <div className="card" style={{ width: 'min(720px, 96vw)', maxHeight: '88vh', overflow: 'auto', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem' }}>
                <h2 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1.2rem' }}>Upload CSV</h2>
                <MotionButton
                  type="button"
                  onClick={closeCsvImportModal}
                  style={{
                    padding: '0.4rem 0.75rem',
                    background: 'var(--bg-main)',
                    color: 'var(--text-header)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </MotionButton>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', background: 'var(--bg-main)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-header)', marginBottom: '0.45rem' }}>
                    Select client first
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    Choose the client before uploading a CSV file. Each imported row will be linked to that client.
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Search client..."
                      value={csvClientSearchText}
                      onChange={(e) => {
                        setCsvClientSearchText(e.target.value)
                        if (csvSelectedClientId && e.target.value !== csvSelectedClientName) {
                          setCsvSelectedClientId('')
                          setCsvSelectedClientName('')
                        }
                        setIsCsvClientDropdownOpen(true)
                      }}
                      onFocus={() => setIsCsvClientDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsCsvClientDropdownOpen(false), 160)}
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.75rem',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)'
                      }}
                    />
                    {isCsvClientDropdownOpen && filteredCsvClients.length > 0 && (
                      <ul style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '220px',
                        overflowY: 'auto',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        marginTop: '4px',
                        padding: 0,
                        listStyle: 'none',
                        zIndex: 20,
                        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.08)'
                      }}>
                        {filteredCsvClients.map((client) => (
                          <li
                            key={String(client._id || client.id || client.customerName)}
                            onClick={() => {
                              const clientName = client.displayName || client.customerName || 'Selected client'
                              setCsvSelectedClientId(String(client._id || client.id || ''))
                              setCsvSelectedClientName(clientName)
                              setCsvClientSearchText(clientName)
                              setIsCsvClientDropdownOpen(false)
                              setCsvImportError('')
                            }}
                            style={{ padding: '0.6rem 0.75rem', cursor: 'pointer', color: 'var(--text-header)', borderBottom: '1px solid var(--border)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-main)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            {client.displayName || client.customerName || client.companyName || 'Client'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {csvSelectedClientName && (
                    <div style={{ marginTop: '0.65rem', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>
                      Selected client: {csvSelectedClientName}
                    </div>
                  )}
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', background: 'var(--bg-main)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-header)', marginBottom: '0.4rem' }}>
                    Map CSV headers to payment fields
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    Match each uploaded CSV column to the payment field it should populate.
                  </div>
                  <div style={{ display: 'grid', gap: '0.7rem' }}>
                    {[
                      { key: 'paymentNumber', label: 'Payment Number' },
                      { key: 'paymentDate', label: 'Payment Date' },
                      { key: 'amount', label: 'Amount' },
                      { key: 'description', label: 'Description' }
                    ].map((field) => (
                      <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-header)' }}>{field.label}</label>
                        <select
                          value={csvFieldMapping[field.key]}
                          onChange={(e) => setCsvFieldMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          disabled={csvHeaders.length === 0}
                          style={{
                            width: '100%',
                            padding: '0.6rem 0.7rem',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            background: 'var(--bg-card)',
                            color: 'var(--text-header)'
                          }}
                        >
                          <option value="">Select CSV column</option>
                          {csvHeaders.map((header) => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ border: '1px dashed var(--border)', borderRadius: '12px', padding: '1rem', background: 'var(--bg-main)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-header)', marginBottom: '0.4rem' }}>
                    Select a CSV file only
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    Files with .csv extension are accepted. XLS/XLSX or other formats will be rejected.
                  </div>
                  <input
                    ref={csvImportInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleCsvFileSelection}
                    style={{ display: 'none' }}
                  />
                  <MotionButton
                    type="button"
                    onClick={() => csvImportInputRef.current?.click()}
                    disabled={csvImporting || !csvSelectedClientId}
                    style={{
                      padding: '0.6rem 1rem',
                      background: 'var(--primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      cursor: csvImporting || !csvSelectedClientId ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      opacity: csvImporting || !csvSelectedClientId ? 0.7 : 1
                    }}
                  >
                    <UploadCloud size={16} />
                    Choose CSV File
                  </MotionButton>
                  {!csvSelectedClientId && (
                    <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Select a client to enable CSV upload.
                    </div>
                  )}
                  <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {csvImportFileName ? `Selected file: ${csvImportFileName}` : 'No file selected yet.'}
                  </div>
                  {csvImportError && (
                    <div style={{ marginTop: '0.5rem', color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600 }}>
                      {csvImportError}
                    </div>
                  )}
                </div>

                {csvPreviewRows.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ padding: '0.75rem 0.9rem', background: 'var(--bg-main)', fontWeight: 700, color: 'var(--text-header)' }}>
                      CSV Preview
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <tbody>
                          {csvPreviewRows.map((row, rowIndex) => (
                            <tr key={`csv-row-${rowIndex}`} style={{ borderTop: rowIndex === 0 ? 'none' : '1px solid var(--border)' }}>
                              {row.map((cell, cellIndex) => (
                                <td key={`csv-cell-${rowIndex}-${cellIndex}`} style={{ padding: '0.45rem 0.6rem', borderRight: cellIndex === row.length - 1 ? 'none' : '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <MotionButton
                  type="button"
                  onClick={closeCsvImportModal}
                  style={{
                    padding: '0.55rem 1rem',
                    background: 'var(--bg-main)',
                    color: 'var(--text-header)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </MotionButton>
                <MotionButton
                  type="button"
                  onClick={handleCsvImportSubmit}
                  disabled={csvImporting || !csvImportFileName}
                  style={{
                    padding: '0.55rem 1rem',
                    background: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: csvImporting || !csvImportFileName ? 'not-allowed' : 'pointer',
                    opacity: csvImporting || !csvImportFileName ? 0.7 : 1
                  }}
                >
                  {csvImporting ? 'Processing...' : 'Import CSV'}
                </MotionButton>
              </div>
            </div>
          </div>
        </ActionMenuPortal>
      )}

      {formOpen && (
        <ActionMenuPortal>
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
                      Select Company <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Search Company..."
                        value={clientSearchText}
                        onChange={(e) => {
                          setClientSearchText(e.target.value)
                          setIsClientDropdownOpen(e.target.value.length > 0)
                          if (paymentForm.clientId) {
                            setPaymentForm(prev => ({ ...prev, clientId: '', clientType: 'Customer' }))
                            setIsPaymentAmountManuallyEdited(false)
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
                                setPaymentForm(prev => ({ ...prev, clientId: client._id, clientType: 'Customer' }))
                                setIsPaymentAmountManuallyEdited(false)
                                setClientSearchText(client.displayName || client.name || '')
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
                              {client.displayName || client.name}
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
                      min="0"
                      step="0.01"
                      onChange={(e) => {
                        const sanitized = String(e.target.value || '').replace(/[^0-9.]/g, '')
                        const parts = sanitized.split('.')
                        const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized
                        setIsPaymentAmountManuallyEdited(true)
                        setPaymentForm(prev => ({ ...prev, amount: normalized }))
                        if (formSubmitted && errors.amount) {
                          setErrors(prev => {
                            const ne = { ...prev }
                            delete ne.amount
                            return ne
                          })
                        }
                      }}
                      disabled={loading}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: `1px solid ${errors.amount ? 'var(--danger)' : 'var(--border)'}`,
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        background: 'var(--bg-main)',
                        color: 'var(--text-header)'
                      }}
                    />
                    {formSubmitted && errors.amount && (
                      <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.amount}</p>
                    )}
                    <div style={{ marginTop: '0.45rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      {Number(availableCredit) > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'rgb(22, 163, 74)', fontWeight: 600 }}>
                          Available Credit: ₹{formatMoney(availableCredit)}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Bill Payment Amount: ₹{formatMoney(billPaymentAmount)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                        Adjusted Bill Amount: ₹{formatMoney(adjustedBillPaymentAmount)}
                      </div>
                    </div>
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

                <div style={{ marginTop: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-header)' }}>Pending Invoices</h3>
                    {paymentForm.clientId && (
                      <div style={{ position: 'relative', width: 'min(420px, 100%)' }}>
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: '0.45rem',
                          width: '100%',
                          minHeight: '2.1rem',
                          padding: '0.35rem 0.6rem',
                          border: `1px solid ${invoiceInputFocused ? 'var(--text-muted)' : 'var(--border)'}`,
                          borderRadius: '8px',
                          background: 'var(--bg-main)'
                        }}>
                          <Search size={14} color="var(--text-muted)" style={{ marginRight: '0.1rem', flex: '0 0 auto' }} />
                          {invoiceInputParts.selectedTokens.map((token) => (
                            <span
                              key={token}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '0.15rem 0.45rem',
                                border: '1px solid var(--border)',
                                borderRadius: '999px',
                                background: 'var(--bg-card)',
                                color: 'var(--text-header)',
                                fontSize: '0.8rem'
                              }}
                            >
                              {token}
                              <button
                                type="button"
                                aria-label={`Remove ${token}`}
                                onClick={() => {
                                  const remaining = invoiceInputParts.selectedTokens.filter((t) => t !== token)
                                  const combined = buildInvoiceInputValue(remaining, '')
                                  setInvoiceSearchText(combined)
                                  setInvoiceInput(combined)
                                  setIsInvoiceDropdownOpen(false)
                                }}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: 0,
                                  fontSize: '1rem',
                                  lineHeight: 1
                                }}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          <input
                            aria-label="Search Invoice Number"
                            type="search"
                            placeholder={!invoiceInputParts.selectedTokens.length && !invoiceInputParts.fragment ? 'Search INV No' : ''}
                            value={invoiceInputParts.fragment || ''}
                            onChange={(e) => {
                              const fragment = e.target.value
                              const nextValue = buildInvoiceInputValue(invoiceInputParts.selectedTokens, fragment)
                              setInvoiceInput(nextValue)
                              setInvoiceSearchText(nextValue)
                              setIsInvoiceDropdownOpen(String(fragment).trim().length > 0 && !!paymentForm.clientId)
                            }}
                            onFocus={(e) => { setInvoiceInputFocused(true); if (String(e.target.value || '').trim().length > 0 && paymentForm.clientId) setIsInvoiceDropdownOpen(true) }}
                            onBlur={() => setTimeout(() => { setInvoiceInputFocused(false); setIsInvoiceDropdownOpen(false) }, 200)}
                            onKeyDown={(e) => {
                              const isSeparator = e.key === ',' || e.key === ';' || e.key === ' '
                              const fragment = String(invoiceInputParts.fragment || '').trim()
                              if (e.key === 'Backspace' && !fragment && invoiceInputParts.selectedTokens.length > 0) {
                                const remaining = invoiceInputParts.selectedTokens.slice(0, -1)
                                const combined = buildInvoiceInputValue(remaining, '')
                                setInvoiceSearchText(combined)
                                setInvoiceInput(combined)
                                setIsInvoiceDropdownOpen(false)
                                e.preventDefault()
                                return
                              }
                              if (e.key === 'Enter' || isSeparator) {
                                if (fragment) {
                                  const parts = [...invoiceInputParts.selectedTokens]
                                  if (!parts.map((t) => t.toLowerCase()).includes(fragment.toLowerCase())) parts.push(fragment)
                                  const combined = buildInvoiceInputValue(parts, '')
                                  setInvoiceSearchText(combined)
                                  setInvoiceInput(combined)
                                }
                                setIsInvoiceDropdownOpen(false)
                                if (isSeparator) e.preventDefault()
                              }
                            }}
                            onPaste={(e) => {
                              try {
                                const pasted = (e.clipboardData || window.clipboardData).getData('text') || ''
                                if (!pasted) return
                                e.preventDefault()
                                const tokens = parseInvoiceRawTokens(pasted)
                                if (tokens.length === 0) return
                                const lowerSet = new Set(invoiceInputParts.selectedTokens.map((t) => t.toLowerCase()))
                                if (invoiceInputParts.fragment) lowerSet.add(invoiceInputParts.fragment.toLowerCase())
                                const parts = [...invoiceInputParts.selectedTokens]
                                if (invoiceInputParts.fragment && !parts.map((t) => t.toLowerCase()).includes(invoiceInputParts.fragment.toLowerCase())) {
                                  parts.push(invoiceInputParts.fragment)
                                }
                                for (const t of tokens) {
                                  if (!lowerSet.has(t.toLowerCase())) {
                                    parts.push(t)
                                    lowerSet.add(t.toLowerCase())
                                  }
                                }
                                const combined = buildInvoiceInputValue(parts, '')
                                setInvoiceSearchText(combined)
                                setInvoiceInput(combined)
                                setIsInvoiceDropdownOpen(false)
                                if (autoAllocateOnSelect) {
                                  const matchedIds = []
                                  for (const t of parseInvoiceTokens(combined)) {
                                    const inv = orderedPendingInvoices.find(i => String(i.invoiceNumber || '').toLowerCase().includes(t))
                                    if (inv) {
                                      const id = String(inv._id)
                                      if (!matchedIds.includes(id)) matchedIds.push(id)
                                    }
                                  }
                                  if (matchedIds.length > 0) {
                                    setPendingInvoiceOrder((prev) => {
                                      const next = Array.isArray(prev) ? [...prev] : []
                                      for (const id of matchedIds) {
                                        const idx = next.indexOf(id)
                                        if (idx !== -1) next.splice(idx, 1)
                                      }
                                      for (let i = matchedIds.length - 1; i >= 0; i--) next.unshift(matchedIds[i])
                                      return next
                                    })
                                  }
                                }
                              } catch (err) {
                                // ignore
                              }
                            }}
                            disabled={!paymentForm.clientId || loading}
                            style={{
                              flex: 1,
                              minWidth: '120px',
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              color: 'var(--text-header)',
                              fontSize: '0.8125rem',
                              padding: 0,
                              margin: 0
                            }}
                          />
                        </div>
                        {isInvoiceDropdownOpen && invoiceSuggestions.length > 0 && (
                          <ul style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            maxHeight: '260px',
                            overflowY: 'auto',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            marginTop: '6px',
                            padding: 0,
                            listStyle: 'none',
                            zIndex: 60,
                            boxShadow: '0 8px 16px rgba(0,0,0,0.12)'
                          }}>
                            {invoiceSuggestions.map((inv) => (
                              <li
                                key={String(inv._id)}
                                onClick={() => {
                                  const parts = [...invoiceInputParts.selectedTokens]
                                  const invNum = String(inv.invoiceNumber || '')
                                  if (!parts.map((t) => t.toLowerCase()).includes(invNum.toLowerCase())) parts.push(invNum)
                                  const combined = buildInvoiceInputValue(parts, '')
                                  setInvoiceSearchText(combined)
                                  setInvoiceInput(combined)
                                  setIsInvoiceDropdownOpen(false)
                                  if (autoAllocateOnSelect) {
                                    setPendingInvoiceOrder((prev) => {
                                      const id = String(inv._id)
                                      const list = Array.isArray(prev) ? [...prev] : []
                                      const idx = list.indexOf(id)
                                      if (idx !== -1) list.splice(idx, 1)
                                      list.unshift(id)
                                      return list
                                    })
                                  }
                                }}
                                style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--border)', color: 'var(--text-header)' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-main)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                              >
                                <div style={{ fontWeight: 700 }}>{inv.invoiceNumber}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '3px' }}>₹{formatMoney(inv.pendingAmount || inv.invoiceAmount)}</div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '40%' }} />
                        <col style={{ width: '15%' }} />
                      </colgroup>
                      <thead style={{ background: 'var(--bg-main)' }}>
                        <tr>
                          <th style={{ padding: '0.5rem', textAlign: 'center', width: 80 }}>Select</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Invoice No</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Invoice Amt</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Paid</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Balance</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left' }}>Description</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', width: 170 }}>Payment Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPendingInvoices.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                              {paymentForm.clientId ? (invoiceInput ? 'No pending invoices match this search.' : 'No pending invoices for this client.') : 'Select a client to view pending invoices.'}
                            </td>
                          </tr>
                        ) : (
                          filteredPendingInvoices.map((inv) => {
                            const invoiceId = String(inv._id)
                            const isChecked = selectedInvoiceIdSet.has(invoiceId)
                            const enteredAmount = invoicePaymentAmounts[invoiceId] || ''
                            const enteredDescription = invoiceDescriptions[invoiceId] ?? String(inv.description || '')
                            return (
                            <tr
                              key={inv._id}
                              style={{
                                borderTop: '1px solid var(--border)',
                                background: selectedInvoiceSet.has(String(inv.invoiceNumber || '').toLowerCase()) ? 'rgba(99,102,241,0.06)' : 'transparent'
                              }}
                            >
                              <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => handleInvoiceSelectionToggle(inv._id, e.target.checked, inv.pendingAmount, inv.description)}
                                  disabled={loading}
                                  style={{ width: 16, height: 16, cursor: loading ? 'not-allowed' : 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '0.75rem 0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inv.invoiceNumber}>
                                {inv.invoiceNumber}
                              </td>
                              <td style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>₹{formatMoney(inv.invoiceAmount)}</td>
                              <td style={{ padding: '0.75rem 0.5rem', textAlign: 'left' }}>₹{formatMoney(inv.paidAmount)}</td>
                              <td style={{ padding: '0.75rem 0.5rem', textAlign: 'left', color: 'rgb(249, 115, 22)', fontWeight: 700 }}>
                                ₹{formatMoney(inv.pendingAmount)}
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                <input
                                  type="text"
                                  value={enteredDescription}
                                  onChange={(e) => handleInvoiceDescriptionChange(inv._id, e.target.value)}
                                  disabled={!isChecked || loading}
                                  placeholder="Enter description"
                                  maxLength={250}
                                  style={{
                                    width: '100%',
                                    padding: '0.4rem 0.5rem',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    background: !isChecked ? 'var(--bg-main)' : 'var(--bg-card)',
                                    color: 'var(--text-header)',
                                    fontSize: '0.85rem'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '0.5rem', textAlign: 'left' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  max={Math.max(0, Number(inv.pendingAmount) || 0)}
                                  value={enteredAmount}
                                  onChange={(e) => handleInvoicePaymentAmountChange(inv._id, e.target.value)}
                                  disabled={!isChecked || loading}
                                  placeholder="0.00"
                                  style={{
                                    width: '100%',
                                    padding: '0.4rem 0.5rem',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    background: !isChecked ? 'var(--bg-main)' : 'var(--bg-card)',
                                    color: 'var(--text-header)',
                                    textAlign: 'right',
                                    fontSize: '0.85rem'
                                  }}
                                />
                              </td>
                            </tr>
                            )
                          })
                        )}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '1px solid var(--border)', background: 'rgba(59,130,246,0.08)' }}>
                          <td colSpan={5} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-header)' }}>
                            Total Balance:
                          </td>
                          <td colSpan={2} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                            ₹{formatMoney(totalPending)}
                          </td>
                        </tr>
                        <tr style={{ borderTop: '1px solid var(--border)', background: 'rgba(16,185,129,0.10)' }}>
                          <td colSpan={5} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-header)' }}>
                            Selected Payment Total:
                          </td>
                          <td colSpan={2} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'rgb(16,185,129)' }}>
                            ₹{formatMoney(selectedAllocationTotal)}
                          </td>
                        </tr>
                        <tr style={{ borderTop: '1px solid var(--border)', background: 'rgba(22,163,74,0.08)' }}>
                          <td colSpan={5} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-header)' }}>
                            Adjusted Bill Amount:
                          </td>
                          <td colSpan={2} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'rgb(22, 163, 74)' }}>
                            ₹{formatMoney(availableCredit)}
                          </td>
                        </tr>
                        <tr style={{ borderTop: '1px solid var(--border)', background: 'rgba(59,130,246,0.06)' }}>
                          <td colSpan={5} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-header)' }}>
                            Net Amount to Pay:
                          </td>
                          <td colSpan={2} style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                            ₹{formatMoney(adjustedBillPaymentAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {formSubmitted && errors.allocations && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{errors.allocations}</p>
                  )}
                  {formSubmitted && errors.allocationDescription && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{errors.allocationDescription}</p>
                  )}

                  <div style={{
                    marginTop: '0.75rem',
                    border: '1px solid rgba(59,130,246,0.25)',
                    background: 'rgba(59,130,246,0.08)',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    color: 'var(--text-header)'
                  }}>
                    <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Payment Logic:</span> Select invoice rows and enter payment amount per row. Payment Amount auto-fills from selected rows and can be edited manually.
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-header)' }}>File Attachment</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Max 5 files</div>
                  </div>
                  <div
                    onDrop={handleAttachmentDrop}
                    onDragOver={handleAttachmentDragOver}
                    onDragLeave={handleAttachmentDragLeave}
                    style={{
                      border: `2px dashed ${isAttachmentDragging ? 'var(--primary)' : 'rgba(209, 213, 219, 0.95)'}`,
                      borderRadius: '16px',
                      padding: '1rem 0.75rem',
                      background: isAttachmentDragging ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-card)',
                      minHeight: '90px',
                      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input
                      ref={attachmentInputRef}
                      id="payment-attachment-input"
                      type="file"
                      accept={ATTACHMENT_ACCEPT}
                      multiple
                      onChange={handleAttachmentChange}
                      disabled={loading || (Array.isArray(paymentForm.attachments) && paymentForm.attachments.length >= 5)}
                      style={{ display: 'none' }}
                    />
                    {(paymentForm.attachments?.length || 0) < 5 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem',
                          textAlign: 'center'
                        }}
                      >
                        {!paymentForm.attachments?.length && (
                          <>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-header)' }}>
                              Upload File
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45, maxWidth: '420px' }}>
                              Drag and drop files here or click to upload
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Supported formats: JPEG, JPG, PNG, GIF, WebP, SVG, PDF up to 25 MB each
                            </div>
                          </>
                        )}
                        <MotionButton
                          type="button"
                          onClick={openAttachmentPicker}
                          disabled={loading}
                          style={{
                            marginTop: '0.2rem',
                            padding: '0.4rem 1rem',
                            borderRadius: '10px',
                            background: 'linear-gradient(180deg, #4c7cf0 0%, #315be0 100%)',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            boxShadow: '0 10px 20px rgba(49, 91, 224, 0.22)',
                            border: 'none',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.7 : 1
                          }}
                        >
                          Browse Files
                        </MotionButton>
                      </div>
                    )}
                    <div style={{ marginTop: '0.5rem', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {paymentForm.attachments?.length || 0}/5 selected
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                      {(paymentForm.attachments || []).map((attachment, index) => (
                        <div
                          key={`${attachment.name}-${index}`}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: '14px',
                            background: 'var(--bg-card)',
                            padding: '0.65rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-main)',
                            display: 'grid',
                            placeItems: 'center',
                            color: 'var(--text-muted)',
                            flex: '0 0 auto'
                          }}>
                            {String(attachment.type || '').startsWith('image/') ? <ImageIcon size={18} /> : <FileText size={18} />}
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-header)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={attachment.name}>
                              {attachment.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                              {formatFileSize(attachment.size)}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '0 0 auto' }}>
                            <button
                              type="button"
                              style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center' }}
                              title="More"
                            >
                              <MoreHorizontal size={20} />
                            </button>
                            <a
                              href={attachment.dataUrl}
                              download={attachment.name}
                              style={{ color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}
                              title="Download"
                            >
                              <Download size={18} />
                            </a>
                            <button
                              type="button"
                              onClick={() => removeAttachment(index)}
                              style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center' }}
                              title="Remove file"
                            >
                              <X size={20} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {attachmentError && (
                      <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.5rem' }}>{attachmentError}</p>
                    )}
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
                          description: '',
                          attachments: []
                        })
                        setIsPaymentAmountManuallyEdited(false)
                        setPendingInvoiceOrder([])
                        setSelectedInvoiceIds([])
                        setInvoicePaymentAmounts({})
                        setClientSearchText('')
                        setInvoiceSearchText('')
                        setInvoiceInput('')
                        setAttachmentError('')
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
        </ActionMenuPortal>
      )}

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
            {selectedPaymentIds.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <MotionButton
                  onClick={handleBulkDeletePayments}
                  style={{
                    padding: '0.45rem 0.8rem',
                    background: 'var(--danger)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.82rem'
                  }}
                >
                  <Trash2 size={14} style={{ marginRight: '0.3rem' }} />
                  Delete Selected
                </MotionButton>
                <MotionButton
                  onClick={() => setSelectedPaymentIds([])}
                  style={{
                    padding: '0.45rem 0.8rem',
                    background: 'var(--bg-main)',
                    color: 'var(--text-header)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.82rem'
                  }}
                >
                  Clear
                </MotionButton>
              </div>
            )}
            {/* Mobile/Tablet Card View */}
            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {payments.map((payment) => {
                  const name =
                    payment.vendorId?.customerName ||
                    payment.vendorId?.vendorName ||
                    `${payment.vendorId?.firstName || ''} ${payment.vendorId?.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
                    'Unknown'
                  const companyName = payment.vendorId?.companyName || ''
                  const customerLabel = companyName ? `${name} - ${companyName}` : name
                  const dateLabel = formatDateDDMMMYYYY(payment.paymentDate)
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={selectedPaymentIds.includes(payment._id)}
                            onChange={() => togglePaymentSelection(payment._id)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
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
                        </div>
                        <div style={{ position: 'relative' }}>
                          <MotionButton
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openDropdownId === payment._id) {
                                closeActionDropdown();
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const { top, left, shouldOpenUp } = getActionDropdownPosition({
                                  rect,
                                  dropdownHeight: 280
                                });
                                setDropdownPosition({ top, left });
                                setDropdownUp(shouldOpenUp);
                                setDropdownPayment(payment);
                                setOpenDropdownId(payment._id);
                                setAttachmentsMenuOpen(false)
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
              <div style={{ overflowX: 'auto', border: isAdmin ? '1px solid var(--border)' : 'none', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ width: '4%', textAlign: 'center', padding: '0.5rem 0.25rem', color: 'var(--text-header)', fontWeight: 700 }}>
                        <input
                          type="checkbox"
                          checked={payments.length > 0 && payments.every((payment) => selectedPaymentIds.includes(payment._id))}
                          onChange={toggleSelectAllVisiblePayments}
                          style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                        />
                      </th>
                      <th
                        onClick={() => handleSort('paymentNumber')}
                        style={{ width: '10%', textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                      >
                        INV No {sortColumn === 'paymentNumber' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('vendorId')}
                        style={{ width: '20%', textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                      >
                        Customer Name {sortColumn === 'vendorId' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('paymentDate')}
                        style={{ width: '10%', textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                      >
                        Date {sortColumn === 'paymentDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('description')}
                        style={{ width: '30%', textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                      >
                        Description {sortColumn === 'description' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        onClick={() => handleSort('amount')}
                        style={{ width: '10%', textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                      >
                        Amount {sortColumn === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                      <th style={{ width: '10%', textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => {
                      const name =
                        payment.vendorId?.customerName ||
                        payment.vendorId?.vendorName ||
                        `${payment.vendorId?.firstName || ''} ${payment.vendorId?.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
                        'Unknown'
                      const companyName = payment.vendorId?.companyName || ''
                      const customerLabel = companyName ? `${name} - ${companyName}` : name
                      const dateLabel = formatDateDDMMMYYYY(payment.paymentDate)
                      const amountLabel = `₹${formatMoney(payment.amount)}`
                      const descriptionLabel = payment.description ? String(payment.description) : '-'

                      return (
                        <tr key={payment._id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ width: '4%', textAlign: 'center', padding: '0.5rem 0.25rem' }}>
                            <input
                              type="checkbox"
                              checked={selectedPaymentIds.includes(payment._id)}
                              onChange={() => togglePaymentSelection(payment._id)}
                              style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ width: '10%', padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(payment.paymentNumber || '')}>
                            {truncateText(payment.paymentNumber || '')}
                          </td>
                          <td style={{ width: '20%', padding: '0.5rem 0.375rem', color: 'var(--text-main)', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word', minWidth: '140px' }} title={String(customerLabel)}>
                            {customerLabel}
                          </td>
                          <td style={{ width: '10%', padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(dateLabel)}>
                            {dateLabel}
                          </td>
                          <td style={{ width: '30%', padding: '0.5rem 0.375rem', color: 'var(--text-main)', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '260px' }} title={String(descriptionLabel === '-' ? '' : descriptionLabel)}>
                            {descriptionLabel || '-'}
                          </td>
                          <td style={{ width: '10%', padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={amountLabel}>
                            {amountLabel}
                          </td>
                          <td style={{ padding: '0.5rem 0.375rem' }}>
                            <div style={{ position: 'relative' }}>
                              <MotionButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (openDropdownId === payment._id) {
                                    closeActionDropdown();
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const { top, left, shouldOpenUp } = getActionDropdownPosition({
                                      rect,
                                      dropdownHeight: 280
                                    });
                                    setDropdownPosition({ top, left });
                                    setDropdownUp(shouldOpenUp);
                                    setDropdownPayment(payment);
                                    setOpenDropdownId(payment._id);
                                    setAttachmentsMenuOpen(false)
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

      {infoOpen && (
        <ActionMenuPortal>
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
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.75rem' }}>Client Details</div>
                  <div style={{ background: 'var(--bg-main)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {(() => {
                        const client = infoPayment?.vendorId;
                        const paymentDate = formatDateDDMMMYYYY(infoPayment?.paymentDate);
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
                            {/* Client ID removed per UI preference; only showing Name / Company */}
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
        </ActionMenuPortal>
      )}

      {/* Dropdown Menu */}
      {openDropdownId && dropdownPayment && (
        <ActionMenuPortal>
          {(() => {
            const attachmentMenuItems = getAttachmentMenuItems(dropdownPayment.attachments || [])

            return (
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
              minWidth: '220px',
              maxWidth: '260px',
              maxHeight: 'min(320px, 70vh)',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MotionButton
              onClick={(e) => {
                e.stopPropagation();
                setInfoPayment(dropdownPayment);
                setInfoOpen(true);
                closeActionDropdown()
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
              <Info size={14} />
              View
            </MotionButton>
            <MotionButton
              onClick={(e) => {
                e.stopPropagation()
                if (attachmentMenuItems.length > 0) {
                  setAttachmentsMenuOpen(prev => !prev)
                }
              }}
              disabled={attachmentMenuItems.length === 0}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.375rem 0.75rem',
                background: attachmentsMenuOpen ? 'var(--bg-main)' : 'transparent',
                border: 'none',
                cursor: attachmentMenuItems.length === 0 ? 'not-allowed' : 'pointer',
                color: attachmentMenuItems.length === 0 ? 'var(--text-muted)' : 'var(--text-header)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                transition: 'all 0.2s',
                opacity: attachmentMenuItems.length === 0 ? 0.7 : 1
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ImageIcon size={14} />
                View Attachments
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                {attachmentMenuItems.length}
              </span>
            </MotionButton>
            {attachmentsMenuOpen && attachmentMenuItems.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '0.35rem 0' }}>
                {attachmentMenuItems.map(({ attachment, label }, index) => (
                  <MotionButton
                    key={`${attachment.name || 'attachment'}-${index}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      openAttachmentPreview(attachment)
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.45rem 0.75rem',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-header)',
                      fontSize: '0.84rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.2s'
                    }}
                    title={attachment.name || label}
                  >
                    {isImageAttachment(attachment) ? <ImageIcon size={13} /> : <FileText size={13} />}
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                      <span>{label}</span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                        {attachment.name || 'Unnamed file'}
                      </span>
                    </span>
                  </MotionButton>
                ))}
              </div>
            )}
            <MotionButton
              onClick={(e) => {
                e.stopPropagation();
                generatePaymentPDF(dropdownPayment);
                closeActionDropdown()
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
              View PDF
            </MotionButton>
            <MotionButton
              onClick={(e) => {
                e.stopPropagation();
                handleEditPayment(dropdownPayment);
                closeActionDropdown()
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
                  handleDeletePayment(dropdownPayment._id);
                  closeActionDropdown()
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
          </div>
            )
          })()}
        </ActionMenuPortal>
      )}

      {attachmentViewerOpen && selectedAttachment && (
        <ActionMenuPortal>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.78)',
              zIndex: 100000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeAttachmentPreview()
            }}
          >
            <div
              style={{
                width: isPdfAttachment(selectedAttachment) ? 'min(1000px, 94vw)' : 'auto',
                maxWidth: '94vw',
                maxHeight: '92vh',
                background: '#fff',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 20px 45px rgba(0,0,0,0.28)',
                display: 'flex',
                flexDirection: 'column'
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: '0.9rem 1rem',
                  borderBottom: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  background: '#f8fafc'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    {selectedAttachment.name || 'Attachment Preview'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                    {isImageAttachment(selectedAttachment) ? 'Image preview' : isPdfAttachment(selectedAttachment) ? 'PDF preview' : 'Attachment preview'}
                  </div>
                </div>
                <MotionButton
                  type="button"
                  onClick={closeAttachmentPreview}
                  style={{
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    borderRadius: 10,
                    padding: '0.45rem',
                    cursor: 'pointer',
                    color: '#475569'
                  }}
                  title="Close"
                >
                  <X size={18} />
                </MotionButton>
              </div>

              <div
                style={{
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#e2e8f0',
                  overflow: 'auto',
                  maxHeight: 'calc(92vh - 72px)'
                }}
              >
                {isImageAttachment(selectedAttachment) ? (
                  <img
                    src={selectedAttachment.dataUrl}
                    alt={selectedAttachment.name || 'Attachment preview'}
                    style={{
                      display: 'block',
                      maxWidth: 'min(90vw, 1100px)',
                      maxHeight: 'calc(92vh - 120px)',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      borderRadius: '12px',
                      background: '#fff',
                      boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)'
                    }}
                  />
                ) : isPdfAttachment(selectedAttachment) ? (
                  <iframe
                    src={selectedAttachment.dataUrl}
                    title={selectedAttachment.name || 'PDF preview'}
                    style={{
                      width: 'min(90vw, 980px)',
                      height: 'min(78vh, 900px)',
                      border: 'none',
                      borderRadius: '12px',
                      background: '#fff',
                      boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)'
                    }}
                  />
                ) : (
                  <div style={{ padding: '2rem', color: '#475569', fontWeight: 600, background: '#fff', borderRadius: '12px' }}>
                    Preview is not available for this attachment type.
                  </div>
                )}
              </div>
            </div>
          </div>
        </ActionMenuPortal>
      )}

      {/* PDF Viewer Modal */}
      {pdfViewerOpen && pdfBlobUrl && (
        <ActionMenuPortal>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              zIndex: 100000,
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={() => setPdfViewerOpen(false)}
          >
            {/* Header */}
            <div
              style={{
                background: '#f8fafc',
                borderBottom: '1px solid #e5e7eb',
                padding: '1rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: 0, color: '#1e293b' }}>{pdfFileName}</h3>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <MotionButton
                  onClick={handleDownloadPdf}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Download
                </MotionButton>
                <MotionButton
                  onClick={() => setPdfViewerOpen(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#e5e7eb',
                    color: '#1e293b',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </MotionButton>
              </div>
            </div>

            {/* PDF Content */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '1.5rem',
                overflow: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <iframe
                src={pdfBlobUrl}
                style={{
                  width: '100%',
                  maxWidth: '900px',
                  height: '100%',
                  minHeight: '600px',
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.25)'
                }}
                title="PDF Viewer"
              />
            </div>
          </div>
        </ActionMenuPortal>
      )}
    </div>
  )
}

export default Payment
