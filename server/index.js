const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/purchase-invoices', require('./routes/purchaseInvoices'));
app.use('/api/purchase-payments', require('./routes/purchasePayments'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/users', require('./routes/users'));

app.use('/api', (req, res) => {
  res.status(404).json({ message: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error', err);
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: status >= 500 ? 'Internal server error' : err.message || 'Request failed'
  });
});

// MongoDB Connection
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/goldflow';

let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

const connectToDatabase = async () => {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
};

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  connectToDatabase()
    .then(async () => {
      console.log('Connected to MongoDB');
      try {
        const Payment = require('./models/Payment');
        await Payment.updateMany(
          { unappliedAmount: { $exists: true } },
          { $unset: { unappliedAmount: '' } }
        );
      } catch (err) {
        console.error('Could not cleanup unappliedAmount field', err);
      }
    })
    .catch(err => console.error('Could not connect to MongoDB', err));
}

module.exports = { app, connectToDatabase };
