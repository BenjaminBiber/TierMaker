import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT UNIQUE COLLATE NOCASE, -- only for password login
  password_hash TEXT,
  google_sub    TEXT UNIQUE,                -- only for Google login
  email         TEXT,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tierlists (
  id                 INTEGER PRIMARY KEY,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  owner_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  results_visibility TEXT NOT NULL DEFAULT 'after_vote'
                     CHECK (results_visibility IN ('always', 'after_vote', 'after_close')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tiers (
  id          INTEGER PRIMARY KEY,
  tierlist_id INTEGER NOT NULL REFERENCES tierlists(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY,
  tierlist_id INTEGER NOT NULL REFERENCES tierlists(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image       TEXT,
  extra       TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS votes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tier_id    INTEGER NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_tiers_list ON tiers(tierlist_id);
CREATE INDEX IF NOT EXISTS idx_items_list ON items(tierlist_id);
CREATE INDEX IF NOT EXISTS idx_votes_item ON votes(item_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
