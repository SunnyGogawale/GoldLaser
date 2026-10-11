const crypto = require('crypto');
const os = require('os');
const { EventEmitter } = require('events');
const RateLimitActivity = require('../models/RateLimitActivity');
const RateLimitBucket = require('../models/RateLimitBucket');

const INSTANCE_ID = String(process.env.APP_INSTANCE_ID || `${os.hostname()}-${process.pid}`).slice(0, 120);
const EVENT_BUFFER_SIZE = 500;
const BUCKET_EVENT_BUFFER_SIZE = 100;
const FLUSH_INTERVAL_MS = 200;
const eventEmitter = new EventEmitter();
eventEmitter.setMaxListeners(0);
const eventRing = [];
const publishedEventIds = new Set();
const pendingActivities = new Map();
const pendingMetrics = new Map();
let eventSequence = 0;
let flushTimer = null;
let changeStream = null;
let changeStreamRetryTimer = null;
let changeStreamRetryDelay = 1000;
let streamStopping = false;
let streamMode = 'local';
let streamWarning = 'Live updates are limited to this application instance.';
let lastFlushErrorAt = 0;

const safeErrorLog = (error, source = 'persistence') => {
  const now = Date.now();
  if (now - lastFlushErrorAt < 60000) return;
  lastFlushErrorAt = now;
  console.error(`[rate-limit-telemetry] ${source} failed`, error?.name || 'Error', error?.code || '');
};

const emitStatus = () => eventEmitter.emit('status', getLiveStatus());

const rememberEvent = (activity) => {
  if (publishedEventIds.has(activity.eventId)) return false;
  publishedEventIds.add(activity.eventId);
  while (publishedEventIds.size > EVENT_BUFFER_SIZE * 4) {
    publishedEventIds.delete(publishedEventIds.values().next().value);
  }
  eventRing.push(activity);
  if (eventRing.length > EVENT_BUFFER_SIZE) eventRing.shift();
  eventEmitter.emit('activity', activity);
  return true;
};

const publishActivity = (activity) => {
  const eventId = activity.eventId || `${INSTANCE_ID}:${Date.now()}:${++eventSequence}`;
  return rememberEvent({ ...activity, eventId });
};

const publishSharedEvents = (change) => {
  const events = change?.fullDocument?.apiEvents;
  if (!Array.isArray(events)) return;
  for (const activity of events) publishActivity(activity);
};

const startSharedActivityStream = () => {
  if (streamStopping || changeStream || changeStreamRetryTimer) return;
  try {
    changeStream = RateLimitBucket.watch([], { fullDocument: 'updateLookup' });
    streamMode = 'connecting';
    streamWarning = '';
    const retry = () => {
      if (changeStreamRetryTimer) return;
      changeStreamRetryTimer = setTimeout(() => {
        changeStreamRetryTimer = null;
        startSharedActivityStream();
      }, changeStreamRetryDelay);
      changeStreamRetryTimer.unref?.();
      changeStreamRetryDelay = Math.min(changeStreamRetryDelay * 2, 30000);
    };
    changeStream.on('change', (change) => {
      streamMode = 'distributed';
      streamWarning = '';
      changeStreamRetryDelay = 1000;
      publishSharedEvents(change);
      emitStatus();
    });
    changeStream.on('error', (error) => {
      streamMode = 'local';
      streamWarning = 'Shared live updates are unavailable; showing activity from this application instance only.';
      safeErrorLog(error, 'change stream');
      emitStatus();
      changeStream = null;
      retry();
    });
    changeStream.on('close', () => {
      streamMode = 'local';
      streamWarning = 'Shared live updates disconnected; showing activity from this application instance only.';
      emitStatus();
      changeStream = null;
      retry();
    });
  } catch (error) {
    changeStream = null;
    streamMode = 'local';
    streamWarning = 'Shared live updates are unavailable; showing activity from this application instance only.';
    safeErrorLog(error, 'change stream');
  }
  emitStatus();
};

const stopSharedActivityStream = async () => {
  streamStopping = true;
  const currentStream = changeStream;
  changeStream = null;
  if (changeStreamRetryTimer) clearTimeout(changeStreamRetryTimer);
  changeStreamRetryTimer = null;
  if (currentStream) await currentStream.close().catch(() => {});
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  await flushTelemetry();
};

