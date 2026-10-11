const mongoose = require('mongoose');

const apiMetricSchema = new mongoose.Schema({
  routeId: { type: String, required: true, maxlength: 64 },
  endpoint: { type: String, required: true, maxlength: 256 },
  method: { type: String, required: true, maxlength: 12 },
  moduleName: { type: String, required: true, maxlength: 120 },
  authenticationRequired: { type: Boolean, default: false },
  accessRole: { type: String, enum: ['Admin', 'User', 'Public'], default: 'Public' },
  policyName: { type: String, required: true, maxlength: 64 },
  requestLimit: { type: Number, required: true, min: 1 },
  windowDuration: { type: Number, required: true, min: 1 },
  requestsUsed: { type: Number, default: 0, min: 0 },
  allowedRequests: { type: Number, default: 0, min: 0 },
  blockedRequests: { type: Number, default: 0, min: 0 },
  successfulRequests: { type: Number, default: 0, min: 0 },
  failedRequests: { type: Number, default: 0, min: 0 },
  responseTimeTotalMs: { type: Number, default: 0, min: 0 },
  lastRequestAt: { type: Date, default: null },
  lastStatusCode: { type: Number, default: null, min: 100, max: 599 },
  lastResponseTimeMs: { type: Number, default: null, min: 0 }
}, { _id: false });

const bucketSchema = new mongoose.Schema({
  counterKey: { type: String, required: true },
  policyName: { type: String, required: true, maxlength: 64 },
  identityHash: { type: String, required: true, maxlength: 128 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  windowStartedAt: { type: Date, required: true },
  windowEndsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  requestLimit: { type: Number, required: true, min: 1 },
  windowDuration: { type: Number, required: true, min: 1 },
  requestsUsed: { type: Number, default: 0, min: 0 },
  allowedRequests: { type: Number, default: 0, min: 0 },
  limitedRequests: { type: Number, default: 0, min: 0 },
  apiMetrics: { type: [apiMetricSchema], default: [] },
  apiEvents: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: false, minimize: false });

bucketSchema.index({ counterKey: 1 }, { unique: true });
bucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
bucketSchema.index({ windowStartedAt: 1, policyName: 1 });
bucketSchema.index({ windowEndsAt: 1 }, { partialFilterExpression: { limitedRequests: { $gt: 0 } } });
bucketSchema.index({ 'apiMetrics.routeId': 1, windowStartedAt: -1 });

module.exports = mongoose.model('RateLimitBucket', bucketSchema);