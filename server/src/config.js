import path from 'node:path';

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const list = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const dataDir = path.resolve(process.env.DATA_DIR || './data');
const publicUrl = (process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/+$/, '');

export const config = {
  port: Number(process.env.PORT) || 3000,
  publicUrl,
  dataDir,
  dbPath: path.join(dataDir, 'tiermaker.db'),
  uploadDir: path.join(dataDir, 'uploads'),
  staticDir: process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null,

  // Google OAuth – enabled as soon as client id + secret are set
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleAllowedDomains: list(process.env.GOOGLE_ALLOWED_DOMAINS),
  adminEmails: list(process.env.ADMIN_EMAILS),

  // Username + password login
  passwordAuth: bool(process.env.PASSWORD_AUTH, true),
  allowRegistration: bool(process.env.ALLOW_REGISTRATION, true),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',

  cookieSecure: bool(process.env.COOKIE_SECURE, publicUrl.startsWith('https://')),
  sessionDays: Number(process.env.SESSION_DAYS) || 30,
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 200,
  maxImageMb: Number(process.env.MAX_IMAGE_MB) || 20,
};

config.googleAuth = !!(config.googleClientId && config.googleClientSecret);
