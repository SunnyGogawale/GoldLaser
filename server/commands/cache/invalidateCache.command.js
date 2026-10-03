const redisCache = require('../../services/redisCache.service');
const { getVersionKey } = require('../../utils/cacheKey');

const invalidateCacheCommand = (namespace) => redisCache.increment(getVersionKey(namespace));

module.exports = invalidateCacheCommand;