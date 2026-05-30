const mongoose = require('mongoose');
require('dotenv').config();
const Invoice = require('./models/Invoice');

async function test() {
  await mongoose.connect('mongodb://localhost:27017/goldflow');
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
  console.log(res);
  process.exit(0);
}
test();
