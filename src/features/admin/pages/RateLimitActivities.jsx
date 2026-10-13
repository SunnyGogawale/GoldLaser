import { useEffect, useRef, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, Download, Pause, Play, RefreshCw, Search, Shield, Users, X } from 'lucide-react'
import { getAuthToken } from '../../../utils/authStorage'
import { apiFetch as fetch } from '../../../utils/authStorage'
import { useDebouncedValue } from '../../../utils/useApiRequest'
import './RateLimitActivities.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const POLICIES = ['authentication', 'resource', 'monitoring', 'general']
const PAGE_SIZES = [10, 25, 50, 100]
const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER']

const formatNumber = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : '0'
const formatDate = (value) => value ? new Date(value).toLocaleString() : 'N/A'

function MetricCard({ label, value, caption, icon: Icon, tone = '' }) {
  return <section className={`rla-metric ${tone}`}>
    <div className="rla-metric-label"><span>{label}</span><Icon size={17} aria-hidden="true" /></div>
    <strong>{value}</strong>
    <small>{caption}</small>
  </section>
}

function ActivityStatus({ value }) {
  const tone = value === 'Allowed' ? 'allowed' : value === 'Limit Exceeded' ? 'exceeded' : 'restricted'
  return <span className={`rla-status rla-status-${tone}`}>{value || 'Unknown'}</span>
}

