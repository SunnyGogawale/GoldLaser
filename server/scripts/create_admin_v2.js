const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/env');

const createAdmin = async () => {
  try {
    const { email, password, fullName } = config.adminBootstrap;
    if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be configured');
    config.validateDatabase();
    await mongoose.connect(config.database.uri);
    console.log('Connected to MongoDB...');

    const User = require('../models/User');
    await User.deleteOne({ email });
    console.log('Old admin deleted (if existed).');

    const salt = await bcrypt.genSalt(config.auth.bcryptSaltRounds);
    const hashedPassword = await bcrypt.hash(password, salt);

    const admin = new User({
      fullName,
      email,
      password: hashedPassword,
      roll: 'admin'
    });

    await admin.save();
    console.log('Admin account created successfully.');
    process.exit(0);
  } catch {
    console.error('Failed to create admin account.');
    process.exit(1);
  }
};

createAdmin();
