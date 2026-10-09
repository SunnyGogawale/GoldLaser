const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMongoConnectionOptions, getMongoReconnectDelay } = require('../config/mongoConnection');
const { safeErrorDetails } = require('../utils/mongoMonitoring');

test('Mongo pool configuration uses bounded defaults and primary reads', () => {
  const options = buildMongoConnectionOptions({ NODE_ENV: 'production' });

  assert.equal(options.maxPoolSize, 10);
  assert.equal(options.minPoolSize, 0);
  assert.equal(options.maxIdleTimeMS, 30000);
  assert.equal(options.waitQueueTimeoutMS, 5000);
  assert.equal(options.connectTimeoutMS, 10000);
  assert.equal(options.serverSelectionTimeoutMS, 10000);
  assert.equal(options.readPreference, 'primary');
  assert.equal(options.autoIndex, false);
});

test('Mongo pool configuration bounds values and ignores unsupported read preferences', () => {
  const options = buildMongoConnectionOptions({
    MONGODB_MAX_POOL_SIZE: '4',
    MONGODB_MIN_POOL_SIZE: '8',
    MONGODB_WAIT_QUEUE_TIMEOUT_MS: '999999',
    MONGODB_READ_PREFERENCE: 'random'
  });

  assert.equal(options.maxPoolSize, 4);
  assert.equal(options.minPoolSize, 4);
  assert.equal(options.waitQueueTimeoutMS, 120000);
  assert.equal(options.readPreference, 'primary');
});

test('Mongo reconnect delay backs off and remains bounded', () => {
  assert.equal(getMongoReconnectDelay(0), 1000);
  assert.equal(getMongoReconnectDelay(2), 4000);
  assert.equal(getMongoReconnectDelay(10), 30000);
});

test('monitoring error details omit command values and redact connection secrets', () => {
  const duplicateError = Object.assign(new Error('duplicate key sensitive@example.test'), {
    name: 'MongoServerError',
    code: 11000
  });
  const networkError = Object.assign(new Error('connect mongodb://user:password@host/db token=secret'), {
    name: 'MongoNetworkError'
  });

  assert.equal(safeErrorDetails(duplicateError), 'MongoServerError (code 11000)');
  const safeNetworkDetails = safeErrorDetails(networkError);
  assert.match(safeNetworkDetails, /MongoNetworkError/);
  assert.doesNotMatch(safeNetworkDetails, /mongodb:\/\/|password@host|token=secret/);
});