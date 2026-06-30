import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Save, RotateCcw, Trash2, Edit2, X, Search, Info, Eye, MoreVertical } from 'lucide-react'
import EmptyDataCard from '../components/EmptyDataCard'
import { getAuthToken, getAuthValue } from '../utils/authStorage'
import { readJsonResponse } from '../utils/api'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import MotionButton from '../components/MotionButton'
import ActionMenuPortal from '../components/ActionMenuPortal'
import { getActionDropdownPosition } from '../utils/dropdownPosition'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const API_URL = `${API_BASE_URL}/api/vendors`

const CUSTOM_FIELDS_API_URL = `${API_BASE_URL}/api/vendor-custom-fields`

function Vendor() {
  // Responsive state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  // Vendor form state
  const [vendorForm, setVendorForm] = useState({
    id: '',
    vendorName: '',
    companyName: '',
    contactNumber: '',
    email: '',
    address: '',
    note: '',
    customFields: {}
  })
  // State for custom fields (array of { key, value })
  const [customFieldsArray, setCustomFieldsArray] = useState([])
  // State for add custom field popup
  const [addFieldPopupOpen, setAddFieldPopupOpen] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [addToListTable, setAddToListTable] = useState(false)
  // State for edit custom field popup
  const [editFieldPopupOpen, setEditFieldPopupOpen] = useState(false)
  const [editingFieldIndex, setEditingFieldIndex] = useState(null)
  const [editingFieldOldName, setEditingFieldOldName] = useState('')
  const [editingFieldNewName, setEditingFieldNewName] = useState('')
  // State for custom columns in list table
  const [customColumns, setCustomColumns] = useState([])
  // State for all custom field names (permanent)
  const [customFieldNames, setCustomFieldNames] = useState([])
  // Loading state for custom fields
  const [customFieldsLoading, setCustomFieldsLoading] = useState(true)



  // Validation errors state
  const [errors, setErrors] = useState({});
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Edit mode state
  const [editingVendorId, setEditingVendorId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)

  // Vendors list state
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortColumn, setSortColumn] = useState('')
  const [sortOrder, setSortOrder] = useState('asc')
  const isAdmin = (getAuthValue('userRole') || '').toLowerCase() === 'admin'
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoVendor, setInfoVendor] = useState(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoNowMs, setInfoNowMs] = useState(0)
  const [openDropdownId, setOpenDropdownId] = useState(null)
  const [dropdownVendor, setDropdownVendor] = useState(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 })
  const [dropdownUp, setDropdownUp] = useState(false)
  const dropdownRef = useRef(null)
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null)
  const [pdfFileName, setPdfFileName] = useState('vendor_statement.pdf')

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdownId && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdownId(null)
        setDropdownVendor(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
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

  const truncateText = (value, max = 20) => {
    const s = String(value ?? '')
    if (s.length <= max) return s
    return s.slice(0, max) + '...'
  }

  const formatMoney = (value) =>
    Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const formatPdfMoney = (value) => `${formatMoney(value)}`

  const formatPdfDate = (value) => {
    const d = value ? new Date(value) : null
    if (!d || Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('en-GB')
  }

  const fetchJsonWithAuth = async (url, fallbackMessage) => {
    const token = getAuthToken()
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    })
    return readJsonResponse(response, fallbackMessage)
  }

  const buildVendorStatementPayload = (vendorRecord, invoiceRows, paymentRows) => {
    const vendorId = String(vendorRecord?._id || '')

    const invoices = (invoiceRows || []).filter((invoice) => {
      const clientId = String(invoice?.clientId?._id || invoice?.clientId || '')
      const legacyVendorId = String(invoice?.vendorId?._id || invoice?.vendorId || '')
      return (
        legacyVendorId === vendorId ||
        (clientId === vendorId && String(invoice?.clientType || 'Vendor') === 'Vendor')
      )
    })

    const payments = (paymentRows || []).filter((payment) => {
      const clientId = String(payment?.clientId?._id || payment?.clientId || '')
      const legacyVendorId = String(payment?.vendorId?._id || payment?.vendorId || '')
      return (
        legacyVendorId === vendorId ||
        (clientId === vendorId && String(payment?.clientType || 'Vendor') === 'Vendor')
      )
    })

    const statementRows = [
      ...invoices.map((invoice) => ({
        date: invoice.invoiceDate || invoice.createdAt,
        createdAt: invoice.createdAt || invoice.invoiceDate,
        transactionNo: invoice.invoiceNumber || '-',
        transactionType: 'Purchase Invoice',
        description: String(invoice.transactionDescription || '').trim() || 'Purchase Invoice',
        debit: Number(invoice.totalAmount) || 0,
        credit: 0
      })),
      ...payments.map((payment) => ({
        date: payment.paymentDate || payment.createdAt,
        createdAt: payment.createdAt || payment.paymentDate,
        transactionNo: payment.paymentNumber || '-',
        transactionType: 'Purchase Payment',
        description: String(payment.description || '').trim() || 'Payment Made',
        debit: 0,
        credit: Number(payment.amount) || 0
      }))
    ].sort((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime()
      if (dateDiff !== 0) return dateDiff
      const typeDiff = (a.credit > 0 ? 1 : 0) - (b.credit > 0 ? 1 : 0)
      if (typeDiff !== 0) return typeDiff
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

    let runningBalance = 0
    const transactions = statementRows.map((row) => {
      runningBalance += row.debit - row.credit
      return {
        date: row.date,
        transactionNo: row.transactionNo,
        transactionType: row.transactionType,
        description: row.description,
        debit: row.debit,
        credit: row.credit,
        balance: runningBalance
      }
    })

    const totalInvoice = invoices.reduce((sum, invoice) => sum + (Number(invoice.totalAmount) || 0), 0)
    const totalPayment = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
    const openingBalance = 0
    const closingBalance = openingBalance + totalInvoice - totalPayment

    return {
      vendor: vendorRecord,
      summary: {
        openingBalance,
        totalInvoice,
        totalPayment,
        closingBalance
      },
      transactions
    }
  }

  const buildVendorStatementFallback = async (vendor) => {
    const [vendorRecord, invoiceData, paymentData] = await Promise.all([
      fetchJsonWithAuth(`${API_URL}/${vendor._id}`, 'Error fetching vendor details'),
      fetchJsonWithAuth(`${API_BASE_URL}/api/purchase-invoices?limit=1000`, 'Error fetching purchase invoices'),
      fetchJsonWithAuth(`${API_BASE_URL}/api/purchase-payments?limit=1000`, 'Error fetching purchase payments')
    ])

    return buildVendorStatementPayload(
      vendorRecord || vendor,
      invoiceData?.invoices || [],
      paymentData?.payments || []
    )
  }

  // Function to fetch next vendor id
  const fetchNextVendorId = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/next-id`);
      const data = await readJsonResponse(response, 'Error fetching next vendor id');
      setVendorForm(prev => ({ ...prev, id: data.nextId }));
    } catch (err) {
      console.error('Error fetching next vendor id:', err);
    }
  }, []);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortOrder('asc');
    }
  };

  const fetchVendors = useCallback(async (page = 1, search = searchQuery, column = sortColumn, order = sortOrder) => {
    setLoading(true);
    try {
      let url = `${API_URL}?page=${page}&limit=25&search=${encodeURIComponent(search)}`;
      if (column) {
        url += `&sortColumn=${encodeURIComponent(column)}&sortOrder=${encodeURIComponent(order)}`;
      }
      const response = await fetch(url);
      const data = await readJsonResponse(response, 'Error fetching vendors');
      setVendors(data.vendors || []);
      setTotalPages(data.totalPages || 0);
      setCurrentPage(page);
    } catch (err) {
      console.error('Error fetching vendors:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sortColumn, sortOrder]);

  const fetchCustomFields = useCallback(async () => {
    try {
      const response = await fetch(CUSTOM_FIELDS_API_URL);
      const fields = await response.json();
      setCustomFieldNames(fields.map(f => f.fieldName));
      setCustomColumns(fields.filter(f => f.showInTable).map(f => f.fieldName));
      // Initialize custom fields array if form is open
      if (formOpen || editingVendorId) {
        // Get existing custom fields from current state (using functional update to avoid dependency)
        setCustomFieldsArray(prevArray => {
          return fields.map(f => {
            // Try to find existing value from previous array, default to empty string
            const existingField = prevArray.find(item => item.key === f.fieldName);
            return {
              key: f.fieldName,
              value: existingField?.value || ''
            };
          });
        });
        // Also update vendorForm.customFields using functional update
        setVendorForm(prevForm => {
          const existingCustomFields = prevForm.customFields || {};
          const customFieldsObj = {};
          fields.forEach(f => {
            customFieldsObj[f.fieldName] = existingCustomFields[f.fieldName] || '';
          });
          return { ...prevForm, customFields: customFieldsObj };
        });
      }
    } catch (err) {
      console.error('Error fetching custom fields:', err);
    } finally {
      setCustomFieldsLoading(false);
    }
  }, [formOpen, editingVendorId]);

  // Fetch vendors and custom fields on component mount
  useEffect(() => {
    fetchVendors(1, searchQuery, sortColumn, sortOrder);
    fetchNextVendorId();
    fetchCustomFields();
  }, [searchQuery, sortColumn, sortOrder, fetchVendors, fetchNextVendorId, fetchCustomFields]);

  // Validation function
  const validateForm = () => {
    const newErrors = {};

    const fields = ['vendorName', 'companyName', 'contactNumber', 'email', 'address'];
    fields.forEach(field => {
      const error = validateField(field, vendorForm[field]);
      if (error) {
        newErrors[field] = error;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Validate single field
  const validateField = (name, value) => {
    let error = '';

    switch (name) {
      case 'vendorName':
        if (!value.trim()) {
          error = 'Please enter a vendor name';
        } else if (value.trim().length < 2) {
          error = 'Vendor name must be at least 2 characters';
        }
        break;
      case 'companyName':
        if (!value.trim()) {
          error = 'Please enter a company name';
        } else if (value.trim().length < 2) {
          error = 'Company name must be at least 2 characters';
        }
        break;
      case 'contactNumber':
        if (!value.trim()) {
          error = 'Please enter a contact number';
        } else {
          const phoneRegex = /^[0-9+\-\s()]{6,}$/;
          if (!phoneRegex.test(value.trim())) {
            error = 'Please enter a valid contact number';
          }
        }
        break;
      case 'email':
        if (!value.trim()) {
          error = 'Please enter an email address';
        } else {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value.trim())) {
            error = 'Please enter a valid email address';
          }
        }
        break;
      case 'address':
        if (!value.trim()) {
          error = 'Please enter an address';
        } else if (value.trim().length < 5) {
          error = 'Address must be at least 5 characters';
        }
        break;
    }

    return error;
  };

  // Vendor form handlers
  // Handle adding a new custom field
  const addCustomField = () => {
    setAddFieldPopupOpen(true);
    setNewFieldName('');
    setAddToListTable(false);
  };

  // Handle saving new custom field
  const saveNewCustomField = async () => {
    if (!newFieldName.trim()) return;
    // Avoid duplicates
    if (customFieldNames.includes(newFieldName.trim())) {
      alert('This field name already exists!');
      return;
    }

    try {
      // Save to backend
      const token = getAuthToken();
      const response = await fetch(CUSTOM_FIELDS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          fieldName: newFieldName.trim(),
          showInTable: addToListTable
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Error adding custom field');
      }

      // Refresh custom fields from backend
      await fetchCustomFields();
      // Refresh vendor list
      await fetchVendors();
      
      // Close popup
      setAddFieldPopupOpen(false);
    } catch (err) {
      console.error('Error saving custom field:', err);
      alert(err.message || 'Error adding custom field!');
    }
  };

  // Handle removing a custom field
  const removeCustomField = async (index, fieldName) => {
    // Ask for confirmation before deleting
    if (!window.confirm(`Are you sure you want to delete the field "${fieldName}"?`)) {
      return;
    }

    try {
      // Delete from backend
      const token = getAuthToken();
      const response = await fetch(`${CUSTOM_FIELDS_API_URL}/${encodeURIComponent(fieldName)}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Error deleting custom field');
      }

      // Refresh custom fields from backend
      await fetchCustomFields();
      // Refresh vendor list
      await fetchVendors();
    } catch (err) {
      console.error('Error deleting custom field:', err);
      alert(err.message || 'Error deleting custom field!');
    }
  };

  // Handle renaming a custom field
  const renameCustomField = async () => {
    if (!editingFieldNewName.trim() || editingFieldNewName.trim() === editingFieldOldName) {
      setEditFieldPopupOpen(false);
      return;
    }

    // Check if new name already exists
    if (customFieldNames.includes(editingFieldNewName.trim()) && editingFieldNewName.trim() !== editingFieldOldName) {
      alert('This field name already exists!');
      return;
    }

    // Preserve existing value for the field being renamed
    const existingValue = vendorForm.customFields?.[editingFieldOldName] || '';

    try {
      // Update in backend
      const token = getAuthToken();
      const response = await fetch(`${CUSTOM_FIELDS_API_URL}/${encodeURIComponent(editingFieldOldName)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          newFieldName: editingFieldNewName.trim()
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Error renaming custom field');
      }

      // First update vendorForm to preserve the value under the new name
      const updatedCustomFields = { ...vendorForm.customFields };
      if (editingFieldOldName in updatedCustomFields) {
        const value = updatedCustomFields[editingFieldOldName];
        delete updatedCustomFields[editingFieldOldName];
        updatedCustomFields[editingFieldNewName.trim()] = value;
      } else if (existingValue) {
        updatedCustomFields[editingFieldNewName.trim()] = existingValue;
      }
      setVendorForm(prev => ({ ...prev, customFields: updatedCustomFields }));

      // Then refresh custom fields from backend
      await fetchCustomFields();
      // Refresh vendor list
      await fetchVendors();

      // Close popup
      setEditFieldPopupOpen(false);
    } catch (err) {
      console.error('Error renaming custom field:', err);
      alert(err.message || 'Error renaming custom field!');
    }
  };

  // Handle custom field input changes
  const handleCustomFieldChange = (index, field, value) => {
    const updated = [...customFieldsArray];
    updated[index][field] = value;
    setCustomFieldsArray(updated);
    // Update vendorForm
    const customFieldsObj = {};
    updated.forEach(f => {
      if (f.key.trim()) {
        customFieldsObj[f.key.trim()] = f.value;
      }
    });
    setVendorForm(prev => ({ ...prev, customFields: customFieldsObj }));
  };

  const handleVendorInputChange = (e) => {
    const { name, value } = e.target;
    const updatedForm = {
      ...vendorForm,
      [name]: value
    };
    setVendorForm(updatedForm);
    
    // Real-time validation
    if (formSubmitted) {
      const error = validateField(name, value);
      setErrors(prev => {
        const newErrors = { ...prev };
        if (error) {
          newErrors[name] = error;
        } else {
          delete newErrors[name];
        }
        return newErrors;
      });
    }
  };

  const handleVendorSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitted(true);

    if (!validateForm()) {
      return;
    }
    setLoading(true);
    try {
      const token = getAuthToken()
      const payload = {
        ...vendorForm,
        id: String(vendorForm.id || '').trim(),
        vendorName: String(vendorForm.vendorName || '').trim(),
        companyName: String(vendorForm.companyName || '').trim(),
        contactNumber: String(vendorForm.contactNumber || '').trim(),
        email: String(vendorForm.email || '').trim(),
        address: String(vendorForm.address || '').trim(),
        note: String(vendorForm.note || '').trim()
      }

      if (!editingVendorId && !payload.id) {
        const idResponse = await fetch(`${API_URL}/next-id`)
        const idData = await readJsonResponse(idResponse, 'Error fetching next vendor id')
        const nextId = String(idData?.nextId || '').trim()
        if (nextId) {
          payload.id = nextId
          setVendorForm(prev => ({ ...prev, id: nextId }))
        }
      }

      if (editingVendorId) {
        // Update existing vendor
        const response = await fetch(`${API_URL}/${editingVendorId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || 'Error updating vendor');
        }

        setEditingVendorId(null);
        alert('Vendor updated successfully!');
      } else {
        // Add new vendor to list
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || 'Error saving vendor');
        }

        alert('Vendor added successfully!');
      }
      // Refresh vendor list (go to first page after adding/updating)
      await fetchVendors(1, searchQuery, sortColumn, sortOrder);
      // Reset custom fields array with permanent field names
      const initialCustomFieldsArray = customFieldNames.map(fieldName => ({
        key: fieldName,
        value: ''
      }))
      setCustomFieldsArray(initialCustomFieldsArray)
      // Initialize customFields in vendorForm
      const initialCustomFields = {}
      customFieldNames.forEach(fieldName => {
        initialCustomFields[fieldName] = ''
      })
      // Reset form
      setVendorForm({
        id: '',
        vendorName: '',
        companyName: '',
        contactNumber: '',
        email: '',
        address: '',
        note: '',
        customFields: initialCustomFields
      });
      await fetchNextVendorId();
      setErrors({});
      setFormSubmitted(false);
      setFormOpen(false)
    } catch (err) {
      console.error('Error saving vendor:', err);
      alert(err.message || 'Error saving vendor!');
    } finally {
      setLoading(false);
    }
  };

  const openCreateVendor = async () => {
    if (loading) return
    setEditingVendorId(null)
    // Initialize custom fields array with all permanent custom field names
    const initialCustomFieldsArray = customFieldNames.map(fieldName => ({
      key: fieldName,
      value: ''
    }))
    setCustomFieldsArray(initialCustomFieldsArray)
    // Initialize customFields in vendorForm
    const initialCustomFields = {}
    customFieldNames.forEach(fieldName => {
      initialCustomFields[fieldName] = ''
    })
    setVendorForm({
      id: '',
      vendorName: '',
      companyName: '',
      contactNumber: '',
      email: '',
      address: '',
      note: '',
      customFields: initialCustomFields
    })
    await fetchNextVendorId()
    setErrors({})
    setFormSubmitted(false)
    setFormOpen(true)
  }

  const handleEditVendor = async (vendor) => {
    try {
      // Fetch full vendor details to ensure we have all customFields
      const token = getAuthToken()
      const response = await fetch(`${API_URL}/${vendor._id}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
      if (!response.ok) throw new Error('Failed to fetch vendor details')
      const fullVendor = await response.json()

      // Convert vendor's customFields to array, and add any missing permanent fields
      const vendorCustomFields = fullVendor.customFields || {}
      const customArray = customFieldNames.map(fieldName => ({
        key: fieldName,
        value: vendorCustomFields[fieldName] || ''
      }))
      setCustomFieldsArray(customArray)
      // Build customFields object with all permanent fields
      const customFields = {}
      customFieldNames.forEach(fieldName => {
        customFields[fieldName] = vendorCustomFields[fieldName] || ''
      })
      setVendorForm({
        id: fullVendor.id,
        vendorName: fullVendor.vendorName || '',
        companyName: fullVendor.companyName || '',
        contactNumber: fullVendor.contactNumber,
        email: fullVendor.email,
        address: fullVendor.address,
        note: fullVendor.note,
        customFields
      })
      setEditingVendorId(fullVendor._id)
      setErrors({})
      setFormSubmitted(false)
      setFormOpen(true)
    } catch (err) {
      console.error('Error fetching vendor for edit:', err)
      alert('Failed to load vendor details')
    }
  };

  const handleCancelEdit = async () => {
    setEditingVendorId(null);
    // Reset custom fields array with permanent field names
    const initialCustomFieldsArray = customFieldNames.map(fieldName => ({
      key: fieldName,
      value: ''
    }))
    setCustomFieldsArray(initialCustomFieldsArray);
    // Reset vendorForm
    const initialCustomFields = {}
    customFieldNames.forEach(fieldName => {
      initialCustomFields[fieldName] = ''
    })
    setVendorForm({
      id: '',
      vendorName: '',
      companyName: '',
      contactNumber: '',
      email: '',
      address: '',
      note: '',
      customFields: initialCustomFields
    });
    await fetchNextVendorId();
    setErrors({});
    setFormSubmitted(false);
    setFormOpen(false)
  };

  const closeVendorForm = () => {
    if (loading) return
    setFormOpen(false)
  }

  const handleDeleteVendor = async (id) => {
    if (!isAdmin) {
      alert('Only admin can delete.')
      return
    }
    if (window.confirm('Are you sure you want to delete this vendor?')) {
      try {
        const token = getAuthToken()
        const response = await fetch(`${API_URL}/${id}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || 'Error deleting vendor');
        }
        await fetchVendors(currentPage);
        alert('Vendor deleted successfully!');
      } catch (err) {
        console.error('Error deleting vendor:', err);
        alert('Error deleting vendor!');
      }
    }
  };

  const openInfo = async (vendor) => {
    setInfoOpen(true)
    setInfoVendor(vendor || null)
    const id = vendor?._id
    if (!id) return
    setInfoLoading(true)
    setInfoNowMs(Date.now())
    try {
      const token = getAuthToken()
      const response = await fetch(`${API_URL}/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      const data = await readJsonResponse(response, 'Error fetching vendor info')
      setInfoVendor(data || null)
    } catch (err) {
      console.error('Error fetching vendor info:', err)
    } finally {
      setInfoLoading(false)
    }
  }

  const refreshInfo = async () => {
    const id = infoVendor?._id
    if (!id) return
    setInfoLoading(true)
    setInfoNowMs(Date.now())
    try {
      // Refresh custom fields first to ensure we have the latest
      await fetchCustomFields()
      
      const token = getAuthToken()
      const response = await fetch(`${API_URL}/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      const data = await readJsonResponse(response, 'Error refreshing vendor info')
      
      // Ensure customFields is always an object
      if (data && !data.customFields) {
        data.customFields = {}
      }
      
      setInfoVendor(data || null)
    } catch (err) {
      console.error('Error refreshing vendor info:', err)
    } finally {
      setInfoLoading(false)
    }
  }

  const closeInfo = () => {
    setInfoOpen(false)
    setInfoVendor(null)
  }

  const handleDownloadPdf = () => {
    if (!pdfBlobUrl) return
    const a = document.createElement('a')
    a.href = pdfBlobUrl
    a.download = pdfFileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const generateVendorStatementPdf = async (vendor) => {
    const id = vendor?._id
    if (!id) return

    try {
      let data
      try {
        data = await fetchJsonWithAuth(`${API_URL}/${id}/statement`, 'Error fetching vendor statement')
      } catch (statementErr) {
        console.warn('Falling back to local vendor statement builder:', statementErr)
        data = await buildVendorStatementFallback(vendor)
      }

      const statementVendor = data?.vendor || vendor
      const summary = data?.summary || {}
      const transactions = Array.isArray(data?.transactions) ? data.transactions : []

      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const marginLeft = 10
      const marginRight = 10
      let y = 14

      doc.setTextColor(17, 24, 39)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.text('Vendor Statement', marginLeft, y)

      y += 8
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, marginLeft, y)

      y += 8
      doc.setDrawColor(0, 0, 0)
      doc.setLineWidth(0.4)
      doc.roundedRect(marginLeft, y, pageWidth - marginLeft - marginRight, 30, 3, 3)

      const vendorName = statementVendor?.vendorName || '-'
      const companyName = statementVendor?.companyName || '-'
      const vendorCode = statementVendor?.id || '-'
      const contactNumber = statementVendor?.contactNumber || '-'
      const email = statementVendor?.email || '-'
      const address = statementVendor?.address || '-'

      let detailY = y + 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text('Vendor Details', marginLeft + 4, detailY)

      detailY += 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('Name:', marginLeft + 4, detailY)
      doc.setFont('helvetica', 'normal')
      doc.text(String(vendorName), marginLeft + 23, detailY)

      doc.setFont('helvetica', 'bold')
      doc.text('Vendor ID:', marginLeft + 105, detailY)
      doc.setFont('helvetica', 'normal')
      doc.text(String(vendorCode), marginLeft + 126, detailY)

      detailY += 5
      doc.setFont('helvetica', 'bold')
      doc.text('Company:', marginLeft + 4, detailY)
      doc.setFont('helvetica', 'normal')
      doc.text(String(companyName), marginLeft + 23, detailY)

      doc.setFont('helvetica', 'bold')
      doc.text('Mobile:', marginLeft + 105, detailY)
      doc.setFont('helvetica', 'normal')
      doc.text(String(contactNumber), marginLeft + 126, detailY)

      detailY += 5
      doc.setFont('helvetica', 'bold')
      doc.text('Email:', marginLeft + 4, detailY)
      doc.setFont('helvetica', 'normal')
      doc.text(String(email), marginLeft + 23, detailY)

      const addressLines = doc.splitTextToSize(String(address), 72)
      doc.setFont('helvetica', 'bold')
      doc.text('Address:', marginLeft + 105, detailY)
      doc.setFont('helvetica', 'normal')
      doc.text(addressLines, marginLeft + 126, detailY)

      y += 38
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text('Summary', marginLeft, y)

      autoTable(doc, {
        startY: y + 3,
        margin: { left: marginLeft, right: marginRight },
        theme: 'grid',
        head: [['Particular', 'Amount']],
        body: [
          ['Opening Balance', formatPdfMoney(summary.openingBalance || 0)],
          ['Total Invoice', formatPdfMoney(summary.totalInvoice || 0)],
          ['Total Payment', formatPdfMoney(summary.totalPayment || 0)],
          ['Closing Balance', formatPdfMoney(summary.closingBalance || 0)]
        ],
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [17, 24, 39],
          fontStyle: 'bold',
          lineColor: [0, 0, 0],
          lineWidth: 0.2
        },
        bodyStyles: {
          font: 'helvetica',
          fontStyle: 'normal',
          textColor: [17, 24, 39],
          lineColor: [0, 0, 0],
          lineWidth: 0.15
        },
        columnStyles: {
          0: { cellWidth: 115, halign: 'left' },
          1: { cellWidth: 65, halign: 'right', fontStyle: 'normal' }
        }
      })

      y = (doc.lastAutoTable?.finalY || y + 35) + 10
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text('Statement Grid', marginLeft, y)

      autoTable(doc, {
        startY: y + 3,
        margin: { left: marginLeft, right: marginRight },
        theme: 'grid',
        head: [['Date', 'Transaction No', 'Transaction Type', 'Description', 'Debit (Invoice)', 'Credit (Payment)', 'Balance']],
        body: transactions.length > 0
          ? transactions.map((row) => [
              formatPdfDate(row.date),
              row.transactionNo || '-',
              row.transactionType || '-',
              row.description || '-',
              row.debit ? formatPdfMoney(row.debit) : '-',
              row.credit ? formatPdfMoney(row.credit) : '-',
              formatPdfMoney(row.balance || 0)
            ])
          : [['-', '-', '-', 'No transactions found', '-', '-', formatPdfMoney(summary.closingBalance || 0)]],
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [17, 24, 39],
          fontStyle: 'bold',
          fontSize: 8,
          lineColor: [0, 0, 0],
          lineWidth: 0.2
        },
        bodyStyles: {
          fontSize: 8,
          font: 'helvetica',
          fontStyle: 'normal',
          textColor: [17, 24, 39],
          lineColor: [0, 0, 0],
          lineWidth: 0.15,
          cellPadding: { top: 2, right: 1.2, bottom: 2, left: 1.2 }
        },
        columnStyles: {
          0: { cellWidth: 20, halign: 'left' },
          1: { cellWidth: 24, halign: 'left' },
          2: { cellWidth: 34, halign: 'left' },
          3: { cellWidth: 28, halign: 'left' },
          4: { cellWidth: 28, halign: 'right', fontStyle: 'normal' },
          5: { cellWidth: 27, halign: 'right', fontStyle: 'normal' },
          6: { cellWidth: 29, halign: 'right', fontStyle: 'normal' }
        },
        didParseCell: (hookData) => {
          if (hookData.section !== 'body') return
          if (![4, 5, 6].includes(hookData.column.index)) return
          hookData.cell.styles.fontStyle = 'normal'
          hookData.cell.styles.font = 'helvetica'
          hookData.cell.styles.fontSize = 8
          hookData.cell.styles.halign = 'right'
        },
        didDrawPage: () => {
          doc.setFontSize(8)
          doc.setTextColor(107, 114, 128)
          doc.text(
            'Vendor statement generated from GoldFlow.',
            pageWidth / 2,
            pageHeight - 8,
            { align: 'center' }
          )
        }
      })

      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      setPdfBlobUrl(url)
      setPdfFileName(`vendor_statement_${statementVendor?.id || statementVendor?.vendorName || 'vendor'}.pdf`)
      setPdfViewerOpen(true)
    } catch (err) {
      console.error('Error generating vendor statement PDF:', err)
      alert(err.message || 'Failed to generate vendor statement PDF')
    }
  }

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0 }}>
        <MotionButton
          type="button"
          onClick={openCreateVendor}
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
          Add Vendor
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
            if (e.target === e.currentTarget) closeVendorForm()
          }}
        >
          <div
            className="card"
            style={{
              width: 'min(980px, 96vw)',
              maxHeight: '88vh',
              overflow: 'auto',
              padding: '1.5rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, color: 'var(--text-header)' }}>
                {editingVendorId ? 'Edit Vendor' : 'Add New Vendor'}
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
                  Vendor ID : {vendorForm.id || 'xxxx'}
                </div>
                <MotionButton
                  type="button"
                  onClick={closeVendorForm}
                  disabled={loading}
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
            <form onSubmit={handleVendorSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    <span>Vendor Name <span style={{ color: 'var(--danger)' }}>*</span></span>
                  </label>
                  <input
                    type="text"
                    name="vendorName"
                    value={vendorForm.vendorName}
                    onChange={handleVendorInputChange}
                    disabled={loading}
                    autoComplete="name"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: `2px solid ${errors.vendorName ? '#ef4444' : 'var(--border)'}`,
                      borderRadius: '12px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s ease',
                      opacity: loading ? 0.7 : 1,
                      outline: 'none',
                      boxShadow: errors.vendorName ? '0 0 0 3px rgba(239, 68, 68, 0.1)' : 'none'
                    }}
                    placeholder="Enter vendor name"
                  />
                  {formSubmitted && errors.vendorName && (
                    <p style={{
                      color: '#ef4444',
                      fontSize: '0.875rem',
                      marginTop: '0.5rem',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {errors.vendorName}
                    </p>
                  )}
                </div>

                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    <span>Company Name <span style={{ color: 'var(--danger)' }}>*</span></span>
                    {/* <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Optional</span> */}
                  </label>
                  <input
                    type="text"
                    name="companyName"
                    value={vendorForm.companyName}
                    onChange={handleVendorInputChange}
                    disabled={loading}
                    autoComplete="organization"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: `2px solid ${errors.companyName ? '#ef4444' : 'var(--border)'}`,
                      borderRadius: '12px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s ease',
                      opacity: loading ? 0.7 : 1,
                      outline: 'none',
                      boxShadow: errors.companyName ? '0 0 0 3px rgba(239, 68, 68, 0.1)' : 'none'
                    }}
                    placeholder="Enter company name"
                  />
                  {formSubmitted && errors.companyName && (
                    <p style={{
                      color: '#ef4444',
                      fontSize: '0.875rem',
                      marginTop: '0.5rem',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {errors.companyName}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    <span>Contact Number <span style={{ color: 'var(--danger)' }}>*</span></span>
                  </label>
                  <input
                    type="tel"
                    name="contactNumber"
                    value={vendorForm.contactNumber}
                    onChange={handleVendorInputChange}
                    disabled={loading}
                    inputMode="tel"
                    autoComplete="tel"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: `2px solid ${errors.contactNumber ? '#ef4444' : 'var(--border)'}`,
                      borderRadius: '12px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s ease',
                      opacity: loading ? 0.7 : 1,
                      outline: 'none',
                      boxShadow: errors.contactNumber ? '0 0 0 3px rgba(239, 68, 68, 0.1)' : 'none'
                    }}
                    placeholder="Enter contact number"
                  />
                  {formSubmitted && errors.contactNumber && (
                    <p style={{
                      color: '#ef4444',
                      fontSize: '0.875rem',
                      marginTop: '0.5rem',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {errors.contactNumber}
                    </p>
                  )}
                </div>

                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    <span>Email <span style={{ color: 'var(--danger)' }}>*</span></span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={vendorForm.email}
                    onChange={handleVendorInputChange}
                    disabled={loading}
                    autoComplete="email"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: `2px solid ${errors.email ? '#ef4444' : 'var(--border)'}`,
                      borderRadius: '12px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s ease',
                      opacity: loading ? 0.7 : 1,
                      outline: 'none',
                      boxShadow: errors.email ? '0 0 0 3px rgba(239, 68, 68, 0.1)' : 'none'
                    }}
                    placeholder="Enter email address"
                  />
                  {formSubmitted && errors.email && (
                    <p style={{
                      color: '#ef4444',
                      fontSize: '0.875rem',
                      marginTop: '0.5rem',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {errors.email}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    <span>Address <span style={{ color: 'var(--danger)' }}>*</span></span>
                  </label>
                  <textarea
                    name="address"
                    value={vendorForm.address}
                    onChange={handleVendorInputChange}
                    rows={3}
                    disabled={loading}
                    autoComplete="street-address"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: `2px solid ${errors.address ? '#ef4444' : 'var(--border)'}`,
                      borderRadius: '12px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s ease',
                      resize: 'vertical',
                      opacity: loading ? 0.7 : 1,
                      outline: 'none',
                      boxShadow: errors.address ? '0 0 0 3px rgba(239, 68, 68, 0.1)' : 'none'
                    }}
                    placeholder="Enter vendor address"
                  ></textarea>
                  {formSubmitted && errors.address && (
                    <p style={{
                      color: '#ef4444',
                      fontSize: '0.875rem',
                      marginTop: '0.5rem',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {errors.address}
                    </p>
                  )}
                </div>

                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    Note
                  </label>
                  <textarea
                    name="note"
                    value={vendorForm.note}
                    onChange={handleVendorInputChange}
                    rows={3}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s',
                      resize: 'vertical',
                      opacity: loading ? 0.7 : 1
                    }}
                    placeholder="Add any notes"
                  ></textarea>
                </div>
              </div>

              {/* Custom Fields Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Admin: Add new field button (only when not editing vendor) */}
                {isAdmin && !editingVendorId && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1rem' }}>Custom Fields</h3>
                    <MotionButton
                      type="button"
                      onClick={addCustomField}
                      disabled={loading}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        opacity: loading ? 0.7 : 1
                      }}
                    >
                      Add Field
                    </MotionButton>
                  </div>
                )}
                
                {/* Render all custom fields in 2 columns */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  {customFieldsArray.map((field, index) => (
                    <div key={index}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ marginBottom: 0, fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                          {field.key || 'Custom Field'}
                        </label>
                        {/* Only show edit/delete buttons for custom fields when NOT editing vendor */}
                        {isAdmin && !editingVendorId && (
                          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                            <MotionButton
                              type="button"
                              onClick={() => {
                                setEditingFieldIndex(index)
                                setEditingFieldOldName(field.key)
                                setEditingFieldNewName(field.key)
                                setEditFieldPopupOpen(true)
                              }}
                              disabled={loading}
                              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)')}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              style={{
                                padding: '0.25rem',
                                background: 'transparent',
                                color: 'var(--text-header)',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                opacity: loading ? 0.7 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <Edit2 size={16} />
                            </MotionButton>
                            <MotionButton
                              type="button"
                              onClick={() => removeCustomField(index, field.key)}
                              disabled={loading}
                              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)')}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              style={{
                                padding: '0.25rem',
                                background: 'transparent',
                                color: 'var(--danger)',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                opacity: loading ? 0.7 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <X size={18} />
                            </MotionButton>
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        value={field.value}
                        onChange={(e) => handleCustomFieldChange(index, 'value', e.target.value)}
                        disabled={loading}
                        style={{
                          width: '100%',
                          padding: '0.75rem 1rem',
                          border: '2px solid var(--border)',
                          borderRadius: '12px',
                          fontSize: '0.9375rem',
                          background: 'var(--bg-card)',
                          color: 'var(--text-header)',
                          transition: 'all 0.2s ease',
                          opacity: loading ? 0.7 : 1,
                          outline: 'none'
                        }}
                        placeholder={`Enter ${field.key || 'value'}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                <MotionButton
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '0.875rem 1.5rem',
                    background: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: loading ? 0.5 : 1
                  }}
                >
                  <Save size={16} />
                  {loading ? 'Saving...' : editingVendorId ? 'Update Vendor' : 'Save Vendor'}
                </MotionButton>
                {!editingVendorId && (
                  <MotionButton
                    type="button"
                    onClick={async () => {
                      // Reset custom fields array with permanent field names
                      const initialCustomFieldsArray = customFieldNames.map(fieldName => ({
                        key: fieldName,
                        value: ''
                      }))
                      setCustomFieldsArray(initialCustomFieldsArray)
                      // Reset vendorForm
                      const initialCustomFields = {}
                      customFieldNames.forEach(fieldName => {
                        initialCustomFields[fieldName] = ''
                      })
                      setVendorForm({
                        id: '',
                        vendorName: '',
                        companyName: '',
                        contactNumber: '',
                        email: '',
                        address: '',
                        note: '',
                        customFields: initialCustomFields
                      });
                      await fetchNextVendorId();
                      setErrors({});
                      setFormSubmitted(false);
                    }}
                    disabled={loading}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '0.9375rem',
                      fontWeight: 700,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      opacity: loading ? 0.7 : 1
                    }}
                  >
                    <RotateCcw size={16} />
                    Reset
                  </MotionButton>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Custom Field Popup */}
      {addFieldPopupOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAddFieldPopupOpen(false)
          }}
        >
          <div
            className="card"
            style={{
              width: 'min(400px, 96vw)',
              maxHeight: '88vh',
              overflow: 'auto',
              padding: '2rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--text-header)' }}>Add Custom Field</h3>
              <MotionButton
                type="button"
                onClick={() => setAddFieldPopupOpen(false)}
                style={{
                  padding: '0.5rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
              >
                <X size={20} />
              </MotionButton>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                  Field Name
                </label>
                <input
                  type="text"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '2px solid var(--border)',
                    borderRadius: '12px',
                    fontSize: '0.9375rem',
                    background: 'var(--bg-card)',
                    color: 'var(--text-header)',
                    outline: 'none'
                  }}
                  placeholder="Enter field name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNewCustomField()
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="addToListTable"
                  checked={addToListTable}
                  onChange={(e) => setAddToListTable(e.target.checked)}
                  style={{
                    width: '1rem',
                    height: '1rem',
                    cursor: 'pointer'
                  }}
                />
                <label
                  htmlFor="addToListTable"
                  style={{
                    color: 'var(--text-header)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Add to vendor list table
                </label>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <MotionButton
                  type="button"
                  onClick={() => setAddFieldPopupOpen(false)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'var(--bg-main)',
                    color: 'var(--text-header)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </MotionButton>
                <MotionButton
                  type="button"
                  onClick={saveNewCustomField}
                  disabled={!newFieldName.trim()}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    cursor: newFieldName.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    opacity: newFieldName.trim() ? 1 : 0.5
                  }}
                >
                  Add Field
                </MotionButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Custom Field Popup */}
      {editFieldPopupOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditFieldPopupOpen(false)
          }}
        >
          <div
            className="card"
            style={{
              width: 'min(400px, 96vw)',
              maxHeight: '88vh',
              overflow: 'auto',
              padding: '2rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: 'var(--text-header)' }}>Edit Custom Field</h3>
              <MotionButton
                type="button"
                onClick={() => setEditFieldPopupOpen(false)}
                style={{
                  padding: '0.5rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
              >
                <X size={20} />
              </MotionButton>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                  Field Name
                </label>
                <input
                  type="text"
                  value={editingFieldNewName}
                  onChange={(e) => setEditingFieldNewName(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '2px solid var(--border)',
                    borderRadius: '12px',
                    fontSize: '0.9375rem',
                    background: 'var(--bg-card)',
                    color: 'var(--text-header)',
                    outline: 'none'
                  }}
                  placeholder="Enter new field name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameCustomField()
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <MotionButton
                  type="button"
                  onClick={() => setEditFieldPopupOpen(false)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'var(--bg-main)',
                    color: 'var(--text-header)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </MotionButton>
                <MotionButton
                  type="button"
                  onClick={renameCustomField}
                  disabled={!editingFieldNewName.trim() || editingFieldNewName.trim() === editingFieldOldName}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    cursor: (editingFieldNewName.trim() && editingFieldNewName.trim() !== editingFieldOldName) ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    opacity: (editingFieldNewName.trim() && editingFieldNewName.trim() !== editingFieldOldName) ? 1 : 0.5
                  }}
                >
                  Rename
                </MotionButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vendor List */}
      {(
        <div className="card" style={{ margin: '0 auto 0', width: '100%', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1.25rem' }}>Vendor List</h2>

            {/* Search Bar */}
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
                placeholder="Search by company or vendor name..."
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

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading vendors...</div>
          ) : vendors.length === 0 ? (
            <EmptyDataCard />
          ) : (
            <div>
              {/* Mobile/Tablet Card View */}
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {vendors.map((vendor) => {
                    const vendorName =
                      vendor.vendorName ||
                      `${vendor.firstName || ''} ${vendor.lastName || ''}`.replace(/\s+/g, ' ').trim()
                    const companyName = vendor.companyName || ''
                    const mobile = vendor.contactNumber || ''
                    const email = vendor.email || ''
                    const outstandingAmount = vendor.outstanding?.outstanding || 0
                    const outstanding = formatMoney(outstandingAmount)
                    
                    return (
                      <div 
                        key={vendor._id} 
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
                              {vendorName || '-'}
                            </div>
                            {companyName && (
                              <div style={{ 
                                fontSize: '0.875rem', 
                                color: 'var(--text-muted)',
                                fontWeight: 600
                              }}>
                                {companyName}
                              </div>
                            )}
                          </div>
                          <div style={{ position: 'relative' }}>
                            <MotionButton
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openDropdownId === vendor._id) {
                                  setOpenDropdownId(null);
                                  setDropdownVendor(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const { top, left, shouldOpenUp } = getActionDropdownPosition({
                                    rect,
                                    dropdownHeight: isAdmin ? 160 : 120
                                  });
                                  setDropdownPosition({ top, left });
                                  setDropdownUp(shouldOpenUp);
                                  setDropdownVendor(vendor);
                                  setOpenDropdownId(vendor._id);
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
                          {mobile && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Mobile:</div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600 }}>{mobile}</div>
                            </div>
                          )}
                          {email && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Email:</div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600, wordBreak: 'break-all' }}>{email}</div>
                            </div>
                          )}
                          {outstanding && outstanding !== '0' && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Outstanding:</div>
                              <div style={{ fontSize: '0.875rem', color: outstandingAmount < 0 ? '#16a34a' : 'var(--danger)', fontWeight: 800 }}>{outstanding}</div>
                            </div>
                          )}
                          {/* Custom columns */}
                          {customColumns.map((columnName) => {
                            const value = vendor.customFields?.[columnName]
                            if (!value) return null
                            return (
                              <div key={columnName} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>{columnName}:</div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600 }}>{value}</div>
                              </div>
                            )
                          })}
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
                          onClick={() => handleSort('companyName')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Company Name {sortColumn === 'companyName' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('vendorName')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Vendor Name {sortColumn === 'vendorName' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('contactNumber')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Mobile {sortColumn === 'contactNumber' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('email')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Email {sortColumn === 'email' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('outstanding')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Outstanding {sortColumn === 'outstanding' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        {/* Custom columns */}
                        {customColumns.map((columnName) => (
                          <th
                            key={columnName}
                            onClick={() => handleSort(`customField_${columnName}`)}
                            style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                          >
                            {columnName} {sortColumn === `customField_${columnName}` && (sortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                        ))}
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendors.map((vendor) => {
                        const vendorName =
                          vendor.vendorName ||
                          `${vendor.firstName || ''} ${vendor.lastName || ''}`.replace(/\s+/g, ' ').trim()
                        const companyName = vendor.companyName || ''
                        const mobile = vendor.contactNumber || ''
                        const email = vendor.email || ''
                        const outstandingAmount = vendor.outstanding?.outstanding || 0
                    const outstanding = formatMoney(outstandingAmount)
                        return (
                          <tr key={vendor._id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(companyName)}>
                              {truncateText(companyName) || '-'}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }}>
                              <span title={String(vendorName)}>{truncateText(vendorName)}</span>
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(mobile)}>
                              {truncateText(mobile)}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(email)}>
                              {truncateText(email)}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: outstandingAmount < 0 ? '#16a34a' : (outstandingAmount > 0 ? 'var(--danger)' : 'var(--text-main)') }} title={String(outstanding)}>
                              {outstanding}
                            </td>
                            {/* Custom column cells */}
                            {customColumns.map((columnName) => (
                              <td key={columnName} style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(vendor.customFields?.[columnName] || '-')}>
                                {truncateText(vendor.customFields?.[columnName] || '-')}
                              </td>
                            ))}
                            <td style={{ padding: '0.5rem 0.375rem' }}>
                              <div style={{ position: 'relative' }}>
                                <MotionButton
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (openDropdownId === vendor._id) {
                                      setOpenDropdownId(null);
                                      setDropdownVendor(null);
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const { top, left, shouldOpenUp } = getActionDropdownPosition({
                                        rect,
                                        dropdownHeight: isAdmin ? 160 : 120
                                      });
                                      setDropdownPosition({ top, left });
                                      setDropdownUp(shouldOpenUp);
                                      setDropdownVendor(vendor);
                                      setOpenDropdownId(vendor._id);
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
                    onClick={() => fetchVendors(currentPage - 1, searchQuery)}
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
                      onClick={() => fetchVendors(page, searchQuery)}
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
                    onClick={() => fetchVendors(currentPage + 1, searchQuery)}
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
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-header)' }}>Vendor Details</div>
                {/* <div style={{ marginTop: 2, fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {infoVendor?.vendorName ? `${infoVendor.vendorName}` : 'Vendor'}
                </div> */}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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

            {/* Vendor Details */}
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Vendor Name</div>
                  <div style={{ color: 'var(--text-header)', fontWeight: 700 }}>{infoVendor?.vendorName || '-'}</div>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Company Name</div>
                  <div style={{ color: 'var(--text-header)', fontWeight: 700 }}>{infoVendor?.companyName || '-'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Contact Number</div>
                  <div style={{ color: 'var(--text-header)', fontWeight: 700 }}>{infoVendor?.contactNumber || '-'}</div>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Email</div>
                  <div style={{ color: 'var(--text-header)', fontWeight: 700 }}>{infoVendor?.email || '-'}</div>
                </div>
              </div>
              {infoVendor?.address && (
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Address</div>
                  <div style={{ color: 'var(--text-header)', fontWeight: 700 }}>{infoVendor.address}</div>
                </div>
              )}
              {infoVendor?.note && (
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Note</div>
                  <div style={{ color: 'var(--text-header)', fontWeight: 700 }}>{infoVendor.note}</div>
                </div>
              )}
              {/* Custom Fields as individual columns */}
              {infoVendor?.customFields && (
                <>
                  {customFieldNames.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      {customFieldNames.map((fieldName, index) => {
                        const value = infoVendor.customFields?.[fieldName] || ''
                        if (!value) return null // Hide if no value
                        return (
                          <div key={fieldName} style={{ flex: '1 1 200px' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>{fieldName}</div>
                            <div style={{ color: 'var(--text-header)', fontWeight: 700 }}>{value}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {isAdmin && (
              (() => {
                const record = infoVendor?.id ? `Vendor • ${infoVendor.id}` : 'Vendor'
                const createdByName = infoVendor?.createdBy?.fullName || '-'
                const createdByEmail = infoVendor?.createdBy?.email || '-'
                const updatedByName = infoVendor?.updatedBy?.fullName || infoVendor?.updatedByName || '-'
                const updatedByEmail = infoVendor?.updatedBy?.email || infoVendor?.updatedByEmail || '-'

                const raw = Array.isArray(infoVendor?.activity) ? infoVendor.activity : []
                let activities = raw
                  .filter((a) => a && a.action && a.at)
                  .slice()
                  .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

                if (activities.length === 0) {
                  const fallback = []
                  if (infoVendor?.createdAt) {
                    fallback.push({
                      action: 'create',
                      at: infoVendor.createdAt,
                      userName: createdByName,
                      userEmail: createdByEmail,
                      changes: []
                    })
                  }
                  if (infoVendor?.updatedAt && infoVendor?.createdAt && new Date(infoVendor.updatedAt).getTime() !== new Date(infoVendor.createdAt).getTime()) {
                    fallback.unshift({
                      action: 'update',
                      at: infoVendor.updatedAt,
                      userName: updatedByName,
                      userEmail: updatedByEmail,
                      changes: []
                    })
                  }
                  activities = fallback
                }

                const items = activities.map((a, idx) => {
                  const isUpdate = a.action === 'update'
                  // Filter out customFields from changes
                  const filteredChanges = Array.isArray(a.changes) 
                    ? a.changes.filter(c => c.field !== 'customFields') 
                    : []
                  return {
                    key: `${a.action}-${new Date(a.at).getTime()}-${idx}`,
                    chip: isUpdate ? 'Update Vendor' : 'Create Vendor',
                    method: isUpdate ? 'PUT' : 'POST',
                    path: isUpdate ? '/api/vendors/:id' : '/api/vendors',
                    at: a.at,
                    icon: isUpdate ? '✎' : '+',
                    iconBg: isUpdate ? '#dbeafe' : '#d1fae5',
                    iconColor: isUpdate ? '#1d4ed8' : '#065f46',
                    userName: a.userName || (isUpdate ? updatedByName : createdByName) || '-',
                    userEmail: a.userEmail || (isUpdate ? updatedByEmail : createdByEmail) || '-',
                    record,
                    changes: filteredChanges
                  }
                })

                return (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-header)', marginBottom: '0.5rem' }}>Recent Activity</div>
                    {items.map((a, idx) => (
                      <div key={a.key} style={{ display: 'flex', gap: '0.9rem', padding: '0.75rem 0' }}>
                        <div style={{ width: 34, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 10,
                              background: a.iconBg,
                              color: a.iconColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 900,
                              border: '1px solid rgba(0,0,0,0.04)'
                            }}
                          >
                            {a.icon}
                          </div>
                          {idx !== items.length - 1 && (
                            <div style={{ flex: 1, width: 2, background: 'var(--border)', opacity: 0.6, marginTop: 8 }} />
                          )}
                        </div>

                        <div
                          style={{
                            flex: 1,
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 14,
                            padding: '0.85rem 0.95rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '0.25rem 0.6rem',
                                borderRadius: 999,
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                color: 'var(--text-header)',
                                fontWeight: 800,
                                fontSize: '0.85rem'
                              }}
                            >
                              {a.chip}
                            </div>
                            <div
                              style={{
                                padding: '0.2rem 0.55rem',
                                borderRadius: 999,
                                border: '1px solid var(--border)',
                                background: 'transparent',
                                color: 'var(--text-muted)',
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {infoLoading ? 'Loading...' : formatTimeAgo(a.at)}
                            </div>
                          </div>

                          <div style={{ marginTop: 10, color: 'var(--text-header)', fontWeight: 800, fontSize: '0.93rem' }}>
                            {infoLoading ? 'Loading...' : a.userName}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 700, marginLeft: 8 }}>
                              {infoLoading ? '' : a.userEmail && a.userEmail !== '-' ? `• ${a.userEmail}` : ''}
                            </span>
                          </div>

                          {Array.isArray(a.changes) && a.changes.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ color: 'var(--text-muted)', fontWeight: 900, fontSize: '0.85rem' }}>Recent Changes</div>
                              <div style={{ marginTop: 6, display: 'grid', gap: 4, color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem' }}>
                                {a.changes.map((c, i) => (
                                  <div key={`${c.field}-${i}`}>
                                    {c.field}: {c.from || '-'} → {c.to || '-'}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()
            )}

          </div>
        </div>
      )}

      {/* Dropdown Menu */}
      {openDropdownId && dropdownVendor && (
        <ActionMenuPortal>
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
              openInfo(dropdownVendor);
              setOpenDropdownId(null);
              setDropdownVendor(null);
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
              handleEditVendor(dropdownVendor);
              setOpenDropdownId(null);
              setDropdownVendor(null);
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
              generateVendorStatementPdf(dropdownVendor);
              setOpenDropdownId(null);
              setDropdownVendor(null);
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
                handleDeleteVendor(dropdownVendor._id);
                setOpenDropdownId(null);
                setDropdownVendor(null);
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
        </ActionMenuPortal>
      )}

      {pdfViewerOpen && pdfBlobUrl && (
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
          <div
            style={{
              background: '#f8fafc',
              borderBottom: '1px solid #e5e7eb',
              padding: '1rem 1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#1f2937',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <MotionButton
                onClick={() => setPdfViewerOpen(false)}
                style={{
                  background: 'rgba(0,0,0,0.05)',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  color: '#1f2937'
                }}
              >
                <X size={24} />
              </MotionButton>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800 }}>{pdfFileName}</h2>
              </div>
            </div>
            <MotionButton
              onClick={handleDownloadPdf}
              style={{
                background: 'rgba(0,0,0,0.05)',
                border: 'none',
                borderRadius: '999px',
                padding: '0.5rem 1rem',
                color: '#1f2937',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <span>⬇️</span>
              Download
            </MotionButton>
          </div>

          <div style={{ flex: 1, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <iframe
              src={pdfBlobUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none'
              }}
              title={pdfFileName}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default Vendor
