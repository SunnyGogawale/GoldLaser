const os = require('node:os');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const LoadBalancingActivity = require('../models/LoadBalancingActivity');

const READ_COMMANDS = new Set(['find', 'aggregate', 'count', 'distinct', 'getMore', 'listCollections', 'listIndexes']);
const WRITE_COMMANDS = new Set(['insert', 'update', 'delete', 'findAndModify', 'bulkWrite']);
const monitoringState = global._goldFlowMongoMonitoring || (global._goldFlowMongoMonitoring = {
  client: null,
  connection: null,
  applicationServerId: null,
  nodes: new Map(),
  totals: { readOperations: 0, writeOperations: 0, queryCount: 0, queryLatencyTotalMs: 0, connectionFailures: 0 },
  topology: null,
  topologyCheckedAt: 0,
  topologyPromise: null,
  lastSnapshotAt: 0,
  snapshotPromise: null,
  snapshotTimer: null,
  instanceStarted: false,
  instanceStopped: false,
  eventWindowStartedAt: 0,
  eventCountInWindow: 0,
  enabled: true
});

if (!monitoringState.applicationServerId) {
  const generatedId = [process.env.VERCEL_REGION, os.hostname(), process.pid, crypto.randomUUID()]
    .filter(Boolean)
    .join(':');
  monitoringState.applicationServerId = String(process.env.APP_INSTANCE_ID || generatedId).slice(0, 120);
}

const boundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
};

const monitoringConfig = () => ({
  enabled: process.env.DB_MONITORING_ENABLED !== 'false',
  refreshIntervalMs: boundedInteger(process.env.DB_MONITORING_REFRESH_INTERVAL_MS, 15000, 5000, 120000),
  snapshotIntervalMs: boundedInteger(process.env.DB_MONITORING_SNAPSHOT_INTERVAL_MS, 60000, 30000, 300000),
  activeWindowMs: boundedInteger(process.env.DB_MONITORING_ACTIVE_WINDOW_MS, 180000, 30000, 3600000),
  maxEventsPerMinute: boundedInteger(process.env.DB_ACTIVITY_MAX_EVENTS_PER_MINUTE, 20, 1, 300)
});

const applicationServerId = () => monitoringState.applicationServerId;

const currentEnvironment = () => ['development', 'test', 'staging', 'production'].includes(process.env.NODE_ENV)
  ? process.env.NODE_ENV
  : 'development';

const nodeFor = (address) => {
  const identifier = String(address || 'unknown').slice(0, 255);
  let node = monitoringState.nodes.get(identifier);
  if (!node) {
    node = {
      nodeIdentifier: identifier,
      healthStatus: null,
      poolStatus: null,
      activeConnections: 0,
      totalConnections: 0,
      checkedOutConnections: new Set(),
      poolObserved: false,
      readOperationCount: 0,
      writeOperationCount: 0,
      queryCount: 0,
      queryLatencyTotalMs: 0,
      connectionFailures: 0,
      lastHeartbeatAt: null,
      roundTripTimeMs: null
    };
    monitoringState.nodes.set(identifier, node);
  }
  return node;
};

const isConnectivityError = (error) => /network|serverselection|waitqueue|poolcleared|connection|timeout/i
  .test(`${error?.name || ''} ${error?.codeName || ''} ${error?.message || ''}`);

