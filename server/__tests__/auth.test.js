const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { requireApiAuth, requireAuth } = require('../middleware/auth');

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

const invokeAuth = async (authorization, user) => {
  const req = { headers: authorization ? { authorization } : {} };
  const res = makeResponse();
  let nextError = null;
  let nextCalls = 0;
  const originalFindById = User.findById;
  User.findById = () => ({ select: async () => user });
  try {
    await requireAuth(req, res, (error) => {
      nextCalls += 1;
      nextError = error || null;
    });
  } finally {
    User.findById = originalFindById;
  }
  return { req, res, nextCalls, nextError };
};

test('authentication rejects missing, malformed, and expired bearer tokens', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'auth-test-secret';
  const userId = new mongoose.Types.ObjectId().toString();
  try {
    const missing = await invokeAuth('', null);
    assert.equal(missing.res.statusCode, 401);

    const malformed = await invokeAuth('Bearer not-a-jwt', null);
    assert.equal(malformed.res.statusCode, 401);

    const expiredToken = jwt.sign({ user: { id: userId } }, process.env.JWT_SECRET, { expiresIn: -1 });
    const expired = await invokeAuth(`Bearer ${expiredToken}`, null);
    assert.equal(expired.res.statusCode, 401);

    const sessionlessToken = jwt.sign({ user: { id: userId } }, process.env.JWT_SECRET);
    const sessionless = await invokeAuth(`Bearer ${sessionlessToken}`, {
      _id: userId,
      roll: 'user',
      isActive: true,
      loginHistory: []
    });
    assert.equal(sessionless.res.statusCode, 401);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('API authentication keeps health public but protects business routes', async () => {
  const healthResponse = makeResponse();
  let healthNextCalls = 0;
  requireApiAuth({ method: 'GET', path: '/health', headers: {} }, healthResponse, () => {
    healthNextCalls += 1;
  });
  assert.equal(healthResponse.statusCode, 200);
  assert.equal(healthNextCalls, 1);

  const protectedResponse = makeResponse();
  let protectedNextCalls = 0;
  await requireApiAuth({ method: 'GET', path: '/reports/sales', headers: {} }, protectedResponse, () => {
    protectedNextCalls += 1;
  });
  assert.equal(protectedResponse.statusCode, 401);
  assert.equal(protectedNextCalls, 0);
});

test('authentication requires an active user and active login session', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'auth-test-secret';
  const userId = new mongoose.Types.ObjectId();
  const token = jwt.sign({ user: { id: userId.toString(), sessionId: 'session-1' } }, process.env.JWT_SECRET);
  try {
    const inactive = await invokeAuth(`Bearer ${token}`, { _id: userId, roll: 'user', isActive: false, loginHistory: [] });
    assert.equal(inactive.res.statusCode, 401);

    const loggedOut = await invokeAuth(`Bearer ${token}`, {
      _id: userId,
      roll: 'user',
      isActive: true,
      loginHistory: [{ sessionId: 'session-1', logoutTime: new Date() }]
    });
    assert.equal(loggedOut.res.statusCode, 401);

    const valid = await invokeAuth(`Bearer ${token}`, {
      _id: userId,
      roll: 'user',
      isActive: true,
      loginHistory: [{ sessionId: 'session-1', logoutTime: null }]
    });
    assert.equal(valid.res.statusCode, 200);
    assert.equal(valid.nextCalls, 1);
    assert.equal(valid.nextError, null);
    assert.deepEqual(valid.req.auth, {
      userId: userId.toString(),
      sessionId: 'session-1',
      role: 'user'
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
