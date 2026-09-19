import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit2, Plus, Power, Search, X } from 'lucide-react'
import { getAuthToken, getAuthValue } from '../../../utils/authStorage'
import { handleApiError, showSuccessToast } from '../../../utils/toast'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')

function Product() {
  const token = useMemo(() => getAuthToken(), [])
  const isAdmin = useMemo(() => (getAuthValue('userRole') || '').toLowerCase() === 'admin', [])
  const [products, setProducts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productName, setProductName] = useState('')

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return products
    return products.filter((product) => String(product.productName || '').toLowerCase().includes(query))
  }, [products, searchQuery])

  const fetchProducts = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/products`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || 'Failed to load products')
      setProducts(Array.isArray(data?.products) ? data.products : [])
    } catch (err) {
      setProducts([])
      setError(handleApiError(err, 'Failed to load products'))
    } finally {
      setLoading(false)
    }
  }, [isAdmin, token])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const openCreate = () => {
    setEditingProduct(null)
    setProductName('')
    setFormOpen(true)
    setError('')
  }

  const openEdit = (product) => {
    setEditingProduct(product)
    setProductName(product.productName || '')
    setFormOpen(true)
    setError('')
  }

  const closeForm = () => {
    if (saving) return
    setFormOpen(false)
    setEditingProduct(null)
    setProductName('')
  }

  const saveProduct = async (event) => {
    event.preventDefault()
    const trimmedName = productName.trim()
    if (!trimmedName) {
      setError('Product name is required')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/products${editingProduct?._id ? `/${editingProduct._id}` : ''}`,
        {
          method: editingProduct?._id ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ productName: trimmedName })
        }
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || 'Failed to save product')
      closeForm()
      await fetchProducts()
      showSuccessToast(editingProduct ? 'Product updated successfully!' : 'Product created successfully!')
    } catch (err) {
      setError(handleApiError(err, 'Failed to save product'))
    } finally {
      setSaving(false)
    }
  }

  const toggleProduct = async (product) => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${product._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ isActive: !product.isActive })
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || 'Failed to update product status')
      await fetchProducts()
      showSuccessToast(product.isActive ? 'Product deactivated.' : 'Product reactivated.')
    } catch (err) {
      setError(handleApiError(err, 'Failed to update product status'))
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return <div className="dashboard-content" style={{ padding: '1rem' }}><div className="card" style={{ padding: '1.5rem' }}>Access denied.</div></div>
  }

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div className="card" style={{ width: '100%', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--text-header)' }}>Products</h2>
            <div style={{ marginTop: '0.25rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Manage products used by invoice item search.</div>
          </div>
          <button type="button" onClick={openCreate} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', border: 'none', borderRadius: 8, background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={16} /> Add Product
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', padding: '0.6rem 0.75rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-main)' }}>
          <Search size={16} color="var(--text-muted)" />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search products" style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-header)' }} />
        </div>

        {error && <div style={{ marginTop: '1rem', padding: '0.7rem 0.85rem', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--danger)', background: 'var(--bg-main)' }}>{error}</div>}

        <div style={{ marginTop: '1rem', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead style={{ background: 'var(--bg-main)' }}><tr>
              {['Product Name', 'Status', 'Created By', 'Created On', 'Action'].map((heading) => <th key={heading} style={{ padding: '0.75rem', textAlign: heading === 'Action' ? 'center' : 'left', color: 'var(--text-header)', fontSize: '0.85rem' }}>{heading}</th>)}
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading products...</td></tr> : filteredProducts.length === 0 ? <tr><td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>No products found.</td></tr> : filteredProducts.map((product) => (
                <tr key={product._id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem', color: 'var(--text-header)', fontWeight: 700 }}>{product.productName}</td>
                  <td style={{ padding: '0.75rem', color: product.isActive ? 'var(--success, #16a34a)' : 'var(--text-muted)', fontWeight: 700 }}>{product.isActive ? 'Active' : 'Inactive'}</td>
                  <td style={{ padding: '0.75rem', color: 'var(--text-main)' }}>{product.createdBy?.fullName || product.createdBy?.email || '-'}</td>
                  <td style={{ padding: '0.75rem', color: 'var(--text-main)' }}>{product.createdOn ? new Date(product.createdOn).toLocaleString('en-US') : '-'}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}><div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                    <button type="button" title="Edit product" onClick={() => openEdit(product)} disabled={saving} style={{ padding: '0.4rem', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-header)', cursor: 'pointer' }}><Edit2 size={15} /></button>
                    <button type="button" title={product.isActive ? 'Deactivate product' : 'Reactivate product'} onClick={() => toggleProduct(product)} disabled={saving} style={{ padding: '0.4rem', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: product.isActive ? 'var(--danger)' : 'var(--success, #16a34a)', cursor: 'pointer' }}><Power size={15} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.45)' }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}>
        <form onSubmit={saveProduct} className="card" style={{ width: 'min(460px, 96vw)', padding: '1.25rem' }} onMouseDown={(event) => event.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0, color: 'var(--text-header)' }}>{editingProduct ? 'Edit Product' : 'Add Product'}</h3><button type="button" onClick={closeForm} disabled={saving} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button></div>
          <label style={{ display: 'block', marginTop: '1rem', color: 'var(--text-header)', fontWeight: 700, fontSize: '0.875rem' }}>Product Name</label>
          <input autoFocus value={productName} onChange={(event) => setProductName(event.target.value)} disabled={saving} placeholder="Enter product name" style={{ width: '100%', marginTop: '0.4rem', padding: '0.65rem 0.75rem', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg-card)', color: 'var(--text-header)', outline: 'none' }} />
          <button type="submit" disabled={saving} style={{ width: '100%', marginTop: '1rem', padding: '0.65rem', border: 'none', borderRadius: 7, background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}</button>
        </form>
      </div>}
    </div>
  )
}

export default Product