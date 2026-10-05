const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const config = require('./config/env');
const { logError, sanitizeErrorMessage, sendErrorResponse } = require('./utils/errorHandler');
const { disableBrowserCaching } = require('./services/browserCache.service');
const User = require('./models/User');
const { AUTH_COOKIE_NAME } = require('./utils/authCookie');

const app = express();
app.set('trust proxy', config.trustProxy);
const REQUEST_BODY_LIMIT = config.requestBodyLimit;
const backupRoutes = require('./routes/backups');
const allowedOrigins = new Set(config.cors.origins);

const isAllowedOrigin = (origin, req) => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  return origin === `${req.protocol}://${req.get('host')}`;
};

const corsOptions = {
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: config.cors.credentials
};

// Middleware
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
app.use(cookieParser());
app.use(cors(corsOptions));
app.use('/api', (req, res, next) => {
  disableBrowserCaching(res);
  next();
});
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') && !isAllowedOrigin(req.get('origin'), req)) {
    return res.status(403).json({ message: 'Origin not allowed' });
  }

  if (!req.get('origin') && req.get('sec-fetch-site') === 'cross-site' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return res.status(403).json({ message: 'Cross-site request not allowed' });
  }

  return next();
});

// Routes accept authentication only from the HttpOnly cookie. Never trust a
// browser-supplied Authorization header; existing route middleware consumes
// this server-generated header after validating the cookie session.
app.use(async (req, res, next) => {
  delete req.headers.authorization;
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const userId = decoded?.user?.id;
    const sessionId = decoded?.user?.sessionId;
    if (!userId || !sessionId) return next();

    const user = await User.findById(userId).select('isActive loginHistory');
    const activeSession = Array.isArray(user?.loginHistory) && user.loginHistory.some((entry) =>
      entry?.sessionId === sessionId && !entry?.logoutTime
    );
    if (user && user.isActive !== false && activeSession) {
      req.headers.authorization = `Bearer ${token}`;
    }
  } catch {
    // Protected route middleware will return 401 when no valid cookie exists.
  }

  return next();
});

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && typeof body.message === 'string') {
      const statusCode = typeof res.statusCode === 'number' ? res.statusCode : 500;
      const shouldSanitize = statusCode >= 500 || /at\s+|\/Users\//.test(body.message) || /\/Applications\//.test(body.message) || /mongodb|mongoose|mongo|e11000|duplicate key|collection/i.test(body.message);
      const safeMessage = sanitizeErrorMessage(body.message, 'Something went wrong. Please try again later.');

      if (shouldSanitize && body.message !== safeMessage) {
        logError('api.response', body.message);
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
app.use('/api/products', require('./routes/products'));
app.use('/api/vendor-custom-fields', require('./routes/vendorCustomFields'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/purchase-invoices', require('./routes/purchaseInvoices'));
app.use('/api/purchase-payments', require('./routes/purchasePayments'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/users', require('./routes/users'));
app.use('/api/backups', backupRoutes);
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
let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

const connectToDatabase = async () => {
  config.validateDatabase();
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(config.database.uri).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
};

if (require.main === module) {
  config.validateListener();
  app.listen(config.port, () => console.log(`Server running on port ${config.port}`));
  connectToDatabase()
    .then(async () => {
      console.log('Connected to MongoDB');
      backupRoutes.startBackupScheduler?.();
      try {
        const Payment = require('./models/SalePayment');
        await Payment.updateMany(
          { unappliedAmount: { $exists: true } },
          { $unset: { unappliedAmount: '' } }
        );
      } catch (err) {
        logError('startup.cleanup', err);
      }
    })
    .catch(err => logError('startup.mongodb', err));
}

module.exports = { app, connectToDatabase };
