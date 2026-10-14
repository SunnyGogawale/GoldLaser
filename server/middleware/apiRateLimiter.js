const crypto = require('crypto');
const os = require('os');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const RateLimitBucket = require('../models/RateLimitBucket');
const { queueRequestCompletion } = require('../utils/rateLimitTelemetry');

const readPositiveInteger = (name, fallback, maximum) => {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? Math.min(maximum, value) : fallback;
};

const POLICIES = {
  authentication: {
    name: 'authentication',
    limit: readPositiveInteger('RATE_LIMIT_AUTH_MAX', 10, 10000),
    windowMs: readPositiveInteger('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000, 24 * 60 * 60 * 1000)
  },
  resource: {
    name: 'resource',
    limit: readPositiveInteger('RATE_LIMIT_RESOURCE_MAX', 60, 10000),
    windowMs: readPositiveInteger('RATE_LIMIT_RESOURCE_WINDOW_MS', 60 * 1000, 24 * 60 * 60 * 1000)
  },
  monitoring: {
    name: 'monitoring',
    limit: readPositiveInteger('RATE_LIMIT_MONITORING_MAX', 60, 10000),
    windowMs: readPositiveInteger('RATE_LIMIT_MONITORING_WINDOW_MS', 60 * 1000, 24 * 60 * 60 * 1000)
  },
  general: {
    name: 'general',
    limit: readPositiveInteger('RATE_LIMIT_GENERAL_MAX', 300, 10000),
    windowMs: readPositiveInteger('RATE_LIMIT_GENERAL_WINDOW_MS', 60 * 1000, 24 * 60 * 60 * 1000)
  }
};

const applicationInstanceId = String(process.env.APP_INSTANCE_ID || `${os.hostname()}-${process.pid}`).slice(0, 120);
let lastStoreWarningAt = 0;
const environment = ['development', 'staging', 'production'].includes(process.env.APP_ENV)
  ? process.env.APP_ENV
  : process.env.NODE_ENV === 'production' ? 'production' : 'development';

const getRequestPath = (req) => String(req.originalUrl || req.url || '/').split('?')[0].slice(0, 2048);

const normalizeEndpoint = (requestPath) => requestPath
  .replace(/\/[a-f\d]{24}(?=\/|$)/gi, '/:id')
  .replace(/\/\d+(?=\/|$)/g, '/:id')
  .slice(0, 256);

const selectPolicy = (req, policies = POLICIES) => {
  const path = getRequestPath(req);
  if (/^\/api\/admin\/(?:rate-limit-activities|users\/[^/]+\/rate-limit-activities)(?:\/|$)/.test(path)) return policies.monitoring;
  if (/^\/api\/auth(?:\/|$)/.test(path)) return policies.authentication;
  if (/^\/api\/(?:reports|backups|dashboard)(?:\/|$)/.test(path)) return policies.resource;
  return policies.general;
};

const getVerifiedUserId = (req) => {
  const authorization = String(req.headers?.authorization || '');
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match || !process.env.JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(match[1], process.env.JWT_SECRET);
    const userId = decoded?.user?.id;
    return mongoose.isValidObjectId(userId) ? String(userId) : null;
  } catch {
    return null;
  }
};

const getClientIp = (req) => String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 128);

const hashValue = (value) => crypto
  .createHmac('sha256', process.env.RATE_LIMIT_IP_HASH_SECRET || process.env.JWT_SECRET || 'goldflow-rate-limit-ip-v1')
  .update(value)
  .digest('hex');

