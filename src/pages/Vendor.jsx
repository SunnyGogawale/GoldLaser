import React, { useState, useEffect } from 'react'
import { Save, RotateCcw, Trash2, Edit2, X, Search, Info } from 'lucide-react'
import EmptyDataCard from '../components/EmptyDataCard'
import { getAuthToken, getAuthValue } from '../utils/authStorage'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const API_URL = `${API_BASE_URL}/api/vendors`

const readJsonResponse = async (response, fallbackMessage) => {
  const raw = await response.text()
  let data = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    throw new Error(data?.message || raw || fallbackMessage || `Request failed (${response.status})`)
  }
  return data || {}
}

function Vendor() {
  // Vendor form state
  const [vendorForm, setVendorForm] = useState({
    id: '',
    firstName: '',
    lastName: '',
    contactNumber: '',
    email: '',
    address: '',
    note: ''
  })

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
  const isAdmin = (getAuthValue('userRole') || '').toLowerCase() === 'admin'
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoVendor, setInfoVendor] = useState(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoNowMs, setInfoNowMs] = useState(0)

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

  // Function to fetch next vendor id
  const fetchNextVendorId = async () => {
    try {
      const response = await fetch(`${API_URL}/next-id`);
      const data = await readJsonResponse(response, 'Error fetching next vendor id');
      setVendorForm(prev => ({ ...prev, id: data.nextId }));
    } catch (err) {
      console.error('Error fetching next vendor id:', err);
    }
  };

  async function fetchVendors(page = 1, search = searchQuery) {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}?page=${page}&limit=25&search=${encodeURIComponent(search)}`);
      const data = await readJsonResponse(response, 'Error fetching vendors');
      setVendors(data.vendors || []);
      setTotalPages(data.totalPages || 0);
      setCurrentPage(page);
    } catch (err) {
      console.error('Error fetching vendors:', err);
    } finally {
      setLoading(false);
    }
  }

  // Fetch vendors on component mount
  useEffect(() => {
    fetchVendors();
    fetchNextVendorId();
  }, []);

  // Validation function
  const validateForm = () => {
    const newErrors = {};

    if (!vendorForm.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!vendorForm.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (!vendorForm.contactNumber.trim()) {
      newErrors.contactNumber = 'Contact number is required';
    }

    if (vendorForm.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(vendorForm.email)) {
        newErrors.email = 'Please enter a valid email';
      }
    }

    if (!vendorForm.address.trim()) {
      newErrors.address = 'Address is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Fetch vendors on component mount
  useEffect(() => {
    fetchVendors(1, searchQuery);
  }, [searchQuery]);

  // Vendor form handlers
  const handleVendorInputChange = (e) => {
    const { name, value } = e.target;
    const updatedForm = {
      ...vendorForm,
      [name]: value
    };
    setVendorForm(updatedForm);
    
    // Clear error for this field when user starts typing
    if (formSubmitted && errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
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
        firstName: String(vendorForm.firstName || '').trim(),
        lastName: String(vendorForm.lastName || '').trim(),
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
      await fetchVendors(1);
      // Reset form
      setVendorForm({
        id: '',
        firstName: '',
        lastName: '',
        contactNumber: '',
        email: '',
        address: '',
        note: ''
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
    setVendorForm({
      id: '',
      firstName: '',
      lastName: '',
      contactNumber: '',
      email: '',
      address: '',
      note: ''
    })
    await fetchNextVendorId()
    setErrors({})
    setFormSubmitted(false)
    setFormOpen(true)
  }

  const handleEditVendor = (vendor) => {
    const firstName = vendor.firstName || (vendor.vendorName ? vendor.vendorName.split(' ')[0] : '');
    const lastName = vendor.lastName || (vendor.vendorName ? vendor.vendorName.split(' ').slice(1).join(' ') : '');
    setVendorForm({
      id: vendor.id,
      firstName,
      lastName,
      contactNumber: vendor.contactNumber,
      email: vendor.email,
      address: vendor.address,
      note: vendor.note
    });
    setEditingVendorId(vendor._id);
    setErrors({});
    setFormSubmitted(false);
    setFormOpen(true)
  };

  const handleCancelEdit = async () => {
    setEditingVendorId(null);
    setVendorForm({
      id: '',
      firstName: '',
      lastName: '',
      contactNumber: '',
      email: '',
      address: '',
      note: ''
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
      const token = getAuthToken()
      const response = await fetch(`${API_URL}/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      const data = await readJsonResponse(response, 'Error refreshing vendor info')
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

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0 }}>
        <button
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
            if (e.target === e.currentTarget) closeVendorForm()
          }}
        >
          <div
            className="card"
            style={{
              width: 'min(980px, 96vw)',
              maxHeight: '88vh',
              overflow: 'auto',
              padding: '2rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
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
                {editingVendorId && (
                  <button
                    onClick={handleCancelEdit}
                    disabled={loading}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'var(--bg-main)',
                      color: 'var(--text-header)',
                      border: '1px solid var(--border)',
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
                    Cancel
                  </button>
                )}
                <button
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
                </button>
              </div>
            </div>
            <form onSubmit={handleVendorSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    First Name
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={vendorForm.firstName}
                    onChange={handleVendorInputChange}
                    required
                    disabled={loading}
                    autoComplete="given-name"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: `1px solid ${errors.firstName ? 'var(--danger)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s',
                      opacity: loading ? 0.7 : 1
                    }}
                    placeholder="Enter first name"
                  />
                  {formSubmitted && errors.firstName && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      {errors.firstName}
                    </p>
                  )}
                </div>

                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={vendorForm.lastName}
                    onChange={handleVendorInputChange}
                    required
                    disabled={loading}
                    autoComplete="family-name"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: `1px solid ${errors.lastName ? 'var(--danger)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s',
                      opacity: loading ? 0.7 : 1
                    }}
                    placeholder="Enter last name"
                  />
                  {formSubmitted && errors.lastName && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      {errors.lastName}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    name="contactNumber"
                    value={vendorForm.contactNumber}
                    onChange={handleVendorInputChange}
                    required
                    disabled={loading}
                    inputMode="tel"
                    autoComplete="tel"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: `1px solid ${errors.contactNumber ? 'var(--danger)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s',
                      opacity: loading ? 0.7 : 1
                    }}
                    placeholder="Enter contact number"
                  />
                  {formSubmitted && errors.contactNumber && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      {errors.contactNumber}
                    </p>
                  )}
                </div>

                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    Email
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
                      border: `1px solid ${errors.email ? 'var(--danger)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s',
                      opacity: loading ? 0.7 : 1
                    }}
                    placeholder="Enter email address"
                  />
                  {formSubmitted && errors.email && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                      {errors.email}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                    Address
                  </label>
                  <textarea
                    name="address"
                    value={vendorForm.address}
                    onChange={handleVendorInputChange}
                    rows={3}
                    required
                    disabled={loading}
                    autoComplete="street-address"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      border: `1px solid ${errors.address ? 'var(--danger)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      fontSize: '0.9375rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-header)',
                      transition: 'all 0.2s',
                      resize: 'vertical',
                      opacity: loading ? 0.7 : 1
                    }}
                    placeholder="Enter vendor address"
                  ></textarea>
                  {formSubmitted && errors.address && (
                    <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
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

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                <button
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
                </button>
                {!editingVendorId && (
                  <button
                    type="button"
                    onClick={async () => {
                      setVendorForm({
                        id: '',
                        firstName: '',
                        lastName: '',
                        contactNumber: '',
                        email: '',
                        address: '',
                        note: ''
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
                  </button>
                )}
              </div>
            </form>
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
              width: 'min(220px, 100%)',
              flex: '0 0 auto',
              marginLeft: 'auto'
            }}>
              <Search size={14} color="var(--text-muted)" style={{ marginRight: '0.4rem' }} />
              <input
                type="text"
                placeholder="Search by vendor no or name..."
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Vendor ID</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Contact Number</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Address</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((vendor) => {
                      const name =
                        vendor.vendorName ||
                        `${vendor.firstName || ''} ${vendor.lastName || ''}`.replace(/\s+/g, ' ').trim()
                      const id = vendor.id || ''
                      const contactNumber = vendor.contactNumber || ''
                      const email = vendor.email || ''
                      const address = vendor.address || ''
                      return (
                      <tr key={vendor._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }} title={String(id)}>
                          {truncateText(id)}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }}>
                          <span title={String(name)}>{truncateText(name)}</span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }} title={String(contactNumber)}>
                          {truncateText(contactNumber)}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }} title={String(email)}>
                          {truncateText(email)}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }} title={String(address)}>
                          {truncateText(address)}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              onClick={() => handleEditVendor(vendor)}
                              style={{
                                padding: '0.25rem',
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                borderRadius: '6px',
                                transition: 'all 0.2s'
                              }}
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => openInfo(vendor)}
                                style={{
                                  padding: '0.25rem',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--text-muted)',
                                  borderRadius: '6px',
                                  transition: 'all 0.2s'
                                }}
                                title="Info"
                              >
                                <Info size={14} />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteVendor(vendor._id)}
                                style={{
                                  padding: '0.25rem',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--danger)',
                                  borderRadius: '6px',
                                  transition: 'all 0.2s'
                                }}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ 
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '1.5rem'
                }}>
                  <button
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
                  </button>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
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
                    </button>
                  ))}
                  
                  <button
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
                  {infoVendor?.vendorName ? `${infoVendor.vendorName}` : 'Vendor'}
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
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default Vendor
