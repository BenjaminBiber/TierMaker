import { Router } from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError, hashPassword, requireAdmin, validatePassword, validateUsername } from '../auth.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const toUser = (u) => ({
  id: u.id,
  name: u.display_name,
  username: u.username,
  email: u.email,
  avatarUrl: u.avatar_url,
  isAdmin: !!u.is_admin,
  provider: u.google_sub ? 'google' : 'password',
  createdAt: u.created_at,
  voteCount: u.vote_count,
  boardCount: u.board_count,
});

adminRouter.get('/users', (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.*,
         (SELECT COUNT(*) FROM votes v WHERE v.user_id = u.id) AS vote_count,
         (SELECT COUNT(*) FROM tierlists t WHERE t.owner_id = u.id) AS board_count
       FROM users u ORDER BY u.display_name COLLATE NOCASE`,
    )
    .all();
  res.json(users.map(toUser));
});

adminRouter.post('/users', async (req, res) => {
  if (!config.passwordAuth) throw new HttpError(400, 'Passwort-Login ist deaktiviert');
  const username = String(req.body?.username ?? '').trim();
  const { password, isAdmin } = req.body ?? {};
  validateUsername(username);
  validatePassword(password);
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Benutzername ist bereits vergeben');
  const id = db
    .prepare('INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?)')
    .run(username, await hashPassword(password), username, isAdmin ? 1 : 0).lastInsertRowid;
  res.status(201).json({ id });
});

adminRouter.patch('/users/:id', async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!user) throw new HttpError(404, 'Benutzer nicht gefunden');
  const { isAdmin, password } = req.body ?? {};
  if (isAdmin !== undefined) {
    if (user.id === req.user.id && !isAdmin) throw new HttpError(400, 'Du kannst dir selbst keine Admin-Rechte entziehen');
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, user.id);
  }
  if (password !== undefined) {
    if (!user.password_hash) throw new HttpError(400, 'Google-Konten haben kein Passwort');
    validatePassword(password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  }
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw new HttpError(400, 'Du kannst dich nicht selbst löschen');
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (!result.changes) throw new HttpError(404, 'Benutzer nicht gefunden');
  res.json({ ok: true });
});
