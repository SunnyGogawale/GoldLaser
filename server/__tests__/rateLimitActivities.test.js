const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { buildActivityFilter, createRateLimitActivitiesRouter } = require('../routes/rateLimitActivities');
const { hashValue } = require('../middleware/apiRateLimiter');
const { parseTrustProxySetting } = require('../config/trustProxy');

const withServer = async (router, run) => {
  const app = express();
  app.use('/api/admin', router);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

test('rate-limit monitoring endpoints require the existing admin authorization middleware', async () => {
  const router = createRateLimitActivitiesRouter();
  await withServer(router, async (baseUrl) => {
    for (const path of [
      '/api/admin/rate-limit-activities',
      '/api/admin/rate-limit-activities/stats',
      '/api/admin/rate-limit-activities/apis',
      '/api/admin/rate-limit-activities/live'
    ]) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { message: 'Unauthorized' });
    }
  });
});

test('activity list validates pagination and returns filtered records in newest-first pages', async () => {
  const id = new mongoose.Types.ObjectId();
  const calls = {};
  const ActivityModel = {
    find(query) {
      calls.query = query;
      return {
        sort(value) { calls.sort = value; return this; },
        skip(value) { calls.skip = value; return this; },
        limit(value) { calls.limit = value; return this; },
        async lean() { return [{ _id: id, userName: 'Alice', endpoint: '/api/invoices' }]; }
      };
    },
    async countDocuments() { return 21; }
  };
  const router = createRateLimitActivitiesRouter({ ActivityModel, requireAdminMiddleware: (_req, _res, next) => next() });

  await withServer(router, async (baseUrl) => {
    const invalidResponse = await fetch(`${baseUrl}/api/admin/rate-limit-activities?page=1&limit=11`);
    assert.equal(invalidResponse.status, 400);

    const response = await fetch(`${baseUrl}/api/admin/rate-limit-activities?page=2&limit=10&search=Alice&method=GET`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.total, 21);
    assert.equal(result.page, 2);
    assert.equal(result.limit, 10);
    assert.equal(result.totalPages, 3);
    assert.equal(result.activities[0].userName, 'Alice');
    assert.equal(calls.skip, 10);
    assert.equal(calls.limit, 10);
    assert.deepEqual(calls.sort, { createdAt: -1, _id: -1 });
    assert.equal(calls.query.method, 'GET');
    assert.ok(calls.query.$and[0].$or.some((condition) => condition.userName));
  });
});

