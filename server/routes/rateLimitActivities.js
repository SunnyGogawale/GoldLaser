const express = require('express');
const mongoose = require('mongoose');
const RateLimitActivity = require('../models/RateLimitActivity');
const RateLimitBucket = require('../models/RateLimitBucket');
const { requireAdmin } = require('../middleware/adminAuth');
const { POLICIES, hashValue } = require('../middleware/apiRateLimiter');
const { selectPolicy } = require('../middleware/apiRateLimiter');
const { getLiveStatus, streamToResponse } = require('../utils/rateLimitTelemetry');
const { sendErrorResponse } = require('../utils/errorHandler');

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER'];
const ROLES = ['Admin', 'User', 'Guest'];
const ACTIVITY_TYPES = ['Allowed', 'Limit Exceeded', 'Temporarily Restricted'];
const POLICY_NAMES = [...new Set(Object.values(POLICIES).map(({ name }) => name))];
const PAGE_SIZES = [10, 25, 50, 100];

const parseDate = (value, endOfDay = false) => {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 40) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getQueryString = (query, name, maxLength = 120) => {
  const value = query[name];
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > maxLength) return false;
  return value.trim();
};

const buildActivityFilter = (query, { userId = null, includeSearch = true } = {}) => {
  const fromDate = parseDate(query.fromDate);
  const toDate = parseDate(query.toDate, true);
  if (fromDate === false || toDate === false || (fromDate && toDate && fromDate > toDate)) return { error: 'Invalid activity date range' };

  const search = getQueryString(query, 'search', 100);
  const endpoint = getQueryString(query, 'endpoint', 256);
  const ipAddress = getQueryString(query, 'ipAddress', 64);
  const policyName = getQueryString(query, 'policyName', 64);
  if ([search, endpoint, ipAddress, policyName].includes(false)) return { error: 'Invalid activity filter' };
  if (policyName && !POLICY_NAMES.includes(policyName)) return { error: 'Invalid rate-limit policy' };
  for (const [name, values] of [['method', METHODS], ['userRole', ROLES], ['activityType', ACTIVITY_TYPES]]) {
    const value = getQueryString(query, name, 64);
    if (value === false) return { error: `Invalid ${name} filter` };
    if (value && !values.includes(value)) return { error: `Invalid ${name} filter` };
  }

  const filter = {};
  if (userId) filter.userId = userId;
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = fromDate;
    if (toDate) filter.createdAt.$lte = toDate;
  }
  for (const name of ['method', 'userRole', 'activityType']) {
    const value = getQueryString(query, name, 64);
    if (value) filter[name] = value;
  }
  if (policyName) filter.policyName = policyName;
  if (endpoint) filter.endpoint = new RegExp(escapeRegex(endpoint), 'i');
  if (ipAddress) filter.ipAddress = hashValue(ipAddress);

  if (includeSearch && search) {
    const searchRegex = new RegExp(escapeRegex(search), 'i');
    const searchConditions = [{ userName: searchRegex }, { endpoint: searchRegex }];
    if (mongoose.isValidObjectId(search)) searchConditions.push({ userId: new mongoose.Types.ObjectId(search) });
    filter.$and = [...(filter.$and || []), { $or: searchConditions }];
  }

  return { filter, fromDate, toDate, policyName };
};

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

const toCsv = (activities) => {
  const columns = [
    ['Timestamp', 'createdAt'], ['User', 'userName'], ['User ID', 'userId'], ['Role', 'userRole'],
    ['API Endpoint', 'endpoint'], ['Method', 'method'], ['IP Identifier', 'ipAddress'],
    ['Policy', 'policyName'], ['Request Limit', 'requestLimit'], ['Requests Used', 'requestsUsed'],
    ['Remaining Requests', 'remainingRequests'], ['Window Duration (ms)', 'windowDuration'],
    ['Status', 'activityType'], ['HTTP Status', 'statusCode'], ['Restriction Expiry', 'restrictionExpiry'],
    ['Application Instance', 'applicationInstanceId'], ['Environment', 'environment'], ['Event Count', 'eventCount']
  ];
  return [columns.map(([label]) => csvCell(label)).join(','), ...activities.map((activity) => (
    columns.map(([, field]) => csvCell(activity[field])).join(',')
  ))].join('\r\n');
};

