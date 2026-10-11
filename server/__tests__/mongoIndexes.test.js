const test = require('node:test');
const assert = require('node:assert/strict');
const SaleInvoice = require('../models/SaleInvoice');
const SalePayment = require('../models/SalePayment');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const PurchasePayment = require('../models/PurchasePayment');
const LoadBalancingActivity = require('../models/LoadBalancingActivity');
const RateLimitActivity = require('../models/RateLimitActivity');
const RateLimitBucket = require('../models/RateLimitBucket');

const statementIndexes = [
  [SaleInvoice, 'customerId', 'invoiceDate'],
  [SalePayment, 'customerId', 'paymentDate'],
  [PurchaseInvoice, 'vendorId', 'invoiceDate'],
  [PurchasePayment, 'vendorId', 'paymentDate']
];

test('legacy statement queries have partial indexes matching their date sort', () => {
  for (const [model, clientField, dateField] of statementIndexes) {
    const index = model.schema.indexes().find(([keys, options]) => (
      keys[clientField] === 1 &&
      keys[dateField] === 1 &&
      keys.createdAt === 1 &&
      options.partialFilterExpression?.[clientField]?.$exists === true
    ));

    assert.ok(index, `${model.modelName} should index ${clientField} with ${dateField}`);
  }
});

test('load-balancing activity indexes include bounded retention and server snapshot uniqueness', () => {
  const indexes = LoadBalancingActivity.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.createdAt === 1 && options.expireAfterSeconds >= 86400));
  assert.ok(indexes.some(([keys, options]) => (
    keys.activityType === 1 &&
    keys.applicationServerId === 1 &&
    options.unique === true &&
    options.partialFilterExpression?.activityType === 'metrics_snapshot'
  )));
});

test('rate-limit activity indexes support retention, history filters, and grouped violation updates', () => {
  const activityIndexes = RateLimitActivity.schema.indexes();
  const bucketIndexes = RateLimitBucket.schema.indexes();
  assert.ok(activityIndexes.some(([keys, options]) => keys.createdAt === 1 && options.expireAfterSeconds >= 86400));
  assert.ok(activityIndexes.some(([keys]) => keys.userId === 1 && keys.createdAt === -1));
  assert.ok(activityIndexes.some(([keys]) => keys.activityType === 1 && keys.createdAt === -1));
  assert.ok(activityIndexes.some(([keys]) => keys.endpoint === 1 && keys.createdAt === -1));
  assert.ok(activityIndexes.some(([keys]) => keys.policyName === 1 && keys.createdAt === -1));
  assert.ok(activityIndexes.some(([keys]) => keys.ipAddress === 1 && keys.createdAt === -1));
  assert.ok(bucketIndexes.some(([keys, options]) => keys.counterKey === 1 && options.unique === true));
  assert.ok(bucketIndexes.some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
  assert.ok(bucketIndexes.some(([keys, options]) => keys.windowEndsAt === 1 && options.partialFilterExpression?.limitedRequests?.$gt === 0));
  assert.ok(bucketIndexes.some(([keys]) => keys['apiMetrics.routeId'] === 1 && keys.windowStartedAt === -1));
});