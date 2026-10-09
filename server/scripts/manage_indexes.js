const path = require('node:path');
const mongoose = require('mongoose');
const { isDeepStrictEqual } = require('node:util');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const models = [
  require('../models/User'),
  require('../models/Customer'),
  require('../models/Vendor'),
  require('../models/Product'),
  require('../models/CustomerCustomField'),
  require('../models/VendorCustomField'),
  require('../models/CompanySettings'),
  require('../models/CustomerFormSettings'),
  require('../models/SaleInvoice'),
  require('../models/SalePayment'),
  require('../models/PurchaseInvoice'),
  require('../models/PurchasePayment'),
  require('../models/LoadBalancingActivity')
];

const comparableOptions = ['unique', 'sparse', 'expireAfterSeconds', 'partialFilterExpression', 'collation'];

const hasSameKey = (left, right) => {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length && leftEntries.every(([field, value], index) => (
    rightEntries[index]?.[0] === field && rightEntries[index]?.[1] === value
  ));
};

const hasSameOptions = (existing, desired) => comparableOptions.every((key) => {
  const defaultValue = ['unique', 'sparse'].includes(key) ? false : undefined;
  return isDeepStrictEqual(existing[key] ?? defaultValue, desired[key] ?? defaultValue);
});

const getExistingIndexes = async (model) => {
  try {
    return await model.collection.indexes();
  } catch (error) {
    if (error.code === 26 || error.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
};

const getCollectionExists = async (model) => mongoose.connection.db
  .listCollections({ name: model.collection.collectionName }, { nameOnly: true })
  .hasNext();

const findDuplicate = async (model, keys, options) => {
  const filters = [];
  if (options.partialFilterExpression) filters.push(options.partialFilterExpression);
  if (options.sparse) {
    filters.push({
      $or: Object.keys(keys).map((field) => ({ [field]: { $exists: true } }))
    });
  }

  const groupId = Object.fromEntries(
    Object.keys(keys).map((field, index) => [`field${index}`, `$${field}`])
  );
  const pipeline = [];
  if (filters.length) pipeline.push({ $match: { $and: filters } });
  pipeline.push(
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 }
  );

  const [duplicate] = await model.collection.aggregate(pipeline, { allowDiskUse: true }).toArray();
  return duplicate || null;
};

const ensureIndexes = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/goldflow';
  await mongoose.connect(uri, { autoIndex: false });

  const plans = [];
  for (const model of models) {
    const existingIndexes = await getExistingIndexes(model);
    for (const [keys, options] of model.schema.indexes()) {
      const existing = existingIndexes.find((index) => hasSameKey(index.key, keys));
      if (existing) {
        if (!hasSameOptions(existing, options) || existing.hidden) {
          throw new Error(`Conflicting existing index for ${model.collection.collectionName}: ${JSON.stringify(keys)}`);
        }
        continue;
      }
      plans.push({ model, keys, options });
    }
  }

  const collections = new Map();
  for (const plan of plans) {
    if (!plan.options.unique) continue;
    let exists = collections.get(plan.model);
    if (exists === undefined) {
      exists = await getCollectionExists(plan.model);
      collections.set(plan.model, exists);
    }
    if (!exists) continue;

    const duplicate = await findDuplicate(plan.model, plan.keys, plan.options);
    if (duplicate) {
      throw new Error(`Duplicate data prevents unique index on ${plan.model.collection.collectionName}: ${Object.keys(plan.keys).join(', ')}`);
    }
  }

  for (const { model, keys, options } of plans) {
    const name = await model.collection.createIndex(keys, options);
    console.log(`Created ${model.collection.collectionName}.${name}`);
  }
  if (!plans.length) console.log('All declared indexes already exist.');
};

if (require.main === module) {
  ensureIndexes()
    .catch((error) => {
      console.error(`Index installation failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { ensureIndexes, findDuplicate, hasSameKey, hasSameOptions };