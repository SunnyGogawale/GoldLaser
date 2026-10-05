const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const serverRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(serverRoot, '..');
const baseEnvPath = path.join(serverRoot, '.env');
const sharedBaseEnvPath = path.join(projectRoot, '.env');
const readEnvFile = (filePath) => fs.existsSync(filePath)
  ? dotenv.parse(fs.readFileSync(filePath))
  : {};
const baseEnv = { ...readEnvFile(baseEnvPath), ...readEnvFile(sharedBaseEnvPath) };
const nodeEnv = process.env.NODE_ENV || baseEnv.NODE_ENV || 'development';
const envFilePaths = [
  path.join(projectRoot, `.env.${nodeEnv}.local`),
  path.join(serverRoot, `.env.${nodeEnv}.local`),
  path.join(projectRoot, `.env.${nodeEnv}`),
  path.join(serverRoot, `.env.${nodeEnv}`),
  path.join(projectRoot, '.env.local'),
  path.join(serverRoot, '.env.local'),
  sharedBaseEnvPath,
  baseEnvPath
];

dotenv.config({ path: envFilePaths, quiet: true });
if (!process.env.NODE_ENV) process.env.NODE_ENV = nodeEnv;

const parseBoolean = (value, defaultValue) => {
  if (value === undefined || value === '') return defaultValue;
  return String(value).trim().toLowerCase() === 'true';
};

const parsePositiveInteger = (value, defaultValue) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
};

const parseTrustProxy = (value) => {
  if (value === undefined || value === '') return 1;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  const hops = Number.parseInt(normalized, 10);
  return Number.isInteger(hops) && hops >= 0 ? hops : normalized;
};

const cacheEnabled = parseBoolean(process.env.CACHE_ENABLED, true);
const redisUrl = process.env.REDIS_URL || '';
const redisCacheEnabled = parseBoolean(process.env.REDIS_CACHE_ENABLED, Boolean(redisUrl));
const cacheDefaultTtl = parsePositiveInteger(process.env.CACHE_DEFAULT_TTL, 120);
const getBackupNumber = (key, defaultValue) => parsePositiveInteger(process.env[key], defaultValue);

const config = {
  nodeEnv,
  port: Number.parseInt(process.env.PORT, 10),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '200mb',
  database: {
    uri: process.env.MONGODB_URI || '',
    name: process.env.MONGODB_DB_NAME || ''
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h'
  },
  auth: {
    bcryptSaltRounds: parsePositiveInteger(process.env.BCRYPT_SALT_ROUNDS, 10)
  },
  adminBootstrap: {
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
    fullName: process.env.ADMIN_FULL_NAME || 'System Administrator'
  },
  cors: {
    origins: String(process.env.CORS_ORIGINS || process.env.CLIENT_ORIGIN || process.env.FRONTEND_ORIGIN || '')
      .split(',').map((origin) => origin.trim()).filter(Boolean),
    credentials: parseBoolean(process.env.CORS_CREDENTIALS, true)
  },
  cookie: {
    name: process.env.AUTH_COOKIE_NAME || (nodeEnv === 'production' ? '__Host-goldflow_session' : 'goldflow_session'),
    domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    sameSite: String(process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase(),
    secure: nodeEnv === 'production' || parseBoolean(process.env.AUTH_COOKIE_SECURE, false),
    maxAgeMs: parsePositiveInteger(process.env.AUTH_COOKIE_MAX_AGE_MS, 60 * 60 * 1000),
    httpOnly: true
  },
  redis: {
    url: redisUrl,
    cacheEnabled: cacheEnabled && redisCacheEnabled
  },
  cache: {
    enabled: cacheEnabled,
    defaultTtlSeconds: cacheDefaultTtl,
    versionTtlSeconds: parsePositiveInteger(process.env.CACHE_VERSION_TTL, Math.max(cacheDefaultTtl * 10, 86400)),
    prefix: (process.env.CACHE_PREFIX || '').trim().replace(/:+$/, '')
  },
  backup: {
    get mongoDumpPath() { return process.env.MONGODUMP_PATH || ''; },
    get mongoRestorePath() { return process.env.MONGORESTORE_PATH || ''; },
    get storagePath() { return process.env.BACKUP_STORAGE_PATH || 'backups'; },
    get maxCount() { return getBackupNumber('BACKUP_MAX_COUNT', 25); },
    get retentionDays() { return getBackupNumber('BACKUP_RETENTION_DAYS', 8); },
    get keepLatestCount() { return getBackupNumber('BACKUP_KEEP_LATEST_COUNT', 10); },
    get intervalHours() { return getBackupNumber('BACKUP_INTERVAL_HOURS', 0); },
    get intervalMinutes() { return getBackupNumber('BACKUP_INTERVAL_MINUTES', 0); }
  },
  persistBackupSetting(key, value) {
    const allowedKeys = new Set([
      'BACKUP_KEEP_LATEST_COUNT',
      'BACKUP_INTERVAL_HOURS',
      'BACKUP_INTERVAL_MINUTES'
    ]);
    if (!allowedKeys.has(key)) throw new Error(`Unsupported runtime setting: ${key}`);

    const envFilePath = envFilePaths.find((candidate) => fs.existsSync(candidate)) || baseEnvPath;
    const contents = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : '';
    const keyPattern = new RegExp(`^${key}=.*$`, 'm');
    const nextContents = keyPattern.test(contents)
      ? contents.replace(keyPattern, `${key}=${value}`)
      : `${contents.trim() ? `${contents.trim()}\n` : ''}${key}=${value}\n`;

    fs.writeFileSync(envFilePath, nextContents);
    process.env[key] = String(value);
  },
  validateDatabase() {
    if (!config.database.uri) throw new Error('Missing required environment variable: MONGODB_URI');
  },
  validate() {
    const missing = [];
    if (!config.database.uri) missing.push('MONGODB_URI');
    if (!config.jwt.secret) missing.push('JWT_SECRET');
    if (config.redis.cacheEnabled && !config.redis.url) missing.push('REDIS_URL');
    if (missing.length) throw new Error(`Missing or invalid environment configuration: ${missing.join(', ')}`);
    if (!['development', 'production', 'test'].includes(config.nodeEnv)) {
      throw new Error('NODE_ENV must be development, test, or production');
    }
    if (!['strict', 'lax', 'none'].includes(config.cookie.sameSite)) {
      throw new Error('AUTH_COOKIE_SAME_SITE must be strict, lax, or none');
    }
    if (config.cors.credentials && config.cors.origins.includes('*')) {
      throw new Error('CORS_ORIGINS cannot contain * when CORS_CREDENTIALS=true');
    }
    if (config.cookie.name.startsWith('__Host-') && config.cookie.domain) {
      throw new Error('AUTH_COOKIE_DOMAIN must be empty when using a __Host- cookie name');
    }
    if (config.cookie.sameSite === 'none' && !config.cookie.secure) {
      throw new Error('AUTH_COOKIE_SECURE=true is required when AUTH_COOKIE_SAME_SITE=none');
    }
    if (config.nodeEnv === 'production' && config.jwt.secret.length < 32) {
      throw new Error('JWT_SECRET must contain at least 32 characters in production');
    }
  },
  validateListener() {
    config.validate();
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
      throw new Error('PORT must be an integer between 1 and 65535');
    }
  }
};

module.exports = config;