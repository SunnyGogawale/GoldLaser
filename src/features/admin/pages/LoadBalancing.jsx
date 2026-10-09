import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, Search, Server, X } from 'lucide-react'
import { getAuthToken } from '../../../utils/authStorage'
import './LoadBalancing.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
const FALLBACK_REFRESH_MS = Number(import.meta.env.VITE_DB_MONITORING_REFRESH_INTERVAL_MS || 15000)
const ACTIVITY_TYPES = [
  ['connection_pool_ready', 'Pool ready'],
  ['connection_pool_cleared', 'Pool cleared'],
  ['connection_pool_closed', 'Pool closed'],
  ['connection_checkout_failed', 'Checkout failed'],
  ['node_healthy', 'Node healthy'],
  ['node_unhealthy', 'Node unhealthy'],
  ['operation_failed', 'Operation failed'],
  ['health_check_failed', 'Health check failed'],
  ['application_instance_started', 'Application started'],
  ['application_instance_stopped', 'Application stopped']
]

const formatNumber = (value) => Number.isFinite(value) ? new Intl.NumberFormat().format(value) : 'N/A'
const formatMilliseconds = (value) => Number.isFinite(value) ? `${value.toFixed(1)} ms` : 'N/A'
const formatPercent = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'N/A'
const formatDate = (value) => value ? new Date(value).toLocaleString() : 'N/A'
const labelFor = (value) => String(value || 'unknown').replaceAll('_', ' ')

function MetricCard({ label, value, detail, icon: Icon, tone = '' }) {
  return (
    <section className={`lb-metric ${tone}`}>
      <div className="lb-metric-top">
        <span>{label}</span>
        <Icon size={17} aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  )
}

function StatusPill({ value }) {
  const normalized = String(value || 'unknown').toLowerCase()
  return <span className={`lb-status lb-status-${normalized}`}>{labelFor(normalized)}</span>
}

