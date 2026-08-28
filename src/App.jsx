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
import Vendor from './features/vendors/pages/Vendor'
import PurchaseInvoice from './features/purchases/pages/PurchaseInvoice'
import PurchasePayment from './features/purchases/pages/PurchasePayment'
import { clearAuthSession, getAuthToken, getLastActivityAt, markSessionActivity, recordLogout } from './utils/authStorage'
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
      const token = getAuthToken()
      if (!token) {
        onLogout()
        navigate('/login', { replace: true })
        return
      }

      const lastActivityAt = getLastActivityAt()
      if (lastActivityAt && Date.now() - lastActivityAt >= timeoutMs) {
        onLogout()
        navigate('/login', { replace: true })
      }
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
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
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme')
    return savedTheme === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    const token = getAuthToken()
    setIsLoggedIn(Boolean(token))
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

  const withPageTransition = (element) => <PageTransition>{element}</PageTransition>

  return (
    <ToastProvider>
      <BrowserRouter>
        <IdleSessionManager isLoggedIn={isLoggedIn} onLogout={logout} timeoutMs={120000} />
        <Routes>
        {/* Auth Routes */}
        <Route
          path="/login"
          element={
            isLoggedIn
              ? <Navigate to="/dashboard" replace />
              : withPageTransition(<Login setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />)
          }
        />
        <Route
          path="/admin"
          element={
            isLoggedIn
              ? <Navigate to="/dashboard" replace />
              : withPageTransition(<AdminLogin setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />)
          }
        />
        <Route path="/signup" element={withPageTransition(<SignUp theme={theme} toggleTheme={toggleTheme} />)} />
        <Route path="/forgot-password" element={withPageTransition(<ForgotPassword theme={theme} toggleTheme={toggleTheme} />)} />
        
        {/* Protected Routes with Layout */}
        <Route element={<Layout setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />}>
          <Route index element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />} />
          <Route path="/dashboard" element={isLoggedIn ? <Dashboard /> : <Navigate to="/login" replace />} />
          <Route path="/customer" element={isLoggedIn ? <Customer /> : <Navigate to="/login" replace />} />
          <Route path="/vendor" element={isLoggedIn ? <Vendor /> : <Navigate to="/login" replace />} />
          <Route path="/invoice" element={isLoggedIn ? <Invoice /> : <Navigate to="/login" replace />} />
          <Route path="/payment" element={isLoggedIn ? <Payment /> : <Navigate to="/login" replace />} />
          <Route path="/purchase-invoice" element={isLoggedIn ? <PurchaseInvoice /> : <Navigate to="/login" replace />} />
          <Route path="/purchase-payment" element={isLoggedIn ? <PurchasePayment /> : <Navigate to="/login" replace />} />
          <Route path="/reports" element={isLoggedIn ? <Reports /> : <Navigate to="/login" replace />} />
          <Route path="/user" element={isLoggedIn ? <User /> : <Navigate to="/login" replace />} />
          <Route path="/backup" element={isLoggedIn ? <Backup /> : <Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  )
}

export default App
