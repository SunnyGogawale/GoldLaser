import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Outlet, useNavigate, useLocation, useOutlet } from 'react-router-dom'
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  User,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  Settings,
  Truck,
  CreditCard,
  ClipboardCheck
} from 'lucide-react'
import { clearAuthSession, getAuthToken, getAuthValue, setAuthValue } from '../utils/authStorage'
import { modalMotionProps, overlayMotionProps } from './PageTransition'
import MotionButton from './MotionButton'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')

function Layout({ setIsLoggedIn, theme, toggleTheme }) {
  const navigate = useNavigate()
  const location = useLocation()
  const outlet = useOutlet()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsUser, setSettingsUser] = useState(null)
  const [profileForm, setProfileForm] = useState({ fullName: '', email: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordSaving, setPasswordSaving] = useState(false)

  const isAdmin = (getAuthValue('userRole') || '').toLowerCase() === 'admin'
  const userFullName = (getAuthValue('userFullName') || '').trim()
  const userEmail = (getAuthValue('userEmail') || '').trim()
  const userRoleLabel = isAdmin ? 'Admin' : 'User'
  const userAvatarLetter = (userFullName || userEmail || userRoleLabel).trim().charAt(0).toUpperCase() || 'U'

  const primaryButtonStyle = {
    padding: '0.45rem 0.85rem',
    fontSize: '0.85rem',
    borderRadius: 8,
    border: '1px solid var(--primary)',
    background: 'var(--primary)',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 800,
    transition: 'all 0.2s'
  }

  const secondaryButtonStyle = {
    padding: '0.45rem 0.85rem',
    fontSize: '0.85rem',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-header)',
    cursor: 'pointer',
    fontWeight: 800,
    transition: 'all 0.2s'
  }

  const navSections = [
    {
      label: null,
      items: [
        { id: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' }
      ]
    },
    {
      label: 'Masters',
      items: [
        { id: '/customer', icon: <Users size={20} />, label: 'Customer Masters' },
        { id: '/vendor', icon: <Truck size={20} />, label: 'Vender Masters' }
      ]
    },
    {
      label: 'Transactions',
      items: [
        { id: '/invoice', icon: <FileText size={20} />, label: 'Sales Invoice' },
        { id: '/payment', icon: <CreditCard size={20} />, label: 'Sales Payment' },
        { id: '/purchase-invoice', icon: <FileText size={20} />, label: 'Purchase Invoice' },
        { id: '/purchase-payment', icon: <CreditCard size={20} />, label: 'Purchase Payment' }
      ]
    },
    {
      label: 'Reports',
      items: [
        { id: '/reports', icon: <ClipboardCheck size={20} />, label: 'Reports' }
      ]
    },
    ...(isAdmin
      ? [{
          label: 'Admin',
          items: [{ id: '/user', icon: <User size={20} />, label: 'User' }]
        }]
      : [])
  ]
  const navItems = navSections.flatMap((section) => section.items)

  const activeItem = navItems.find(item => item.id === location.pathname)

  const pageTitle = activeItem ? activeItem.label : 'Dashboard'

  useEffect(() => {
    setIsMobileMenuOpen(false)
    setIsProfileMenuOpen(false)
    setIsSettingsOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isMobileMenuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isMobileMenuOpen])

  useEffect(() => {
    if (!isProfileMenuOpen) return
    const onDocClick = (e) => {
      const btn = e.target?.closest?.('.user-avatar-btn')
      const menu = e.target?.closest?.('.user-avatar-menu')
      if (btn || menu) return
      setIsProfileMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [isProfileMenuOpen])

  const openSettings = async () => {
    setIsProfileMenuOpen(false)
    setIsSettingsOpen(true)
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setProfileForm({ fullName: userFullName || '', email: userEmail || '' })

    const token = getAuthToken()
    if (!token) return

    setSettingsLoading(true)
    try {
      let response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      }
      if (!response.ok) {
        if (response.status === 401) {
          clearAuthSession()
          setIsLoggedIn(false)
          navigate('/login', { replace: true })
          return
        }
        const data = await response.json().catch(() => null)
        throw new Error(data?.message || `Request failed (${response.status})`)
      }
      const data = await response.json()
      const u = data?.user || null
      setSettingsUser(u)
      setProfileForm({
        fullName: String(u?.fullName || userFullName || '').trim(),
        email: String(u?.email || userEmail || '').trim()
      })
    } catch {
      setSettingsUser(null)
    } finally {
      setSettingsLoading(false)
    }
  }

  const closeSettings = () => {
    setIsSettingsOpen(false)
    setSettingsUser(null)
    setSettingsLoading(false)
    setProfileSaving(false)
    setProfileForm({ fullName: '', email: '' })
    setPasswordSaving(false)
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
  }

  const saveProfile = async () => {
    if (profileSaving) return

    const fullName = String(profileForm.fullName || '').trim()
    const email = String(profileForm.email || '').trim()

    if (!fullName) return alert('Full name is required')
    if (!email || !email.includes('@')) return alert('Valid email is required')

    const token = getAuthToken()
    if (!token) {
      alert('Please login again.')
          clearAuthSession()
      setIsLoggedIn(false)
      navigate('/login', { replace: true })
      return
    }

    setProfileSaving(true)
    try {
      let response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fullName, email })
      })
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/users/me`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ fullName, email })
        })
      }
      if (response.status === 401) {
          clearAuthSession()
        setIsLoggedIn(false)
        navigate('/login', { replace: true })
        return
      }

      const raw = await response.text()
      let data = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        data = null
      }
      if (!response.ok) {
        const message = data?.message || raw || 'Failed to update profile'
        throw new Error(message)
      }
      const u = data?.user || null
      setSettingsUser(u)
      setAuthValue('userFullName', String(u?.fullName || fullName))
      setAuthValue('userEmail', String(u?.email || email))
      setProfileForm({
        fullName: String(u?.fullName || fullName).trim(),
        email: String(u?.email || email).trim()
      })
      alert('Profile updated')
    } catch (err) {
      alert(err?.message || 'Failed to update profile')
    } finally {
      setProfileSaving(false)
    }
  }

  const changePassword = async () => {
    if (passwordSaving) return

    const currentPassword = passwordForm.currentPassword || ''
    const newPassword = passwordForm.newPassword || ''
    const confirmPassword = passwordForm.confirmPassword || ''

    if (!currentPassword) return alert('Current password is required')
    if (!newPassword || newPassword.length < 6) return alert('New password must be at least 6 characters')
    if (newPassword !== confirmPassword) return alert('New password and confirm password must match')

    const token = getAuthToken()
    if (!token) {
      alert('Please login again.')
          clearAuthSession()
      setIsLoggedIn(false)
      navigate('/login', { replace: true })
      return
    }

    setPasswordSaving(true)
    try {
      let response = await fetch(`${API_BASE_URL}/api/auth/me/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      })
      if (response.status === 404) {
        response = await fetch(`${API_BASE_URL}/api/users/me/password`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ currentPassword, newPassword })
        })
      }
      if (response.status === 401) {
          clearAuthSession()
        setIsLoggedIn(false)
        navigate('/login', { replace: true })
        return
      }

      const raw = await response.text()
      let data = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        data = null
      }
      if (!response.ok) {
        const message = data?.message || raw || 'Failed to update password'
        throw new Error(message)
      }
      alert(data?.message || 'Password updated')
      closeSettings()
    } catch (err) {
      alert(err?.message || 'Failed to update password')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="app-container">
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'mobile-show' : ''}`} aria-label="Sidebar Navigation">
        <div className="sidebar-header">
          <MotionButton
            type="button"
            className={`nav-item sidebar-toggle-btn sidebar-brand ${isSidebarCollapsed ? 'is-collapsed' : ''}`}
            onClick={() => {
              const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches
              if (isMobile) {
                setIsMobileMenuOpen((v) => !v)
                return
              }
              setIsSidebarCollapsed((v) => !v)
            }}
            aria-label="Toggle sidebar"
          >
            <div className="logo-icon">G</div>
            {!isSidebarCollapsed && <span className="sidebar-brand-text">GoldFlow</span>}
          </MotionButton>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navSections.map((section, sectionIndex) => (
            <div className="nav-section" key={section.label || `nav-section-${sectionIndex}`}>
              {section.label && !isSidebarCollapsed && (
                <div className="nav-section-label">{section.label}</div>
              )}
              {section.items.map((item) => (
                <MotionButton
                  key={item.id}
                  type="button"
                  className={`nav-item ${location.pathname === item.id ? 'active' : ''}`}
                  onClick={() => {
                    navigate(item.id)
                    setIsMobileMenuOpen(false)
                  }}
                  title={item.label}
                >
                  {item.icon}
                  {!isSidebarCollapsed && <span>{item.label}</span>}
                </MotionButton>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <MotionButton
            type="button"
            className="nav-item logout-btn"
            onClick={() => {
          clearAuthSession()
              setIsLoggedIn(false)
              navigate('/login', { replace: true })
            }}
            title="Logout"
          >
            <LogOut size={20} />
            {!isSidebarCollapsed && <span>Logout</span>}
          </MotionButton>
        </div>
      </aside>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            className="mobile-overlay"
            onClick={() => setIsMobileMenuOpen(false)}
            {...overlayMotionProps}
          />
        )}
      </AnimatePresence>

      {/* Main Content Container */}
      <div className="main-content">
        {/* Top Header/Navbar */}
        <header className="header">
          <div className="header-title">
            {/* Mobile menu toggle */}
            <MotionButton 
              className="menu-toggle mobile-only"
              onClick={() => {
                setIsMobileMenuOpen((v) => {
                  const next = !v
                  if (next) setIsSidebarCollapsed(false)
                  return next
                })
              }}
              style={{ marginRight: '1rem' }}
              aria-label="Toggle menu"
            >
              <Menu size={24} />
            </MotionButton>
            <h2 style={{ color: 'var(--text-header)', margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
              {pageTitle}
            </h2>
          </div>
          
          <div className="header-actions">
            {/* Theme Toggle */}
            <MotionButton 
              onClick={toggleTheme}
              title="Toggle theme"
              style={{
                padding: '0.5rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '8px',
                color: 'var(--text-header)',
                display: 'flex',
                alignItems: 'center',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-main)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'none'}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </MotionButton>
            
            <div style={{ position: 'relative' }}>
              <MotionButton
                type="button"
                className="user-avatar-btn"
                title="Account"
                aria-label="Account"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
                onClick={() => setIsProfileMenuOpen((v) => !v)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {userAvatarLetter}
              </MotionButton>

              <AnimatePresence>
                {isProfileMenuOpen && (
                <motion.div
                  className="user-avatar-menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 10px)',
                    right: 0,
                    minWidth: 180,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    boxShadow: 'var(--shadow-sm)',
                    padding: '0.5rem',
                    zIndex: 1000
                  }}
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  <MotionButton
                    type="button"
                    onClick={() => {
                      openSettings()
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 0.75rem',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-header)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontWeight: 700
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-main)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Settings size={16} />
                    Setting
                  </MotionButton>
                  <MotionButton
                    type="button"
                    onClick={() => {
          clearAuthSession()
                      setIsLoggedIn(false)
                      setIsProfileMenuOpen(false)
                      navigate('/login', { replace: true })
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 0.75rem',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-header)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontWeight: 700
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-main)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <LogOut size={16} />
                    Logout
                  </MotionButton>
                </motion.div>
              )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {isSettingsOpen && (
          <motion.div
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
            {...overlayMotionProps}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeSettings()
            }}
          >
            <motion.div
              className="card"
              style={{
                width: 'min(520px, 96vw)',
                maxHeight: '88vh',
                overflow: 'auto',
                padding: '1rem',
                fontSize: '0.875rem'
              }}
              {...modalMotionProps}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-header)' }}>Settings</div>
                <MotionButton
                  type="button"
                  onClick={closeSettings}
                  style={{ border: '1px solid var(--border)', background: 'transparent', borderRadius: 8, padding: '0.35rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                  title="Close"
                >
                  <X size={18} />
                </MotionButton>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Name</div>
                    <input
                      value={profileForm.fullName}
                      onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))}
                      disabled={settingsLoading || profileSaving}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.7rem',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Email</div>
                    <input
                      value={profileForm.email}
                      onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                      disabled={settingsLoading || profileSaving}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.7rem',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Role</div>
                    <div style={{ padding: '0.55rem 0.7rem', fontWeight: 800, color: 'var(--text-header)' }}>
                      {String(settingsUser?.roll || settingsUser?.role || userRoleLabel || 'User')}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <MotionButton
                    type="button"
                    onClick={saveProfile}
                    disabled={settingsLoading || profileSaving}
                    style={{
                      ...primaryButtonStyle,
                      opacity: settingsLoading || profileSaving ? 0.6 : 1,
                      cursor: settingsLoading || profileSaving ? 'not-allowed' : 'pointer'
                    }}
                    onMouseOver={(e) => {
                      if (settingsLoading || profileSaving) return
                      e.currentTarget.style.filter = 'brightness(0.95)'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.filter = 'none'
                    }}
                  >
                    {profileSaving ? 'Saving...' : 'Save'}
                  </MotionButton>
                </div>
              </div>

              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-header)' }}>Change Password</div>

                <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.3rem' }}>Current Password</div>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                      disabled={passwordSaving}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.7rem',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.3rem' }}>New Password</div>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                      disabled={passwordSaving}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.7rem',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-header)', marginBottom: '0.3rem' }}>Confirm Password</div>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                      disabled={passwordSaving}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.7rem',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-card)',
                        color: 'var(--text-header)',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <MotionButton
                    type="button"
                    onClick={closeSettings}
                    disabled={passwordSaving}
                    style={{
                      ...secondaryButtonStyle,
                      opacity: passwordSaving ? 0.6 : 1,
                      cursor: passwordSaving ? 'not-allowed' : 'pointer'
                    }}
                    onMouseOver={(e) => {
                      if (passwordSaving) return
                      e.currentTarget.style.background = 'var(--bg-main)'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    Cancel
                  </MotionButton>
                  <MotionButton
                    type="button"
                    onClick={changePassword}
                    disabled={passwordSaving}
                    style={{
                      ...primaryButtonStyle,
                      opacity: passwordSaving ? 0.6 : 1,
                      cursor: passwordSaving ? 'not-allowed' : 'pointer'
                    }}
                    onMouseOver={(e) => {
                      if (passwordSaving) return
                      e.currentTarget.style.filter = 'brightness(0.95)'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.filter = 'none'
                    }}
                  >
                    {passwordSaving ? 'Saving...' : 'Update Password'}
                  </MotionButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Page Content */}
        <div className="page-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
              style={{ minHeight: '100%' }}
            >
              {outlet || <Outlet />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export default Layout