const safeErrorDetails = (error) => {
  if (typeof error === 'string') return error.slice(0, 1200);
  if (!error || typeof error !== 'object') return 'Unknown database error';
  const errorType = String(error.name || 'MongoError').replace(/[^a-z0-9_.-]/gi, '').slice(0, 100);
  const code = error.codeName || error.code;
  const safeCode = code === undefined ? '' : ` (code ${String(code).replace(/[^a-z0-9_.-]/gi, '').slice(0, 40)})`;
  const message = isConnectivityError(error)
    ? String(error.message || '')
      .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, '[redacted connection string]')
      .replace(/(password|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
      .slice(0, 900)
    : '';
  return `${errorType}${safeCode}${message ? `: ${message}` : ''}`.slice(0, 1200);
};

const recordActivity = (activity) => {
  const config = monitoringConfig();
  if (!config.enabled) return;

  const now = Date.now();
  if (now - monitoringState.eventWindowStartedAt >= 60000) {
    monitoringState.eventWindowStartedAt = now;
    monitoringState.eventCountInWindow = 0;
  }
  if (monitoringState.eventCountInWindow >= config.maxEventsPerMinute) return;
  monitoringState.eventCountInWindow += 1;

  LoadBalancingActivity.create({
    ...activity,
    applicationServerId: applicationServerId(),
    environment: currentEnvironment(),
    occurredAt: new Date(now)
  }).catch(() => {});
};

const getAddress = (event) => event?.address || event?.connectionId?.address || 'unknown';

const isMonitoringCommand = (event) => {
  const collectionNames = [event?.command?.find, event?.command?.aggregate, event?.command?.insert,
    event?.command?.update, event?.command?.delete, event?.command?.findAndModify, event?.command?.getMore];
  return collectionNames.includes(LoadBalancingActivity.collection.collectionName);
};

const operationTypeFor = (commandName) => {
  if (WRITE_COMMANDS.has(commandName)) return 'write';
  if (READ_COMMANDS.has(commandName)) return 'read';
  return null;
};

const poolActivity = (node, activityType, status, errorDetails = null, queueWaitTimeMs = null) => recordActivity({
  activityType,
  databaseNodeIdentifier: node.nodeIdentifier,
  operationType: 'connection',
  connectionPoolStatus: node.poolStatus,
  activeConnections: node.activeConnections,
  idleConnections: node.poolObserved ? Math.max(0, node.totalConnections - node.activeConnections) : null,
  maxPoolSize: monitoringState.connectionOptions?.maxPoolSize ?? null,
  queueWaitTimeMs,
  databaseNodeHealthStatus: node.healthStatus,
  activityStatus: status,
  errorDetails
});

const attachMongoMonitoring = (connection, connectionOptions = {}) => {
  const config = monitoringConfig();
  monitoringState.enabled = config.enabled;
  if (!config.enabled) return false;

  const client = connection.getClient();
  if (monitoringState.client === client) return true;
  monitoringState.client = client;
  monitoringState.connection = connection;

  client.on('connectionPoolCreated', (event) => {
    const node = nodeFor(event.address);
    node.poolStatus = 'initializing';
  });
  client.on('connectionPoolReady', (event) => {
    const node = nodeFor(event.address);
    node.poolStatus = 'ready';
    poolActivity(node, 'connection_pool_ready', 'success');
  });
  client.on('connectionPoolCleared', (event) => {
    const node = nodeFor(event.address);
    node.poolStatus = 'cleared';
    poolActivity(node, 'connection_pool_cleared', 'warning', safeErrorDetails(event.reason || 'Connection pool cleared'));
  });
  client.on('connectionPoolClosed', (event) => {
    const node = nodeFor(event.address);
    node.poolStatus = 'closed';
    poolActivity(node, 'connection_pool_closed', 'warning');
  });
  client.on('connectionReady', (event) => {
    const node = nodeFor(getAddress(event));
    node.totalConnections += 1;
    node.poolObserved = true;
  });
  client.on('connectionClosed', (event) => {
    const node = nodeFor(getAddress(event));
    node.totalConnections = Math.max(0, node.totalConnections - 1);
    node.checkedOutConnections.delete(event.connectionId);
    node.activeConnections = node.checkedOutConnections.size;
    node.poolObserved = true;
  });
  client.on('connectionCheckedOut', (event) => {
    const node = nodeFor(getAddress(event));
    node.checkedOutConnections.add(event.connectionId);
    node.activeConnections = node.checkedOutConnections.size;
    node.poolObserved = true;
  });
  client.on('connectionCheckedIn', (event) => {
    const node = nodeFor(getAddress(event));
    node.checkedOutConnections.delete(event.connectionId);
    node.activeConnections = node.checkedOutConnections.size;
    node.poolObserved = true;
  });
  client.on('connectionCheckOutFailed', (event) => {
    const node = nodeFor(getAddress(event));
    node.connectionFailures += 1;
    monitoringState.totals.connectionFailures += 1;
    poolActivity(
      node,
      'connection_checkout_failed',
      'failure',
      safeErrorDetails(event.reason),
      Number.isFinite(event.durationMS) ? event.durationMS : null
    );
  });
  client.on('serverHeartbeatSucceeded', (event) => {
    const node = nodeFor(event.connectionId);
    const changed = node.healthStatus !== 'healthy';
    node.healthStatus = 'healthy';
    node.lastHeartbeatAt = new Date();
    node.roundTripTimeMs = Number.isFinite(event.duration) ? event.duration : null;
    if (changed) {
      recordActivity({
        activityType: 'node_healthy',
        databaseNodeIdentifier: node.nodeIdentifier,
        operationType: 'health_check',
        queryResponseTimeMs: node.roundTripTimeMs,
        databaseNodeHealthStatus: 'healthy',
        activityStatus: 'success'
      });
    }
  });
  client.on('serverHeartbeatFailed', (event) => {
    const node = nodeFor(event.connectionId);
    node.healthStatus = 'unhealthy';
    node.lastHeartbeatAt = new Date();
    node.connectionFailures += 1;
    monitoringState.totals.connectionFailures += 1;
    recordActivity({
      activityType: 'node_unhealthy',
      databaseNodeIdentifier: node.nodeIdentifier,
      operationType: 'health_check',
      databaseNodeHealthStatus: 'unhealthy',
      activityStatus: 'failure',
      errorDetails: safeErrorDetails(event.failure)
    });
  });
  client.on('commandStarted', (event) => {
    if (isMonitoringCommand(event)) return;
    const operationType = operationTypeFor(event.commandName);
    if (!operationType) return;
    const node = nodeFor(getAddress(event));
    if (operationType === 'read') {
      node.readOperationCount += 1;
      monitoringState.totals.readOperations += 1;
    } else {
      node.writeOperationCount += 1;
      monitoringState.totals.writeOperations += 1;
    }
  });
  client.on('commandSucceeded', (event) => {
    if (isMonitoringCommand(event)) return;
    const operationType = operationTypeFor(event.commandName);
    if (!operationType) return;
    const node = nodeFor(getAddress(event));
    const duration = Number(event.duration);
    if (!Number.isFinite(duration)) return;
    node.queryCount += 1;
    node.queryLatencyTotalMs += duration;
    monitoringState.totals.queryCount += 1;
    monitoringState.totals.queryLatencyTotalMs += duration;
  });
  client.on('commandFailed', (event) => {
    if (isMonitoringCommand(event)) return;
    const operationType = operationTypeFor(event.commandName);
    if (!operationType) return;
    const node = nodeFor(getAddress(event));
    if (isConnectivityError(event.failure)) {
      node.connectionFailures += 1;
      monitoringState.totals.connectionFailures += 1;
    }
    recordActivity({
      activityType: 'operation_failed',
      databaseNodeIdentifier: node.nodeIdentifier,
      operationType,
      databaseNodeHealthStatus: node.healthStatus,
      activityStatus: 'failure',
      queryResponseTimeMs: Number.isFinite(event.duration) ? event.duration : null,
      errorDetails: safeErrorDetails(event.failure)
    });
  });

  connection.on('disconnected', () => {
    for (const node of monitoringState.nodes.values()) {
      if (node.poolStatus !== 'closed') node.poolStatus = 'disconnected';
      node.healthStatus = 'unhealthy';
    }
  });
  connection.on('connected', () => {
    for (const node of monitoringState.nodes.values()) {
      if (node.poolStatus === 'disconnected') node.poolStatus = 'ready';
      node.healthStatus = 'healthy';
      node.lastHeartbeatAt = new Date();
    }
  });

  monitoringState.connectionOptions = connectionOptions;
  monitoringState.instanceStopped = false;
  if (!monitoringState.instanceStarted) {
    monitoringState.instanceStarted = true;
    recordActivity({
      activityType: 'application_instance_started',
      operationType: 'connection',
      activityStatus: 'success'
    });
  }
  if (!monitoringState.snapshotTimer) {
    monitoringState.snapshotTimer = setInterval(() => {
      persistMetricsSnapshot().catch(() => {});
    }, config.snapshotIntervalMs);
    monitoringState.snapshotTimer.unref?.();
  }
  return true;
};

const probeTopology = async () => {
  const now = Date.now();
  if (monitoringState.topology && now - monitoringState.topologyCheckedAt < 10000) return monitoringState.topology;
  if (monitoringState.topologyPromise) return monitoringState.topologyPromise;

  monitoringState.topologyPromise = (async () => {
    try {
      const connection = monitoringState.connection || mongoose.connection;
      const hello = await connection.db.admin().command({ hello: 1 });
      const isSharded = hello.msg === 'isdbgrid';
      const isReplicaSet = Boolean(hello.setName);
      const members = [...new Set([...(hello.hosts || []), ...(hello.passives || []), ...(hello.arbiters || [])])];
      const standaloneNode = hello.me || [connection.host, connection.port].filter(Boolean).join(':') || 'MongoDB node 1';
      const nodeIdentifiers = isSharded ? [] : isReplicaSet ? members : [standaloneNode];

      for (const identifier of nodeIdentifiers) {
        const node = nodeFor(identifier);
        if (!node.healthStatus || node.healthStatus === 'unknown') node.healthStatus = 'healthy';
        node.lastHeartbeatAt ||= new Date();
      }

      monitoringState.topology = {
        type: isSharded ? 'sharded-cluster' : isReplicaSet ? 'replica-set' : 'standalone',
        replicaSetName: hello.setName || null,
        databaseNodeCount: isSharded ? null : isReplicaSet ? nodeIdentifiers.length : 1,
        nodeIdentifiers,
        checkedAt: new Date(),
        available: true
      };
      monitoringState.topologyCheckedAt = now;
      return monitoringState.topology;
    } catch (error) {
      monitoringState.topologyCheckedAt = now;
      monitoringState.totals.connectionFailures += 1;
      recordActivity({
        activityType: 'health_check_failed',
        operationType: 'health_check',
        activityStatus: 'failure',
        errorDetails: safeErrorDetails(error)
      });
      monitoringState.topology = { ...(monitoringState.topology || {}), available: false, checkedAt: new Date() };
      return monitoringState.topology;
    } finally {
      monitoringState.topologyPromise = null;
    }
  })();
  return monitoringState.topologyPromise;
};

const localMetricsSnapshot = async () => {
  const config = monitoringConfig();
  const topology = config.enabled ? await probeTopology() : null;
  const options = monitoringState.connectionOptions || {};
  const identifiers = new Set([
    ...(topology?.nodeIdentifiers || []),
    ...monitoringState.nodes.keys()
  ]);
  const nodeMetrics = [...identifiers].map((identifier) => {
    const node = nodeFor(identifier);
    const maximum = Number(options.maxPoolSize);
    return {
      nodeIdentifier: identifier,
      healthStatus: node.healthStatus,
      poolStatus: node.poolStatus,
      activeConnections: node.poolObserved ? node.activeConnections : null,
      idleConnections: node.poolObserved ? Math.max(0, node.totalConnections - node.activeConnections) : null,
      maxPoolSize: Number.isFinite(maximum) ? maximum : null,
      readOperationCount: node.readOperationCount,
      writeOperationCount: node.writeOperationCount,
      averageResponseTimeMs: node.queryCount ? node.queryLatencyTotalMs / node.queryCount : null,
      lastHeartbeatAt: node.lastHeartbeatAt
    };
  });

  const connectionValues = nodeMetrics.filter((node) => node.activeConnections !== null);
  const maxValues = nodeMetrics.map((node) => node.maxPoolSize).filter(Number.isFinite);
  const activeConnections = connectionValues.length
    ? connectionValues.reduce((sum, node) => sum + node.activeConnections, 0)
    : null;
  const idleConnections = connectionValues.length
    ? connectionValues.reduce((sum, node) => sum + node.idleConnections, 0)
    : null;
  const maximumConnections = maxValues.length ? maxValues.reduce((sum, value) => sum + value, 0) : null;

  return {
    monitoringEnabled: config.enabled,
    applicationServerId: applicationServerId(),
    topologyType: topology?.type || null,
    topologyAvailable: topology?.available ?? false,
    databaseNodeCount: topology?.databaseNodeCount ?? null,
    nodeMetrics,
    activeConnections,
    idleConnections,
    maximumConnections,
    poolUtilization: activeConnections !== null && maximumConnections > 0
      ? activeConnections / maximumConnections
      : null,
    readOperationCount: monitoringState.totals.readOperations,
    writeOperationCount: monitoringState.totals.writeOperations,
    connectionFailures: monitoringState.totals.connectionFailures,
    queryCount: monitoringState.totals.queryCount,
    queryLatencyTotalMs: monitoringState.totals.queryLatencyTotalMs,
    averageResponseTimeMs: monitoringState.totals.queryCount
      ? monitoringState.totals.queryLatencyTotalMs / monitoringState.totals.queryCount
      : null,
    refreshIntervalMs: config.refreshIntervalMs,
    collectedAt: new Date()
  };
};

const persistMetricsSnapshot = async () => {
  const config = monitoringConfig();
  if (!config.enabled) return null;
  if (monitoringState.snapshotPromise) return monitoringState.snapshotPromise;
  if (Date.now() - monitoringState.lastSnapshotAt < config.snapshotIntervalMs) return null;

  monitoringState.lastSnapshotAt = Date.now();
  monitoringState.snapshotPromise = (async () => {
    const snapshot = await localMetricsSnapshot();
    await LoadBalancingActivity.findOneAndUpdate({
      activityType: 'metrics_snapshot',
      applicationServerId: snapshot.applicationServerId
    }, {
      activityType: 'metrics_snapshot',
      applicationServerId: snapshot.applicationServerId,
      operationType: 'health_check',
      connectionPoolStatus: snapshot.topologyAvailable ? 'ready' : 'unavailable',
      activeConnections: snapshot.activeConnections,
      idleConnections: snapshot.idleConnections,
      maxPoolSize: snapshot.maximumConnections,
      databaseNodeHealthStatus: snapshot.topologyAvailable ? 'healthy' : 'unhealthy',
      loadDistribution: snapshot.nodeMetrics,
      activityStatus: snapshot.topologyAvailable ? 'success' : 'warning',
      topologyType: snapshot.topologyType,
      databaseNodeCount: snapshot.databaseNodeCount,
      readOperationCount: snapshot.readOperationCount,
      writeOperationCount: snapshot.writeOperationCount,
      connectionFailures: snapshot.connectionFailures,
      queryCount: snapshot.queryCount,
      queryLatencyTotalMs: snapshot.queryLatencyTotalMs,
      environment: currentEnvironment()
    }, { upsert: true, setDefaultsOnInsert: true });
    return snapshot;
  })().finally(() => {
    monitoringState.snapshotPromise = null;
  });
  return monitoringState.snapshotPromise;
};

const unavailableMetrics = () => ({
  monitoringEnabled: monitoringConfig().enabled,
  topologyType: null,
  totalDatabaseNodes: null,
  healthyDatabaseNodes: null,
  unhealthyDatabaseNodes: null,
  activeConnections: null,
  idleConnections: null,
  configuredMaximumPoolSize: null,
  poolUtilization: null,
  averageDatabaseResponseTimeMs: null,
  readOperationCount: null,
  writeOperationCount: null,
  connectionFailures: null,
  loadDistribution: [],
  applicationInstances: null,
  refreshIntervalMs: monitoringConfig().refreshIntervalMs,
  collectedAt: null
});

const getLiveDatabaseHealth = async () => {
  const topology = await probeTopology();
  return {
    available: Boolean(topology?.available && (monitoringState.connection || mongoose.connection).readyState === 1),
    topologyType: topology?.type || null,
    totalDatabaseNodes: topology?.databaseNodeCount ?? null,
    checkedAt: topology?.checkedAt || null
  };
};

const getAggregatedMetrics = async () => {
  if (!monitoringConfig().enabled) return unavailableMetrics();
  const local = await localMetricsSnapshot();
  await persistMetricsSnapshot().catch(() => {});

  const cutoff = new Date(Date.now() - monitoringConfig().activeWindowMs);
  const persistedSnapshots = await LoadBalancingActivity.aggregate([
    { $match: { activityType: 'metrics_snapshot', updatedAt: { $gte: cutoff } } },
    { $sort: { updatedAt: -1 } },
    { $group: { _id: '$applicationServerId', snapshot: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$snapshot' } }
  ]).allowDiskUse(false);
  const stoppedInstances = await LoadBalancingActivity.find({
    activityType: 'application_instance_stopped',
    createdAt: { $gte: cutoff }
  }).select('applicationServerId createdAt').lean();
  const stoppedAtByInstance = new Map(stoppedInstances.map((item) => [item.applicationServerId, item.createdAt]));
  const snapshots = persistedSnapshots.filter((item) => (
    item.applicationServerId !== local.applicationServerId &&
    (!stoppedAtByInstance.has(item.applicationServerId) || stoppedAtByInstance.get(item.applicationServerId) < item.updatedAt)
  ));
  snapshots.push({
    applicationServerId: local.applicationServerId,
    createdAt: local.collectedAt,
    updatedAt: local.collectedAt,
    topologyType: local.topologyType,
    databaseNodeCount: local.databaseNodeCount,
    activeConnections: local.activeConnections,
    idleConnections: local.idleConnections,
    maxPoolSize: local.maximumConnections,
    loadDistribution: local.nodeMetrics,
    readOperationCount: local.readOperationCount,
    writeOperationCount: local.writeOperationCount,
    connectionFailures: local.connectionFailures,
    queryCount: local.queryCount,
    queryLatencyTotalMs: local.queryLatencyTotalMs
  });
  if (!snapshots.length) return unavailableMetrics();

  const latest = snapshots.reduce((current, item) => item.createdAt > current.createdAt ? item : current);
  const nodes = new Map();
  let activeTotal = 0;
  let activeKnown = false;
  let idleTotal = 0;
  let idleKnown = false;
  let maximumTotal = 0;
  let maximumKnown = false;

  for (const snapshot of snapshots) {
    if (Number.isFinite(snapshot.activeConnections)) {
      activeTotal += snapshot.activeConnections;
      activeKnown = true;
    }
    if (Number.isFinite(snapshot.idleConnections)) {
      idleTotal += snapshot.idleConnections;
      idleKnown = true;
    }
    if (Number.isFinite(snapshot.maxPoolSize)) {
      maximumTotal += snapshot.maxPoolSize;
      maximumKnown = true;
    }

    for (const metric of snapshot.loadDistribution || []) {
      const node = nodes.get(metric.nodeIdentifier) || {
        nodeIdentifier: metric.nodeIdentifier,
        healthStatus: metric.healthStatus,
        poolStatus: metric.poolStatus,
        activeConnections: 0,
        idleConnections: 0,
        maxPoolSize: 0,
        readOperationCount: 0,
        writeOperationCount: 0,
        averageResponseTimeMs: null,
        lastHeartbeatAt: metric.lastHeartbeatAt || null,
        queryLatencyTotalMs: 0,
        queryCount: 0,
        activeKnown: false,
        idleKnown: false,
        maxKnown: false
      };
      if (metric.healthStatus) node.healthStatus = metric.healthStatus;
      if (metric.poolStatus) node.poolStatus = metric.poolStatus;
      if (Number.isFinite(metric.activeConnections)) {
        node.activeConnections += metric.activeConnections;
        node.activeKnown = true;
      }
      if (Number.isFinite(metric.idleConnections)) {
        node.idleConnections += metric.idleConnections;
        node.idleKnown = true;
      }
      if (Number.isFinite(metric.maxPoolSize)) {
        node.maxPoolSize += metric.maxPoolSize;
        node.maxKnown = true;
      }
      node.readOperationCount += metric.readOperationCount || 0;
      node.writeOperationCount += metric.writeOperationCount || 0;
      if (Number.isFinite(metric.averageResponseTimeMs)) {
        node.queryLatencyTotalMs += metric.averageResponseTimeMs;
        node.queryCount += 1;
      }
      if (metric.lastHeartbeatAt && (!node.lastHeartbeatAt || metric.lastHeartbeatAt > node.lastHeartbeatAt)) {
        node.lastHeartbeatAt = metric.lastHeartbeatAt;
      }
      nodes.set(metric.nodeIdentifier, node);
    }
  }

  const loadDistribution = [...nodes.values()].map((node) => ({
    ...node,
    activeConnections: node.activeKnown ? node.activeConnections : null,
    idleConnections: node.idleKnown ? node.idleConnections : null,
    maxPoolSize: node.maxKnown ? node.maxPoolSize : null,
    averageResponseTimeMs: node.queryCount ? node.queryLatencyTotalMs / node.queryCount : null
  }));
  const knownHealth = loadDistribution.filter((node) => ['healthy', 'unhealthy'].includes(node.healthStatus));
  const weightedLatency = snapshots.reduce((sum, item) => sum + (item.queryLatencyTotalMs || 0), 0);
  const weightedQueryCount = snapshots.reduce((sum, item) => sum + (item.queryCount || 0), 0);
  const activeConnections = activeKnown ? activeTotal : null;
  const configuredMaximumPoolSize = maximumKnown ? maximumTotal : null;

  return {
    monitoringEnabled: true,
    topologyType: latest.topologyType || null,
    totalDatabaseNodes: latest.databaseNodeCount ?? null,
    healthyDatabaseNodes: knownHealth.length ? knownHealth.filter((node) => node.healthStatus === 'healthy').length : null,
    unhealthyDatabaseNodes: knownHealth.length ? knownHealth.filter((node) => node.healthStatus === 'unhealthy').length : null,
    activeConnections,
    idleConnections: idleKnown ? idleTotal : null,
    configuredMaximumPoolSize,
    poolUtilization: activeConnections !== null && configuredMaximumPoolSize > 0
      ? activeConnections / configuredMaximumPoolSize
      : null,
    averageDatabaseResponseTimeMs: weightedQueryCount ? weightedLatency / weightedQueryCount : null,
    readOperationCount: snapshots.reduce((sum, item) => sum + (item.readOperationCount || 0), 0),
    writeOperationCount: snapshots.reduce((sum, item) => sum + (item.writeOperationCount || 0), 0),
    connectionFailures: snapshots.reduce((sum, item) => sum + (item.connectionFailures || 0), 0),
    loadDistribution,
    applicationInstances: snapshots.length,
    refreshIntervalMs: monitoringConfig().refreshIntervalMs,
    collectedAt: latest.createdAt
  };
};

const stopMongoMonitoring = async () => {
  if (monitoringState.snapshotTimer) clearInterval(monitoringState.snapshotTimer);
  monitoringState.snapshotTimer = null;
  if (monitoringState.instanceStarted && !monitoringState.instanceStopped && monitoringConfig().enabled) {
    monitoringState.instanceStopped = true;
    await LoadBalancingActivity.create({
      activityType: 'application_instance_stopped',
      applicationServerId: applicationServerId(),
      operationType: 'connection',
      activityStatus: 'success',
      environment: currentEnvironment()
    }).catch(() => {});
  }
};

module.exports = {
  attachMongoMonitoring,
  getAggregatedMetrics,
  getLiveDatabaseHealth,
  monitoringConfig,
  persistMetricsSnapshot,
  safeErrorDetails,
  stopMongoMonitoring
};