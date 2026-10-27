const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const routes = require('../routes/customers');
const Customer = require('../models/Customer');
const SaleInvoice = require('../models/SaleInvoice');
const SalePayment = require('../models/SalePayment');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const PurchasePayment = require('../models/PurchasePayment');
const User = require('../models/User');

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

const makeQuery = (result, sessionState) => ({
  session(session) {
    sessionState.value = session;
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(result).then(resolve, reject);
  }
});

const findDeleteRoute = (path) => routes.stack
  .find((layer) => layer.route?.path === path && layer.route.methods.delete)
  .route;

const invokeDeleteRoute = async (path, customerId, scope) => {
  const route = findDeleteRoute(path);
  const response = makeResponse();
  const [adminMiddleware, handler] = route.stack.map((layer) => layer.handle);
  let authorized = false;

  await adminMiddleware({
    headers: { authorization: `Bearer ${jwt.sign({ user: { id: new mongoose.Types.ObjectId().toString() } }, process.env.JWT_SECRET)}` },
    params: { id: customerId, scope }
  }, response, () => { authorized = true; });

  if (authorized) {
    await handler({ params: { id: customerId, scope } }, response);
  }
  return response;
};

test('customer deletion scopes only remove matching records inside a transaction', async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalStartSession = mongoose.startSession;
  const originalFindById = Customer.findById;
  const originalCustomerDeleteOne = Customer.deleteOne;
  const originalUserFindById = User.findById;
  const models = [
    ['saleInvoices', SaleInvoice],
    ['salePayments', SalePayment],
    ['purchaseInvoices', PurchaseInvoice],
    ['purchasePayments', PurchasePayment]
  ];
  const originalDeleteMethods = models.map(([, model]) => model.deleteMany);
  const customerId = new mongoose.Types.ObjectId();
  const customer = { _id: customerId };
  const session = {
    withTransaction: async (callback) => callback(),
    endSession: async () => {}
  };
  const calls = [];
  let currentRole = 'admin';

  process.env.JWT_SECRET = 'customer-deletion-test-secret';
  User.findById = () => ({
    select: async () => ({ roll: currentRole, isActive: true })
  });
  Customer.findById = () => makeQuery(customer, { value: null });
  Customer.deleteOne = async (filter, options) => {
    calls.push({ model: 'customers', filter, options });
    return { deletedCount: 1 };
  };
  mongoose.startSession = async () => session;
  models.forEach(([name, model]) => {
    model.deleteMany = async (filter, options) => {
      calls.push({ model: name, filter, options });
      return { deletedCount: 1 };
    };
  });

  try {
    for (const [path, scope, expectedModels] of [
      ['/:id/:scope', 'invoices', ['saleInvoices', 'purchaseInvoices']],
      ['/:id/:scope', 'payments', ['salePayments', 'purchasePayments']],
      ['/:id/:scope', 'full', ['saleInvoices', 'salePayments', 'purchaseInvoices', 'purchasePayments', 'customers']],
      ['/:id', undefined, ['saleInvoices', 'salePayments', 'purchaseInvoices', 'purchasePayments', 'customers']]
    ]) {
      calls.length = 0;
      const response = await invokeDeleteRoute(path, customerId.toString(), scope);
      assert.equal(response.statusCode, 200);
      assert.deepEqual(calls.map((call) => call.model).sort(), [...expectedModels].sort());
      for (const call of calls) {
        assert.equal(call.options.session, session);
        assert.ok(JSON.stringify(call.filter).includes(customerId.toString()));
      }
      assert.equal(response.body.deleted.customers, expectedModels.includes('customers') ? 1 : 0);
    }

    calls.length = 0;
    const invalidIdResponse = await invokeDeleteRoute('/:id/:scope', 'not-an-object-id', 'full');
    assert.equal(invalidIdResponse.statusCode, 400);
    assert.equal(calls.length, 0);

    currentRole = 'user';
    const forbiddenResponse = await invokeDeleteRoute('/:id/:scope', customerId.toString(), 'full');
    assert.equal(forbiddenResponse.statusCode, 403);
    assert.equal(calls.length, 0);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    mongoose.startSession = originalStartSession;
    Customer.findById = originalFindById;
    Customer.deleteOne = originalCustomerDeleteOne;
    User.findById = originalUserFindById;
    models.forEach(([, model], index) => {
      model.deleteMany = originalDeleteMethods[index];
    });
  }
});

test('customer deletion falls back only when transactions are unsupported', async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalStartSession = mongoose.startSession;
  const originalFindById = Customer.findById;
  const originalUserFindById = User.findById;
  const originalDeleteMany = SaleInvoice.deleteMany;
  const originalPurchaseDeleteMany = PurchaseInvoice.deleteMany;
  const customerId = new mongoose.Types.ObjectId();
  let sessionLookup = true;
  let deleteCount = 0;

  process.env.JWT_SECRET = 'customer-deletion-test-secret';
  User.findById = () => ({
    select: async () => ({ roll: 'admin', isActive: true })
  });
  Customer.findById = () => ({
    session() {
      return this;
    },
    then(resolve, reject) {
      if (sessionLookup) {
        sessionLookup = false;
        const error = new Error('Transaction numbers are only allowed on a replica set member or mongos');
        error.code = 20;
        return Promise.reject(error).then(resolve, reject);
      }
      return Promise.resolve({ _id: customerId }).then(resolve, reject);
    }
  });
  SaleInvoice.deleteMany = async () => {
    deleteCount += 1;
    return { deletedCount: 1 };
  };
  PurchaseInvoice.deleteMany = async () => ({ deletedCount: 1 });
  mongoose.startSession = async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {}
  });

  try {
    const response = await invokeDeleteRoute('/:id/:scope', customerId.toString(), 'invoices');
    assert.equal(response.statusCode, 200);
    assert.equal(deleteCount, 1);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    mongoose.startSession = originalStartSession;
    Customer.findById = originalFindById;
    User.findById = originalUserFindById;
    SaleInvoice.deleteMany = originalDeleteMany;
    PurchaseInvoice.deleteMany = originalPurchaseDeleteMany;
  }
});
