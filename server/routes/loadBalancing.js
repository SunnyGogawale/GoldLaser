const express = require('express');
const LoadBalancingActivity = require('../models/LoadBalancingActivity');
const { requireAdmin } = require('../middleware/adminAuth');
const { getAggregatedMetrics, getLiveDatabaseHealth } = require('../utils/mongoMonitoring');
const { sendErrorResponse } = require('../utils/errorHandler');

const router = express.Router();
const activityTypes = LoadBalancingActivity.schema.path('activityType').enumValues.filter((value) => value !== 'metrics_snapshot');
const operationTypes = LoadBalancingActivity.schema.path('operationType').enumValues;
const activityStatuses = LoadBalancingActivity.schema.path('activityStatus').enumValues;
const nodeHealthStatuses = ['healthy', 'unhealthy', 'unknown'];

router.use(requireAdmin);

const parseDate = (value, endOfDay = false) => {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 40) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
};

const isEnumValue = (value, values) => typeof value === 'string' && values.includes(value);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/health', async (req, res) => {
  try {
    return res.json(await getLiveDatabaseHealth());
  } catch (error) {
    return sendErrorResponse(res, error, 'Database health is unavailable.', 503, 'loadBalancing.health');
  }
});

router.get('/metrics', async (req, res) => {
  try {
    return res.json(await getAggregatedMetrics());
  } catch (error) {
    return sendErrorResponse(res, error, 'Database metrics are unavailable.', 503, 'loadBalancing.metrics');
  }
});

router.get('/activities', async (req, res) => {
  try {
    const pageValue = req.query.page ?? '1';
    const limitValue = req.query.limit ?? '25';
    if (typeof pageValue !== 'string' || !/^\d+$/.test(pageValue) || typeof limitValue !== 'string' || !/^\d+$/.test(limitValue)) {
      return res.status(400).json({ message: 'Invalid pagination values' });
    }
    const page = Number(pageValue);
    const limit = Number(limitValue);
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: 'Invalid pagination values' });
    }

    const fromDate = parseDate(req.query.fromDate);
    const toDate = parseDate(req.query.toDate, true);
    if (fromDate === false || toDate === false || (fromDate && toDate && fromDate > toDate)) {
      return res.status(400).json({ message: 'Invalid activity date range' });
    }
    if (req.query.activityType && !isEnumValue(req.query.activityType, activityTypes)) {
      return res.status(400).json({ message: 'Invalid activity type' });
    }
    if (req.query.operationType && !isEnumValue(req.query.operationType, operationTypes)) {
      return res.status(400).json({ message: 'Invalid operation type' });
    }
    if (req.query.status && !isEnumValue(req.query.status, activityStatuses)) {
      return res.status(400).json({ message: 'Invalid activity status' });
    }
    if (req.query.healthStatus && !nodeHealthStatuses.includes(req.query.healthStatus)) {
      return res.status(400).json({ message: 'Invalid database health status' });
    }

    const query = { activityType: { $ne: 'metrics_snapshot' } };
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = fromDate;
      if (toDate) query.createdAt.$lte = toDate;
    }
    if (req.query.activityType) query.activityType = req.query.activityType;
    if (req.query.operationType) query.operationType = req.query.operationType;
    if (req.query.status) query.activityStatus = req.query.status;
    if (req.query.healthStatus) {
      query.databaseNodeHealthStatus = req.query.healthStatus === 'unknown' ? null : req.query.healthStatus;
    }
    if (req.query.serverId) {
      const serverId = String(req.query.serverId);
      if (serverId.length > 120) return res.status(400).json({ message: 'Server filter is too long' });
      query.applicationServerId = serverId;
    }
    if (req.query.databaseNode) {
      const databaseNode = String(req.query.databaseNode);
      if (databaseNode.length > 255) return res.status(400).json({ message: 'Database node filter is too long' });
      query.databaseNodeIdentifier = databaseNode;
    }
    if (req.query.search) {
      const search = String(req.query.search).trim();
      if (search.length > 100) return res.status(400).json({ message: 'Search text is too long' });
      const expression = new RegExp(escapeRegex(search), 'i');
      query.$or = [
        { applicationServerId: expression },
        { databaseNodeIdentifier: expression },
        { activityType: expression },
        { errorDetails: expression }
      ];
    }

    const [activities, total] = await Promise.all([
      LoadBalancingActivity.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      LoadBalancingActivity.countDocuments(query)
    ]);
    return res.json({ activities, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return sendErrorResponse(res, error, 'Activity history is unavailable.', 500, 'loadBalancing.activities');
  }
});

module.exports = router;