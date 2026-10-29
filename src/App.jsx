import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
const Login = lazy(() => import('./features/auth/pages/Login'))
const AdminLogin = lazy(() => import('./features/auth/pages/AdminLogin'))
const SignUp = lazy(() => import('./features/auth/pages/SignUp'))
const ForgotPassword = lazy(() => import('./features/auth/pages/ForgotPassword'))
import Layout from './components/Layout'
const Dashboard = lazy(() => import('./features/dashboard/pages/Dashboard'))
const Customer = lazy(() => import('./features/customers/pages/Customer'))
const Invoice = lazy(() => import('./features/sales/pages/Invoice'))
const Payment = lazy(() => import('./features/sales/pages/Payment'))
const Reports = lazy(() => import('./features/reports/pages/Reports'))
const User = lazy(() => import('./features/admin/pages/User'))
const Backup = lazy(() => import('./features/admin/pages/Backup'))
const Product = lazy(() => import('./features/admin/pages/Product'))
const LoadBalancing = lazy(() => import('./features/admin/pages/LoadBalancing'))
const RateLimitActivities = lazy(() => import('./features/admin/pages/RateLimitActivities'))
const Vendor = lazy(() => import('./features/vendors/pages/Vendor'))
const PurchaseInvoice = lazy(() => import('./features/purchases/pages/PurchaseInvoice'))
const PurchasePayment = lazy(() => import('./features/purchases/pages/PurchasePayment'))
import { clearAuthSession, getAuthToken, getAuthValue, getLastActivityAt, markSessionActivity, recordLogout } from './utils/authStorage'
const PageTransition = lazy(() => import('./components/PageTransition'))
import ToastProvider from './components/ToastProvider'
import { ROUTES } from './config/routes'
import { APP_CONFIG } from './config/app-config'
import { ROLES } from './constants/roles'
import './App.css'

function IdleSessionManager({ isLoggedIn, onLogout, timeoutMs = APP_CONFIG.idleSessionTimeoutMs }) {
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
        navigate(ROUTES.login, { replace: true })
        return
      }

      const lastActivityAt = getLastActivityAt()
      if (lastActivityAt && Date.now() - lastActivityAt >= timeoutMs) {
        onLogout()
        navigate(ROUTES.login, { replace: true })
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

function UnauthorizedSessionHandler({ onUnauthorized }) {
  const navigate = useNavigate()

  useEffect(() => {
    const handleUnauthorized = () => {
      onUnauthorized()
      navigate(ROUTES.login, { replace: true })
    }

    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [navigate, onUnauthorized])

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
  const handleUnauthorized = useCallback(() => {
    clearAuthSession()
    setIsLoggedIn(false)
  }, [])

  const withPageTransition = (element) => <PageTransition>{element}</PageTransition>
  const isAdmin = getAuthValue('userRole').toLowerCase() === ROLES.admin

  return (
    <ToastProvider>
      <BrowserRouter>
        <IdleSessionManager isLoggedIn={isLoggedIn} onLogout={logout} />
        <UnauthorizedSessionHandler onUnauthorized={handleUnauthorized} />
        <Suspense fallback={<div role="status" style={{ padding: '1.5rem' }}>Loading...</div>}>
        <Routes>
        {/* Auth Routes */}
        <Route
          path={ROUTES.login}
          element={
            isLoggedIn
              ? <Navigate to={ROUTES.dashboard} replace />
              : withPageTransition(<Login setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />)
          }
        />
        <Route
          path={ROUTES.adminLogin}
          element={
            isLoggedIn
              ? <Navigate to={ROUTES.dashboard} replace />
              : withPageTransition(<AdminLogin setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />)
          }
        />
        <Route path={ROUTES.signUp} element={withPageTransition(<SignUp theme={theme} toggleTheme={toggleTheme} />)} />
        <Route path={ROUTES.forgotPassword} element={withPageTransition(<ForgotPassword theme={theme} toggleTheme={toggleTheme} />)} />
        
        {/* Protected Routes with Layout */}
        <Route element={<Layout setIsLoggedIn={setIsLoggedIn} theme={theme} toggleTheme={toggleTheme} />}>
          <Route index element={isLoggedIn ? <Navigate to={ROUTES.dashboard} replace /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.dashboard} element={isLoggedIn ? <Dashboard /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.customers} element={isLoggedIn ? <Customer /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.vendors} element={isLoggedIn ? <Vendor /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.invoices} element={isLoggedIn ? <Invoice /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.payments} element={isLoggedIn ? <Payment /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.purchaseInvoices} element={isLoggedIn ? <PurchaseInvoice /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.purchasePayments} element={isLoggedIn ? <PurchasePayment /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.reports} element={isLoggedIn ? <Reports /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.users} element={isLoggedIn ? <User /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.backups} element={isLoggedIn ? <Backup /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.products} element={isLoggedIn ? <Product /> : <Navigate to={ROUTES.login} replace />} />
          <Route path={ROUTES.loadBalancing} element={!isLoggedIn ? <Navigate to={ROUTES.login} replace /> : isAdmin ? <LoadBalancing /> : <Navigate to={ROUTES.dashboard} replace />} />
          <Route path={ROUTES.rateLimitActivities} element={!isLoggedIn ? <Navigate to={ROUTES.login} replace /> : isAdmin ? <RateLimitActivities /> : <Navigate to={ROUTES.dashboard} replace />} />
          <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
        </Route>
      </Routes>
        </Suspense>
    </BrowserRouter>
    </ToastProvider>
  )
}

export default App
