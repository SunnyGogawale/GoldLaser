import React, { useState, useEffect } from 'react'
import { Save, RotateCcw, Trash2, Edit2, X, Search, Info } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const API_URL = `${API_BASE_URL}/api/customers`

function Customer() {
  // Customer form state
  const [customerForm, setCustomerForm] = useState({
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
  const [editingCustomerId, setEditingCustomerId] = useState(null)

  // Customers list state
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const isAdmin = (localStorage.getItem('userRole') || '').toLowerCase() === 'admin'
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoCustomer, setInfoCustomer] = useState(null)
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

  // Function to fetch next customer id
  const fetchNextCustomerId = async () => {
    try {
      const response = await fetch(`${API_URL}/next-id`);
      const data = await response.json();
      setCustomerForm(prev => ({ ...prev, id: data.nextId }));
    } catch (err) {
      console.error('Error fetching next customer id:', err);
    }
  };

  async function fetchCustomers(page = 1, search = searchQuery) {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}?page=${page}&limit=25&search=${encodeURIComponent(search)}`);
      const data = await response.json();
      setCustomers(data.customers);
      setTotalPages(data.totalPages);
      setCurrentPage(page);
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  }

  // Fetch customers on component mount
  useEffect(() => {
    fetchCustomers();
    fetchNextCustomerId();
  }, []);

  // Validation function
  const validateForm = () => {
    const newErrors = {};

    if (!customerForm.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!customerForm.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (!customerForm.contactNumber.trim()) {
      newErrors.contactNumber = 'Contact number is required';
    }

    if (customerForm.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerForm.email)) {
        newErrors.email = 'Please enter a valid email';
      }
    }

    if (!customerForm.address.trim()) {
      newErrors.address = 'Address is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Fetch customers on component mount
  useEffect(() => {
    fetchCustomers(1, searchQuery);
  }, [searchQuery]);

  // Customer form handlers
  const handleCustomerInputChange = (e) => {
    const { name, value } = e.target;
    const updatedForm = {
      ...customerForm,
      [name]: value
    };
    setCustomerForm(updatedForm);
    
    // Clear error for this field when user starts typing
    if (formSubmitted && errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleCustomerSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitted(true);
    
    if (!validateForm()) {
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token')
      const payload = {
        ...customerForm,
        id: String(customerForm.id || '').trim(),
        firstName: String(customerForm.firstName || '').trim(),
        lastName: String(customerForm.lastName || '').trim(),
        contactNumber: String(customerForm.contactNumber || '').trim(),
        email: String(customerForm.email || '').trim(),
        address: String(customerForm.address || '').trim(),
        note: String(customerForm.note || '').trim()
      }

      if (!editingCustomerId && !payload.id) {
        const idResponse = await fetch(`${API_URL}/next-id`)
        const idData = await idResponse.json()
        const nextId = String(idData?.nextId || '').trim()
        if (nextId) {
          payload.id = nextId
          setCustomerForm(prev => ({ ...prev, id: nextId }))
        }
      }

      if (editingCustomerId) {
        // Update existing customer
        const response = await fetch(`${API_URL}/${editingCustomerId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Error updating customer');
        }
        
        setEditingCustomerId(null);
        alert('Customer updated successfully!');
      } else {
        // Add new customer to list
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Error saving customer');
        }
        
        alert('Customer added successfully!');
      }
      // Refresh customer list (go to first page after adding/updating)
      await fetchCustomers(1);
      // Reset form
      setCustomerForm({
        id: '',
        firstName: '',
        lastName: '',
        contactNumber: '',
        email: '',
        address: '',
        note: ''
      });
      await fetchNextCustomerId();
      setErrors({});
      setFormSubmitted(false);
    } catch (err) {
      console.error('Error saving customer:', err);
      alert(err.message || 'Error saving customer!');
    } finally {
      setLoading(false);
    }
  };

  const handleEditCustomer = (customer) => {
    const firstName = customer.firstName || (customer.customerName ? customer.customerName.split(' ')[0] : '');
    const lastName = customer.lastName || (customer.customerName ? customer.customerName.split(' ').slice(1).join(' ') : '');
    setCustomerForm({
      id: customer.id,
      firstName,
      lastName,
      contactNumber: customer.contactNumber,
      email: customer.email,
      address: customer.address,
      note: customer.note
    });
    setEditingCustomerId(customer._id);
    setErrors({});
    setFormSubmitted(false);
  };

  const handleCancelEdit = async () => {
    setEditingCustomerId(null);
    setCustomerForm({
      id: '',
      firstName: '',
      lastName: '',
      contactNumber: '',
      email: '',
      address: '',
      note: ''
    });
    await fetchNextCustomerId();
    setErrors({});
    setFormSubmitted(false);
  };

  const handleDeleteCustomer = async (id) => {
    if (!isAdmin) {
      alert('Only admin can delete.')
      return
    }
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        const token = localStorage.getItem('token')
        await fetch(`${API_URL}/${id}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        await fetchCustomers(currentPage);
        alert('Customer deleted successfully!');
      } catch (err) {
        console.error('Error deleting customer:', err);
        alert('Error deleting customer!');
      }
    }
  };

  const openInfo = async (customer) => {
    setInfoOpen(true)
    setInfoCustomer(customer || null)
    const id = customer?._id
    if (!id) return
    setInfoLoading(true)
    setInfoNowMs(Date.now())
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      const data = await response.json()
      setInfoCustomer(data || null)
    } catch (err) {
      console.error('Error fetching customer info:', err)
    } finally {
      setInfoLoading(false)
    }
  }

  const refreshInfo = async () => {
    const id = infoCustomer?._id
    if (!id) return
    setInfoLoading(true)
    setInfoNowMs(Date.now())
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      const data = await response.json()
      setInfoCustomer(data || null)
    } catch (err) {
      console.error('Error refreshing customer info:', err)
    } finally {
      setInfoLoading(false)
    }
  }

  const closeInfo = () => {
    setInfoOpen(false)
    setInfoCustomer(null)
  }

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div className="card" style={{ margin: '0 auto', width: '100%', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, color: 'var(--text-header)' }}>
            {editingCustomerId ? 'Edit Customer' : 'Add New Customer'}
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
              Customer ID : {customerForm.id || 'xxxx'}
            </div>
            {editingCustomerId && (
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
          </div>
        </div>
        <form onSubmit={handleCustomerSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 280px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-header)', fontSize: '0.9375rem' }}>
                First Name
              </label>
              <input
                type="text"
                name="firstName"
                value={customerForm.firstName}
                onChange={handleCustomerInputChange}
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
                value={customerForm.lastName}
                onChange={handleCustomerInputChange}
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
                value={customerForm.contactNumber}
                onChange={handleCustomerInputChange}
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
                value={customerForm.email}
                onChange={handleCustomerInputChange}
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
                value={customerForm.address}
                onChange={handleCustomerInputChange}
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
                placeholder="Enter customer address"
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
                value={customerForm.note}
                onChange={handleCustomerInputChange}
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
              {loading ? 'Saving...' : editingCustomerId ? 'Update Customer' : 'Save Customer'}
            </button>
            {!editingCustomerId && (
              <button
                type="button"
                onClick={async () => {
                  setCustomerForm({
                    id: '',
                    firstName: '',
                    lastName: '',
                    contactNumber: '',
                    email: '',
                    address: '',
                    note: ''
                  });
                  await fetchNextCustomerId();
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

      {/* Customer List */}
      {(customers.length > 0 || loading || searchQuery) && (
        <div className="card" style={{ margin: '1.5rem auto 0', width: '100%', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, color: 'var(--text-header)', fontSize: '1.25rem' }}>Customer List</h2>
            
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
                placeholder="Search by customer no or name..."
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
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading customers...</div>
          ) : customers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No customers found matching "{searchQuery}".
            </div>
          ) : (
            <div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Customer ID</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Contact Number</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Address</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Note</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer, index) => (
                      <tr key={customer._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }}>{customer.id}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }}>
                          {customer.customerName || `${customer.firstName || ''} ${customer.lastName || ''}`.replace(/\s+/g, ' ').trim()}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }}>{customer.contactNumber}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }}>{customer.email}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }}>{customer.address}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }}>{customer.note}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              onClick={() => handleEditCustomer(customer)}
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
                                onClick={() => openInfo(customer)}
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
                                onClick={() => handleDeleteCustomer(customer._id)}
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
                    ))}
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
                    onClick={() => fetchCustomers(currentPage - 1, searchQuery)}
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
                      onClick={() => fetchCustomers(page, searchQuery)}
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
                    onClick={() => fetchCustomers(currentPage + 1, searchQuery)}
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
                  {infoCustomer?.customerName ? `${infoCustomer.customerName}` : 'Customer'}
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
              const record = infoCustomer?.id ? `Customer • ${infoCustomer.id}` : 'Customer'
              const createdByName = infoCustomer?.createdBy?.fullName || '-'
              const createdByEmail = infoCustomer?.createdBy?.email || '-'
              const updatedByName = infoCustomer?.updatedBy?.fullName || infoCustomer?.updatedByName || '-'
              const updatedByEmail = infoCustomer?.updatedBy?.email || infoCustomer?.updatedByEmail || '-'

              const raw = Array.isArray(infoCustomer?.activity) ? infoCustomer.activity : []
              let activities = raw
                .filter((a) => a && a.action && a.at)
                .slice()
                .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

              if (activities.length === 0) {
                const fallback = []
                if (infoCustomer?.createdAt) {
                  fallback.push({
                    action: 'create',
                    at: infoCustomer.createdAt,
                    userName: createdByName,
                    userEmail: createdByEmail,
                    changes: []
                  })
                }
                if (infoCustomer?.updatedAt && infoCustomer?.createdAt && new Date(infoCustomer.updatedAt).getTime() !== new Date(infoCustomer.createdAt).getTime()) {
                  fallback.unshift({
                    action: 'update',
                    at: infoCustomer.updatedAt,
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
                  chip: isUpdate ? 'Update Customer' : 'Create Customer',
                  method: isUpdate ? 'PUT' : 'POST',
                  path: isUpdate ? '/api/customers/:id' : '/api/customers',
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

export default Customer
