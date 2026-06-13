import React, { useEffect, useMemo, useState } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  ChevronRight, 
  ChevronLeft, 
  Calendar, 
  RotateCcw, 
  Edit2, 
  Plus, 
  User,
  Users,
  FileText,
  HandCoins,
  Search,
  Eye,
  Trash2,
  X
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts'
import EmptyDataCard from '../components/EmptyDataCard'
import { getAuthToken, getAuthValue } from '../utils/authStorage'
import { readJsonResponse } from '../utils/api'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')

// Helper to generate mock data for different ranges
const generateData = (count, labelPrefix = '') => {
  return Array.from({ length: count }, (_, i) => ({
    name: `${labelPrefix}${i + 1}`,
    inflow: Math.floor(Math.random() * 150000) + 50000,
    outflow: Math.floor(Math.random() * 100000) + 30000,
    gold: parseFloat((Math.random() * 2).toFixed(2)),
    silver: parseFloat((Math.random() * 20).toFixed(2)),
  }))
}

const data14D = [
  { name: '02 May', inflow: 95000, outflow: 55000, gold: 0.5, silver: 5.2 },
  { name: '03 May', inflow: 45000, outflow: 35000, gold: 0.3, silver: 3.1 },
  { name: '04 May', inflow: 70000, outflow: 60000, gold: 0.8, silver: 8.4 },
  { name: '05 May', inflow: 50000, outflow: 40000, gold: 0.4, silver: 4.2 },
  { name: '06 May', inflow: 65000, outflow: 30000, gold: 0.6, silver: 6.5 },
  { name: '07 May', inflow: 85000, outflow: 45000, gold: 1.2, silver: 12.0 },
  { name: '08 May', inflow: 75000, outflow: 35000, gold: 0.7, silver: 7.8 },
  { name: '09 May', inflow: 40000, outflow: 25000, gold: 0.2, silver: 2.5 },
  { name: '10 May', inflow: 170000, outflow: 105000, gold: 2.1, silver: 22.4 },
  { name: '11 May', inflow: 55000, outflow: 35000, gold: 0.4, silver: 4.8 },
  { name: '12 May', inflow: 95000, outflow: 65000, gold: 1.1, silver: 11.2 },
  { name: '13 May', inflow: 85000, outflow: 55000, gold: 0.9, silver: 9.5 },
  { name: '14 May', inflow: 65000, outflow: 75000, gold: 0.5, silver: 5.8 },
  { name: '15 May', inflow: 145000, outflow: 100000, gold: 1.8, silver: 18.6 },
]

const data1M = generateData(30, 'Day ')
const data1Y = generateData(12, 'Month ')
const data2Y = generateData(24, 'M')
const data5Y = generateData(5, 'Year ')

const inflowDetails = [
  {
    title: 'SALES',
    amount: '₹ 28,813',
    items: [
      { name: 'Sunita Bhagwan Kumawat', desc: 'Bill #609', amount: '₹ 5,337' },
      { name: 'Manoj Kailash Khandelwal', desc: 'Items Wt Sale #69', amount: '₹ 23,476' },
    ]
  },
  {
    title: 'RECEIPTS',
    amount: '₹ 14,750',
    items: [
      { name: 'Ravi Mohan Soni', desc: 'Receipt #375', amount: '₹ 3,000' },
      { name: 'Sunita Bhagwan Kumawat', desc: 'Receipt #389', amount: '₹ 11,750' },
    ]
  },
  {
    title: 'CHARGES',
    amount: '₹ 1,125',
    items: [
      { name: 'Ravi Mohan Soni', desc: 'Charge #128', amount: '₹ 250' },
      { name: 'Nitin Ramesh Gupta', desc: 'Charge #135', amount: '₹ 875' },
    ]
  },
  {
    title: 'LOAN REPAYMENTS',
    amount: '₹ 95,788',
    items: [
      { name: 'Meena Ramesh Sharma', desc: 'Repayment #257', amount: '₹ 40' },
      { name: 'Meena Ramesh Sharma', desc: 'Repayment #258', amount: '₹ 12,065' },
    ]
  }
]

