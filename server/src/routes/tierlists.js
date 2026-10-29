import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError, requireAuth } from '../auth.js';
import { DEFAULT_TIERS, parseTierlistZip } from '../importZip.js';
import { compareResults, summarize } from '../stats.js';

export const tierlistRouter = Router();
tierlistRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
});

// ── helpers ─────────────────────────────────────────────────────────────

const VISIBILITY = ['always', 'after_vote', 'after_close'];

function getTierlist(id) {
  const list = db.prepare('SELECT * FROM tierlists WHERE id = ?').get(Number(id));
  if (!list) throw new HttpError(404, 'Tierlist nicht gefunden');
  return list;
}

const canManage = (user, list) => !!user.is_admin || list.owner_id === user.id;

function requireManage(user, list) {
  if (!canManage(user, list)) throw new HttpError(403, 'Nur Ersteller:in oder Admins dürfen das');
}

function canSeeResults(user, list) {
  if (canManage(user, list) || list.status === 'closed' || list.results_visibility === 'always') return true;
  if (list.results_visibility === 'after_close') return false;
  return !!db
    .prepare('SELECT 1 FROM votes v JOIN items i ON i.id = v.item_id WHERE i.tierlist_id = ? AND v.user_id = ? LIMIT 1')
    .get(list.id, user.id);
}

const imageSrc = (image) => (!image ? null : /^https?:\/\//i.test(image) ? image : `/uploads/${image}`);

const toItem = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  image: imageSrc(row.image),
  extra: JSON.parse(row.extra || '{}'),
});

const toTier = (row) => ({ id: row.id, name: row.name, color: row.color, position: row.position });

const owner = (list) => {
  const u = list.owner_id ? db.prepare('SELECT id, display_name, avatar_url FROM users WHERE id = ?').get(list.owner_id) : null;
  return u ? { id: u.id, name: u.display_name, avatarUrl: u.avatar_url } : null;
};

/** Writes parsed zip items into a tierlist (inside the caller's transaction) and stores their images. */
function insertItems(tierlistId, items) {
  const dir = path.join(config.uploadDir, String(tierlistId));
  fs.mkdirSync(dir, { recursive: true });
  const { maxPos } = db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM items WHERE tierlist_id = ?').get(tierlistId);
  const insert = db.prepare('INSERT INTO items (tierlist_id, position, name, description, image, extra) VALUES (?, ?, ?, ?, ?, ?)');
  const setImage = db.prepare('UPDATE items SET image = ? WHERE id = ?');
  items.forEach((item, i) => {
    const id = insert.run(tierlistId, maxPos + 1 + i, item.name, item.description, item.imageUrl ?? null, JSON.stringify(item.extra)).lastInsertRowid;
    if (item.image) {
      const file = `${id}${item.image.ext}`;
      fs.writeFileSync(path.join(dir, file), item.image.data);
      setImage.run(`${tierlistId}/${file}`, id);
    }
  });
}

