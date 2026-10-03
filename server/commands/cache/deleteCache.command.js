const redisCache = require('../../services/redisCache.service');
const { getVersionKey, getEntryKey } = require('../../utils/cacheKey');

const deleteCacheCommand = async (namespace, keyParts) => {
  const versionResult = await redisCache.getValue(getVersionKey(namespace));
  if (!versionResult.available) return false;
  const version = versionResult.value || '0';
  return redisCache.deleteKey(getEntryKey(namespace, version, keyParts));
};

module.exports = deleteCacheCommand;