const outflowDetails = [
  {
    title: 'CREDIT SALES',
    amount: '₹ 26,313',
    items: [
      { name: 'Sunita Bhagwan Kumawat', desc: 'Credit Sale #609', amount: '₹ 5,337' },
      { name: 'Manoj Kailash Khandelwal', desc: 'Items Wt Credit #69', amount: '₹ 20,976' },
    ]
  },
  {
    title: 'CHARGE RECEIVABLES',
    amount: '₹ 1,125',
    items: [
      { name: 'Ravi Mohan Soni', desc: 'Charge Due #128', amount: '₹ 250' },
      { name: 'Nitin Ramesh Gupta', desc: 'Charge Due #135', amount: '₹ 875' },
    ]
  },
  {
    title: 'EXPENSES',
    amount: '₹ 52',
    items: [
      { name: 'Mahalaxmi Silver Works', desc: 'Vendor Payment #52', amount: '₹ 52' },
    ]
  },
  {
    title: 'LOANS GIVEN',
    amount: '₹ 64,500',
    items: [
      { name: 'Pooja Rajesh Jain', desc: 'Issue #283', amount: '₹ 26,000' },
      { name: 'Manoj Kailash Khandelwal', desc: 'Issue #284', amount: '₹ 38,500' },
    ]
  }
]

const recentActivity = [
  {
    id: 1,
    action: 'Update Billing',
    time: '11 MINUTES AGO',
    type: 'edit',
    color: '#3b82f6',
    bgColor: '#eff6ff',
    user: 'test user',
    role: 'Super User',
    module: 'Customer Trans',
    refId: 'cmp6pknps0',
    method: 'PUT',
    path: '/customer-trans'
  },
  {
    id: 2,
    action: 'Create Receipt',
    time: '19 MINUTES AGO',
    type: 'plus',
    color: '#10b981',
    bgColor: '#ecfdf5',
    user: 'test user',
    role: 'Super User',
    module: 'Customer Trans',
    refId: 'cmp6pknro0',
    method: 'POST',
    path: '/customer-trans'
  },
  {
    id: 3,
    action: 'Create Billing',
    time: '19 MINUTES AGO',
    type: 'plus',
    color: '#10b981',
    bgColor: '#ecfdf5',
    user: 'test user',
    role: 'Super User',
    module: 'Customer Trans',
    refId: 'cmp6pknps0',
    method: 'POST',
    path: '/customer-trans'
  },
  {
    id: 4,
    action: 'Update Receipt',
    time: '25 MINUTES AGO',
    type: 'edit',
    color: '#3b82f6',
    bgColor: '#eff6ff',
    user: 'test user',
    role: 'Super User',
    module: 'Customer Trans',
    refId: 'cmp6pknro0',
    method: 'PUT',
    path: '/customer-trans'
  }
]

const topDebtors = [
  { name: 'Vikram Pratap Singh', initial: 'VP', color: '#f87171', cash: '₹ 69,336.27', gold: '-', silver: '-' },
  { name: 'Gopal Mohanlal Soni', initial: 'GM', color: '#60a5fa', cash: '₹ 53,887', gold: '-', silver: '-' },
  { name: 'Manoj Kailash Khandelwal', initial: 'MK', color: '#34d399', cash: '₹ 53,844', gold: '-', silver: '-' },
  { name: 'Suresh Girdhari Verma', initial: 'SG', color: '#fbbf24', cash: '₹ 50,520', gold: '2.500 g', silver: '-' },
  { name: 'Kavita Mahendra Rathore', initial: 'KM', color: '#c084fc', cash: '₹ 50,420', gold: '-1.850 g', silver: '-' }
]