function RateLimitActivities() {
  const [stats, setStats] = useState(null)
  const [activities, setActivities] = useState([])
  const [apis, setApis] = useState([])
  const [total, setTotal] = useState(0)
  const [apiTotal, setApiTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [apiPage, setApiPage] = useState(1)
  const [apiPageSize, setApiPageSize] = useState(25)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [livePaused, setLivePaused] = useState(false)
  const [liveStatus, setLiveStatus] = useState({ connection: 'connecting', mode: 'connecting', warning: '' })
  const [liveEvents, setLiveEvents] = useState([])
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const lastEventId = useRef('')
  const seenLiveEventIds = useRef(new Set())
  const lastEventRefresh = useRef(0)
  const [filters, setFilters] = useState({
    search: '', fromDate: '', toDate: '', method: '', activityType: '', userRole: '', policyName: '', ipAddress: ''
  })
  const [apiFilters, setApiFilters] = useState({ search: '', method: '', module: '', role: '', status: '' })
  const debouncedSearch = useDebouncedValue(filters.search)
  const debouncedIpAddress = useDebouncedValue(filters.ipAddress)
  const debouncedApiSearch = useDebouncedValue(apiFilters.search)
  const debouncedApiModule = useDebouncedValue(apiFilters.module)

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams()
    if (filters.fromDate) query.set('fromDate', filters.fromDate)
    if (filters.toDate) query.set('toDate', filters.toDate)
    if (filters.policyName) query.set('policyName', filters.policyName)
    const loadStats = async () => {
      try {
        const token = getAuthToken()
        const response = await fetch(`${API_BASE_URL}/api/admin/rate-limit-activities/stats?${query}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.message || 'Rate-limit statistics are unavailable')
        if (!controller.signal.aborted) {
          setStats(data)
          setLastUpdatedAt(new Date())
        }
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message || 'Rate-limit statistics are unavailable')
      }
    }
    loadStats()
    return () => controller.abort()
  }, [filters.fromDate, filters.toDate, filters.policyName, refreshKey])

  useEffect(() => {
    if (filters.search !== debouncedSearch || filters.ipAddress !== debouncedIpAddress) return
    const controller = new AbortController()
    const requestFilters = {
      search: debouncedSearch,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      method: filters.method,
      activityType: filters.activityType,
      userRole: filters.userRole,
      policyName: filters.policyName,
      ipAddress: debouncedIpAddress
    }
    const loadActivities = async () => {
      const token = getAuthToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const listQuery = new URLSearchParams({ page: String(page), limit: String(pageSize) })
      for (const [key, value] of Object.entries(requestFilters)) {
        if (!value) continue
        listQuery.set(key, value)
      }

      setRefreshing(true)
      setError('')
      try {
        const listResponse = await fetch(`${API_BASE_URL}/api/admin/rate-limit-activities?${listQuery}`, { headers, signal: controller.signal })
        const listData = await listResponse.json().catch(() => null)
        if (!listResponse.ok) throw new Error(listData?.message || 'Rate-limit activities are unavailable')
        setActivities(Array.isArray(listData?.activities) ? listData.activities : [])
        setTotal(Number(listData?.total) || 0)
        setLastUpdatedAt(new Date())
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message || 'Monitoring data is unavailable')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    loadActivities()
    return () => controller.abort()
  }, [filters.search, filters.ipAddress, filters.fromDate, filters.toDate, filters.method, filters.activityType, filters.userRole, filters.policyName, debouncedSearch, debouncedIpAddress, page, pageSize, refreshKey])

  useEffect(() => {
    if (apiFilters.search !== debouncedApiSearch || apiFilters.module !== debouncedApiModule) return
    const controller = new AbortController()
    const query = new URLSearchParams({ page: String(apiPage), limit: String(apiPageSize) })
    const requestFilters = {
      search: debouncedApiSearch,
      method: apiFilters.method,
      module: debouncedApiModule,
      role: apiFilters.role,
      status: apiFilters.status
    }
    for (const [key, value] of Object.entries(requestFilters)) if (value) query.set(key, value)
    const loadApis = async () => {
      try {
        const token = getAuthToken()
        const response = await fetch(`${API_BASE_URL}/api/admin/rate-limit-activities/apis?${query}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal
        })
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.message || 'API registry is unavailable')
        setApis(Array.isArray(data?.apis) ? data.apis : [])
        setApiTotal(Number(data?.total) || 0)
        setLastUpdatedAt(new Date())
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message || 'API registry is unavailable')
      }
    }
    loadApis()
    return () => controller.abort()
  }, [apiFilters.search, apiFilters.module, apiFilters.method, apiFilters.role, apiFilters.status, debouncedApiSearch, debouncedApiModule, apiPage, apiPageSize, refreshKey])

  useEffect(() => {
    if (livePaused) {
      setLiveStatus((current) => ({ ...current, connection: 'paused' }))
      return undefined
    }

    const controller = new AbortController()
    const connect = async () => {
      let retryDelay = 1000
      while (!controller.signal.aborted) {
        setLiveStatus((current) => ({ ...current, connection: 'connecting' }))
        try {
          const token = getAuthToken()
          const headers = token ? { Authorization: `Bearer ${token}` } : {}
          if (lastEventId.current) headers['Last-Event-ID'] = lastEventId.current
          const response = await fetch(`${API_BASE_URL}/api/admin/rate-limit-activities/live`, {
            headers,
            signal: controller.signal
          })
          if (!response.ok || !response.body) throw new Error(response.status === 401 || response.status === 403 ? 'Admin authorization is required for live monitoring.' : 'Live activity stream is unavailable.')

          setLiveStatus((current) => ({ ...current, connection: 'connected' }))
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read()
            if (done) throw new Error('Live connection closed. Reconnecting…')
            buffer += decoder.decode(value, { stream: true })
            let boundary = buffer.indexOf('\n\n')
            while (boundary >= 0) {
              const block = buffer.slice(0, boundary)
              buffer = buffer.slice(boundary + 2)
              let eventName = 'message'
              let eventId = ''
              let data = ''
              for (const line of block.split('\n')) {
                if (line.startsWith('event:')) eventName = line.slice(6).trim()
                else if (line.startsWith('id:')) eventId = line.slice(3).trim()
                else if (line.startsWith('data:')) data += line.slice(5).trim()
              }
              if (eventId) lastEventId.current = eventId
              if (!data) { boundary = buffer.indexOf('\n\n'); continue }
              const payload = JSON.parse(data)
              if (eventName === 'status') {
                setLiveStatus((current) => ({ ...current, ...payload, connection: 'connected' }))
              } else if (eventName === 'activity') {
                if (payload.eventId && seenLiveEventIds.current.has(payload.eventId)) {
                  boundary = buffer.indexOf('\n\n')
                  continue
                }
                if (payload.eventId) {
                  seenLiveEventIds.current.add(payload.eventId)
                  while (seenLiveEventIds.current.size > 500) {
                    seenLiveEventIds.current.delete(seenLiveEventIds.current.values().next().value)
                  }
                }
                setLiveEvents((current) => [payload, ...current.filter((item) => item.eventId !== payload.eventId)].slice(0, 100))
                setLastUpdatedAt(new Date())
                setStats((current) => {
                  if (!current) return current
                  const limited = payload.requestStatus === 'Rate Limited'
                  const failed = payload.requestStatus === 'Failed'
                  const patch = {
                    totalRequests: (current.totalRequests || 0) + 1,
                    allowedRequests: (current.allowedRequests || 0) + (limited ? 0 : 1),
                    rateLimitedRequests: (current.rateLimitedRequests || 0) + (limited ? 1 : 0),
                    successfulRequests: (current.successfulRequests || 0) + (!limited && !failed ? 1 : 0),
                    failedRequests: (current.failedRequests || 0) + (failed ? 1 : 0)
                  }
                  return { ...current, ...patch }
                })
                setApis((current) => current.map((api) => api.routeId !== payload.routeId ? api : ({
                  ...api,
                  requestsUsed: payload.requestsUsed,
                  remainingRequests: payload.remainingRequests,
                  totalRequests: (api.totalRequests || 0) + 1,
                  totalBlockedRequests: (api.totalBlockedRequests || 0) + (payload.requestStatus === 'Rate Limited' ? 1 : 0),
                  successfulRequests: (api.successfulRequests || 0) + (payload.requestStatus === 'Success' ? 1 : 0),
                  failedRequests: (api.failedRequests || 0) + (payload.requestStatus !== 'Success' ? 1 : 0),
                  lastRequestAt: payload.timestamp
                })))
                const now = Date.now()
                if (now - lastEventRefresh.current > 1500) {
                  lastEventRefresh.current = now
                  setRefreshKey((current) => current + 1)
                }
              } else if (eventName === 'reset') {
                setRefreshKey((current) => current + 1)
              }
              boundary = buffer.indexOf('\n\n')
            }
          }
        } catch (streamError) {
          if (controller.signal.aborted) return
          setLiveStatus((current) => ({
            ...current,
            connection: 'reconnecting',
            warning: streamError.message || 'Live connection interrupted. Retrying…'
          }))
          await new Promise((resolve) => window.setTimeout(resolve, retryDelay))
          retryDelay = Math.min(retryDelay * 2, 30000)
        }
      }
    }

    connect()
    return () => controller.abort()
  }, [livePaused])

  useEffect(() => {
    if ((liveStatus.connection === 'connected' && liveStatus.mode === 'distributed') || livePaused) return undefined
    const timer = window.setInterval(() => setRefreshKey((current) => current + 1), 15000)
    return () => window.clearInterval(timer)
  }, [liveStatus.connection, liveStatus.mode, livePaused])

  useEffect(() => {
    if (!selectedActivity) return
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedActivity(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedActivity])

  const updateFilter = (key, value) => {
    setPage(1)
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const updateApiFilter = (key, value) => {
    setApiPage(1)
    setApiFilters((current) => ({ ...current, [key]: value }))
  }

  const clearApiFilters = () => {
    setApiPage(1)
    setApiFilters({ search: '', method: '', module: '', role: '', status: '' })
  }

  const clearFilters = () => {
    setPage(1)
    setFilters({ search: '', fromDate: '', toDate: '', method: '', activityType: '', userRole: '', policyName: '', ipAddress: '' })
  }

  const viewDetails = async (activity) => {
    setSelectedActivity(activity)
    setDetailLoading(true)
    try {
      const token = getAuthToken()
      const response = await fetch(`${API_BASE_URL}/api/admin/rate-limit-activities/${activity._id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.message || 'Activity details are unavailable')
      setSelectedActivity(data.activity)
    } catch (detailError) {
      setError(detailError.message || 'Activity details are unavailable')
    } finally {
      setDetailLoading(false)
    }
  }

  const exportCsv = async () => {
    setExporting(true)
    setError('')
    try {
      const query = new URLSearchParams({ export: 'csv' })
      for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value)
      const token = getAuthToken()
      const response = await fetch(`${API_BASE_URL}/api/admin/rate-limit-activities?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.message || 'CSV export failed')
      }
      const blobUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = 'rate-limit-activities.csv'
      link.click()
      URL.revokeObjectURL(blobUrl)
    } catch (exportError) {
      setError(exportError.message || 'CSV export failed')
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const apiTotalPages = Math.max(1, Math.ceil(apiTotal / apiPageSize))
  return <main className="rla-page">
    <header className="rla-header">
      <div>
        <p className="rla-eyebrow">Operations / Admin</p>
        <h1>Rate Limit Activities</h1>
        <p className="rla-subtitle">Request pressure, policy enforcement, and temporary restrictions</p>
      </div>
      <div className="rla-header-actions">
        <button className="rla-button" type="button" onClick={exportCsv} disabled={exporting || loading} title="Export filtered events to CSV">
          <Download size={16} /><span>{exporting ? 'Exporting' : 'Export CSV'}</span>
        </button>
        <button className="rla-button rla-primary-button" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={refreshing} title="Refresh monitoring data">
          <RefreshCw size={16} className={refreshing ? 'rla-spinning' : ''} /><span>Refresh</span>
        </button>
      </div>
    </header>

    {error && <div className="rla-error" role="alert"><AlertTriangle size={17} />{error}</div>}

    <section className="rla-metrics-grid" aria-label="Rate-limit summary">
      <MetricCard label="Registered APIs" value={formatNumber(stats?.totalRegisteredApis)} caption="Discovered from Express routes" icon={Activity} />
      <MetricCard label="Rate limiting enabled" value={formatNumber(stats?.apisWithRateLimiting)} caption="Registered API methods covered" icon={Shield} tone="rla-good" />
      <MetricCard label="Rate limiting disabled" value={formatNumber(stats?.apisWithoutRateLimiting)} caption="No applicable policy" icon={AlertTriangle} tone="rla-warn" />
      <MetricCard label="Total requests" value={formatNumber(stats?.totalRequests)} caption="Shared policy-window counters" icon={Activity} />
      <MetricCard label="Successful requests" value={formatNumber(stats?.successfulRequests)} caption="Completed below HTTP 400" icon={CheckCircle2} tone="rla-good" />
      <MetricCard label="Failed requests" value={formatNumber(stats?.failedRequests)} caption="HTTP 400+ excluding throttles" icon={AlertTriangle} tone="rla-warn" />
      <MetricCard label="Rate-limited requests" value={formatNumber(stats?.rateLimitedRequests)} caption="Blocked with HTTP 429" icon={Shield} tone="rla-warn" />
      <MetricCard label="Active restrictions" value={formatNumber(stats?.activeTemporaryRestrictions)} caption="Restricted windows not yet expired" icon={Clock3} tone="rla-warn" />
      <MetricCard label="Affected users" value={formatNumber(stats?.uniqueAffectedUsers)} caption="Accounts with a stored restriction" icon={Users} />
    </section>

    <section className="rla-section">
      <div className="rla-section-heading"><div><h2>Registered API routes</h2><span>{formatNumber(apiTotal)} discovered methods</span></div>
        <div className="rla-search"><Search size={16} aria-hidden="true" /><input aria-label="Search API endpoints" placeholder="Search endpoint" value={apiFilters.search} onChange={(event) => updateApiFilter('search', event.target.value)} /></div>
      </div>
      <div className="rla-filters rla-api-filters">
        <label>Method<select value={apiFilters.method} onChange={(event) => updateApiFilter('method', event.target.value)}><option value="">All methods</option>{API_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
        <label>Module<input placeholder="Any module" value={apiFilters.module} onChange={(event) => updateApiFilter('module', event.target.value)} /></label>
        <label>Access role<select value={apiFilters.role} onChange={(event) => updateApiFilter('role', event.target.value)}><option value="">All roles</option><option>Admin</option><option>User</option><option>Public</option></select></label>
        <label>Rate-limit status<select value={apiFilters.status} onChange={(event) => updateApiFilter('status', event.target.value)}><option value="">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option><option value="active">Active</option><option value="limited">Limited</option><option value="unused">Unused</option></select></label>
        <button type="button" className="rla-text-button" onClick={clearApiFilters}>Clear filters</button>
      </div>
      <div className="rla-table-wrap"><table className="rla-table">
        <thead><tr><th>API endpoint</th><th>Method</th><th>Module / controller</th><th>Auth</th><th>Access role</th><th>Policy</th><th>Maximum</th><th>Window</th><th>Used</th><th>Remaining</th><th>Limit status</th><th>Total requests</th><th>Blocked</th><th>Last request</th></tr></thead>
        <tbody>{apis.map((api) => <tr key={api.routeId}>
          <td className="rla-endpoint" title={api.endpoint}>{api.endpoint}</td><td>{api.method}</td><td>{api.moduleName}</td>
          <td>{api.authenticationRequired ? 'Required' : 'Public'}</td><td>{api.accessRole}</td><td>{api.policyName || 'None'}</td>
          <td>{api.requestLimit ? formatNumber(api.requestLimit) : 'N/A'}</td><td>{api.windowDuration ? `${formatNumber(api.windowDuration / 1000)} s` : 'N/A'}</td>
          <td>{formatNumber(api.requestsUsed)}</td><td>{formatNumber(api.remainingRequests)}</td>
          <td><span className={`rla-status rla-status-${api.rateLimitStatus.toLowerCase()}`}>{api.rateLimitStatus}</span></td>
          <td>{formatNumber(api.totalRequests)}</td><td>{formatNumber(api.totalBlockedRequests)}</td><td>{formatDate(api.lastRequestAt)}</td>
        </tr>)}
        {!apis.length && <tr><td colSpan="14" className="rla-empty-row">{loading ? 'Discovering registered APIs…' : 'No API routes match these filters'}</td></tr>}</tbody>
      </table></div>
      <footer className="rla-pagination"><label>Rows per page<select value={apiPageSize} onChange={(event) => { setApiPageSize(Number(event.target.value)); setApiPage(1) }}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <span>Page {apiPage} of {apiTotalPages}</span><div><button className="rla-button" type="button" disabled={apiPage <= 1} onClick={() => setApiPage((value) => Math.max(1, value - 1))}>Previous</button><button className="rla-button" type="button" disabled={apiPage >= apiTotalPages} onClick={() => setApiPage((value) => Math.min(apiTotalPages, value + 1))}>Next</button></div>
      </footer>
    </section>

    <section className="rla-section rla-live-section">
      <div className="rla-section-heading"><div><h2>Live activities</h2><span>Last successful update: {formatDate(lastUpdatedAt)}</span></div>
        <div className="rla-live-controls"><span className={`rla-connection rla-connection-${liveStatus.connection}`}><i />{liveStatus.connection}</span>
          <button className="rla-icon-button" type="button" onClick={() => setLivePaused((paused) => !paused)} aria-label={livePaused ? 'Resume live updates' : 'Pause live updates'} title={livePaused ? 'Resume live updates' : 'Pause live updates'}>{livePaused ? <Play size={15} /> : <Pause size={15} />}</button>
          <button className="rla-icon-button" type="button" onClick={() => setRefreshKey((value) => value + 1)} aria-label="Refresh data" title="Refresh data"><RefreshCw size={15} /></button>
        </div>
      </div>
      {(liveStatus.warning || liveStatus.mode !== 'distributed') && <div className="rla-live-warning" role="status"><AlertTriangle size={15} />{liveStatus.warning || (liveStatus.mode === 'local' ? 'Shared streaming unavailable; live events may be limited to this API instance.' : 'Connecting to shared activity stream…')}</div>}
      <div className="rla-table-wrap"><table className="rla-table">
        <thead><tr><th>Timestamp</th><th>API endpoint</th><th>Method</th><th>User / ID</th><th>Role</th><th>Request status</th><th>HTTP</th><th>Response time</th><th>Policy</th><th>Limit</th><th>Used</th><th>Remaining</th><th>Client IP ID</th><th>Instance</th></tr></thead>
        <tbody>{liveEvents.map((event) => <tr key={event.eventId}>
          <td>{formatDate(event.timestamp)}</td><td className="rla-endpoint" title={event.endpoint}>{event.endpoint}</td><td>{event.method}</td>
          <td>{event.userName || event.userId || 'Guest'}</td><td>{event.userRole || 'Guest'}</td>
          <td><span className={`rla-status rla-status-${event.requestStatus === 'Success' ? 'allowed' : event.requestStatus === 'Rate Limited' ? 'restricted' : 'failed'}`}>{event.requestStatus}</span></td>
          <td>{event.statusCode}</td><td>{Number(event.responseTimeMs || 0).toFixed(1)} ms</td><td>{event.policyName}</td>
          <td>{formatNumber(event.requestLimit)}</td><td>{formatNumber(event.requestsUsed)}</td><td>{formatNumber(event.remainingRequests)}</td>
          <td title="Privacy-preserving HMAC identifier">{event.ipAddress || 'N/A'}</td><td>{event.applicationInstanceId}</td>
        </tr>)}
        {!liveEvents.length && <tr><td colSpan="14" className="rla-empty-row">{livePaused ? 'Live updates paused' : liveStatus.connection === 'connected' ? 'Waiting for API requests…' : 'No live requests received; retrying connection'}</td></tr>}</tbody>
      </table></div>
    </section>

    <section className="rla-section">
      <div className="rla-section-heading">
        <div><h2>Recorded activity</h2><span>{formatNumber(total)} matching events</span></div>
        <div className="rla-search"><Search size={16} aria-hidden="true" /><input aria-label="Search username, user ID, or endpoint" placeholder="Username, user ID, or endpoint" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} /></div>
      </div>
      <div className="rla-filters">
        <label>From<input type="date" value={filters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} /></label>
        <label>To<input type="date" value={filters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} /></label>
        <label>Method<select value={filters.method} onChange={(event) => updateFilter('method', event.target.value)}><option value="">All methods</option>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => <option key={method}>{method}</option>)}</select></label>
        <label>Status<select value={filters.activityType} onChange={(event) => updateFilter('activityType', event.target.value)}><option value="">All statuses</option><option>Allowed</option><option>Failed</option><option>Limit Exceeded</option><option>Temporarily Restricted</option></select></label>
        <label>Role<select value={filters.userRole} onChange={(event) => updateFilter('userRole', event.target.value)}><option value="">All roles</option><option>Admin</option><option>User</option><option>Guest</option></select></label>
        <label>Policy<select value={filters.policyName} onChange={(event) => updateFilter('policyName', event.target.value)}><option value="">All policies</option>{POLICIES.map((policy) => <option key={policy}>{policy}</option>)}</select></label>
        <label>Client IP<input inputMode="decimal" placeholder="Authorized IP lookup" value={filters.ipAddress} onChange={(event) => updateFilter('ipAddress', event.target.value)} /></label>
        <button type="button" className="rla-text-button" onClick={clearFilters}>Clear filters</button>
      </div>
      <div className="rla-table-wrap">
        <table className="rla-table">
          <thead><tr><th>Timestamp</th><th>User</th><th>Role</th><th>API endpoint</th><th>Method</th><th>Policy</th><th>Request limit</th><th>Requests used</th><th>Remaining</th><th>Status</th><th>HTTP</th><th>Restriction expiry</th><th>Actions</th></tr></thead>
          <tbody>
            {activities.map((activity) => <tr key={activity._id}>
              <td>{formatDate(activity.createdAt)}</td>
              <td className="rla-user-name">{activity.userName || 'Guest'}</td>
              <td>{activity.userRole || 'Guest'}</td>
              <td className="rla-endpoint" title={activity.endpoint}>{activity.endpoint}</td>
              <td>{activity.method}</td>
              <td>{activity.policyName}</td>
              <td>{formatNumber(activity.requestLimit)}</td>
              <td>{formatNumber(activity.requestsUsed)}</td>
              <td>{formatNumber(activity.remainingRequests)}</td>
              <td><ActivityStatus value={activity.activityType} /></td>
              <td>{activity.statusCode}</td>
              <td>{formatDate(activity.restrictionExpiry)}</td>
              <td><button className="rla-icon-button" type="button" onClick={() => viewDetails(activity)} aria-label="View activity details" title="View details"><Search size={15} /></button></td>
            </tr>)}
            {!activities.length && <tr><td colSpan="13" className="rla-empty-row">{loading
              ? 'Loading rate-limit activity…'
              : total === 0 && !Object.values(filters).some(Boolean)
                ? 'No rate-limit events recorded yet. Allowed requests appear in the summary; an event is recorded when a request exceeds a policy limit.'
                : 'No rate-limit events match these filters'}</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="rla-pagination">
        <label>Rows per page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <span>Page {page} of {totalPages}</span>
        <div><button className="rla-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button className="rla-button" type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</button></div>
      </footer>
    </section>

    {selectedActivity && <div className="rla-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedActivity(null) }}>
      <section className="rla-modal" role="dialog" aria-modal="true" aria-labelledby="rla-detail-title">
        <header><div><span>Recorded event</span><h2 id="rla-detail-title">{selectedActivity.endpoint}</h2></div><button className="rla-icon-button" type="button" onClick={() => setSelectedActivity(null)} aria-label="Close details"><X size={18} /></button></header>
        {detailLoading ? <p className="rla-detail-loading">Loading activity details…</p> : <dl>
          <div><dt>Timestamp</dt><dd>{formatDate(selectedActivity.createdAt)}</dd></div>
          <div><dt>User</dt><dd>{selectedActivity.userName || 'Guest'} ({selectedActivity.userRole || 'Guest'})</dd></div>
          <div><dt>User ID</dt><dd>{selectedActivity.userId || 'Not authenticated'}</dd></div>
          <div><dt>Method and status</dt><dd>{selectedActivity.method} / HTTP {selectedActivity.statusCode}</dd></div>
          <div><dt>Policy</dt><dd>{selectedActivity.policyName}</dd></div>
          <div><dt>Request window</dt><dd>{formatNumber(selectedActivity.requestsUsed)} used of {formatNumber(selectedActivity.requestLimit)}; {formatNumber(selectedActivity.remainingRequests)} remaining</dd></div>
          <div><dt>Window duration</dt><dd>{formatNumber(selectedActivity.windowDuration)} ms</dd></div>
          <div><dt>Restriction expiry</dt><dd>{formatDate(selectedActivity.restrictionExpiry)}</dd></div>
          <div><dt>Client IP identifier</dt><dd>{selectedActivity.ipAddress || 'Not recorded'}</dd></div>
          <div><dt>Application instance</dt><dd>{selectedActivity.applicationInstanceId || 'N/A'}</dd></div>
          <div><dt>Environment</dt><dd>{selectedActivity.environment || 'N/A'}</dd></div>
          <div><dt>Grouped events</dt><dd>{formatNumber(selectedActivity.eventCount)}</dd></div>
          <div><dt>Last observed</dt><dd>{formatDate(selectedActivity.lastOccurredAt)}</dd></div>
        </dl>}
      </section>
    </div>}
  </main>
}

export default RateLimitActivities