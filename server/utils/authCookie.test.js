const test = require('node:test');
const assert = require('node:assert/strict');
const { AUTH_COOKIE_NAME, getAuthCookieOptions, setAuthCookie, clearAuthCookie } = require('./authCookie');

test('auth cookies are HTTP-only, scoped to the host, and use a safe same-site default', () => {
  const options = getAuthCookieOptions();

  assert.match(AUTH_COOKIE_NAME, /goldflow_session$/);
  assert.equal(options.httpOnly, true);
  assert.equal(options.path, '/');
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.secure, false);
  assert.equal(options.domain, undefined);
  assert.equal(options.maxAge, 60 * 60 * 1000);
});

test('auth cookie helpers set and clear only the HttpOnly cookie', () => {
  const calls = [];
  const response = {
    cookie: (...args) => calls.push(['cookie', ...args]),
    clearCookie: (...args) => calls.push(['clearCookie', ...args]),
    setHeader: (...args) => calls.push(['setHeader', ...args])
  };

  setAuthCookie(response, 'opaque-test-value');
  clearAuthCookie(response);

  assert.equal(calls[0][0], 'cookie');
  assert.equal(calls[0][1], AUTH_COOKIE_NAME);
  assert.equal(calls[0][2], 'opaque-test-value');
  assert.equal(calls[0][3].httpOnly, true);
  assert.equal(calls[2][0], 'clearCookie');
  assert.equal(calls[2][1], AUTH_COOKIE_NAME);
  assert.equal(calls[2][2].httpOnly, true);
});