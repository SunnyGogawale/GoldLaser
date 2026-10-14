const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { CONTENT_SECURITY_POLICY, securityHeaders } = require('../middleware/securityHeaders');

const makeResponse = () => {
  const headers = {};
  return {
    headers,
    set(nameOrHeaders, value) {
      if (typeof nameOrHeaders === 'string') headers[nameOrHeaders.toLowerCase()] = value;
      else {
        for (const [name, headerValue] of Object.entries(nameOrHeaders)) {
          headers[name.toLowerCase()] = headerValue;
        }
      }
      return this;
    }
  };
};

test('security headers are present before downstream success or error handling', () => {
  const res = makeResponse();
  let nextCalls = 0;
  securityHeaders({ secure: false }, res, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
  assert.equal(res.headers['content-security-policy-report-only'], CONTENT_SECURITY_POLICY);
  assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(res.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=(), payment=()');
  assert.equal(res.headers['strict-transport-security'], undefined);
});

test('HSTS is only added for secure production requests', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const secureResponse = makeResponse();
    securityHeaders({ secure: true }, secureResponse, () => {});
    assert.equal(secureResponse.headers['strict-transport-security'], 'max-age=31536000');

    const insecureResponse = makeResponse();
    securityHeaders({ secure: false }, insecureResponse, () => {});
    assert.equal(insecureResponse.headers['strict-transport-security'], undefined);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('report-only CSP uses a restrictive allowlist and blocks framing by other origins', () => {
  assert.match(CONTENT_SECURITY_POLICY, /default-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /style-src 'self' 'unsafe-inline'/);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
  assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'self'/);
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-eval/);
});

test('security headers are returned for successful and error HTTP responses', async () => {
  const app = express();
  app.use(securityHeaders);
  app.get('/success', (req, res) => res.json({ status: 'ok' }));
  app.get('/error', (req, res) => res.status(401).json({ message: 'Unauthorized' }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    for (const [path, expectedStatus] of [['/success', 200], ['/error', 401]]) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, expectedStatus);
      assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
      assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=(), payment=()');
      assert.equal(response.headers.get('content-security-policy-report-only'), CONTENT_SECURITY_POLICY);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