const getLiveStatus = () => ({
  mode: streamMode,
  warning: streamWarning,
  applicationInstanceId: INSTANCE_ID,
  lastEventAt: eventRing.length ? eventRing[eventRing.length - 1].timestamp : null
});

const writeSse = (res, eventName, data, eventId = null) => {
  if (res.destroyed || res.writableEnded) return;
  if (eventId) res.write(`id: ${eventId}\n`);
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const streamToResponse = (req, res) => {
  res.status(200);
  res.set('Content-Type', 'text/event-stream; charset=utf-8');
  res.set('Cache-Control', 'no-cache, no-transform');
  res.set('Connection', 'keep-alive');
  res.set('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const statusListener = (status) => writeSse(res, 'status', status);
  const activityListener = (activity) => writeSse(res, 'activity', activity, activity.eventId);
  eventEmitter.on('status', statusListener);
  eventEmitter.on('activity', activityListener);
  writeSse(res, 'status', getLiveStatus());

  const lastEventId = String(req.get?.('Last-Event-ID') || req.headers?.['last-event-id'] || '').slice(0, 256);
  if (lastEventId) {
    const lastIndex = eventRing.findIndex((event) => event.eventId === lastEventId);
    if (lastIndex >= 0) {
      for (const activity of eventRing.slice(lastIndex + 1)) activityListener(activity);
    } else {
      writeSse(res, 'reset', { reason: 'Live event replay window expired; refresh historical data.' });
    }
  }

  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write(': keep-alive\n\n');
  }, 15000);
  heartbeat.unref?.();

  const close = () => {
    clearInterval(heartbeat);
    eventEmitter.off('status', statusListener);
    eventEmitter.off('activity', activityListener);
  };
  req.on('close', close);
  res.on('close', close);
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushTelemetry().catch(safeErrorLog);
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
};

const queueRequestCompletion = ({
  counterKey,
  route,
  policy,
  userId,
  userName,
  userRole,
  ipAddress,
  method,
  requestsUsed,
  responseTimeMs,
  statusCode,
  timestamp,
  restrictionExpiry,
  applicationInstanceId = INSTANCE_ID,
  environment = ['development', 'staging', 'production'].includes(process.env.APP_ENV)
    ? process.env.APP_ENV
    : process.env.NODE_ENV === 'production' ? 'production' : 'development'
}) => {
  const activityType = statusCode === 429 ? 'Temporarily Restricted' : statusCode >= 400 ? 'Failed' : 'Allowed';
  const requestStatus = statusCode === 429 ? 'Rate Limited' : statusCode >= 400 ? 'Failed' : 'Success';
  const dedupeKey = crypto.createHash('sha256')
    .update(`${counterKey}|${route.routeId}|${method}|${statusCode}`)
    .digest('hex');
  const eventId = `${applicationInstanceId}:${timestamp.getTime()}:${++eventSequence}`;
  const activity = {
    eventId,
    timestamp: timestamp.toISOString(),
    routeId: route.routeId,
    moduleName: route.moduleName,
    endpoint: route.endpoint,
    method,
    userId: userId || null,
    userName: userName || userId || 'Guest',
    userRole,
    requestStatus,
    activityType,
    statusCode,
    responseTimeMs: Math.max(0, Math.round(responseTimeMs * 100) / 100),
    policyName: policy.name,
    requestLimit: policy.limit,
    windowDuration: policy.windowMs,
    requestsUsed,
    remainingRequests: Math.max(0, policy.limit - requestsUsed),
    restrictionExpiry: restrictionExpiry || null,
    ipAddress,
    applicationInstanceId,
    environment
  };

  const current = pendingActivities.get(dedupeKey);
  if (current) {
    current.eventCount += 1;
    current.responseTimeTotalMs += activity.responseTimeMs;
    current.activity = activity;
  } else {
    pendingActivities.set(dedupeKey, {
      dedupeKey,
      eventCount: 1,
      responseTimeTotalMs: activity.responseTimeMs,
      createdAt: timestamp,
      activity
    });
  }

  const metricKey = `${counterKey}|${route.routeId}`;
  const metric = pendingMetrics.get(metricKey) || {
    counterKey,
    routeId: route.routeId,
    successfulRequests: 0,
    failedRequests: 0,
    responseTimeTotalMs: 0,
    lastResponseTimeMs: 0,
    lastStatusCode: statusCode,
    lastRequestAt: timestamp,
    apiEvents: []
  };
  if (statusCode !== 429) {
    if (statusCode >= 400) metric.failedRequests += 1;
    else metric.successfulRequests += 1;
  }
  metric.responseTimeTotalMs += activity.responseTimeMs;
  metric.lastResponseTimeMs = activity.responseTimeMs;
  metric.lastStatusCode = statusCode;
  metric.lastRequestAt = timestamp;
  metric.apiEvents.push(activity);
  if (metric.apiEvents.length > BUCKET_EVENT_BUFFER_SIZE) metric.apiEvents.shift();
  pendingMetrics.set(metricKey, metric);

  publishActivity(activity);
  scheduleFlush();
};

