import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Login from './features/auth/pages/Login'
import AdminLogin from './features/auth/pages/AdminLogin'
import SignUp from './features/auth/pages/SignUp'
import ForgotPassword from './features/auth/pages/ForgotPassword'
import Layout from './components/Layout'
import Dashboard from './features/dashboard/pages/Dashboard'
import Customer from './features/customers/pages/Customer'
import Invoice from './features/sales/pages/Invoice'
import Payment from './features/sales/pages/Payment'
import Reports from './features/reports/pages/Reports'
import User from './features/admin/pages/User'
import Backup from './features/admin/pages/Backup'
import Product from './features/admin/pages/Product'
import Vendor from './features/vendors/pages/Vendor'
import PurchaseInvoice from './features/purchases/pages/PurchaseInvoice'
import PurchasePayment from './features/purchases/pages/PurchasePayment'
import { clearAuthSession, getLastActivityAt, markSessionActivity, recordLogout, setAuthSession } from './utils/authStorage'
import { API_BASE_URL, apiFetch, readJsonResponse } from './utils/api'
import { SkeletonShape } from './components/SkeletonUI'
import PageTransition from './components/PageTransition'
import ToastProvider from './components/ToastProvider'
import './App.css'

function IdleSessionManager({ isLoggedIn, onLogout, timeoutMs = 120000 }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoggedIn) return

    const markActivity = () => {
      markSessionActivity()
    }

    markActivity()

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    for (const eventName of events) {
      window.addEventListener(eventName, markActivity, { passive: true })
    }

    const onVisibilityChange = () => {
      if (!document.hidden) markActivity()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const intervalId = window.setInterval(() => {
      const lastActivityAt = getLastActivityAt()
      if (lastActivityAt && Date.now() - lastActivityAt >= timeoutMs) {
        onLogout()
        navigate('/login', { replace: true })
      }
    }, 1000)

    const refreshIntervalId = window.setInterval(async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/auth/refresh`, { method: 'POST' })
        if (response.status === 401) {
          onLogout()
          navigate('/login', { replace: true })
        }
      } catch {
        // Keep the local session during transient network failures.
      }
    }, 30 * 60 * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearInterval(refreshIntervalId)
      for (const eventName of events) {
        window.removeEventListener(eventName, markActivity)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isLoggedIn, navigate, onLogout, timeoutMs])

  return null
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme')
    return savedTheme === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    let active = true
    const restoreSession = async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/auth/refresh`, { method: 'POST' })
        if (!response.ok) {
          clearAuthSession()
          return
        }
        const data = await readJsonResponse(response, 'Unable to restore session')
        if (data.user) {
          setAuthSession(data.user)
          if (active) setIsLoggedIn(true)
        } else {
          clearAuthSession()
        }
      } catch {
        clearAuthSession()
      } finally {
        if (active) setAuthChecking(false)
      }
    }
    restoreSession()
    return () => { active = false }
  }, [])

  // Apply theme to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  const logout = useCallback(() => {
    recordLogout()
    clearAuthSession()
    setIsLoggedIn(false)
  }, [])

  useEffect(() => {
    const handleSessionExpired = () => {
      logout()
      window.location.assign('/login')
    }
    window.addEventListener('goldflow:session-expired', handleSessionExpired)
    return () => window.removeEventListener('goldflow:session-expired', handleSessionExpired)
  }, [logout])

  const withPageTransition = (element) => <PageTransition>{element}</PageTransition>
  const sessionLoadingView = <div className="dashboard-content" style={{ padding: '2rem' }}><SkeletonShape width="min(420px, 100%)" height={18} style={{ margin: '20vh auto' }} /></div>
  const protectedPage = (element) => authChecking
    ? sessionLoadingView
    : isLoggedIn ? element : <Navigate to="/login" replace />

  return (
    <ToastProvider>
      <BrowserRouter>
        <IdleSessionManager isLoggedIn={isLoggedIn} onLogout={logout} timeoutMs={120000} />
        <Routes>
        {/* Auth Routes */}
        <Route
          path="/login"
          element={
            authChecking
              ? sessionLoadingView
              : isLoggedIn
              ? <Navigate to="/dashboard" replace />
              : withPageTransition(<Login setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />)
          }
        />
        <Route
          path="/admin"
          element={
            authChecking
              ? sessionLoadingView
              : isLoggedIn
              ? <Navigate to="/dashboard" replace />
              : withPageTransition(<AdminLogin setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />)
          }
        />
        <Route path="/signup" element={withPageTransition(<SignUp theme={theme} toggleTheme={toggleTheme} />)} />
        <Route path="/forgot-password" element={withPageTransition(<ForgotPassword theme={theme} toggleTheme={toggleTheme} />)} />
        
        {/* Protected Routes with Layout */}
        <Route element={<Layout setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />}>
          <Route index element={authChecking ? sessionLoadingView : isLoggedIn ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />} />
          <Route path="/dashboard" element={protectedPage(<Dashboard />)} />
          <Route path="/customer" element={protectedPage(<Customer />)} />
          <Route path="/vendor" element={protectedPage(<Vendor />)} />
          <Route path="/invoice" element={protectedPage(<Invoice />)} />
          <Route path="/payment" element={protectedPage(<Payment />)} />
          <Route path="/purchase-invoice" element={protectedPage(<PurchaseInvoice />)} />
          <Route path="/purchase-payment" element={protectedPage(<PurchasePayment />)} />
          <Route path="/reports" element={protectedPage(<Reports />)} />
          <Route path="/user" element={protectedPage(<User />)} />
          <Route path="/backup" element={protectedPage(<Backup />)} />
          <Route path="/product" element={protectedPage(<Product />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  )
}

export default App
