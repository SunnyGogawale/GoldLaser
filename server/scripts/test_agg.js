const mongoose = require('mongoose');
const config = require('../config/env');
const Invoice = require('../models/Invoice');

async function test() {
  config.validateDatabase();
  await mongoose.connect(config.database.uri);
  const res = await Invoice.aggregate([
    {
      $addFields: {
        numericId: {
          $convert: {
            input: { $replaceAll: { input: "$invoiceNumber", find: "INV", replacement: "" } },
            to: "int",
            onError: -1,
            onNull: -2
          }
        }
      }
    },
    { $project: { invoiceNumber: 1, numericId: 1 } },
    { $sort: { numericId: -1 } },
    { $limit: 10 }
  ]);
  console.log(`Found ${res.length} matching invoices`);
  process.exit(0);
}
test();
