const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/goldflow';

const createAdmin = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB...');

    const User = require('../models/User');

    const adminEmail = 'admin@goldflow.com';
    const adminPassword = 'adminpassword123';

    await User.deleteOne({ email: adminEmail });
    console.log('Old admin deleted (if existed).');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const admin = new User({
      fullName: 'System Administrator',
      email: adminEmail,
      password: hashedPassword,
      roll: 'admin'
    });

    await admin.save();
    console.log('New Admin user created successfully!');
    console.log('Email:', adminEmail);
    console.log('Password:', adminPassword);
    console.log('Roll:', admin.roll);
    process.exit(0);
  } catch (err) {
    console.error('Failed to create admin:', err);
    process.exit(1);
  }
};

createAdmin();
