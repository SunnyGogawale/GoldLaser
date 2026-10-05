const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const config = require('../config/env');

async function deleteAllCustomers() {
  try {
    config.validateDatabase();
    await mongoose.connect(config.database.uri);
    console.log('Connected to MongoDB');

    const result = await Customer.deleteMany({});
    console.log(`✅ Successfully deleted ${result.deletedCount} customers`);

    process.exit(0);
  } catch {
    console.error('Error deleting customers');
    process.exit(1);
  }
}

deleteAllCustomers();
