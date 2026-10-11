const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: false },
  userName: { type: String, default: 'Guest', maxlength: 120 },
  userRole: { type: String, enum: ['Admin', 'User', 'Guest'], required: true },
  routeId: { type: String, default: null, maxlength: 64 },
  moduleName: { type: String, default: null, maxlength: 120 },
  endpoint: { type: String, required: true, maxlength: 256 },
  method: { type: String, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER'], required: true },
  ipAddress: { type: String, default: null, maxlength: 128 },
  policyName: { type: String, required: true, maxlength: 64 },
  requestLimit: { type: Number, required: true, min: 1 },
  requestsUsed: { type: Number, required: true, min: 1 },
  remainingRequests: { type: Number, required: true, min: 0 },
  windowDuration: { type: Number, required: true, min: 1 },
  activityType: { type: String, enum: ['Allowed', 'Failed', 'Limit Exceeded', 'Temporarily Restricted'], required: true },
  requestStatus: { type: String, enum: ['Success', 'Failed', 'Rate Limited'], default: null },
  statusCode: { type: Number, required: true, min: 100, max: 599 },
  responseTimeMs: { type: Number, default: null, min: 0 },
  responseTimeTotalMs: { type: Number, default: 0, min: 0 },
  restrictionExpiry: { type: Date, default: null },
  applicationInstanceId: { type: String, required: true, maxlength: 120 },
  environment: { type: String, enum: ['development', 'staging', 'production'], required: true },
  dedupeKey: { type: String, required: true, maxlength: 128 },
  eventCount: { type: Number, default: 0, min: 0 },
  lastOccurredAt: { type: Date, required: true }
}, { timestamps: true, minimize: false });

const configuredRetentionDays = Number.parseInt(process.env.RATE_LIMIT_ACTIVITY_RETENTION_DAYS, 10);
const retentionDays = Number.isInteger(configuredRetentionDays)
  ? Math.min(3650, Math.max(1, configuredRetentionDays))
  : 90;

activitySchema.index({ createdAt: -1 });
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ activityType: 1, createdAt: -1 });
activitySchema.index({ endpoint: 1, createdAt: -1 });
activitySchema.index({ policyName: 1, createdAt: -1 });
activitySchema.index({ ipAddress: 1, createdAt: -1 });
activitySchema.index({ dedupeKey: 1 }, { unique: true });
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

module.exports = mongoose.model('RateLimitActivity', activitySchema);