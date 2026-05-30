const mongoose = require('mongoose');
const Customer = require('./models/Customer');
require('dotenv').config();

async function deleteAllCustomers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/goldflow');
    console.log('Connected to MongoDB');

    const result = await Customer.deleteMany({});
    console.log(`✅ Successfully deleted ${result.deletedCount} customers`);

    process.exit(0);
  } catch (err) {
    console.error('Error deleting customers:', err);
    process.exit(1);
  }
}

deleteAllCustomers();
