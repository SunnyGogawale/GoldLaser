const READ_PREFERENCES = new Set([
  'primary',
  'primaryPreferred',
  'secondary',
  'secondaryPreferred',
  'nearest'
]);

const boundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
};

const getMongoReconnectDelay = (retryCount, env = process.env) => {
  const baseDelayMs = boundedInteger(env.MONGODB_RECONNECT_BASE_DELAY_MS, 1000, 100, 30000);
  return Math.min(30000, baseDelayMs * (2 ** Math.min(5, Math.max(0, retryCount))));
};

const buildMongoConnectionOptions = (env = process.env) => {
  const maxPoolSize = boundedInteger(env.MONGODB_MAX_POOL_SIZE, 10, 1, 500);
  const minPoolSize = boundedInteger(env.MONGODB_MIN_POOL_SIZE, 0, 0, maxPoolSize);
  const requestedReadPreference = String(env.MONGODB_READ_PREFERENCE || 'primary');
  const readPreference = READ_PREFERENCES.has(requestedReadPreference)
    ? requestedReadPreference
    : 'primary';

  return {
    appName: String(env.MONGODB_APP_NAME || 'goldflow'),
    autoIndex: env.NODE_ENV !== 'production',
    maxPoolSize,
    minPoolSize,
    maxIdleTimeMS: boundedInteger(env.MONGODB_MAX_IDLE_TIME_MS, 30000, 1000, 3600000),
    waitQueueTimeoutMS: boundedInteger(env.MONGODB_WAIT_QUEUE_TIMEOUT_MS, 5000, 100, 120000),
    connectTimeoutMS: boundedInteger(env.MONGODB_CONNECT_TIMEOUT_MS, 10000, 1000, 120000),
    serverSelectionTimeoutMS: boundedInteger(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 10000, 1000, 120000),
    heartbeatFrequencyMS: boundedInteger(env.MONGODB_HEARTBEAT_FREQUENCY_MS, 10000, 5000, 120000),
    monitorCommands: String(env.DB_MONITORING_ENABLED || 'true').toLowerCase() !== 'false',
    readPreference
  };
};

module.exports = { buildMongoConnectionOptions, getMongoReconnectDelay };