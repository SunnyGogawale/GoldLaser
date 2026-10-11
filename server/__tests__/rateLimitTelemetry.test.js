const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { publishActivity, streamToResponse } = require('../utils/rateLimitTelemetry');

test('SSE reconnect replays unseen events once and reports connection status', () => {
  const eventPrefix = `sse-test-${Date.now()}`;
  const firstEvent = { eventId: `${eventPrefix}-1`, endpoint: '/api/health', requestStatus: 'Success' };
  const secondEvent = { eventId: `${eventPrefix}-2`, endpoint: '/api/customers', requestStatus: 'Failed' };
  assert.equal(publishActivity(firstEvent), true);
  assert.equal(publishActivity(firstEvent), false);
  publishActivity(secondEvent);

  const request = new EventEmitter();
  request.headers = { 'last-event-id': firstEvent.eventId };
  const response = new EventEmitter();
  response.headers = {};
  response.output = '';
  response.destroyed = false;
  response.writableEnded = false;
  response.status = (code) => { response.statusCode = code; return response; };
  response.set = (name, value) => { response.headers[name] = value; return response; };
  response.flushHeaders = () => {};
  response.write = (value) => { response.output += value; return true; };

  streamToResponse(request, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['Content-Type'], /text\/event-stream/);
  assert.match(response.output, /event: status/);
  assert.match(response.output, new RegExp(`id: ${secondEvent.eventId}`));
  assert.doesNotMatch(response.output, new RegExp(`id: ${firstEvent.eventId}`));
  response.emit('close');
});