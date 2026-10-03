const ONE_HOUR_MS = 60 * 60 * 1000;
const sameSiteValues = new Set(['strict', 'lax', 'none']);

const configuredSameSite = String(process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase();
const sameSite = sameSiteValues.has(configuredSameSite) ? configuredSameSite : 'lax';
const secure = process.env.NODE_ENV === 'production' || process.env.AUTH_COOKIE_SECURE === 'true' || sameSite === 'none';

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || (
  process.env.NODE_ENV === 'production' ? '__Host-goldflow_session' : 'goldflow_session'
);

const getAuthCookieOptions = () => ({
  httpOnly: true,
  secure,
  sameSite,
  path: '/',
  maxAge: ONE_HOUR_MS
});

const setAuthCookie = (res, token) => {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
  res.setHeader('Cache-Control', 'no-store');
};

const clearAuthCookie = (res) => {
  const { maxAge, ...options } = getAuthCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, options);
  res.setHeader('Cache-Control', 'no-store');
};

module.exports = { AUTH_COOKIE_NAME, getAuthCookieOptions, setAuthCookie, clearAuthCookie };