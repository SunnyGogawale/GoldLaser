let redisClient = null;
let connectionPromise = null;
let injectedClient = null;
const { logError } = require('../utils/errorHandler');

const getRedisClient = async () => {
  if (injectedClient) return injectedClient;
  if (!process.env.REDIS_URL) return null;
  if (redisClient?.isReady) return redisClient;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    const { createClient } = require('redis');
    const client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: false
      }
    });
    client.on('error', (err) => logError('redis.connection', err));
    redisClient = client;
    try {
      await client.connect();
      return client;
    } catch (err) {
      redisClient = null;
      throw err;
    }
  })().catch((err) => {
    logError('redis.unavailable', err);
    return null;
  }).finally(() => {
    connectionPromise = null;
  });

  return connectionPromise;
};

const setRedisClientForTesting = (client) => {
  injectedClient = client;
};

module.exports = { getRedisClient, setRedisClientForTesting };