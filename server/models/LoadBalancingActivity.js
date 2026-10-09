const mongoose = require('mongoose');

const nodeMetricSchema = new mongoose.Schema({
  nodeIdentifier: { type: String, required: true },
  healthStatus: { type: String, default: null },
  poolStatus: { type: String, default: null },
  activeConnections: { type: Number, default: null },
  idleConnections: { type: Number, default: null },
  maxPoolSize: { type: Number, default: null },
  readOperationCount: { type: Number, default: 0 },
  writeOperationCount: { type: Number, default: 0 },
  averageResponseTimeMs: { type: Number, default: null },
  lastHeartbeatAt: { type: Date, default: null }
}, { _id: false });

const activitySchema = new mongoose.Schema({
  activityType: {
    type: String,
    enum: [
      'connection_pool_ready',
      'connection_pool_cleared',
      'connection_pool_closed',
      'connection_checkout_failed',
      'node_healthy',
      'node_unhealthy',
      'operation_failed',
      'health_check_failed',
      'application_instance_started',
      'application_instance_stopped',
      'metrics_snapshot'
    ],
    required: true
  },
  occurredAt: { type: Date, default: Date.now, required: true },
  applicationServerId: { type: String, required: true, maxlength: 120 },
  databaseNodeIdentifier: { type: String, default: null, maxlength: 255 },
  operationType: {
    type: String,
    enum: ['read', 'write', 'connection', 'health_check', 'unknown'],
    default: 'unknown'
  },
  connectionPoolStatus: { type: String, default: null },
  activeConnections: { type: Number, default: null },
  idleConnections: { type: Number, default: null },
  maxPoolSize: { type: Number, default: null },
  queueWaitTimeMs: { type: Number, default: null },
  queryResponseTimeMs: { type: Number, default: null },
  databaseNodeHealthStatus: {
    type: String,
    enum: ['healthy', 'unhealthy', 'unknown', null],
    default: null
  },
  loadDistribution: { type: [nodeMetricSchema], default: [] },
  errorDetails: { type: String, default: null, maxlength: 1200 },
  activityStatus: {
    type: String,
    enum: ['success', 'warning', 'failure'],
    required: true
  },
  environment: { type: String, required: true, maxlength: 32 },
  topologyType: { type: String, default: null, maxlength: 32 },
  databaseNodeCount: { type: Number, default: null },
  readOperationCount: { type: Number, default: 0 },
  writeOperationCount: { type: Number, default: 0 },
  connectionFailures: { type: Number, default: 0 },
  queryCount: { type: Number, default: 0 },
  queryLatencyTotalMs: { type: Number, default: 0 }
}, { timestamps: true, minimize: false });

const retentionDays = Number.parseInt(process.env.DB_ACTIVITY_RETENTION_DAYS, 10);
const retentionSeconds = Number.isFinite(retentionDays)
  ? Math.min(3650, Math.max(1, retentionDays)) * 24 * 60 * 60
  : 30 * 24 * 60 * 60;

activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionSeconds });
activitySchema.index({ activityType: 1, createdAt: -1 });
activitySchema.index({ applicationServerId: 1, createdAt: -1 });
activitySchema.index({ databaseNodeIdentifier: 1, createdAt: -1 });
activitySchema.index({ databaseNodeHealthStatus: 1, createdAt: -1 });
activitySchema.index({ operationType: 1, createdAt: -1 });
activitySchema.index(
  { activityType: 1, applicationServerId: 1 },
  { unique: true, partialFilterExpression: { activityType: 'metrics_snapshot' } }
);

module.exports = mongoose.model('LoadBalancingActivity', activitySchema);