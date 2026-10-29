import crypto from 'node:crypto';
import { Router } from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import {
  HttpError,
  createSession,
  destroySession,
  fetchGoogleProfile,
  googleAuthorizeUrl,
  hashPassword,
  loginRateLimit,
  publicUser,
  requireAuth,
  upsertGoogleUser,
  validatePassword,
  validateUsername,
  verifyPassword,
} from '../auth.js';

export const authRouter = Router();

const STATE_COOKIE = 'tm_oauth_state';
const NEXT_COOKIE = 'tm_oauth_next';

/** Only same-origin paths, so the login can't be abused as an open redirect. */
export function safeNext(value) {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/';
}

authRouter.get('/config', (_req, res) => {
  res.json({
    googleAuth: config.googleAuth,
    passwordAuth: config.passwordAuth,
    allowRegistration: config.passwordAuth && config.allowRegistration,
  });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

// ── Google ──────────────────────────────────────────────────────────────

authRouter.get('/google', (req, res) => {
  if (!config.googleAuth) throw new HttpError(404, 'Google-Login ist nicht konfiguriert');
  const state = crypto.randomBytes(16).toString('base64url');
  const cookie = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 10 * 60_000,
    path: '/api/auth/google',
  };
  res.cookie(STATE_COOKIE, state, cookie);
  res.cookie(NEXT_COOKIE, safeNext(req.query.next), cookie);
  res.redirect(googleAuthorizeUrl(state));
});

authRouter.get('/google/callback', async (req, res) => {
  const next = safeNext(req.cookies?.[NEXT_COOKIE]);
  const fail = (msg) =>
    res.redirect(`/login?error=${encodeURIComponent(msg)}${next === '/' ? '' : `&next=${encodeURIComponent(next)}`}`);
  if (!config.googleAuth) return fail('Google-Login ist nicht konfiguriert');

  const expected = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: '/api/auth/google' });
  res.clearCookie(NEXT_COOKIE, { path: '/api/auth/google' });
  if (req.query.error) return fail('Google-Anmeldung abgebrochen');
  if (!expected || expected !== req.query.state || typeof req.query.code !== 'string') {
    return fail('Ungültige Anmeldeanfrage, bitte erneut versuchen');
  }

  try {
    const profile = await fetchGoogleProfile(req.query.code);
    const userId = upsertGoogleUser(profile);
    createSession(res, userId);
    res.redirect(next);
  } catch (err) {
    console.error('Google login failed:', err.message);
    fail(err instanceof HttpError ? err.message : 'Google-Anmeldung fehlgeschlagen');
  }
});

// ── Username + password ─────────────────────────────────────────────────

function requirePasswordAuth(_req, _res, next) {
  if (!config.passwordAuth) return next(new HttpError(404, 'Passwort-Login ist deaktiviert'));
  next();
}

authRouter.post('/login', requirePasswordAuth, loginRateLimit, async (req, res) => {
  const { username, password } = req.body ?? {};
  const user =
    typeof username === 'string'
      ? db.prepare('SELECT * FROM users WHERE username = ? AND password_hash IS NOT NULL').get(username.trim())
      : null;
  if (!user || typeof password !== 'string' || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, 'Benutzername oder Passwort falsch');
  }
  createSession(res, user.id);
  res.json({ user: publicUser(user) });
});

authRouter.post('/register', requirePasswordAuth, loginRateLimit, async (req, res) => {
  if (!config.allowRegistration) throw new HttpError(403, 'Registrierung ist deaktiviert');
  const username = String(req.body?.username ?? '').trim();
  const { password } = req.body ?? {};
  validateUsername(username);
  validatePassword(password);
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    throw new HttpError(409, 'Benutzername ist bereits vergeben');
  }
  const id = db
    .prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)')
    .run(username, await hashPassword(password), username).lastInsertRowid;
  createSession(res, id);
  res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});

authRouter.post('/password', requirePasswordAuth, requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!req.user.password_hash) throw new HttpError(400, 'Dieses Konto nutzt Google-Login');
  if (!(await verifyPassword(String(currentPassword ?? ''), req.user.password_hash))) {
    throw new HttpError(401, 'Aktuelles Passwort ist falsch');
  }
  validatePassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(newPassword), req.user.id);
  res.json({ ok: true });
});
