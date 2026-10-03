const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { setRedisClientForTesting } = require('../config/redis');
const getCacheCommand = require('../commands/cache/getCache.command');
const setCacheCommand = require('../commands/cache/setCache.command');
const invalidateCacheCommand = require('../commands/cache/invalidateCache.command');

const createRedisMock = () => {
  const values = new Map();
  const ttlValues = new Map();
  return {
    values,
    ttlValues,
    async get(key) {
      return values.has(key) ? values.get(key) : null;
    },
    async set(key, value, options) {
      values.set(key, value);
      ttlValues.set(key, options.EX);
    },
    async incr(key) {
      const version = Number(values.get(key) || 0) + 1;
      values.set(key, String(version));
      return version;
    },
    async expire() {
      return 1;
    },
    async del(key) {
      return values.delete(key) ? 1 : 0;
    }
  };
};

afterEach(() => setRedisClientForTesting(null));

test('cache command reads, writes with TTL, and returns cached data', async () => {
  const redis = createRedisMock();
  setRedisClientForTesting(redis);
  const scope = { userId: 'user-a', isAdmin: false, search: '' };

  const miss = await getCacheCommand('products:list', scope);
  assert.equal(miss.hit, false);
  assert.equal(miss.version, '0');
  assert.equal(await setCacheCommand('products:list', scope, { products: [] }, 120, miss.version), true);

  const hit = await getCacheCommand('products:list', scope);
  assert.deepEqual(hit.value, { products: [] });
  assert.equal(hit.hit, true);
  assert.deepEqual([...redis.ttlValues.values()], [120]);
});

test('cache invalidation makes the previous generation unreachable', async () => {
  setRedisClientForTesting(createRedisMock());
  const scope = { userId: 'user-a', isAdmin: false, search: '' };
  const miss = await getCacheCommand('products:list', scope);
  await setCacheCommand('products:list', scope, { products: ['old'] }, 120, miss.version);

  await invalidateCacheCommand('products:list');

  const afterInvalidation = await getCacheCommand('products:list', scope);
  assert.equal(afterInvalidation.hit, false);
  assert.equal(afterInvalidation.version, '1');
});

test('cache command falls back cleanly when Redis fails', async () => {
  setRedisClientForTesting({
    async get() {
      throw new Error('Redis unavailable');
    }
  });

  const result = await getCacheCommand('products:list', { userId: 'user-a' });
  assert.deepEqual(result, { hit: false, value: null, version: null });
});