function Dashboard() {
  const navigate = useNavigate()
  const [activeChartTab, setActiveChartTab] = useState('Cash Flow')
  const [activeTimeRange, setActiveTimeRange] = useState('14D')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [customerOverviewLoading, setCustomerOverviewLoading] = useState(false)
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [totalPendingAmount, setTotalPendingAmount] = useState(0)
  const [customerOverviewSearch, setCustomerOverviewSearch] = useState('')
  const [customerOverview, setCustomerOverview] = useState([])
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [customerModalLoading, setCustomerModalLoading] = useState(false)
  const [customerModalSalesLoading, setCustomerModalSalesLoading] = useState(false)
  const [customerModalCustomerId, setCustomerModalCustomerId] = useState(null)
  const [customerModalProfile, setCustomerModalProfile] = useState(null)
  const [customerModalSalesRows, setCustomerModalSalesRows] = useState([])
  const [customerModalSalesTotals, setCustomerModalSalesTotals] = useState({
    totalInvoiceAmount: 0,
    totalPaidAmount: 0,
    totalPendingAmount: 0
  })
  const [customerModalSalesPage, setCustomerModalSalesPage] = useState(1)
  const [customerModalSalesTotalPages, setCustomerModalSalesTotalPages] = useState(1)
  const isAdmin = (getAuthValue('userRole') || '').toLowerCase() === 'admin'

  const fetchDashboardSummary = async () => {
    setSummaryLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/dashboard/summary`)
      const data = await readJsonResponse(response, 'Error fetching dashboard summary')
      setTotalCustomers(Number(data.totalCustomers) || 0)
      setTotalPendingAmount(Number(data.totalPendingAmount) || 0)
    } catch (err) {
      console.error('Error fetching dashboard summary:', err)
      setTotalCustomers(0)
      setTotalPendingAmount(0)
    } finally {
      setSummaryLoading(false)
    }
  }

  const fetchCustomerOverview = async (search = '') => {
    setCustomerOverviewLoading(true)
    try {
      const url = new URL(`${API_BASE_URL}/api/dashboard/customer-overview`, window.location.origin)
      url.searchParams.set('limit', '10')
      if (search.trim()) url.searchParams.set('search', search.trim())
      const response = await fetch(url.toString())
      const data = await readJsonResponse(response, 'Error fetching customer overview')
      setCustomerOverview(data.customers || [])
    } catch (err) {
      console.error('Error fetching customer overview:', err)
      setCustomerOverview([])
    } finally {
      setCustomerOverviewLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardSummary()
    fetchCustomerOverview('')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      fetchCustomerOverview(customerOverviewSearch)
    }, 300)
    return () => clearTimeout(t)
  }, [customerOverviewSearch])

  const formatMoney = (value, fractionDigits = 2) =>
    Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })

  const statusBadgeStyle = (status) => {
    if (status === 'Paid') return { background: 'rgba(34,197,94,0.15)', color: 'rgb(34,197,94)' }
    if (status === 'Partial') return { background: 'rgba(59,130,246,0.15)', color: 'rgb(59,130,246)' }
    return { background: 'rgba(249,115,22,0.18)', color: 'rgb(249,115,22)' }
  }

  const closeCustomerModal = () => {
    setCustomerModalOpen(false)
    setCustomerModalCustomerId(null)
    setCustomerModalProfile(null)
    setCustomerModalSalesRows([])
    setCustomerModalSalesTotals({
      totalInvoiceAmount: 0,
      totalPaidAmount: 0,
      totalPendingAmount: 0
    })
    setCustomerModalSalesPage(1)
    setCustomerModalSalesTotalPages(1)
    setCustomerModalLoading(false)
    setCustomerModalSalesLoading(false)
  }

  const fetchCustomerModalSales = async ({ customerId, page }) => {
    setCustomerModalSalesLoading(true)
    try {
      const url = new URL(`${API_BASE_URL}/api/reports/sales`, window.location.origin)
      url.searchParams.set('customerId', customerId)
      url.searchParams.set('page', String(page))
      url.searchParams.set('limit', '25')
      const response = await fetch(url.toString())
      const data = await readJsonResponse(response, 'Error fetching customer sales report')
      setCustomerModalSalesRows(data.rows || [])
      setCustomerModalSalesTotals(data.totals || { totalInvoiceAmount: 0, totalPaidAmount: 0, totalPendingAmount: 0 })
      setCustomerModalSalesPage(Number(data.page) || 1)
      setCustomerModalSalesTotalPages(Number(data.totalPages) || 1)
    } catch (err) {
      console.error('Error fetching customer sales report:', err)
      setCustomerModalSalesRows([])
      setCustomerModalSalesTotals({ totalInvoiceAmount: 0, totalPaidAmount: 0, totalPendingAmount: 0 })
      setCustomerModalSalesPage(1)
      setCustomerModalSalesTotalPages(1)
    } finally {
      setCustomerModalSalesLoading(false)
    }
  }

  const openCustomerModal = async (customerRow) => {
    const mongoCustomerId = customerRow?.customerId
    setCustomerModalOpen(true)
    setCustomerModalCustomerId(mongoCustomerId)
    setCustomerModalProfile(null)
    setCustomerModalSalesRows([])
    setCustomerModalSalesTotals({ totalInvoiceAmount: 0, totalPaidAmount: 0, totalPendingAmount: 0 })
    setCustomerModalSalesPage(1)
    setCustomerModalSalesTotalPages(1)
    setCustomerModalLoading(true)
    try {
      const url = new URL(`${API_BASE_URL}/api/customers`, window.location.origin)
      url.searchParams.set('page', '1')
      url.searchParams.set('limit', '1')
      if (customerRow?.id) url.searchParams.set('search', customerRow.id)
      else if (customerRow?.customerName) url.searchParams.set('search', customerRow.customerName)
      const response = await fetch(url.toString())
      const data = await readJsonResponse(response, 'Error fetching customer profile')
      setCustomerModalProfile((data.customers && data.customers[0]) || null)
    } catch (err) {
      console.error('Error fetching customer profile:', err)
      setCustomerModalProfile(null)
    } finally {
      setCustomerModalLoading(false)
    }

    fetchCustomerModalSales({ customerId: mongoCustomerId, page: 1 })
  }

  const customerDisplayName = (customer) => {
    if (!customer) return 'Customer'
    const baseName =
      customer.customerName ||
      `${customer.firstName || ''} ${customer.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
      'Customer'
    return customer.id ? `${baseName} (${customer.id})` : baseName
  }

  const handleDashboardDeleteCustomer = async (mongoId) => {
    if (!isAdmin) {
      alert('Only admin can delete.')
      return
    }
    if (!window.confirm('Are you sure you want to delete this customer?')) return
    try {
      const token = getAuthToken()
      const response = await fetch(`${API_BASE_URL}/api/customers/${mongoId}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.message || 'Error deleting customer')
      }
      await fetchDashboardSummary()
      await fetchCustomerOverview(customerOverviewSearch)
      alert('Customer deleted successfully!')
    } catch (err) {
      console.error('Error deleting customer:', err)
      alert('Error deleting customer!')
    }
  }

  const isFutureDate = (date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date > today
  }

  const isFuture = useMemo(() => isFutureDate(currentDate), [currentDate])

  // Generate dynamic dashboard data based on date
  const dashboardData = useMemo(() => {
    if (isFuture) {
      return {
        goldSold: '0.000 g',
        silverSold: '0.000 g',
        closingBalance: '₹ 0',
        inflowTotal: '₹ 0',
        outflowTotal: '₹ 0',
        inflows: [],
        outflows: [],
        activity: [],
        debtors: []
      }
    }

    const day = currentDate.getDate()
    const month = currentDate.getMonth()
    const year = currentDate.getFullYear()
    
    // Deterministic variations based on date
    const gold = (7.520 * (day % 5 + 5) / 10).toFixed(3)
    const silver = (106.800 * (day % 7 + 3) / 10).toFixed(3)
    const balance = Math.floor(40538 * (day % 4 + 7) / 10)
    const inflow = Math.floor(140476 * (day % 3 + 8) / 10)
    const outflow = Math.floor(99938 * (day % 6 + 4) / 10)

    // Tweak inflow/outflow amounts slightly
    const dInflows = inflowDetails.map(sec => ({
      ...sec,
      amount: `₹ ${Math.floor(parseInt(sec.amount.replace(/[^\d]/g, '')) * (day % 5 + 8) / 10).toLocaleString()}`,
      items: sec.items.map(item => ({
        ...item,
        amount: `₹ ${Math.floor(parseInt(item.amount.replace(/[^\d]/g, '')) * (day % 5 + 8) / 10).toLocaleString()}`
      }))
    }))

    const dOutflows = outflowDetails.map(sec => ({
      ...sec,
      amount: `₹ ${Math.floor(parseInt(sec.amount.replace(/[^\d]/g, '')) * (day % 5 + 8) / 10).toLocaleString()}`,
      items: sec.items.map(item => ({
        ...item,
        amount: `₹ ${Math.floor(parseInt(item.amount.replace(/[^\d]/g, '')) * (day % 5 + 8) / 10).toLocaleString()}`
      }))
    }))

    return {
      goldSold: `${gold} g`,
      silverSold: `${silver} g`,
      closingBalance: `₹ ${balance.toLocaleString()}`,
      inflowTotal: `₹ ${inflow.toLocaleString()}`,
      outflowTotal: `₹ ${outflow.toLocaleString()}`,
      inflows: dInflows,
      outflows: dOutflows,
      activity: recentActivity.slice(0, (day % 4) + 1),
      debtors: topDebtors.slice(0, (day % 3) + 3)
    }
  }, [currentDate, isFuture])

  const formatDate = (date) => {
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  const changeDate = (days) => {
    const nextDate = new Date(currentDate)
    nextDate.setDate(currentDate.getDate() + days)
    setCurrentDate(nextDate)
  }

  const currentChartData = useMemo(() => {
    switch (activeTimeRange) {
      case '14D': return data14D
      case '1M': return data1M
      case '1Y': return data1Y
      case '2Y': return data2Y
      case '5Y': return data5Y
      default: return data14D
    }
  }, [activeTimeRange])

  const renderChart = () => {
    switch (activeChartTab) {
      case 'Gold Sold':
        return (
          <ResponsiveContainer>
            <AreaChart data={currentChartData}>
              <defs>
                <linearGradient id="colorGold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(val) => `${val}g`} />
              <Tooltip formatter={(value) => [`${value} g`, 'Gold Sold']} />
              <Area type="monotone" dataKey="gold" stroke="#f59e0b" fillOpacity={1} fill="url(#colorGold)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )
      case 'Silver Sold':
        return (
          <ResponsiveContainer>
            <AreaChart data={currentChartData}>
              <defs>
                <linearGradient id="colorSilver" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(val) => `${val}g`} />
              <Tooltip formatter={(value) => [`${value} g`, 'Silver Sold']} />
              <Area type="monotone" dataKey="silver" stroke="#94a3b8" fillOpacity={1} fill="url(#colorSilver)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )
      default:
        return (
          <ResponsiveContainer>
            <AreaChart data={currentChartData}>
              <defs>
                <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(val) => `₹${val/1000}k`} />
              <Tooltip formatter={(value) => [`₹ ${value.toLocaleString()}`]} />
              <Area type="monotone" dataKey="inflow" stroke="#10b981" fillOpacity={1} fill="url(#colorInflow)" strokeWidth={2} />
              <Area type="monotone" dataKey="outflow" stroke="#ef4444" fillOpacity={1} fill="url(#colorOutflow)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )
    }
  }

  const TransactionDetailList = ({ data, accentColor }) => (
    <div className="detail-section">
      {data.map((section, sIdx) => (
        <div key={sIdx} className="sub-section">
          <div className="sub-header">
            <span className="sub-title" style={{ color: accentColor }}>{section.title}</span>
            <span className="sub-amount" style={{ color: accentColor }}>{section.amount}</span>
          </div>
          <div className="transaction-list">
            {section.items.map((item, iIdx) => (
              <div key={iIdx} className="transaction-item">
                <div className="item-info">
                  <div className="item-avatar">
                    <User size={16} />
                  </div>
                  <div className="item-text">
                    <span className="item-name">{item.name}</span>
                    <span className="item-desc">{item.desc}</span>
                  </div>
                </div>
                <div className="item-amount">{item.amount}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="dashboard-content">
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div
          className="card"
          style={{ flex: '1 1 260px', textAlign: 'center', padding: '1.5rem', cursor: 'pointer' }}
          onClick={() => navigate('/customer')}
        >
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(59,130,246,0.12)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={26} color="rgb(59,130,246)" />
          </div>
          <div style={{ marginTop: '0.75rem', fontWeight: 800, color: 'var(--text-header)' }}>Customer</div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Manage customers</div>
          <div className="quick-access-btn">Quick Access</div>
        </div>

        <div
          className="card"
          style={{ flex: '1 1 260px', textAlign: 'center', padding: '1.5rem', cursor: 'pointer' }}
          onClick={() => navigate('/invoice')}
        >
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(34,197,94,0.12)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={26} color="rgb(34,197,94)" />
          </div>
          <div style={{ marginTop: '0.75rem', fontWeight: 800, color: 'var(--text-header)' }}>Invoice</div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Create invoices</div>
          <div className="quick-access-btn">Quick Access</div>
        </div>

        <div
          className="card"
          style={{ flex: '1 1 260px', textAlign: 'center', padding: '1.5rem', cursor: 'pointer' }}
          onClick={() => navigate('/payment')}
        >
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(168,85,247,0.12)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HandCoins size={26} color="rgb(168,85,247)" />
          </div>
          <div style={{ marginTop: '0.75rem', fontWeight: 800, color: 'var(--text-header)' }}>Payment</div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Record payments</div>
          <div className="quick-access-btn">Quick Access</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 360px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)' }}>Total Customers</div>
              <div style={{ marginTop: '0.5rem', fontSize: '2rem', fontWeight: 900, color: 'var(--text-header)' }}>
                {summaryLoading ? '...' : totalCustomers}
              </div>
              <div style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Active customer accounts</div>
            </div>
            <Users size={18} color="var(--primary)" />
          </div>
        </div>

        <div className="card" style={{ flex: '1 1 360px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-muted)' }}>Total Pending Amount</div>
              <div style={{ marginTop: '0.5rem', fontSize: '2rem', fontWeight: 900, color: 'var(--text-header)' }}>
                {summaryLoading ? '...' : `₹${formatMoney(totalPendingAmount, 2)}`}
              </div>
              <div style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Outstanding receivables</div>
            </div>
            <TrendingUp size={18} color="rgb(249, 115, 22)" />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-header)' }}>Customer Overview</div>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.35rem 0.6rem', width: 'min(220px, 100%)', flex: '0 0 auto', marginLeft: 'auto' }}>
            <Search size={14} color="var(--text-muted)" style={{ marginRight: '0.4rem' }} />
            <input
              type="text"
              placeholder="Search customers..."
              value={customerOverviewSearch}
              onChange={(e) => setCustomerOverviewSearch(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.8125rem', color: 'var(--text-header)' }}
            />
          </div>
        </div>

        <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 800 }}>Customer Name</th>
                <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 800 }}>Contact</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 800 }}>Pending Amount</th>
                <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 800 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customerOverviewLoading ? (
                <tr>
                  <td colSpan={4} style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading...</td>
                </tr>
              ) : customerOverview.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '1rem' }}>
                    <EmptyDataCard />
                  </td>
                </tr>
              ) : (
                customerOverview.map((c) => (
                  <tr key={String(c.customerId)} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>
                      {(c.customerName || `${c.firstName || ''} ${c.lastName || ''}`.replace(/\s+/g, ' ').trim())}{c.id ? ` (${c.id})` : ''}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }}>{c.contactNumber || '-'}</td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'rgb(249, 115, 22)', fontWeight: 900 }}>
                      ₹{formatMoney(c.pendingAmount, 2)}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => openCustomerModal(c)}
                          style={{ padding: '0.35rem', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                          title="View"
                        >
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {customerModalOpen && (
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
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCustomerModal()
          }}
        >
          <div
            className="card"
            style={{
              width: 'min(1100px, 96vw)',
              maxHeight: '88vh',
              overflow: 'auto',
              padding: '1.25rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-header)' }}>
                Profile Summary
              </div>
              <button
                type="button"
                onClick={closeCustomerModal}
                style={{ border: '1px solid var(--border)', background: 'transparent', borderRadius: 8, padding: '0.35rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginTop: '1rem' }}>
              {customerModalLoading ? (
                <div style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Loading profile...</div>
              ) : !customerModalProfile ? (
                <div style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Customer profile not found.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  <div style={{ borderRadius: 10, padding: '0.9rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>Name</div>
                    <div style={{ marginTop: '0.35rem', fontWeight: 900, color: 'var(--text-header)' }}>
                      {customerDisplayName(customerModalProfile)}
                    </div>
                  </div>
                  <div style={{ borderRadius: 10, padding: '0.9rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>Contact</div>
                    <div style={{ marginTop: '0.35rem', fontWeight: 900, color: 'var(--text-header)' }}>
                      {customerModalProfile.contactNumber || '-'}
                    </div>
                  </div>
                  <div style={{ borderRadius: 10, padding: '0.9rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>Email</div>
                    <div style={{ marginTop: '0.35rem', fontWeight: 900, color: 'var(--text-header)', wordBreak: 'break-word' }}>
                      {customerModalProfile.email || '-'}
                    </div>
                  </div>
                  <div style={{ borderRadius: 10, padding: '0.9rem', gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>Address</div>
                    <div style={{ marginTop: '0.35rem', fontWeight: 800, color: 'var(--text-header)', whiteSpace: 'pre-wrap' }}>
                      {customerModalProfile.address || '-'}
                    </div>
                  </div>
                  <div style={{ borderRadius: 10, padding: '0.9rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>Note</div>
                    <div style={{ marginTop: '0.35rem', fontWeight: 800, color: 'var(--text-header)', whiteSpace: 'pre-wrap' }}>
                      {customerModalProfile.note || '-'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', background: 'var(--bg-main)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>Total Invoice Amount</div>
                  <div style={{ marginTop: '0.4rem', fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-header)' }}>
                    ₹{formatMoney(customerModalSalesTotals.totalInvoiceAmount, 0)}
                  </div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', background: 'var(--bg-main)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>Total Paid Amount</div>
                  <div style={{ marginTop: '0.4rem', fontSize: '1.2rem', fontWeight: 900, color: 'rgb(34,197,94)' }}>
                    ₹{formatMoney(customerModalSalesTotals.totalPaidAmount, 0)}
                  </div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', background: 'var(--bg-main)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>Total Pending Amount</div>
                  <div style={{ marginTop: '0.4rem', fontSize: '1.2rem', fontWeight: 900, color: 'rgb(239,68,68)' }}>
                    ₹{formatMoney(customerModalSalesTotals.totalPendingAmount, 0)}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 800 }}>Invoice Number</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 800 }}>Invoice Date</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 800 }}>Invoice Amount</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 800 }}>Paid Amount</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 800 }}>Pending Amount</th>
                      <th style={{ textAlign: 'left', padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 800 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerModalSalesLoading ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading invoices...</td>
                      </tr>
                    ) : customerModalSalesRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '1rem' }}>
                          <EmptyDataCard />
                        </td>
                      </tr>
                    ) : (
                      customerModalSalesRows.map((row) => (
                        <tr key={row._id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-header)', fontWeight: 700 }}>{row.invoiceNumber}</td>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-main)' }}>{new Date(row.invoiceDate).toLocaleDateString()}</td>
                          <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'var(--text-main)' }}>₹{formatMoney(row.invoiceAmount, 0)}</td>
                          <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'var(--text-main)' }}>₹{formatMoney(row.paidAmount, 0)}</td>
                          <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'var(--text-main)' }}>₹{formatMoney(row.pendingAmount, 0)}</td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            <span style={{ ...statusBadgeStyle(row.status), padding: '0.25rem 0.6rem', borderRadius: 999, fontWeight: 800, fontSize: '0.75rem' }}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {customerModalSalesTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.9rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={customerModalSalesPage <= 1 || customerModalSalesLoading}
                    onClick={() => {
                      const nextPage = Math.max(1, customerModalSalesPage - 1)
                      setCustomerModalSalesPage(nextPage)
                      fetchCustomerModalSales({ customerId: customerModalCustomerId, page: nextPage })
                    }}
                    style={{
                      padding: '0.45rem 0.75rem',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--text-header)',
                      opacity: customerModalSalesPage <= 1 ? 0.5 : 1
                    }}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={customerModalSalesPage >= customerModalSalesTotalPages || customerModalSalesLoading}
                    onClick={() => {
                      const nextPage = Math.min(customerModalSalesTotalPages, customerModalSalesPage + 1)
                      setCustomerModalSalesPage(nextPage)
                      fetchCustomerModalSales({ customerId: customerModalCustomerId, page: nextPage })
                    }}
                    style={{
                      padding: '0.45rem 0.75rem',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--text-header)',
                      opacity: customerModalSalesPage >= customerModalSalesTotalPages ? 0.5 : 1
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
