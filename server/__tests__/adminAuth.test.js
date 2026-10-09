const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { requireAdmin } = require('../middleware/adminAuth');

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

const makeToken = (id) => jwt.sign({ user: { id } }, 'monitoring-test-secret');

test('monitoring middleware only allows an active database admin', async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFindById = User.findById;
  const adminId = new mongoose.Types.ObjectId();
  process.env.JWT_SECRET = 'monitoring-test-secret';

  try {
    let nextCalls = 0;
    User.findById = () => ({ select: async () => ({ _id: adminId, roll: 'admin', isActive: true }) });
    const adminResponse = makeResponse();
    await requireAdmin({ headers: { authorization: `Bearer ${makeToken(adminId)}` } }, adminResponse, () => { nextCalls += 1; });
    assert.equal(adminResponse.statusCode, 200);
    assert.equal(nextCalls, 1);

    User.findById = () => ({ select: async () => ({ _id: adminId, roll: 'user', isActive: true }) });
    const userResponse = makeResponse();
    await requireAdmin({ headers: { authorization: `Bearer ${makeToken(adminId)}` } }, userResponse, () => { nextCalls += 1; });
    assert.equal(userResponse.statusCode, 403);
    assert.equal(nextCalls, 1);

    const anonymousResponse = makeResponse();
    await requireAdmin({ headers: {} }, anonymousResponse, () => { nextCalls += 1; });
    assert.equal(anonymousResponse.statusCode, 401);
    assert.equal(nextCalls, 1);
  } finally {
    User.findById = originalFindById;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});