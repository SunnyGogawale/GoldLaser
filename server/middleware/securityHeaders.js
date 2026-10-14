const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "frame-src 'self' blob:",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "upgrade-insecure-requests"
].join('; ');

const securityHeaders = (req, res, next) => {
  res.set({
    'Content-Security-Policy-Report-Only': CONTENT_SECURITY_POLICY,
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
  });

  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.set('Strict-Transport-Security', 'max-age=31536000');
  }

  return next();
};

module.exports = { CONTENT_SECURITY_POLICY, securityHeaders };
