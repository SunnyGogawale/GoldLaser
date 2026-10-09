const path = require('node:path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SaleInvoice = require('../models/SaleInvoice');
const SalePayment = require('../models/SalePayment');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const PurchasePayment = require('../models/PurchasePayment');

const clientId = mongoose.isValidObjectId(process.env.INDEX_EXPLAIN_CLIENT_ID)
  ? new mongoose.Types.ObjectId(process.env.INDEX_EXPLAIN_CLIENT_ID)
  : new mongoose.Types.ObjectId('000000000000000000000001');
const fromDate = process.env.INDEX_EXPLAIN_FROM_DATE
  ? new Date(process.env.INDEX_EXPLAIN_FROM_DATE)
  : new Date('2999-01-01T00:00:00.000Z');
if (Number.isNaN(fromDate.getTime())) throw new Error('INDEX_EXPLAIN_FROM_DATE must be a valid date');
const invoiceId = clientId;

const checks = [
  ['sale invoice ledger', SaleInvoice, { clientId, clientType: 'Customer' }, { invoiceDate: 1, createdAt: 1 }],
  ['sale payment ledger', SalePayment, { clientId, clientType: 'Customer' }, { paymentDate: 1, createdAt: 1 }],
  ['purchase invoice ledger', PurchaseInvoice, { clientId, clientType: 'Vendor' }, { invoiceDate: 1, createdAt: 1 }],
  ['purchase payment ledger', PurchasePayment, { clientId, clientType: 'Vendor' }, { paymentDate: 1, createdAt: 1 }],
  ['sale invoice date range', SaleInvoice, { invoiceDate: { $gte: new Date('2020-01-01T00:00:00.000Z') } }, { invoiceDate: 1, createdAt: 1 }],
  ['sale payment date range', SalePayment, { paymentDate: { $gte: new Date('2020-01-01T00:00:00.000Z') } }, { paymentDate: 1, createdAt: 1 }],
  ['purchase invoice date range', PurchaseInvoice, { invoiceDate: { $gte: new Date('2020-01-01T00:00:00.000Z') } }, { invoiceDate: 1, createdAt: 1 }],
  ['purchase payment date range', PurchasePayment, { paymentDate: { $gte: new Date('2020-01-01T00:00:00.000Z') } }, { paymentDate: 1, createdAt: 1 }],
  ['legacy customer sale invoices', SaleInvoice, { customerId: clientId }, { invoiceDate: 1, createdAt: 1 }],
  ['legacy customer sale payments', SalePayment, { customerId: clientId }, { paymentDate: 1, createdAt: 1 }],
  ['legacy vendor purchase invoices', PurchaseInvoice, { vendorId: clientId }, { invoiceDate: 1, createdAt: 1 }],
  ['legacy vendor purchase payments', PurchasePayment, { vendorId: clientId }, { paymentDate: 1, createdAt: 1 }],
  ['sale allocation lookup', SalePayment, { 'allocations.invoiceId': invoiceId }, {}],
  ['purchase allocation lookup', PurchasePayment, { 'allocations.invoiceId': invoiceId }, {}],
  ['customer list order', require('../models/Customer'), {}, { createdAt: -1 }],
  ['vendor list order', require('../models/Vendor'), {}, { createdAt: -1 }],
  ['product active list order', require('../models/Product'), { isActive: true }, { productName: 1 }],
  ['user list order', require('../models/User'), {}, { createdAt: -1 }],
  ['user email lookup', require('../models/User'), { email: 'missing-index-check@example.invalid' }, {}]
];

const summarizeStages = (plan, stages = []) => {
  if (!plan || typeof plan !== 'object') return stages;
  if (plan.stage) stages.push(plan.stage);
  if (Array.isArray(plan.inputStages)) {
    for (const stage of plan.inputStages) summarizeStages(stage, stages);
  }
  if (plan.inputStage) summarizeStages(plan.inputStage, stages);
  if (plan.queryPlan) summarizeStages(plan.queryPlan, stages);
  if (plan.winningPlan) summarizeStages(plan.winningPlan, stages);
  return stages;
};

const run = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/goldflow';
  await mongoose.connect(uri, { autoIndex: false });

  let failed = false;
  for (const [label, model, filter, sort] of checks) {
    const explain = await model.collection.find(filter).sort(sort).limit(1).explain('executionStats');
    const stages = summarizeStages(explain.queryPlanner?.winningPlan);
    const usesIndex = stages.includes('IXSCAN');
    console.log(JSON.stringify({
      query: label,
      collection: model.collection.collectionName,
      stages,
      usesIndex,
      nReturned: explain.executionStats?.nReturned,
      totalKeysExamined: explain.executionStats?.totalKeysExamined,
      totalDocsExamined: explain.executionStats?.totalDocsExamined
    }));
    if (!usesIndex) failed = true;
  }
  if (failed) process.exitCode = 1;
};

run()
  .catch((error) => {
    console.error(`Index explain failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());