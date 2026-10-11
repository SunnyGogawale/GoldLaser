const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { ApiRegistry, instrumentApiRegistrations } = require('../utils/apiRegistry');

test('API registry discovers mounted route methods and parameters from Express routers', () => {
  const registry = new ApiRegistry();
  const route = { path: '/:id', methods: { get: true, put: true }, stack: [{ handle: function requireAuth() {} }] };
  const router = { stack: [{ route }] };

  registry.registerRouterMount('/api/customers', router);
  const getRoute = registry.resolve('GET', '/api/customers/abc123');
  const putRoute = registry.resolve('PUT', '/api/customers/abc123');

  assert.equal(getRoute.endpoint, '/api/customers/:id');
  assert.equal(getRoute.moduleName, 'Customers');
  assert.equal(getRoute.authenticationRequired, true);
  assert.equal(getRoute.accessRole, 'User');
  assert.equal(putRoute.method, 'PUT');
  assert.equal(registry.list().length, 2);
});

test('API registry inherits router-wide admin guards and supports public/direct routes', () => {
  const registry = new ApiRegistry();
  const router = { stack: [
    { handle: function requireAdmin() {} },
    { route: { path: '/events', methods: { get: true }, stack: [{ handle: function handler() {} }] } }
  ] };

  registry.registerRouterMount('/api/admin/monitoring', router);
  registry.registerDirectRoute('/api/health', 'GET');

  assert.equal(registry.resolve('GET', '/api/admin/monitoring/events').accessRole, 'Admin');
  assert.equal(registry.resolve('GET', '/api/health').accessRole, 'Public');
  assert.equal(registry.resolve('POST', '/api/health'), null);
});

test('Express registrations populate the registry without a separate endpoint list', () => {
  const app = express();
  const registry = new ApiRegistry();
  const router = express.Router();
  router.get('/records/:id', function requireAuth() {}, (_req, res) => res.end());
  instrumentApiRegistrations(app, registry);
  app.use('/api/inventory', router);
  app.get('/api/health', (_req, res) => res.end());

  assert.equal(registry.resolve('GET', '/api/inventory/records/42').endpoint, '/api/inventory/records/:id');
  assert.equal(registry.resolve('GET', '/api/health').moduleName, 'API');
});