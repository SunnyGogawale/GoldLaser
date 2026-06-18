import React, { useEffect, useMemo, useState } from 'react'
import { Edit2, Trash2, X } from 'lucide-react'
import EmptyDataCard from '../components/EmptyDataCard'
import { getAuthToken, getAuthValue } from '../utils/authStorage'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')

function User() {
  // Responsive state
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [users, setUsers] = useState([])
  const [saving, setSaving] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ id: '', fullName: '', email: '', roll: 'user' })
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const token = useMemo(() => getAuthToken(), [])
  const isAdmin = useMemo(() => (getAuthValue('userRole') || '').toLowerCase() === 'admin', [])

  const fetchUsers = async () => {
    if (!isAdmin) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Request failed (${response.status})`)
      }
      const data = await response.json()
      setUsers(Array.isArray(data.users) ? data.users : [])
    } catch (err) {
      setUsers([])
      setError(err?.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [isAdmin, token])

  const openEdit = (u) => {
    setEditForm({
      id: String(u?._id || ''),
      fullName: u?.fullName || '',
      email: u?.email || '',
      roll: String(u?.roll || u?.role || 'user').toLowerCase() === 'admin' ? 'admin' : 'user'
    })
    setEditOpen(true)
    setPasswordOpen(false)
    setNewPassword('')
    setConfirmPassword('')
    setError('')
  }

  const closeEdit = () => {
    setEditOpen(false)
    setEditForm({ id: '', fullName: '', email: '', roll: 'user' })
    setPasswordOpen(false)
    setNewPassword('')
    setConfirmPassword('')
  }

  const saveEdit = async () => {
    if (!editForm.id) return
    setSaving(true)
    setError('')
    try {
      if (passwordOpen && (newPassword || confirmPassword)) {
        if (newPassword.length < 6) throw new Error('Password must be at least 6 characters')
        if (newPassword !== confirmPassword) throw new Error('Passwords do not match')
        const passRes = await fetch(`${API_BASE_URL}/api/users/${editForm.id}/password`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ password: newPassword })
        })
        if (!passRes.ok) {
          const text = await passRes.text()
          throw new Error(text || `Request failed (${passRes.status})`)
        }
      }

      const response = await fetch(`${API_BASE_URL}/api/users/${editForm.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          fullName: editForm.fullName,
          email: editForm.email,
          roll: editForm.roll
        })
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Request failed (${response.status})`)
      }
      closeEdit()
      await fetchUsers()
    } catch (err) {
      setError(err?.message || 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  const deleteUser = async (u) => {
    const id = String(u?._id || '')
    if (!id) return
    if (!window.confirm(`Delete user ${u?.email || ''}?`)) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Request failed (${response.status})`)
      }
      await fetchUsers()
    } catch (err) {
      setError(err?.message || 'Failed to delete user')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="dashboard-content" style={{ padding: '1rem' }}>
        <div className="card" style={{ margin: '0 auto', width: '100%', padding: '1.5rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-header)' }}>USER</div>
          <div style={{ marginTop: '0.75rem', color: 'var(--text-muted)' }}>Access denied.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-content" style={{ padding: '1rem' }}>
      <div className="card" style={{ margin: '0 auto', width: '100%', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-header)' }}>USER</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {saving ? 'Updating...' : `${users.length} total`}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-main)', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          {loading ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading...</div>
          ) : users.length === 0 ? (
            <EmptyDataCard />
          ) : (
            <div>
              {/* Mobile/Tablet Card View */}
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {users.map((u) => (
                    <div
                      key={String(u._id)}
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
                            {u.fullName || '-'}
                          </div>
                          <div style={{
                            fontSize: '0.875rem',
                            color: 'var(--text-muted)',
                            fontWeight: 600
                          }}>
                            {u.email || '-'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            disabled={saving}
                            style={{
                              padding: '0.35rem',
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              cursor: saving ? 'not-allowed' : 'pointer',
                              color: 'var(--text-muted)',
                              transition: 'all 0.2s'
                            }}
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteUser(u)}
                            disabled={saving}
                            style={{
                              padding: '0.35rem',
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              cursor: saving ? 'not-allowed' : 'pointer',
                              color: 'var(--danger)',
                              transition: 'all 0.2s'
                            }}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Role:</div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600 }}>{u.roll || u.role || 'user'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '70px' }}>Created:</div>
                          <div style={{ fontSize: '0.875rem', color: 'var(--text-main)', fontWeight: 600 }}>{u.createdAt ? new Date(u.createdAt).toLocaleString() : '-'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Desktop Table View */
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700 }}>Name</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700 }}>Email</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700 }}>Role</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700 }}>Created</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={String(u._id)} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-header)', fontWeight: 700 }}>{u.fullName || '-'}</td>
                          <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }}>{u.email || '-'}</td>
                          <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }}>{u.roll || u.role || 'user'}</td>
                          <td style={{ padding: '0.5rem 0.375rem', color: 'var(--text-main)' }}>
                            {u.createdAt ? new Date(u.createdAt).toLocaleString() : '-'}
                          </td>
                          <td style={{ padding: '0.5rem 0.375rem' }}>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button
                                type="button"
                                onClick={() => openEdit(u)}
                                disabled={saving}
                                style={{
                                  padding: '0.25rem',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: saving ? 'not-allowed' : 'pointer',
                                  color: 'var(--text-muted)',
                                  borderRadius: '6px',
                                  transition: 'all 0.2s'
                                }}
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteUser(u)}
                                disabled={saving}
                                style={{
                                  padding: '0.25rem',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: saving ? 'not-allowed' : 'pointer',
                                  color: 'var(--danger)',
                                  borderRadius: '6px',
                                  transition: 'all 0.2s'
                                }}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
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
            if (e.target === e.currentTarget) closeEdit()
          }}
        >
          <div
            className="card"
            style={{
              width: 'min(640px, 96vw)',
              maxHeight: '88vh',
              overflow: 'auto',
              padding: '1.25rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-header)' }}>Edit User</div>
              <button
                type="button"
                onClick={closeEdit}
                style={{ border: '1px solid var(--border)', background: 'transparent', borderRadius: 8, padding: '0.35rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-header)', marginBottom: '0.35rem' }}>Full Name</div>
                <input
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((p) => ({ ...p, fullName: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    color: 'var(--text-header)',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-header)', marginBottom: '0.35rem' }}>Email</div>
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    color: 'var(--text-header)',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-header)', marginBottom: '0.35rem' }}>Role</div>
                <div style={{ display: 'flex', gap: '0.5rem', border: '1px solid var(--border)', borderRadius: 10, padding: '0.35rem', background: 'var(--bg-main)' }}>
                  <button
                    type="button"
                    onClick={() => setEditForm((p) => ({ ...p, roll: 'user' }))}
                    disabled={saving}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      borderRadius: 8,
                      border: editForm.roll === 'user' ? '1px solid var(--primary)' : '1px solid transparent',
                      background: editForm.roll === 'user' ? 'rgba(59,130,246,0.12)' : 'transparent',
                      color: 'var(--text-header)',
                      fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer'
                    }}
                  >
                    User
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm((p) => ({ ...p, roll: 'admin' }))}
                    disabled={saving}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      borderRadius: 8,
                      border: editForm.roll === 'admin' ? '1px solid var(--primary)' : '1px solid transparent',
                      background: editForm.roll === 'admin' ? 'rgba(59,130,246,0.12)' : 'transparent',
                      color: 'var(--text-header)',
                      fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Admin
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-header)' }}>Change Password</div>
                <button
                  type="button"
                  onClick={() => setPasswordOpen((v) => !v)}
                  disabled={saving}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    color: 'var(--text-header)',
                    fontWeight: 700
                  }}
                >
                  {passwordOpen ? 'Hide' : 'Change'}
                </button>
              </div>

              {passwordOpen && (
                <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-header)', marginBottom: '0.35rem' }}>New Password</div>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-header)', marginBottom: '0.35rem' }}>Confirm Password</div>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.75rem',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                style={{
                  padding: '0.55rem 1rem',
                  background: 'transparent',
                  color: 'var(--text-header)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                style={{
                  padding: '0.55rem 1rem',
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default User