test('dashboard statistics use stored request counters and stored violation aggregates', async () => {
  const userId = new mongoose.Types.ObjectId();
  const ActivityModel = {
    async distinct() { return [userId]; },
      async aggregate(pipeline) {
        return pipeline.some((stage) => stage.$count)
          ? [{ count: 1 }]
          : [{ _id: '/api/invoices', count: 4 }];
      }
  };
  const BucketModel = {
    async aggregate(pipeline) {
      return pipeline.some((stage) => stage.$unwind)
        ? [{ successfulRequests: 15, failedRequests: 3 }]
        : [{ allowedRequests: 18, rateLimitedRequests: 4 }];
    },
    async countDocuments() { return 2; }
  };
  const router = createRateLimitActivitiesRouter({
    ActivityModel,
    BucketModel,
    requireAdminMiddleware: (_req, _res, next) => next()
  });

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/rate-limit-activities/stats?policyName=general`);
    assert.equal(response.status, 200);
    const stats = await response.json();
    assert.equal(stats.totalRequests, 22);
    assert.equal(stats.allowedRequests, 18);
    assert.equal(stats.rateLimitedRequests, 4);
    assert.equal(stats.successfulRequests, 15);
    assert.equal(stats.failedRequests, 3);
    assert.equal(stats.uniqueAffectedUsers, 1);
    assert.equal(stats.activeTemporaryRestrictions, 2);
    assert.equal(stats.totalRegisteredApis, 0);
    assert.deepEqual(stats.mostFrequentlyRateLimitedEndpoints, [{ endpoint: '/api/invoices', count: 4 }]);
    assert.equal(stats.liveStatus.mode, 'local');
  });
});

test('API registry endpoint filters discovered routes and returns actual window metrics', async () => {
  const routeId = 'customer-list-route';
  const registry = { list: () => [
    { routeId, endpoint: '/api/customers', method: 'GET', moduleName: 'Customers', authenticationRequired: true, accessRole: 'User' },
    { routeId: 'vendor-list-route', endpoint: '/api/vendors', method: 'GET', moduleName: 'Vendors', authenticationRequired: true, accessRole: 'User' }
  ] };
  const BucketModel = {
    async aggregate() { return [{
      totals: [{ _id: routeId, totalRequests: 22, totalBlockedRequests: 2, successfulRequests: 19, failedRequests: 1, responseTimeTotalMs: 220, lastRequestAt: new Date('2026-10-11T12:00:00.000Z') }],
      current: [{ _id: routeId, requestsUsed: 3, remainingRequests: 57, blockedRequests: 1 }]
    }]; }
  };
  const router = createRateLimitActivitiesRouter({
    registry,
    BucketModel,
    requireAdminMiddleware: (_req, _res, next) => next()
  });

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/rate-limit-activities/apis?search=customers&method=GET&module=Customers&role=User&status=limited`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.total, 1);
    assert.equal(result.apis[0].policyName, 'general');
    assert.equal(result.apis[0].requestLimit, 300);
    assert.equal(result.apis[0].requestsUsed, 3);
    assert.equal(result.apis[0].remainingRequests, 57);
    assert.equal(result.apis[0].totalRequests, 22);
    assert.equal(result.apis[0].totalBlockedRequests, 2);
    assert.equal(result.apis[0].rateLimitStatus, 'Limited');
  });
});

test('activity filters escape endpoint text, validate enums, and hash authorized IP lookups', () => {
  const userId = new mongoose.Types.ObjectId();
  const ipAddress = '192.0.2.44';
  const result = buildActivityFilter({
    search: String(userId),
    endpoint: '/api/invoices.*',
    ipAddress,
    method: 'GET',
    activityType: 'Temporarily Restricted',
    userRole: 'Admin',
    policyName: 'general',
    fromDate: '2026-10-01',
    toDate: '2026-10-02'
  });

  assert.ok(result.filter.endpoint.test('/api/invoices.*'));
  assert.equal(result.filter.endpoint.test('/api/invoices/anything'), false);
  assert.equal(result.filter.ipAddress, hashValue(ipAddress));
  assert.equal(result.filter.method, 'GET');
  assert.equal(result.filter.activityType, 'Temporarily Restricted');
  assert.equal(result.filter.userRole, 'Admin');
  assert.ok(result.filter.$and[0].$or.some((condition) => String(condition.userId) === String(userId)));
  assert.equal(buildActivityFilter({ method: 'CONNECT' }).error, 'Invalid method filter');
  assert.equal(buildActivityFilter({ fromDate: '2026-10-03', toDate: '2026-10-02' }).error, 'Invalid activity date range');
});

test('CSV exports are filtered and neutralize spreadsheet formulas', async () => {
  const ActivityModel = {
    find(query) {
      assert.equal(query.policyName, 'general');
      return {
        sort() { return this; },
        limit(value) { assert.equal(value, 10001); return this; },
        async lean() { return [{ userName: '=1+1', endpoint: '/api/test', createdAt: new Date('2026-10-01T00:00:00.000Z') }]; }
      };
    }
  };
  const router = createRateLimitActivitiesRouter({ ActivityModel, requireAdminMiddleware: (_req, _res, next) => next() });

  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/rate-limit-activities?export=csv&policyName=general`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.match(await response.text(), /'=1\+1/);
  });
});

test('proxy trust configuration parses hop counts and does not trust forwarding by default', () => {
  assert.equal(parseTrustProxySetting(undefined), undefined);
  assert.equal(parseTrustProxySetting('true'), true);
  assert.equal(parseTrustProxySetting('false'), false);
  assert.equal(parseTrustProxySetting('2'), 2);
  assert.equal(parseTrustProxySetting('10.0.0.0/8'), '10.0.0.0/8');
});