function LoadBalancing() {
  const [metrics, setMetrics] = useState(null)
  const [activities, setActivities] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    activityType: '',
    serverId: '',
    databaseNode: '',
    healthStatus: '',
    operationType: '',
    search: ''
  })
  const limit = 25
  const refreshInterval = Number.isFinite(metrics?.refreshIntervalMs)
    ? Math.min(120000, Math.max(5000, metrics.refreshIntervalMs))
    : Math.min(120000, Math.max(5000, FALLBACK_REFRESH_MS))

  useEffect(() => {
    const timer = window.setInterval(() => setRefreshKey((value) => value + 1), refreshInterval)
    return () => window.clearInterval(timer)
  }, [refreshInterval])

  useEffect(() => {
    const controller = new AbortController()
    const token = getAuthToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    const query = new URLSearchParams({ page: String(page), limit: String(limit) })
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value)
    }

    const load = async () => {
      setRefreshing(true)
      setError('')
      try {
        const [metricResponse, activityResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/admin/load-balancing/metrics`, { headers, signal: controller.signal }),
          fetch(`${API_BASE_URL}/api/admin/load-balancing/activities?${query}`, { headers, signal: controller.signal })
        ])
        const [metricData, activityData] = await Promise.all([
          metricResponse.json().catch(() => null),
          activityResponse.json().catch(() => null)
        ])
        if (!metricResponse.ok) throw new Error(metricData?.message || 'Database metrics are unavailable')
        if (!activityResponse.ok) throw new Error(activityData?.message || 'Activity history is unavailable')
        setMetrics(metricData)
        setActivities(Array.isArray(activityData?.activities) ? activityData.activities : [])
        setTotal(Number(activityData?.total) || 0)
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message || 'Monitoring data is unavailable')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    load()
    return () => controller.abort()
  }, [filters, page, refreshKey])

  const updateFilter = (key, value) => {
    setPage(1)
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const clearFilters = () => {
    setPage(1)
    setFilters({ fromDate: '', toDate: '', activityType: '', serverId: '', databaseNode: '', healthStatus: '', operationType: '', search: '' })
  }

  const nodes = Array.isArray(metrics?.loadDistribution) ? metrics.loadDistribution : []
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const errorCount = Number.isFinite(metrics?.connectionFailures) ? formatNumber(metrics.connectionFailures) : 'N/A'
  const utilization = formatPercent(metrics?.poolUtilization)
  const maxReadWrite = Math.max(1, ...nodes.map((node) => (node.readOperationCount || 0) + (node.writeOperationCount || 0)))

  return (
    <main className="lb-page">
      <header className="lb-header">
        <div>
          <p className="lb-eyebrow">Operations / Admin</p>
          <h1>Load Balancing</h1>
          <p className="lb-subtitle">MongoDB topology and connection telemetry</p>
        </div>
        <div className="lb-header-actions">
          <StatusPill value={metrics?.topologyType || 'unknown'} />
          <button className="lb-refresh" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={refreshing} title="Refresh monitoring data">
            <RefreshCw size={16} className={refreshing ? 'lb-spinning' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {error && <div className="lb-error-banner" role="alert"><AlertTriangle size={17} />{error}</div>}

      <section className="lb-metrics-grid" aria-label="Database metrics">
        <MetricCard label="Database nodes" value={formatNumber(metrics?.totalDatabaseNodes)} detail={metrics?.topologyType || 'Topology unavailable'} icon={Database} />
        <MetricCard label="Healthy nodes" value={formatNumber(metrics?.healthyDatabaseNodes)} detail="Last observed status" icon={CheckCircle2} tone="lb-tone-good" />
        <MetricCard label="Unhealthy nodes" value={formatNumber(metrics?.unhealthyDatabaseNodes)} detail="Known unhealthy members" icon={AlertTriangle} tone="lb-tone-warn" />
        <MetricCard label="Active connections" value={formatNumber(metrics?.activeConnections)} detail={`Idle ${formatNumber(metrics?.idleConnections)}`} icon={Activity} />
        <MetricCard label="Pool capacity" value={formatNumber(metrics?.configuredMaximumPoolSize)} detail={`Utilization ${utilization}`} icon={Database} />
        <MetricCard label="Average response" value={formatMilliseconds(metrics?.averageDatabaseResponseTimeMs)} detail="Observed DB commands" icon={Clock3} />
        <MetricCard label="Read operations" value={formatNumber(metrics?.readOperationCount)} detail="Since app instance start" icon={Activity} />
        <MetricCard label="Write operations" value={formatNumber(metrics?.writeOperationCount)} detail="Since app instance start" icon={Activity} />
        <MetricCard label="Connection failures" value={errorCount} detail={`${formatNumber(metrics?.applicationInstances)} reporting instances`} icon={AlertTriangle} tone="lb-tone-warn" />
      </section>

      <section className="lb-section">
        <div className="lb-section-heading">
          <div><h2>Database node status</h2><span>{metrics?.topologyType === 'standalone' ? 'Single-node deployment' : `${formatNumber(metrics?.totalDatabaseNodes)} advertised nodes`}</span></div>
          <span className="lb-updated">Updated {formatDate(metrics?.collectedAt)}</span>
        </div>
        <div className="lb-table-wrap">
          <table className="lb-table">
            <thead><tr><th>Node</th><th>Health</th><th>Pool</th><th>Active</th><th>Idle</th><th>Max</th><th>Reads</th><th>Writes</th><th>Avg. response</th><th>Last heartbeat</th></tr></thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.nodeIdentifier}>
                  <td className="lb-node-name">{node.nodeIdentifier}</td>
                  <td><StatusPill value={node.healthStatus} /></td>
                  <td>{node.poolStatus || 'N/A'}</td>
                  <td>{formatNumber(node.activeConnections)}</td>
                  <td>{formatNumber(node.idleConnections)}</td>
                  <td>{formatNumber(node.maxPoolSize)}</td>
                  <td>{formatNumber(node.readOperationCount)}</td>
                  <td>{formatNumber(node.writeOperationCount)}</td>
                  <td>{formatMilliseconds(node.averageResponseTimeMs)}</td>
                  <td>{formatDate(node.lastHeartbeatAt)}</td>
                </tr>
              ))}
              {!nodes.length && <tr><td colSpan="10" className="lb-empty-row">{loading ? 'Collecting node status…' : 'Node status is not available yet'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lb-section">
        <div className="lb-section-heading">
          <div><h2>Load distribution</h2><span>Observed database operations by node</span></div>
        </div>
        {nodes.length ? <div className="lb-distribution-list">
          {nodes.map((node) => {
            const reads = Number(node.readOperationCount) || 0
            const writes = Number(node.writeOperationCount) || 0
            const width = ((reads + writes) / maxReadWrite) * 100
            return <div className="lb-distribution-row" key={node.nodeIdentifier}>
              <span className="lb-distribution-name">{node.nodeIdentifier}</span>
              <div className="lb-distribution-track" aria-label={`${reads} reads and ${writes} writes`}>
                <span className="lb-read-bar" style={{ width: `${width * (reads / Math.max(1, reads + writes))}%` }} />
                <span className="lb-write-bar" style={{ width: `${width * (writes / Math.max(1, reads + writes))}%` }} />
              </div>
              <span className="lb-distribution-values"><b>{formatNumber(reads)}</b> reads <b>{formatNumber(writes)}</b> writes</span>
            </div>
          })}
          <div className="lb-chart-legend"><span><i className="lb-read-dot" /> Reads</span><span><i className="lb-write-dot" /> Writes</span></div>
        </div> : <div className="lb-empty-state"><Server size={21} /><span>Load distribution is not available yet</span></div>}
      </section>

      <section className="lb-section lb-activity-section">
        <div className="lb-section-heading">
          <div><h2>Recent activity</h2><span>{formatNumber(total)} matching events</span></div>
          <div className="lb-history-search"><Search size={16} /><input aria-label="Search activity" placeholder="Search events" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} /></div>
        </div>
        <div className="lb-filters">
          <label>From<input type="date" value={filters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} /></label>
          <label>To<input type="date" value={filters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} /></label>
          <label>Activity<select value={filters.activityType} onChange={(event) => updateFilter('activityType', event.target.value)}><option value="">All activity</option>{ACTIVITY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Server<input placeholder="Any server" value={filters.serverId} onChange={(event) => updateFilter('serverId', event.target.value)} /></label>
          <label>Database node<input placeholder="Any node" value={filters.databaseNode} onChange={(event) => updateFilter('databaseNode', event.target.value)} /></label>
          <label>Health<select value={filters.healthStatus} onChange={(event) => updateFilter('healthStatus', event.target.value)}><option value="">Any health</option><option value="healthy">Healthy</option><option value="unhealthy">Unhealthy</option><option value="unknown">Unknown</option></select></label>
          <label>Operation<select value={filters.operationType} onChange={(event) => updateFilter('operationType', event.target.value)}><option value="">Any operation</option>{['read', 'write', 'connection', 'health_check', 'unknown'].map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}</select></label>
          <button type="button" className="lb-clear-filters" onClick={clearFilters}>Clear filters</button>
        </div>
        <div className="lb-table-wrap">
          <table className="lb-table lb-activity-table">
            <thead><tr><th>Time</th><th>Activity</th><th>Status</th><th>Operation</th><th>Server</th><th>Database node</th><th>Response</th><th /></tr></thead>
            <tbody>
              {activities.map((activity) => (
                <tr key={activity._id}>
                  <td>{formatDate(activity.createdAt)}</td>
                  <td>{labelFor(activity.activityType)}</td>
                  <td><StatusPill value={activity.activityStatus} /></td>
                  <td>{labelFor(activity.operationType)}</td>
                  <td>{activity.applicationServerId || 'N/A'}</td>
                  <td>{activity.databaseNodeIdentifier || 'N/A'}</td>
                  <td>{formatMilliseconds(activity.queryResponseTimeMs)}</td>
                  <td><button className="lb-detail-button" type="button" onClick={() => setSelectedActivity(activity)} aria-label="View activity details">Details</button></td>
                </tr>
              ))}
              {!activities.length && <tr><td colSpan="8" className="lb-empty-row">{loading ? 'Loading activity…' : 'No activity matches these filters'}</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="lb-pagination">
          <span>Page {page} of {totalPages}</span>
          <div><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</button></div>
        </footer>
      </section>

      {selectedActivity && <div className="lb-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedActivity(null) }}>
        <section className="lb-detail-modal" role="dialog" aria-modal="true" aria-labelledby="lb-detail-title">
          <header><div><span>Monitoring event</span><h2 id="lb-detail-title">{labelFor(selectedActivity.activityType)}</h2></div><button type="button" onClick={() => setSelectedActivity(null)} aria-label="Close details"><X size={18} /></button></header>
          <dl>
            <div><dt>Time</dt><dd>{formatDate(selectedActivity.createdAt)}</dd></div>
            <div><dt>Status</dt><dd><StatusPill value={selectedActivity.activityStatus} /></dd></div>
            <div><dt>Operation</dt><dd>{labelFor(selectedActivity.operationType)}</dd></div>
            <div><dt>Application server</dt><dd>{selectedActivity.applicationServerId || 'N/A'}</dd></div>
            <div><dt>Database node</dt><dd>{selectedActivity.databaseNodeIdentifier || 'N/A'}</dd></div>
            <div><dt>Environment</dt><dd>{selectedActivity.environment || 'N/A'}</dd></div>
            <div><dt>Pool state</dt><dd>{selectedActivity.connectionPoolStatus || 'N/A'}</dd></div>
            <div><dt>Pool connections</dt><dd>{formatNumber(selectedActivity.activeConnections)} active / {formatNumber(selectedActivity.idleConnections)} idle</dd></div>
          </dl>
          <div className="lb-error-detail"><h3>Error details</h3><pre>{selectedActivity.errorDetails || 'No error details recorded'}</pre></div>
        </section>
      </div>}
    </main>
  )
}

export default LoadBalancing