const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { sanitizeErrorMessage, sendErrorResponse } = require('./utils/errorHandler');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const REQUEST_BODY_LIMIT = '200mb';

// Middleware
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
app.use(cors());

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && typeof body.message === 'string') {
      const statusCode = typeof res.statusCode === 'number' ? res.statusCode : 500;
      const shouldSanitize = statusCode >= 500 || /at\s+|\/Users\//.test(body.message) || /\/Applications\//.test(body.message) || /mongodb|mongoose|mongo|e11000|duplicate key|collection/i.test(body.message);
      const safeMessage = sanitizeErrorMessage(body.message, 'Something went wrong. Please try again later.');

      if (shouldSanitize && body.message !== safeMessage) {
        console.error(`[${req.method} ${req.originalUrl}]`, body.message);
      }

      return originalJson({ ...body, message: shouldSanitize ? safeMessage : body.message });
    }
    return originalJson(body);
  };
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/company-settings', require('./routes/companySettings'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/customer-custom-fields', require('./routes/customerCustomFields'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/vendor-custom-fields', require('./routes/vendorCustomFields'));
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
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    return sendErrorResponse(res, err, 'Something went wrong. Please try again later.', status, 'unhandled');
  }
  return res.status(status).json({ message: sanitizeErrorMessage(err.message || 'Request failed', 'Request failed') });
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
        const Payment = require('./models/SalePayment');
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
