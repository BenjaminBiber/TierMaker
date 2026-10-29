import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { config } from './config.js';

export const COOKIE_NAME = 'tm_session';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const hashPassword = (password) => bcrypt.hash(password, 11);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

export function validateUsername(username) {
  if (typeof username !== 'string' || !/^[\p{L}\p{N}_.-]{3,32}$/u.test(username)) {
    throw new HttpError(400, 'Benutzername: 3–32 Zeichen, nur Buchstaben, Zahlen, _ . -');
  }
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw new HttpError(400, 'Passwort muss mindestens 8 Zeichen lang sein');
  }
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.display_name,
    avatarUrl: user.avatar_url || null,
    isAdmin: !!user.is_admin,
    provider: user.google_sub ? 'google' : 'password',
  };
}

export function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expires.toISOString().replace('T', ' ').slice(0, 19),
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    expires,
    path: '/',
  });
}

export function destroySession(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

const sessionUser = db.prepare(`
  SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND s.expires_at > datetime('now')
`);

/** Attaches req.user when a valid session cookie is present. */
export function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  req.user = token ? sessionUser.get(token) ?? null : null;
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Nicht angemeldet'));
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Nicht angemeldet'));
  if (!req.user.is_admin) return next(new HttpError(403, 'Nur für Admins'));
  next();
}

/** Very small in-memory limiter against password guessing. */
const attempts = new Map();
export function loginRateLimit(req, _res, next) {
  const key = req.ip;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + 15 * 60_000 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 20) return next(new HttpError(429, 'Zu viele Versuche, bitte später erneut probieren'));
  next();
}

/**
 * Creates the initial password admin when password login is on and no local admin exists.
 * An explicitly set ADMIN_PASSWORD always wins, so it also resets a forgotten password.
 */
export async function ensureAdmin() {
  if (!config.passwordAuth) return;
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(config.adminUsername);
  if (existing) {
    if (!config.adminPassword) return;
    if (!(existing.password_hash && (await verifyPassword(config.adminPassword, existing.password_hash)))) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(config.adminPassword), existing.id);
      console.log(`Passwort von "${config.adminUsername}" aus ADMIN_PASSWORD übernommen`);
    }
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
    return;
  }
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users WHERE password_hash IS NOT NULL').get();
  if (n > 0 && !config.adminPassword) return;

  let password = config.adminPassword;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    console.log('──────────────────────────────────────────────');
    console.log(` Initialer Admin erstellt: ${config.adminUsername}`);
    console.log(` Passwort: ${password}`);
    console.log(' (Setze ADMIN_PASSWORD, um ein eigenes zu verwenden)');
    console.log('──────────────────────────────────────────────');
  }
  db.prepare(
    'INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, 1)',
  ).run(config.adminUsername, await hashPassword(password), config.adminUsername);
}

// ── Google OAuth (authorization code flow) ──────────────────────────────

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const googleRedirectUri = () => `${config.publicUrl}/api/auth/google/callback`;

export function googleAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  if (config.googleAllowedDomains.length === 1) params.set('hd', config.googleAllowedDomains[0]);
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function fetchGoogleProfile(code) {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new HttpError(502, `Google-Token-Austausch fehlgeschlagen (${tokenRes.status})`);
  const { access_token } = await tokenRes.json();

  const infoRes = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) throw new HttpError(502, `Google-Profil konnte nicht geladen werden (${infoRes.status})`);
  return infoRes.json(); // { sub, name, picture, email, email_verified, ... }
}

/** Creates or updates the local user for a Google profile; name and avatar follow Google on every login. */
export function upsertGoogleUser(profile) {
  const email = (profile.email || '').toLowerCase();
  if (config.googleAllowedDomains.length) {
    const domain = email.split('@')[1] || '';
    if (!profile.email_verified || !config.googleAllowedDomains.includes(domain)) {
      throw new HttpError(403, 'Dieses Google-Konto ist für diese Instanz nicht zugelassen');
    }
  }
  const name = profile.name || profile.given_name || email.split('@')[0] || 'Unbekannt';
  const isAdmin = profile.email_verified && config.adminEmails.includes(email) ? 1 : 0;

  const existing = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(profile.sub);
  if (existing) {
    db.prepare(
      'UPDATE users SET display_name = ?, avatar_url = ?, email = ?, is_admin = MAX(is_admin, ?) WHERE id = ?',
    ).run(name, profile.picture || null, email, isAdmin, existing.id);
    return existing.id;
  }
  return db
    .prepare('INSERT INTO users (google_sub, email, display_name, avatar_url, is_admin) VALUES (?, ?, ?, ?, ?)')
    .run(profile.sub, email, name, profile.picture || null, isAdmin).lastInsertRowid;
}
