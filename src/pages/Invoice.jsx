import React, { useState, useEffect, useRef } from 'react';
import { Save, RotateCcw, Trash2, Edit2, X, Search, Info, Eye, MoreVertical, Plus } from 'lucide-react';
import EmptyDataCard from '../components/EmptyDataCard';
import { getAuthToken, getAuthValue } from '../utils/authStorage';
import { readJsonResponse } from '../utils/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '');
const API_URL = `${API_BASE_URL}/api/invoices`;
const CUSTOMERS_API_URL = `${API_BASE_URL}/api/customers`;
const VENDORS_API_URL = `${API_BASE_URL}/api/vendors`;

function Invoice() {
  // Responsive state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    }
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Invoice form state
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: '',
    clientId: '',
    clientType: 'Customer',
    invoiceDate: new Date().toISOString().split('T')[0],
    transactionDescription: '',
    items: [
      { product: '', description: '', amount: 0 }
    ],
    totalAmount: 0
  });

  // Validation errors state
  const [errors, setErrors] = useState({});
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Edit mode state
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  // Invoices list state
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const isAdmin = (getAuthValue('userRole') || '').toLowerCase() === 'admin';
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoInvoice, setInfoInvoice] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoNowMs, setInfoNowMs] = useState(0);
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownInvoice, setDropdownInvoice] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [dropdownUp, setDropdownUp] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdownId && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdownId(null);
        setDropdownInvoice(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdownId]);
  
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortOrder('asc');
    }
  };

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

  // Client dropdown autocomplete state
  const [clientSearchText, setClientSearchText] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  // Combine customers and vendors
  const allClients = [
    ...customers.map(c => ({ ...c, type: 'Customer', name: c.customerName })),
    ...vendors.map(v => ({ ...v, type: 'Vendor', name: v.vendorName }))
  ];

  const filteredClients = allClients.filter(c =>
    c.name?.toLowerCase().includes(clientSearchText.toLowerCase()) ||
    c.id?.toLowerCase().includes(clientSearchText.toLowerCase())
  );

  // Fetch vendors for dropdown
  const fetchVendorsList = async () => {
    try {
      const response = await fetch(`${VENDORS_API_URL}?limit=1000`); // Get all for dropdown
      const data = await readJsonResponse(response, 'Error fetching vendors');
      setVendors(data.vendors || []);
    } catch (err) {
      console.error('Error fetching vendors:', err);
    }
  };
  
  // Fetch next invoice number
  const fetchNextInvoiceNumber = async () => {
    try {
      const response = await fetch(`${API_URL}/next-number`);
      const data = await readJsonResponse(response, 'Error fetching next invoice number');
      setInvoiceForm(prev => ({ ...prev, invoiceNumber: data.nextNumber }));
    } catch (err) {
      console.error('Error fetching next invoice number:', err);
    }
  };

  // Fetch customers for dropdown
  const fetchCustomersList = async () => {
    try {
      const response = await fetch(`${CUSTOMERS_API_URL}?limit=1000`); // Get all for dropdown
      const data = await readJsonResponse(response, 'Error fetching customers');
      setCustomers(data.customers || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  // Fetch invoices on component mount
  const fetchInvoices = async (page = 1, search = searchQuery, column = sortColumn, order = sortOrder) => {
    setLoading(true);
    try {
      let url = `${API_URL}?page=${page}&limit=25&search=${encodeURIComponent(search)}`;
      if (column) {
        url += `&sortColumn=${encodeURIComponent(column)}&sortOrder=${encodeURIComponent(order)}`;
      }
      const response = await fetch(url);
      const data = await readJsonResponse(response, 'Error fetching invoices');
      setInvoices(data.invoices || []);
      setTotalPages(data.totalPages || 0);
      setCurrentPage(page);
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Reset to page 1 when search query or sort changes
    fetchInvoices(1, searchQuery, sortColumn, sortOrder);
  }, [searchQuery, sortColumn, sortOrder]);

  useEffect(() => {
    fetchCustomersList();
    fetchVendorsList();
    fetchNextInvoiceNumber();
  }, []);

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

  // Calculate total amount whenever items change
  useEffect(() => {
    const total = invoiceForm.items.reduce((sum, item) => {
      const amount = parseFloat(item.amount) || 0;
      return sum + amount;
    }, 0);

    setInvoiceForm(prev => ({ ...prev, totalAmount: total }));
  }, [invoiceForm.items]);

  // Validation function
  const validateForm = () => {
    const newErrors = {};

    if (!invoiceForm.clientId) {
      newErrors.clientId = 'Please select a client';
    }

    if (!invoiceForm.invoiceDate) {
      newErrors.invoiceDate = 'Invoice date is required';
    }

    if (invoiceForm.items.length === 0) {
      newErrors.items = 'At least one item is required';
    }

    const itemErrors = [];
    let hasItemErrors = false;

    invoiceForm.items.forEach((item, index) => {
      const itemError = {};
      if (!item.product.trim()) {
        itemError.product = 'Product name is required';
        hasItemErrors = true;
      }
      if (item.amount < 0 || item.amount === '') {
        itemError.amount = 'Valid amount is required';
        hasItemErrors = true;
      }
      itemErrors[index] = itemError;
    });

    if (hasItemErrors) {
      newErrors.itemErrors = itemErrors;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Form handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInvoiceForm(prev => ({
      ...prev,
      [name]: value
    }));

    if (formSubmitted && errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...invoiceForm.items];
    newItems[index] = { ...newItems[index], [field]: value };

    setInvoiceForm(prev => ({
      ...prev,
      items: newItems
    }));
  };

  const addItemRow = () => {
    setInvoiceForm(prev => ({
      ...prev,
      items: [...prev.items, { product: '', description: '', amount: 0 }]
    }));
  };

  const removeItemRow = (index) => {
    if (invoiceForm.items.length > 1) {
      const newItems = invoiceForm.items.filter((_, i) => i !== index);
      setInvoiceForm(prev => ({
        ...prev,
        items: newItems
      }));
    }
  };

  const handleInvoiceSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitted(true);

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const token = getAuthToken();
      if (editingInvoiceId) {
        // Update existing invoice
        const response = await fetch(`${API_URL}/${editingInvoiceId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(invoiceForm)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || 'Error updating invoice');
        }

        setEditingInvoiceId(null);
        alert('Invoice updated successfully!');
      } else {
        // Add new invoice
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(invoiceForm)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || 'Error saving invoice');
        }

        alert('Invoice created successfully!');
      }

      await fetchInvoices(1);
      setInvoiceForm({
        invoiceNumber: '',
        clientId: '',
        clientType: 'Customer',
        invoiceDate: new Date().toISOString().split('T')[0],
        transactionDescription: '',
        items: [{ product: '', description: '', amount: 0 }],
        totalAmount: 0
      });
      setClientSearchText('');
      await fetchNextInvoiceNumber();
      setErrors({});
      setFormSubmitted(false);
      setFormOpen(false);
    } catch (err) {
      console.error('Error saving invoice:', err);
      alert(err.message || 'Error saving invoice!');
    } finally {
      setLoading(false);
    }
  };

  const openInfo = async (invoice) => {
    setInfoOpen(true);
    setInfoInvoice(invoice || null);
    const id = invoice?._id;
    if (!id) return;
    setInfoLoading(true);
    setInfoNowMs(Date.now());
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/detail/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await readJsonResponse(response, 'Error fetching invoice info');
      setInfoInvoice(data || null);
    } catch (err) {
      console.error('Error fetching invoice info:', err);
    } finally {
      setInfoLoading(false);
    }
  };

  const refreshInfo = async () => {
    const id = infoInvoice?._id;
    if (!id) return;
    setInfoLoading(true);
    setInfoNowMs(Date.now());
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/detail/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await readJsonResponse(response, 'Error refreshing invoice info');
      setInfoInvoice(data || null);
    } catch (err) {
      console.error('Error refreshing invoice info:', err);
    } finally {
      setInfoLoading(false);
    }
  };

  const closeInfo = () => {
    setInfoOpen(false);
    setInfoInvoice(null);
  };

  const handleEditInvoice = (invoice) => {
    const clientType = invoice.clientType || 'Customer';
    const clientId = invoice.clientId || invoice.customerId?._id || invoice.customerId;
    const client = invoice.customerId;
    const clientName = client?.customerName || client?.vendorName || '';
    const clientIdStr = client?.id || '';

    setInvoiceForm({
      invoiceNumber: invoice.invoiceNumber,
      clientId: clientId,
      clientType: clientType,
      invoiceDate: new Date(invoice.invoiceDate).toISOString().split('T')[0],
      transactionDescription: invoice.transactionDescription || '',
      items: invoice.items.map(item => ({
        product: item.product,
        description: item.description,
        amount: item.amount
      })),
      totalAmount: invoice.totalAmount
    });
    setClientSearchText(clientName ? `${clientName} (${clientIdStr})` : '');
    setEditingInvoiceId(invoice._id);
    setErrors({});
    setFormSubmitted(false);
    setFormOpen(true);
  };

  const handleCancelEdit = async () => {
    setEditingInvoiceId(null);
    setInvoiceForm({
      invoiceNumber: '',
      clientId: '',
      clientType: 'Customer',
      invoiceDate: new Date().toISOString().split('T')[0],
      transactionDescription: '',
      items: [{ product: '', description: '', amount: 0 }],
      totalAmount: 0
    });
    setClientSearchText('');
    await fetchNextInvoiceNumber();
    setErrors({});
    setFormSubmitted(false);
    setFormOpen(false);
  };

  const openCreateInvoice = async () => {
    if (loading) return;
    setEditingInvoiceId(null);
    setInvoiceForm({
      invoiceNumber: '',
      clientId: '',
      clientType: 'Customer',
      invoiceDate: new Date().toISOString().split('T')[0],
      transactionDescription: '',
      items: [{ product: '', description: '', amount: 0 }],
      totalAmount: 0
    });
    setClientSearchText('');
    setIsClientDropdownOpen(false);
    await fetchNextInvoiceNumber();
    setErrors({});
    setFormSubmitted(false);
    setFormOpen(true);
  };

  const closeInvoiceForm = () => {
    if (loading) return;
    setFormOpen(false);
  };

  const handleDeleteInvoice = async (id) => {
    if (!isAdmin) {
      alert('Only admin can delete.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this invoice?')) {
      try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/${id}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.message || 'Error deleting invoice');
        }
        await fetchInvoices(currentPage);
        alert('Invoice deleted successfully!');
      } catch (err) {
        console.error('Error deleting invoice:', err);
        alert('Error deleting invoice!');
      }
    }
  };

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0 }}>
        <button
          type="button"
          onClick={openCreateInvoice}
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
          Add Invoice
        </button>
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
            if (e.target === e.currentTarget) closeInvoiceForm()
          }}
        >
          <div
            className="card"
            style={{
              width: 'min(1100px, 96vw)',
              maxHeight: '88vh',
              overflow: 'auto',
              padding: '1.5rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1.25rem' }}>
                {editingInvoiceId ? 'Edit Invoice' : 'New Invoice'}
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
                  Invoice No : {invoiceForm.invoiceNumber || 'xxxx'}
                </div>
                {editingInvoiceId && (
                  <button
                    onClick={handleCancelEdit}
                    disabled={loading}
                    className="btn btn-secondary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <X size={16} />
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeInvoiceForm}
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
                </button>
              </div>
            </div>

            <form onSubmit={handleInvoiceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                        setClientSearchText(e.target.value);
                        setIsClientDropdownOpen(e.target.value.length > 0);
                        if (invoiceForm.clientId) {
                          setInvoiceForm(prev => ({ ...prev, clientId: '', clientType: 'Customer' }));
                        }
                        if (formSubmitted && errors.clientId) {
                          setErrors(prev => {
                            const newE = { ...prev };
                            delete newE.clientId;
                            return newE;
                          });
                        }
                      }}
                      onFocus={(e) => {
                        if (e.target.value.length > 0) setIsClientDropdownOpen(true);
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
                              setInvoiceForm(prev => ({ ...prev, clientId: client._id, clientType: client.type }));
                              setClientSearchText(`${client.name} (${client.id}) - ${client.type}`);
                              setIsClientDropdownOpen(false);
                            }}
                            style={{
                              padding: '0.5rem 0.75rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              color: 'var(--text-header)',
                              borderBottom: '1px solid var(--border)',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.background = 'var(--bg-main)'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
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
                    Invoice Date <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="date"
                    name="invoiceDate"
                    value={invoiceForm.invoiceDate}
                    onChange={handleInputChange}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: `1px solid ${errors.invoiceDate ? 'var(--danger)' : 'var(--border)'}`,
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)'
                    }}
                  />
                  {formSubmitted && errors.invoiceDate && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.invoiceDate}</p>
                  )}
                </div>

                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.875rem' }}>
                    Transaction Description
                  </label>
                  <input
                    type="text"
                    name="transactionDescription"
                    value={invoiceForm.transactionDescription}
                    onChange={handleInputChange}
                    disabled={loading}
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
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-header)' }}>Invoice Items</h3>
                  <button
                    type="button"
                    onClick={addItemRow}
                    disabled={loading}
                    style={{
                      padding: '0.25rem 0.75rem',
                      background: 'transparent',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.875rem'
                    }}
                  >
                    <Plus size={14} /> Add Row
                  </button>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead style={{ background: 'var(--bg-main)' }}>
                      <tr>
                        <th style={{ padding: '0.5rem', textAlign: 'center', width: '50px' }}>Sr No</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Product</th>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Description</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right', width: '120px' }}>Amount (₹)</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center', width: '60px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceForm.items.map((item, index) => (
                        <tr key={index} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>{index + 1}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <input
                              type="text"
                              value={item.product}
                              onChange={(e) => handleItemChange(index, 'product', e.target.value)}
                              placeholder="Enter product name"
                              style={{
                                width: '100%',
                                padding: '0.25rem 0.5rem',
                                border: `1px solid ${formSubmitted && errors.itemErrors?.[index]?.product ? 'var(--danger)' : 'transparent'}`,
                                borderRadius: '4px',
                                background: 'transparent',
                                color: 'var(--text-header)',
                                fontSize: '0.875rem'
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                              placeholder="Enter description"
                              style={{
                                width: '100%',
                                padding: '0.25rem 0.5rem',
                                border: '1px solid transparent',
                                borderRadius: '4px',
                                background: 'transparent',
                                color: 'var(--text-header)',
                                fontSize: '0.875rem'
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <input
                              type="number"
                              value={item.amount}
                              onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                              min="0"
                              step="0.01"
                              style={{
                                width: '100%',
                                padding: '0.25rem 0.5rem',
                                border: `1px solid ${formSubmitted && errors.itemErrors?.[index]?.amount ? 'var(--danger)' : 'transparent'}`,
                                borderRadius: '4px',
                                background: 'transparent',
                                color: 'var(--text-header)',
                                textAlign: 'right',
                                fontSize: '0.875rem'
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeItemRow(index)}
                              disabled={invoiceForm.items.length === 1}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: invoiceForm.items.length === 1 ? 'var(--text-muted)' : 'var(--danger)',
                                cursor: invoiceForm.items.length === 1 ? 'not-allowed' : 'pointer',
                                padding: '0.25rem'
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {formSubmitted && errors.items && (
                  <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.items}</p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{
                  background: 'var(--primary-light, #eef2ff)',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '6px',
                  border: '1px solid var(--primary-border, #c7d2fe)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-header)' }}>Total Amount:</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                    ₹{invoiceForm.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {!editingInvoiceId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
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
                    </button>
                  )}
                  <button
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
                    {loading ? 'Saving...' : editingInvoiceId ? 'Update Invoice' : 'Save Invoice'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice List */}
      {(
        <div className="card" style={{ margin: '0 auto 0', width: '100%', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1.25rem' }}>Invoice List</h2>

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
                placeholder="Search by invoice no or customer..."
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
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <EmptyDataCard />
          ) : (
            <div>
              {/* Mobile/Tablet Card View */}
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {invoices.map((invoice) => {
                    const name =
                      invoice.customerId?.customerName ||
                      `${invoice.customerId?.firstName || ''} ${invoice.customerId?.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
                      'Unknown'
                    const label = invoice.customerId?.id ? `${name} (${invoice.customerId.id})` : name
                    
                    return (
                      <div 
                        key={invoice._id} 
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
                              {invoice.invoiceNumber || '-'}
                            </div>
                            <div style={{ 
                              fontSize: '0.875rem', 
                              color: 'var(--text-muted)',
                              fontWeight: 600
                            }}>
                              {label}
                            </div>
                          </div>
                          <div style={{ position: 'relative' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openDropdownId === invoice._id) {
                                  setOpenDropdownId(null);
                                  setDropdownInvoice(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const dropdownHeight = isAdmin ? 160 : 120;
                                  const shouldOpenUp = rect.bottom + dropdownHeight > window.innerHeight;
                                  setDropdownPosition({
                                    top: shouldOpenUp ? rect.top - 4 - dropdownHeight : rect.bottom + 4,
                                    left: rect.right - 140
                                  });
                                  setDropdownUp(shouldOpenUp);
                                  setDropdownInvoice(invoice);
                                  setOpenDropdownId(invoice._id);
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
                            </button>

                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Date:</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600 }}>{new Date(invoice.invoiceDate).toLocaleDateString()}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Amount:</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--danger)', fontWeight: 800 }}>
                              ₹{invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          {invoice.transactionDescription && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Note:</div>
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600 }}>{invoice.transactionDescription}</div>
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
                          onClick={() => handleSort('invoiceNumber')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Invoice No {sortColumn === 'invoiceNumber' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('customerId')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Customer {sortColumn === 'customerId' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('invoiceDate')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Date {sortColumn === 'invoiceDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('transactionDescription')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Txn Description {sortColumn === 'transactionDescription' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                          onClick={() => handleSort('totalAmount')}
                          style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}
                        >
                          Total Amount {sortColumn === 'totalAmount' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => {
                        const name =
                          invoice.customerId?.customerName ||
                          `${invoice.customerId?.firstName || ''} ${invoice.customerId?.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
                          'Unknown'
                        const label = invoice.customerId?.id ? `${name} (${invoice.customerId.id})` : name
                        
                        return (
                          <tr key={invoice._id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(invoice.invoiceNumber || '')}>
                              {truncateText(invoice.invoiceNumber || '')}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(label)}>
                              {truncateText(label)}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={new Date(invoice.invoiceDate).toLocaleDateString()}>
                              {truncateText(new Date(invoice.invoiceDate).toLocaleDateString())}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={String(invoice.transactionDescription || '')}>
                              {invoice.transactionDescription ? truncateText(invoice.transactionDescription) : '-'}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }} title={`₹${invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                              ₹{truncateText(invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem' }}>
                              <div style={{ position: 'relative' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (openDropdownId === invoice._id) {
                                      setOpenDropdownId(null);
                                      setDropdownInvoice(null);
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const dropdownHeight = isAdmin ? 160 : 120;
                                      const shouldOpenUp = rect.bottom + dropdownHeight > window.innerHeight;
                                      setDropdownPosition({
                                        top: shouldOpenUp ? rect.top - 4 - dropdownHeight : rect.bottom + 4,
                                        left: rect.right - 140
                                      });
                                      setDropdownUp(shouldOpenUp);
                                      setDropdownInvoice(invoice);
                                      setOpenDropdownId(invoice._id);
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
                                </button>

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
                  <button
                    onClick={() => fetchInvoices(currentPage - 1, searchQuery)}
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
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => fetchInvoices(page, searchQuery)}
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
                    </button>
                  ))}

                  <button
                    onClick={() => fetchInvoices(currentPage + 1, searchQuery)}
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
                  </button>
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
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-header)' }}>Recent Activity</div>
                <div style={{ marginTop: 2, fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {infoInvoice?.invoiceNumber ? `Invoice • ${infoInvoice.invoiceNumber}` : 'Invoice'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
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
                </button>
                <button
                  type="button"
                  onClick={closeInfo}
                  style={{ border: '1px solid var(--border)', background: 'transparent', borderRadius: 10, padding: '0.45rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {(() => {
              const record = infoInvoice?.invoiceNumber ? `Invoice • ${infoInvoice.invoiceNumber}` : 'Invoice'
              const createdByName = infoInvoice?.createdBy?.fullName || infoInvoice?.createdByName || '-'
              const createdByEmail = infoInvoice?.createdBy?.email || infoInvoice?.createdByEmail || '-'
              const updatedByName = infoInvoice?.updatedBy?.fullName || infoInvoice?.updatedByName || '-'
              const updatedByEmail = infoInvoice?.updatedBy?.email || infoInvoice?.updatedByEmail || '-'

              const raw = Array.isArray(infoInvoice?.activity) ? infoInvoice.activity : []
              let activities = raw
                .filter((a) => a && a.action && a.at)
                .slice()
                .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

              if (activities.length === 0) {
                const fallback = []
                if (infoInvoice?.createdAt) {
                  fallback.push({
                    action: 'create',
                    at: infoInvoice.createdAt,
                    userName: createdByName,
                    userEmail: createdByEmail,
                    changes: []
                  })
                }
                if (infoInvoice?.updatedAt && infoInvoice?.createdAt && new Date(infoInvoice.updatedAt).getTime() !== new Date(infoInvoice.createdAt).getTime()) {
                  fallback.unshift({
                    action: 'update',
                    at: infoInvoice.updatedAt,
                    userName: updatedByName,
                    userEmail: updatedByEmail,
                    changes: []
                  })
                }
                activities = fallback
              }

              const items = activities.map((a, idx) => {
                const isUpdate = a.action === 'update'
                return {
                  key: `${a.action}-${new Date(a.at).getTime()}-${idx}`,
                  chip: isUpdate ? 'Update Invoice' : 'Create Invoice',
                  method: isUpdate ? 'PUT' : 'POST',
                  path: isUpdate ? '/api/invoices/:id' : '/api/invoices',
                  at: a.at,
                  icon: isUpdate ? '✎' : '+',
                  iconBg: isUpdate ? '#dbeafe' : '#d1fae5',
                  iconColor: isUpdate ? '#1d4ed8' : '#065f46',
                  userName: a.userName || (isUpdate ? updatedByName : createdByName) || '-',
                  userEmail: a.userEmail || (isUpdate ? updatedByEmail : createdByEmail) || '-',
                  record,
                  changes: Array.isArray(a.changes) ? a.changes : []
                }
              })

              return (
                <div style={{ marginTop: '1rem' }}>
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
                              {a.changes
                                .filter((c) => c?.field !== 'items' && c?.field !== 'totalAmount')
                                .map((c, i) => (
                                  <div key={`${c.field}-${i}`}>
                                    {c.field}: {String(c.from || '-').replace(/^"+|"+$/g, '')} → {String(c.to || '-').replace(/^"+|"+$/g, '')}
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
            })()}
          </div>
        </div>
      )}

      {/* Dropdown Menu */}
      {openDropdownId && dropdownInvoice && (
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              setInfoInvoice(dropdownInvoice);
              setInfoOpen(true);
              setOpenDropdownId(null);
              setDropdownInvoice(null);
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
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditInvoice(dropdownInvoice);
              setOpenDropdownId(null);
              setDropdownInvoice(null);
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
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              alert('PDF feature coming soon!');
              setOpenDropdownId(null);
              setDropdownInvoice(null);
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
          </button>
          {isAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteInvoice(dropdownInvoice._id);
                setOpenDropdownId(null);
                setDropdownInvoice(null);
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
            </button>
          )}
        </div>
      )}

    </div>
  );
}

export default Invoice;
