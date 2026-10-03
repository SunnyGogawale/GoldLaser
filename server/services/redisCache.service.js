const { getRedisClient } = require('../config/redis');
const { VERSION_KEY_TTL_SECONDS } = require('../config/cache');

const getValue = async (key) => {
  try {
    const client = await getRedisClient();
    if (!client) return { available: false, value: null };
    return { available: true, value: await client.get(key) };
  } catch {
    return { available: false, value: null };
  }
};

const getJson = async (key) => {
  const result = await getValue(key);
  if (!result.available || result.value === null) return result;
  try {
    return { available: true, value: JSON.parse(result.value) };
  } catch {
    return { available: true, value: null };
  }
};

const setJson = async (key, value, ttlSeconds) => {
  try {
    const client = await getRedisClient();
    if (!client || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0) return false;
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    return true;
  } catch {
    return false;
  }
};

const increment = async (key) => {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    const version = await client.incr(key);
    await client.expire(key, VERSION_KEY_TTL_SECONDS);
    return String(version);
  } catch {
    return null;
  }
};

const deleteKey = async (key) => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    await client.del(key);
    return true;
  } catch {
    return false;
  }
};

module.exports = { getValue, getJson, setJson, increment, deleteKey };