const createRateLimitMiddleware = ({
  BucketModel = RateLimitBucket,
  policies = POLICIES,
  isStoreReady = () => mongoose.connection.readyState === 1,
  registry = null,
  recordCompletion = queueRequestCompletion,
  now = () => Date.now()
} = {}) => async (req, res, next) => {
  if (!getRequestPath(req).startsWith('/api/')) return next();
  const requestStartedAt = process.hrtime.bigint();
  if (!isStoreReady()) return next();

  const policy = selectPolicy(req, policies);
  const userId = getVerifiedUserId(req);
  const clientIp = getClientIp(req);
  const identity = policy.name === 'authentication' || !userId ? `ip:${hashValue(clientIp)}` : `user:${userId}`;
  const identityHash = hashValue(identity);
  const timestamp = now();
  const windowStart = Math.floor(timestamp / policy.windowMs) * policy.windowMs;
  const windowStartedAt = new Date(windowStart);
  const windowEndsAt = new Date(windowStart + policy.windowMs);
  const requestPath = getRequestPath(req);
  const endpoint = normalizeEndpoint(requestPath);
  const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER';
  const registeredRoute = registry?.resolve(method, requestPath) || null;
  const route = registeredRoute || {
    routeId: crypto.createHash('sha256').update(`${method}:${endpoint}`).digest('hex'),
    endpoint,
    method,
    moduleName: endpoint.split('/').filter(Boolean)[1] || 'API',
    authenticationRequired: Boolean(userId),
    accessRole: 'Public'
  };
  const counterKey = hashValue(`${policy.name}|${identityHash}|${windowStart}`);
  const currentRequestsUsed = { $ifNull: ['$requestsUsed', 0] };
  const willAllowRequest = { $lt: [currentRequestsUsed, policy.limit] };
  const apiMetrics = { $ifNull: ['$apiMetrics', []] };
  const matchingApiMetrics = {
    $filter: { input: apiMetrics, as: 'apiMetric', cond: { $eq: ['$$apiMetric.routeId', route.routeId] } }
  };
  const routeMetric = {
    routeId: { $literal: route.routeId },
    endpoint: { $literal: route.endpoint },
    method: { $literal: method },
    moduleName: { $literal: route.moduleName },
    authenticationRequired: { $literal: route.authenticationRequired },
    accessRole: { $literal: route.accessRole },
    policyName: { $literal: policy.name },
    requestLimit: { $literal: policy.limit },
    windowDuration: { $literal: policy.windowMs },
    requestsUsed: 1,
    allowedRequests: { $cond: [willAllowRequest, 1, 0] },
    blockedRequests: { $cond: [willAllowRequest, 0, 1] },
    successfulRequests: 0,
    failedRequests: 0,
    responseTimeTotalMs: 0,
    lastRequestAt: { $literal: new Date(timestamp) },
    lastStatusCode: null,
    lastResponseTimeMs: null
  };
  const updateApiMetrics = {
    $cond: [
      { $gt: [{ $size: matchingApiMetrics }, 0] },
      {
        $map: {
          input: apiMetrics,
          as: 'apiMetric',
          in: {
            $cond: [
              { $eq: ['$$apiMetric.routeId', route.routeId] },
              { $mergeObjects: ['$$apiMetric', {
                requestsUsed: { $add: [{ $ifNull: ['$$apiMetric.requestsUsed', 0] }, 1] },
                allowedRequests: { $add: [
                  { $ifNull: ['$$apiMetric.allowedRequests', 0] },
                  { $cond: [willAllowRequest, 1, 0] }
                ] },
                blockedRequests: { $add: [
                  { $ifNull: ['$$apiMetric.blockedRequests', 0] },
                  { $cond: [willAllowRequest, 0, 1] }
                ] },
                requestLimit: { $literal: policy.limit },
                windowDuration: { $literal: policy.windowMs },
                lastRequestAt: { $literal: new Date(timestamp) }
              }] },
              '$$apiMetric'
            ]
          }
        }
      },
      { $concatArrays: [apiMetrics, [routeMetric]] }
    ]
  };

  try {
    const bucketUpdate = [{ $set: {
        counterKey: { $literal: counterKey },
        policyName: { $literal: policy.name },
        identityHash: { $literal: identityHash },
        userId: { $ifNull: ['$userId', userId ? new mongoose.Types.ObjectId(userId) : null] },
        windowStartedAt: { $ifNull: ['$windowStartedAt', windowStartedAt] },
        windowEndsAt: { $ifNull: ['$windowEndsAt', windowEndsAt] },
        expiresAt: { $ifNull: ['$expiresAt', new Date(timestamp + readPositiveInteger('RATE_LIMIT_COUNTER_RETENTION_DAYS', 90, 3650) * 24 * 60 * 60 * 1000)] },
        requestLimit: { $literal: policy.limit },
        windowDuration: { $literal: policy.windowMs },
        apiMetrics: updateApiMetrics,
        requestsUsed: { $add: [{ $ifNull: ['$requestsUsed', 0] }, 1] },
        allowedRequests: { $add: [
          { $ifNull: ['$allowedRequests', 0] },
          { $cond: [{ $lt: [{ $ifNull: ['$requestsUsed', 0] }, policy.limit] }, 1, 0] }
        ] },
        limitedRequests: { $add: [
          { $ifNull: ['$limitedRequests', 0] },
          { $cond: [{ $gte: [{ $ifNull: ['$requestsUsed', 0] }, policy.limit] }, 1, 0] }
        ] }
      } }];
    let bucket;
    try {
      bucket = await BucketModel.findOneAndUpdate(
        { counterKey },
        bucketUpdate,
        { upsert: true, returnDocument: 'after', updatePipeline: true }
      );
    } catch (error) {
      if (error.code !== 11000 && error.codeName !== 'DuplicateKey') throw error;
      bucket = await BucketModel.findOneAndUpdate(
        { counterKey },
        bucketUpdate,
        { upsert: false, returnDocument: 'after', updatePipeline: true }
      );
    }
    if (!bucket) return next();

    let completionRecorded = false;
    const recordCompletionOnce = (statusCode) => {
      if (completionRecorded) return;
      completionRecorded = true;
      const responseTimeMs = Number(process.hrtime.bigint() - requestStartedAt) / 1e6;
      const userRole = !userId ? 'Guest' : (route.accessRole === 'Admin' || req.auth?.isAdmin ? 'Admin' : 'User');
      try {
        recordCompletion({
          counterKey,
          route,
          policy,
          userId,
          userName: req.auth?.userName || userId || 'Guest',
          userRole,
          ipAddress: hashValue(clientIp),
          method,
          requestsUsed: bucket.requestsUsed,
          responseTimeMs,
          statusCode,
          timestamp: new Date(now()),
          restrictionExpiry: bucket.windowEndsAt || windowEndsAt,
          applicationInstanceId,
          environment
        });
      } catch {
        // A telemetry failure must never change the API response.
      }
    };
    res.once?.('finish', () => recordCompletionOnce(res.statusCode || 200));
    res.once?.('close', () => {
      if (!res.writableFinished) recordCompletionOnce(499);
    });

    if (bucket.requestsUsed <= policy.limit) return next();

    const restrictionExpiry = bucket.windowEndsAt || windowEndsAt;
    const retryAfterSeconds = Math.max(1, Math.ceil((restrictionExpiry.getTime() - timestamp) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    res.set('RateLimit-Limit', String(policy.limit));
    res.set('RateLimit-Remaining', '0');
    res.set('RateLimit-Reset', String(Math.ceil(restrictionExpiry.getTime() / 1000)));
    return res.status(429).json({
      message: 'Too many requests. Please try again later.',
      policy: policy.name,
      retryAfterSeconds
    });
  } catch (error) {
    // If the shared store is unavailable, preserve application availability.
    const warningTime = Date.now();
    if (warningTime - lastStoreWarningAt >= 60000) {
      lastStoreWarningAt = warningTime;
      console.error('[rate-limiter] shared counter unavailable; failing open', error?.name || 'Error', error?.code || '');
    }
    return next();
  }
};

module.exports = {
  POLICIES,
  createRateLimitMiddleware,
  getClientIp,
  hashValue,
  normalizeEndpoint,
  selectPolicy
};