const flushTelemetry = async () => {
  if (!pendingActivities.size && !pendingMetrics.size) return;
  const activityBatch = [...pendingActivities.values()];
  const metricBatch = [...pendingMetrics.values()];
  pendingActivities.clear();
  pendingMetrics.clear();

  const activityOps = activityBatch.map(({ dedupeKey, eventCount, responseTimeTotalMs, createdAt, activity }) => ({
    updateOne: {
      filter: { dedupeKey },
      update: {
        $setOnInsert: {
          dedupeKey,
          createdAt,
          userId: activity.userId,
          userName: activity.userName,
          userRole: activity.userRole,
          routeId: activity.routeId,
          moduleName: activity.moduleName,
          endpoint: activity.endpoint,
          method: activity.method,
          ipAddress: activity.ipAddress,
          policyName: activity.policyName,
          requestLimit: activity.requestLimit,
          windowDuration: activity.windowDuration,
          applicationInstanceId: activity.applicationInstanceId,
          environment: activity.environment
        },
        $set: {
          requestsUsed: activity.requestsUsed,
          remainingRequests: activity.remainingRequests,
          activityType: activity.activityType,
          requestStatus: activity.requestStatus,
          statusCode: activity.statusCode,
          responseTimeMs: activity.responseTimeMs,
          responseTimeTotalMs,
          restrictionExpiry: activity.restrictionExpiry,
          lastOccurredAt: new Date(activity.timestamp),
          updatedAt: new Date(activity.timestamp)
        },
        $inc: { eventCount }
      },
      upsert: true
    }
  }));

  const metricWrites = metricBatch.map((metric) => RateLimitBucket.updateOne(
    { counterKey: metric.counterKey },
    [{ $set: {
        apiMetrics: {
          $map: {
            input: { $ifNull: ['$apiMetrics', []] },
            as: 'apiMetric',
            in: { $cond: [
              { $eq: ['$$apiMetric.routeId', metric.routeId] },
              { $mergeObjects: ['$$apiMetric', {
                successfulRequests: { $add: [{ $ifNull: ['$$apiMetric.successfulRequests', 0] }, metric.successfulRequests] },
                failedRequests: { $add: [{ $ifNull: ['$$apiMetric.failedRequests', 0] }, metric.failedRequests] },
                responseTimeTotalMs: { $add: [{ $ifNull: ['$$apiMetric.responseTimeTotalMs', 0] }, metric.responseTimeTotalMs] },
                lastResponseTimeMs: { $literal: metric.lastResponseTimeMs },
                lastStatusCode: { $literal: metric.lastStatusCode },
                lastRequestAt: { $literal: metric.lastRequestAt }
              }] },
              '$$apiMetric'
            ] }
          }
        },
        apiEvents: {
          $slice: [
            { $concatArrays: [{ $ifNull: ['$apiEvents', []] }, { $literal: metric.apiEvents }] },
            -BUCKET_EVENT_BUFFER_SIZE
          ]
        }
      } }],
    { updatePipeline: true, timestamps: false }
  ));

  const results = await Promise.allSettled([
    activityOps.length ? RateLimitActivity.bulkWrite(activityOps, { ordered: false, timestamps: false }) : Promise.resolve(),
    ...metricWrites
  ]);
  for (const result of results) if (result.status === 'rejected') safeErrorLog(result.reason, 'batch persistence');
};

module.exports = {
  flushTelemetry,
  getLiveStatus,
  publishActivity,
  queueRequestCompletion,
  startSharedActivityStream,
  stopSharedActivityStream,
  streamToResponse
};