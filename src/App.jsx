import React, { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import AdminLogin from './pages/AdminLogin'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Customer from './pages/Customer'
import Invoice from './pages/Invoice'
import Payment from './pages/Payment'
import Reports from './pages/Reports'
import User from './pages/User'
import Vendor from './pages/Vendor'
import PurchaseInvoice from './pages/PurchaseInvoice'
import PurchasePayment from './pages/PurchasePayment'
import { clearAuthSession, getAuthToken, getLastActivityAt, markSessionActivity } from './utils/authStorage'
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
    clearAuthSession()
    setIsLoggedIn(false)
  }, [])

  return (
    <BrowserRouter>
      <IdleSessionManager isLoggedIn={isLoggedIn} onLogout={logout} timeoutMs={120000} />
      <Routes>
        {/* Auth Routes */}
        <Route
          path="/login"
          element={
            isLoggedIn ? <Navigate to="/dashboard" replace /> : <Login setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />
          }
        />
        <Route
          path="/admin"
          element={
            isLoggedIn ? <Navigate to="/dashboard" replace /> : <AdminLogin setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />
          }
        />
        <Route path="/signup" element={<SignUp theme={theme} toggleTheme={toggleTheme} />} />
        <Route path="/forgot-password" element={<ForgotPassword theme={theme} toggleTheme={toggleTheme} />} />
        
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
