const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeErrorMessage, sendErrorResponse } = require('../utils/errorHandler');

test('sanitizeErrorMessage replaces stack traces and file paths with a generic message', () => {
  const leaked = 'Error: Cannot read properties of undefined\n    at /Users/sunny/Projects/app/server/routes/auth.js:42:13';
  assert.equal(
    sanitizeErrorMessage(leaked),
    'Something went wrong. Please try again later.'
  );
});

test('sendErrorResponse returns a safe client message while logging the full error', () => {
  const calls = [];
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      calls.push(payload);
      return this;
    }
  };

  const err = new Error('MongoError: E11000 duplicate key');
  sendErrorResponse(res, err, 'Something went wrong. Please try again later.', 500, 'auth');

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: 'Something went wrong. Please try again later.' });
  assert.equal(calls.length, 1);
});