function removeImageFile(image) {
  if (!image || /^https?:\/\//i.test(image)) return;
  fs.rm(path.join(config.uploadDir, image), { force: true }, () => {});
}

// ── boards ──────────────────────────────────────────────────────────────

tierlistRouter.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, u.display_name AS owner_name, u.avatar_url AS owner_avatar,
         (SELECT COUNT(*) FROM items i WHERE i.tierlist_id = t.id) AS item_count,
         (SELECT COUNT(DISTINCT v.user_id) FROM votes v JOIN items i ON i.id = v.item_id WHERE i.tierlist_id = t.id) AS voter_count,
         (SELECT COUNT(*) FROM votes v JOIN items i ON i.id = v.item_id WHERE i.tierlist_id = t.id AND v.user_id = ?) AS my_vote_count,
         (SELECT image FROM items i WHERE i.tierlist_id = t.id AND i.image IS NOT NULL ORDER BY position LIMIT 1) AS cover
       FROM tierlists t LEFT JOIN users u ON u.id = t.owner_id
       ORDER BY t.created_at DESC, t.id DESC`,
    )
    .all(req.user.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      createdAt: r.created_at,
      owner: r.owner_id ? { id: r.owner_id, name: r.owner_name, avatarUrl: r.owner_avatar } : null,
      itemCount: r.item_count,
      voterCount: r.voter_count,
      myVoteCount: r.my_vote_count,
      cover: imageSrc(r.cover),
    })),
  );
});

tierlistRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'Bitte eine ZIP-Datei hochladen');
  const { meta, items } = parseTierlistZip(req.file.buffer);
  const title = String(req.body.title || meta.title || path.parse(req.file.originalname).name || 'Neue Tierlist').trim().slice(0, 120);
  const description = String(req.body.description || meta.description || '').slice(0, 5000);
  const tiers = meta.tiers ?? DEFAULT_TIERS;

  const id = db.transaction(() => {
    const listId = db
      .prepare('INSERT INTO tierlists (title, description, owner_id) VALUES (?, ?, ?)')
      .run(title, description, req.user.id).lastInsertRowid;
    const insertTier = db.prepare('INSERT INTO tiers (tierlist_id, position, name, color) VALUES (?, ?, ?, ?)');
    tiers.forEach((t, i) => insertTier.run(listId, i, t.name, t.color));
    insertItems(listId, items);
    return listId;
  })();
  res.status(201).json({ id, itemCount: items.length });
});

tierlistRouter.get('/:id', (req, res) => {
  const list = getTierlist(req.params.id);
  const tiers = db.prepare('SELECT * FROM tiers WHERE tierlist_id = ? ORDER BY position').all(list.id).map(toTier);
  const items = db.prepare('SELECT * FROM items WHERE tierlist_id = ? ORDER BY position, id').all(list.id).map(toItem);
  const myVotes = Object.fromEntries(
    db
      .prepare('SELECT v.item_id, v.tier_id FROM votes v JOIN items i ON i.id = v.item_id WHERE i.tierlist_id = ? AND v.user_id = ?')
      .all(list.id, req.user.id)
      .map((v) => [v.item_id, v.tier_id]),
  );
  const { voters } = db
    .prepare('SELECT COUNT(DISTINCT v.user_id) AS voters FROM votes v JOIN items i ON i.id = v.item_id WHERE i.tierlist_id = ?')
    .get(list.id);
  res.json({
    id: list.id,
    title: list.title,
    description: list.description,
    status: list.status,
    resultsVisibility: list.results_visibility,
    createdAt: list.created_at,
    owner: owner(list),
    canManage: canManage(req.user, list),
    canSeeResults: canSeeResults(req.user, list),
    voterCount: voters,
    tiers,
    items,
    myVotes,
  });
});

tierlistRouter.patch('/:id', (req, res) => {
  const list = getTierlist(req.params.id);
  requireManage(req.user, list);
  const { title, description, status, resultsVisibility } = req.body ?? {};
  if (title !== undefined && !String(title).trim()) throw new HttpError(400, 'Titel darf nicht leer sein');
  if (status !== undefined && !['open', 'closed'].includes(status)) throw new HttpError(400, 'Ungültiger Status');
  if (resultsVisibility !== undefined && !VISIBILITY.includes(resultsVisibility)) throw new HttpError(400, 'Ungültige Sichtbarkeit');
  db.prepare(
    `UPDATE tierlists SET title = COALESCE(?, title), description = COALESCE(?, description),
       status = COALESCE(?, status), results_visibility = COALESCE(?, results_visibility) WHERE id = ?`,
  ).run(
    title !== undefined ? String(title).trim().slice(0, 120) : null,
    description !== undefined ? String(description).slice(0, 5000) : null,
    status ?? null,
    resultsVisibility ?? null,
    list.id,
  );
  res.json({ ok: true });
});

tierlistRouter.delete('/:id', (req, res) => {
  const list = getTierlist(req.params.id);
  requireManage(req.user, list);
  db.prepare('DELETE FROM tierlists WHERE id = ?').run(list.id);
  fs.rm(path.join(config.uploadDir, String(list.id)), { recursive: true, force: true }, () => {});
  res.json({ ok: true });
});

/** Replaces the tier set. Tiers keep their id when sent with one; removed tiers drop their votes. */
tierlistRouter.put('/:id/tiers', (req, res) => {
  const list = getTierlist(req.params.id);
  requireManage(req.user, list);
  const tiers = req.body?.tiers;
  if (!Array.isArray(tiers) || tiers.length < 2 || tiers.length > 20) throw new HttpError(400, '2 bis 20 Tiers erforderlich');
  for (const t of tiers) {
    if (!String(t?.name ?? '').trim()) throw new HttpError(400, 'Jeder Tier braucht einen Namen');
    if (!/^#[0-9a-f]{3,8}$/i.test(t?.color ?? '')) throw new HttpError(400, 'Ungültige Farbe');
  }
  db.transaction(() => {
    const existing = new Set(db.prepare('SELECT id FROM tiers WHERE tierlist_id = ?').all(list.id).map((t) => t.id));
    const keep = new Set(tiers.filter((t) => existing.has(t.id)).map((t) => t.id));
    for (const id of existing) if (!keep.has(id)) db.prepare('DELETE FROM tiers WHERE id = ?').run(id);
    tiers.forEach((t, i) => {
      const name = String(t.name).trim().slice(0, 40);
      if (keep.has(t.id)) db.prepare('UPDATE tiers SET position = ?, name = ?, color = ? WHERE id = ?').run(i, name, t.color, t.id);
      else db.prepare('INSERT INTO tiers (tierlist_id, position, name, color) VALUES (?, ?, ?, ?)').run(list.id, i, name, t.color);
    });
  })();
  res.json({ ok: true });
});

// ── items ───────────────────────────────────────────────────────────────

tierlistRouter.post('/:id/items/import', upload.single('file'), (req, res) => {
  const list = getTierlist(req.params.id);
  requireManage(req.user, list);
  if (!req.file) throw new HttpError(400, 'Bitte eine ZIP-Datei hochladen');
  const { items } = parseTierlistZip(req.file.buffer);
  db.transaction(() => insertItems(list.id, items))();
  res.status(201).json({ itemCount: items.length });
});

function getItem(listId, itemId) {
  const item = db.prepare('SELECT * FROM items WHERE id = ? AND tierlist_id = ?').get(Number(itemId), listId);
  if (!item) throw new HttpError(404, 'Eintrag nicht gefunden');
  return item;
}

tierlistRouter.patch('/:id/items/:itemId', (req, res) => {
  const list = getTierlist(req.params.id);
  requireManage(req.user, list);
  const item = getItem(list.id, req.params.itemId);
  const { name, description } = req.body ?? {};
  if (name !== undefined && !String(name).trim()) throw new HttpError(400, 'Name darf nicht leer sein');
  db.prepare('UPDATE items SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?').run(
    name !== undefined ? String(name).trim().slice(0, 200) : null,
    description !== undefined ? String(description).slice(0, 5000) : null,
    item.id,
  );
  res.json(toItem(db.prepare('SELECT * FROM items WHERE id = ?').get(item.id)));
});

tierlistRouter.delete('/:id/items/:itemId', (req, res) => {
  const list = getTierlist(req.params.id);
  requireManage(req.user, list);
  const item = getItem(list.id, req.params.itemId);
  db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
  removeImageFile(item.image);
  res.json({ ok: true });
});

// ── votes ───────────────────────────────────────────────────────────────

tierlistRouter.put('/:id/votes/:itemId', (req, res) => {
  const list = getTierlist(req.params.id);
  if (list.status !== 'open') throw new HttpError(409, 'Die Abstimmung ist geschlossen');
  const item = getItem(list.id, req.params.itemId);
  const tierId = req.body?.tierId;
  if (tierId === null || tierId === undefined) {
    db.prepare('DELETE FROM votes WHERE user_id = ? AND item_id = ?').run(req.user.id, item.id);
    return res.json({ ok: true });
  }
  const tier = db.prepare('SELECT id FROM tiers WHERE id = ? AND tierlist_id = ?').get(Number(tierId), list.id);
  if (!tier) throw new HttpError(400, 'Ungültiger Tier');
  db.prepare(
    `INSERT INTO votes (user_id, item_id, tier_id) VALUES (?, ?, ?)
     ON CONFLICT (user_id, item_id) DO UPDATE SET tier_id = excluded.tier_id, updated_at = datetime('now')`,
  ).run(req.user.id, item.id, tier.id);
  res.json({ ok: true });
});

tierlistRouter.delete('/:id/votes', (req, res) => {
  const list = getTierlist(req.params.id);
  if (list.status !== 'open') throw new HttpError(409, 'Die Abstimmung ist geschlossen');
  db.prepare('DELETE FROM votes WHERE user_id = ? AND item_id IN (SELECT id FROM items WHERE tierlist_id = ?)').run(req.user.id, list.id);
  res.json({ ok: true });
});

// ── results ─────────────────────────────────────────────────────────────

export function computeResults(listId) {
  const tiers = db.prepare('SELECT * FROM tiers WHERE tierlist_id = ? ORDER BY position').all(listId).map(toTier);
  const items = db.prepare('SELECT * FROM items WHERE tierlist_id = ? ORDER BY position, id').all(listId).map(toItem);
  const votes = db
    .prepare(
      `SELECT v.item_id, v.user_id, t.position FROM votes v
       JOIN tiers t ON t.id = v.tier_id JOIN items i ON i.id = v.item_id WHERE i.tierlist_id = ?`,
    )
    .all(listId);

  const byItem = new Map(items.map((i) => [i.id, []]));
  for (const v of votes) byItem.get(v.item_id)?.push(v.position);

  const results = items.map((item) => ({ ...item, ...summarize(tiers.length, byItem.get(item.id)) }));
  const rows = tiers.map((tier) => ({
    ...tier,
    items: results.filter((r) => r.position === tier.position).sort(compareResults),
  }));
  const unrated = results.filter((r) => r.position === null);
  const ranking = results.filter((r) => r.position !== null).sort(compareResults);

  const voterIds = [...new Set(votes.map((v) => v.user_id))];
  const voters = voterIds.length
    ? db
        .prepare(`SELECT id, display_name, avatar_url FROM users WHERE id IN (${voterIds.map(() => '?').join(',')}) ORDER BY display_name`)
        .all(...voterIds)
        .map((u) => ({
          id: u.id,
          name: u.display_name,
          avatarUrl: u.avatar_url,
          voteCount: votes.filter((v) => v.user_id === u.id).length,
        }))
    : [];

  return { tiers: rows, unrated, ranking, voters, totalVotes: votes.length };
}

tierlistRouter.get('/:id/results', (req, res) => {
  const list = getTierlist(req.params.id);
  if (!canSeeResults(req.user, list)) {
    throw new HttpError(403, list.results_visibility === 'after_close' ? 'Ergebnisse sind erst nach Abschluss sichtbar' : 'Stimme zuerst ab, um die Ergebnisse zu sehen');
  }
  res.json(computeResults(list.id));
});

tierlistRouter.get('/:id/results.csv', (req, res) => {
  const list = getTierlist(req.params.id);
  if (!canSeeResults(req.user, list)) throw new HttpError(403, 'Keine Berechtigung');
  const { tiers, unrated, ranking } = computeResults(list.id);
  const tierNames = tiers.map((t) => t.name);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const fmt = (n) => (n === null ? '' : String(Math.round(n * 100) / 100).replace('.', ','));
  const lines = [
    ['Rang', 'Name', 'Tier', 'Stimmen', 'Median', 'Mittelwert', 'Std.-Abw.', ...tierNames.map((n) => `Stimmen ${n}`)].map(esc).join(';'),
    ...[...ranking, ...unrated].map((r, i) =>
      [
        r.position === null ? '' : i + 1,
        r.name,
        r.position === null ? '' : tierNames[r.position],
        r.votes,
        fmt(r.median === null ? null : r.median + 1),
        fmt(r.mean === null ? null : r.mean + 1),
        fmt(r.stddev),
        ...r.distribution,
      ]
        .map(esc)
        .join(';'),
    ),
  ];
  const filename = `${list.title.replace(/[^\p{L}\p{N}_-]+/gu, '_')}_ergebnis.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send('﻿' + lines.join('\r\n'));
});
