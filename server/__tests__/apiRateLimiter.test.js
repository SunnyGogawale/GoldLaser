const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimitMiddleware } = require('../middleware/apiRateLimiter');

const createModels = () => {
  const buckets = new Map();
  const activities = new Map();
  return {
    BucketModel: {
      async findOneAndUpdate({ counterKey }) {
        const requestsUsed = (buckets.get(counterKey) || 0) + 1;
        buckets.set(counterKey, requestsUsed);
        return { requestsUsed, windowEndsAt: new Date(Date.now() + 30000) };
      }
    },
    ActivityModel: {
      async findOneAndUpdate({ dedupeKey }, update) {
        activities.set(dedupeKey, (activities.get(dedupeKey) || 0) + update.$inc.eventCount);
      }
    },
    activities
  };
};

const request = (overrides = {}) => ({
  method: 'GET',
  originalUrl: '/api/customers',
  headers: {},
  ip: '192.0.2.12',
  ...overrides
});

const response = () => ({
  statusCode: 200,
  headers: {},
  listeners: {},
  once(event, listener) { this.listeners[event] = listener; return this; },
  emit(event) { this.listeners[event]?.(); },
  status(code) { this.statusCode = code; return this; },
  set(name, value) { this.headers[name] = value; return this; },
  json(body) { this.body = body; return this; }
});

const testPolicies = { general: { name: 'general', limit: 2, windowMs: 60000 } };

test('rate limiter allows requests through the configured threshold and records later denials', async () => {
  const { BucketModel } = createModels();
  const recorded = [];
  const middleware = createRateLimitMiddleware({
    BucketModel,
    policies: testPolicies,
    isStoreReady: () => true,
    recordCompletion: (activity) => recorded.push(activity)
  });
  let nextCalls = 0;

  for (let index = 0; index < 3; index += 1) {
    const res = response();
    await middleware(request(), res, () => { nextCalls += 1; });
    res.emit('finish');
    if (index < 2) assert.equal(res.statusCode, 200);
    else {
      assert.equal(res.statusCode, 429);
      assert.equal(res.headers['Retry-After'] > 0, true);
      assert.equal(res.body.policy, 'general');
    }
  }

  assert.equal(nextCalls, 2);
  assert.equal(recorded.length, 3);
  assert.equal(recorded[2].statusCode, 429);
});

test('rate limiter uses atomic shared increments for concurrent requests', async () => {
  const { BucketModel, ActivityModel } = createModels();
  const middleware = createRateLimitMiddleware({ BucketModel, ActivityModel, policies: testPolicies, isStoreReady: () => true });
  let allowed = 0;
  let limited = 0;

  await Promise.all(Array.from({ length: 8 }, async () => {
    const res = response();
    await middleware(request(), res, () => { allowed += 1; });
    if (res.statusCode === 429) limited += 1;
  }));

  assert.equal(allowed, 2);
  assert.equal(limited, 6);
});

test('rate limiter retries a simultaneous first-window insert collision', async () => {
  let attempt = 0;
  const middleware = createRateLimitMiddleware({
    BucketModel: {
      async findOneAndUpdate(_filter, _update, options) {
        attempt += 1;
        assert.equal(options.updatePipeline, true);
        if (attempt === 1) {
          const duplicateError = new Error('duplicate key');
          duplicateError.code = 11000;
          throw duplicateError;
        }
        assert.equal(options.upsert, false);
        return { requestsUsed: 1, windowEndsAt: new Date(Date.now() + 30000) };
      }
    },
    ActivityModel: { async findOneAndUpdate() {} },
    policies: testPolicies,
    isStoreReady: () => true
  });
  let nextCalls = 0;

  await middleware(request(), response(), () => { nextCalls += 1; });
  assert.equal(attempt, 2);
  assert.equal(nextCalls, 1);
});

test('rate limiter fails open when the shared store is unavailable', async () => {
  const { BucketModel, ActivityModel } = createModels();
  const middleware = createRateLimitMiddleware({ BucketModel, ActivityModel, isStoreReady: () => false });
  let nextCalls = 0;
  await middleware(request(), response(), () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
});

test('CSV import endpoints bypass rate limiting while regular create endpoints remain limited', async () => {
  const { BucketModel } = createModels();
  const middleware = createRateLimitMiddleware({
    BucketModel,
    policies: testPolicies,
    isStoreReady: () => true
  });
  let nextCalls = 0;

  for (const originalUrl of [
    '/api/invoices/csv-import',
    '/api/payments/csv-import',
    '/api/purchase-payments/csv-import'
  ]) {
    const res = response();
    await middleware(request({ method: 'POST', originalUrl }), res, () => { nextCalls += 1; });
    assert.equal(res.statusCode, 200);
  }

  const regularCreate = request({ method: 'POST', originalUrl: '/api/payments' });
  const firstResponse = response();
  await middleware(regularCreate, firstResponse, () => { nextCalls += 1; });
  assert.equal(firstResponse.statusCode, 200);

  const secondResponse = response();
  await middleware(regularCreate, secondResponse, () => { nextCalls += 1; });
  assert.equal(secondResponse.statusCode, 200);

  const thirdResponse = response();
  await middleware(regularCreate, thirdResponse, () => { nextCalls += 1; });
  assert.equal(thirdResponse.statusCode, 429);
  assert.equal(nextCalls, 5);
});
