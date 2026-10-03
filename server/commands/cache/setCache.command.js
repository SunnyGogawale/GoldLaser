const redisCache = require('../../services/redisCache.service');
const { getEntryKey } = require('../../utils/cacheKey');

const setCacheCommand = (namespace, keyParts, value, ttlSeconds, version) => {
  if (version === null || version === undefined) return Promise.resolve(false);
  return redisCache.setJson(getEntryKey(namespace, version, keyParts), value, ttlSeconds);
};

module.exports = setCacheCommand;