const createRateLimitActivitiesRouter = ({
  ActivityModel = RateLimitActivity,
  BucketModel = RateLimitBucket,
  registry = null,
  requireAdminMiddleware = requireAdmin
} = {}) => {
  const router = express.Router();
  router.use(requireAdminMiddleware);

  router.get('/rate-limit-activities/apis', async (req, res) => {
    try {
      const pageValue = req.query.page ?? '1';
      const limitValue = req.query.limit ?? '25';
      if (typeof pageValue !== 'string' || !/^\d+$/.test(pageValue) || typeof limitValue !== 'string' || !/^\d+$/.test(limitValue)) {
        return res.status(400).json({ message: 'Invalid pagination values' });
      }
      const page = Number(pageValue);
      const limit = Number(limitValue);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !PAGE_SIZES.includes(limit)) {
        return res.status(400).json({ message: 'Invalid pagination values' });
      }

      const search = getQueryString(req.query, 'search', 100);
      const method = getQueryString(req.query, 'method', 12);
      const moduleName = getQueryString(req.query, 'module', 120);
      const role = getQueryString(req.query, 'role', 16);
      const status = getQueryString(req.query, 'status', 16);
      if ([search, method, moduleName, role, status].includes(false)) return res.status(400).json({ message: 'Invalid API filter' });
      if (method && !METHODS.includes(method.toUpperCase())) return res.status(400).json({ message: 'Invalid HTTP method' });
      if (role && !['Admin', 'User', 'Public'].includes(role)) return res.status(400).json({ message: 'Invalid access role' });
      if (status && !['enabled', 'disabled', 'limited', 'active', 'unused'].includes(status)) return res.status(400).json({ message: 'Invalid rate-limit status' });

      let apis = (registry?.list() || []).map((api) => {
        const policy = selectPolicy({ originalUrl: api.endpoint });
        return {
          ...api,
          rateLimitEnabled: Boolean(policy),
          policyName: policy?.name || null,
          requestLimit: policy?.limit || null,
          windowDuration: policy?.windowMs || null
        };
      });
      if (search) {
        const expression = new RegExp(escapeRegex(search), 'i');
        apis = apis.filter((api) => expression.test(api.endpoint));
      }
      if (method) apis = apis.filter((api) => api.method === method.toUpperCase());
      if (moduleName) apis = apis.filter((api) => api.moduleName.toLowerCase() === moduleName.toLowerCase());
      if (role) apis = apis.filter((api) => api.accessRole === role);
      if (status === 'enabled') apis = apis.filter((api) => api.rateLimitEnabled);
      if (status === 'disabled') apis = apis.filter((api) => !api.rateLimitEnabled);

      const [metricResults] = await BucketModel.aggregate([
        { $unwind: '$apiMetrics' },
        { $facet: {
          totals: [{ $group: {
            _id: '$apiMetrics.routeId',
            totalRequests: { $sum: '$apiMetrics.requestsUsed' },
            totalBlockedRequests: { $sum: '$apiMetrics.blockedRequests' },
            successfulRequests: { $sum: '$apiMetrics.successfulRequests' },
            failedRequests: { $sum: '$apiMetrics.failedRequests' },
            responseTimeTotalMs: { $sum: '$apiMetrics.responseTimeTotalMs' },
            lastRequestAt: { $max: '$apiMetrics.lastRequestAt' }
          } }],
          current: [
            { $match: { windowEndsAt: { $gt: new Date() } } },
            { $group: {
              _id: '$apiMetrics.routeId',
              requestsUsed: { $sum: '$apiMetrics.requestsUsed' },
              remainingRequests: { $sum: { $max: [{ $subtract: ['$apiMetrics.requestLimit', '$apiMetrics.requestsUsed'] }, 0] } },
              blockedRequests: { $sum: '$apiMetrics.blockedRequests' }
            } }
          ]
        } }
      ]);
      const totalMetrics = new Map(metricResults.totals.map((metric) => [metric._id, metric]));
      const currentMetrics = new Map(metricResults.current.map((metric) => [metric._id, metric]));
      const enrichedApis = apis.map((api) => {
        const totals = totalMetrics.get(api.routeId) || {};
        const current = currentMetrics.get(api.routeId) || {};
        const requestsUsed = current.requestsUsed || 0;
        const rateLimitStatus = current.blockedRequests ? 'Limited' : requestsUsed ? 'Active' : 'Unused';
        return {
          ...api,
          requestsUsed,
          remainingRequests: current.remainingRequests || 0,
          rateLimitStatus,
          totalRequests: totals.totalRequests || 0,
          totalBlockedRequests: totals.totalBlockedRequests || 0,
          successfulRequests: totals.successfulRequests || 0,
          failedRequests: totals.failedRequests || 0,
          averageResponseTimeMs: totals.totalRequests ? Math.round((totals.responseTimeTotalMs || 0) / totals.totalRequests) : null,
          lastRequestAt: totals.lastRequestAt || null
        };
      });
      if (status === 'limited' || status === 'active' || status === 'unused') {
        apis = enrichedApis.filter((api) => api.rateLimitStatus.toLowerCase() === status);
      } else {
        apis = enrichedApis;
      }
      const total = apis.length;
      return res.json({ apis: apis.slice((page - 1) * limit, page * limit), total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      return sendErrorResponse(res, error, 'API registry is unavailable.', 500, 'rateLimitActivities.apis');
    }
  });

  router.get('/rate-limit-activities/live', (req, res) => streamToResponse(req, res));

  router.get('/rate-limit-activities/stats', async (req, res) => {
    try {
      const parsed = buildActivityFilter(req.query, { includeSearch: false });
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      const bucketFilter = {};
      if (parsed.fromDate || parsed.toDate) {
        bucketFilter.windowStartedAt = {};
        if (parsed.fromDate) bucketFilter.windowStartedAt.$gte = parsed.fromDate;
        if (parsed.toDate) bucketFilter.windowStartedAt.$lte = parsed.toDate;
      }
      if (parsed.policyName) bucketFilter.policyName = parsed.policyName;

      const activeFilter = { limitedRequests: { $gt: 0 }, windowEndsAt: { $gt: new Date() } };
      if (parsed.policyName) activeFilter.policyName = parsed.policyName;
      const [requestTotals, affectedUserIds, activeRestrictions, topEndpoints] = await Promise.all([
        BucketModel.aggregate([
          { $match: bucketFilter },
          { $group: {
            _id: null,
            allowedRequests: { $sum: '$allowedRequests' },
            rateLimitedRequests: { $sum: '$limitedRequests' }
          } }
        ]),
        ActivityModel.aggregate([
          { $match: { ...parsed.filter, userId: { $ne: null }, activityType: 'Temporarily Restricted' } },
          { $group: { _id: '$userId' } },
          { $count: 'count' }
        ]),
        BucketModel.countDocuments(activeFilter),
        ActivityModel.aggregate([
          { $match: { ...parsed.filter, activityType: 'Temporarily Restricted' } },
          { $group: { _id: '$endpoint', count: { $sum: '$eventCount' } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 5 }
        ])
      ]);
      const allowedRequests = requestTotals[0]?.allowedRequests || 0;
      const rateLimitedRequests = requestTotals[0]?.rateLimitedRequests || 0;
      const routeOutcomeTotals = await BucketModel.aggregate([
        { $unwind: '$apiMetrics' },
        { $group: {
          _id: null,
          successfulRequests: { $sum: '$apiMetrics.successfulRequests' },
          failedRequests: { $sum: '$apiMetrics.failedRequests' }
        } }
      ]);
      const apiCount = registry?.list().length || 0;
      const apisWithRateLimiting = Object.keys(POLICIES).length ? apiCount : 0;
      return res.json({
        totalRegisteredApis: apiCount,
        apisWithRateLimiting,
        apisWithoutRateLimiting: Math.max(0, apiCount - apisWithRateLimiting),
        totalRequests: allowedRequests + rateLimitedRequests,
        allowedRequests,
        rateLimitedRequests,
        successfulRequests: routeOutcomeTotals[0]?.successfulRequests || 0,
        failedRequests: routeOutcomeTotals[0]?.failedRequests || 0,
        uniqueAffectedUsers: affectedUserIds[0]?.count || 0,
        activeTemporaryRestrictions: activeRestrictions,
        mostFrequentlyRateLimitedEndpoints: topEndpoints.map(({ _id, count }) => ({ endpoint: _id, count })),
        liveStatus: getLiveStatus()
      });
    } catch (error) {
      return sendErrorResponse(res, error, 'Rate-limit statistics are unavailable.', 500, 'rateLimitActivities.stats');
    }
  });

  router.get('/rate-limit-activities', async (req, res) => {
    try {
      const pageValue = req.query.page ?? '1';
      const limitValue = req.query.limit ?? '25';
      if (typeof pageValue !== 'string' || !/^\d+$/.test(pageValue) || typeof limitValue !== 'string' || !/^\d+$/.test(limitValue)) {
        return res.status(400).json({ message: 'Invalid pagination values' });
      }
      const page = Number(pageValue);
      const limit = Number(limitValue);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !PAGE_SIZES.includes(limit)) {
        return res.status(400).json({ message: 'Invalid pagination values' });
      }

      const parsed = buildActivityFilter(req.query);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      const query = { ...parsed.filter };
      if (req.query.export !== undefined && req.query.export !== 'csv') {
        return res.status(400).json({ message: 'Invalid export format' });
      }
      if (req.query.export === 'csv') {
        const activities = await ActivityModel.find(query).sort({ createdAt: -1 }).limit(10001).lean();
        if (activities.length > 10000) return res.status(413).json({ message: 'CSV export is limited to 10,000 matching events. Apply filters and try again.' });
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="rate-limit-activities.csv"');
        return res.send(toCsv(activities));
      }

      const [activities, total] = await Promise.all([
        ActivityModel.find(query).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        ActivityModel.countDocuments(query)
      ]);
      return res.json({ activities, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      return sendErrorResponse(res, error, 'Rate-limit activity history is unavailable.', 500, 'rateLimitActivities.list');
    }
  });

  router.get('/users/:userId/rate-limit-activities', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ message: 'Invalid user ID' });
    const pageValue = req.query.page ?? '1';
    const limitValue = req.query.limit ?? '25';
    if (typeof pageValue !== 'string' || !/^\d+$/.test(pageValue) || typeof limitValue !== 'string' || !/^\d+$/.test(limitValue)) {
      return res.status(400).json({ message: 'Invalid pagination values' });
    }
    const page = Number(pageValue);
    const limit = Number(limitValue);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !PAGE_SIZES.includes(limit)) {
      return res.status(400).json({ message: 'Invalid pagination values' });
    }
    try {
      const parsed = buildActivityFilter(req.query, { userId: new mongoose.Types.ObjectId(req.params.userId) });
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      const [activities, total] = await Promise.all([
        ActivityModel.find(parsed.filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        ActivityModel.countDocuments(parsed.filter)
      ]);
      return res.json({ activities, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      return sendErrorResponse(res, error, 'User rate-limit history is unavailable.', 500, 'rateLimitActivities.userHistory');
    }
  });

  router.get('/rate-limit-activities/:id', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid activity ID' });
    try {
      const activity = await ActivityModel.findById(req.params.id).lean();
      if (!activity) return res.status(404).json({ message: 'Activity not found' });
      return res.json({ activity });
    } catch (error) {
      return sendErrorResponse(res, error, 'Rate-limit activity details are unavailable.', 500, 'rateLimitActivities.detail');
    }
  });

  return router;
};

module.exports = createRateLimitActivitiesRouter();
module.exports.createRateLimitActivitiesRouter = createRateLimitActivitiesRouter;
module.exports.buildActivityFilter = buildActivityFilter;