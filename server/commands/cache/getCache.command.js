const redisCache = require('../../services/redisCache.service');
const { getVersionKey, getEntryKey } = require('../../utils/cacheKey');

const getCacheCommand = async (namespace, keyParts) => {
  const versionResult = await redisCache.getValue(getVersionKey(namespace));
  if (!versionResult.available) return { hit: false, value: null, version: null };

  const version = versionResult.value || '0';
  const cacheResult = await redisCache.getJson(getEntryKey(namespace, version, keyParts));
  if (!cacheResult.available) return { hit: false, value: null, version: null };
  return { hit: cacheResult.value !== null, value: cacheResult.value, version };
};

module.exports = getCacheCommand;