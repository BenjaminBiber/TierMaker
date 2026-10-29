import path from 'node:path';
import AdmZip from 'adm-zip';
import { HttpError } from './auth.js';
import { config } from './config.js';

export const DEFAULT_TIERS = [
  { name: 'S', color: '#ff7f7f' },
  { name: 'A', color: '#ffbf7f' },
  { name: 'B', color: '#ffdf7f' },
  { name: 'C', color: '#ffff7f' },
  { name: 'D', color: '#bfff7f' },
  { name: 'F', color: '#7fbfff' },
];
const FALLBACK_COLORS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fff7f', '#7fffff', '#7fbfff', '#bf7fff', '#ff7fbf'];

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp']);
const NAME_KEYS = ['name', 'title', 'label', 'titel'];
const DESC_KEYS = ['description', 'desc', 'text', 'beschreibung', 'info'];
const IMAGE_KEYS = ['image', 'img', 'file', 'filename', 'picture', 'bild', 'imageurl', 'image_url'];

/** Checks the magic bytes so only real raster images end up on disk. */
function sniffImage(buf) {
  const hex = buf.subarray(0, 12).toString('hex');
  if (hex.startsWith('89504e47')) return '.png';
  if (hex.startsWith('ffd8ff')) return '.jpg';
  if (hex.startsWith('47494638')) return '.gif';
  if (hex.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP') return '.webp';
  if (buf.subarray(4, 12).toString().startsWith('ftypavi')) return '.avif';
  if (hex.startsWith('424d')) return '.bmp';
  return null;
}

const norm = (p) => p.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
const stem = (p) => path.posix.basename(norm(p), path.posix.extname(p));
const prettify = (fileName) =>
  stem(fileName)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

function pick(obj, keys) {
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k.toLowerCase()) && v !== null && v !== undefined && v !== '') return [k, v];
  }
  return [null, undefined];
}

function parseTiers(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const tiers = raw.slice(0, 20).map((t, i) => {
    const name = typeof t === 'string' ? t : (t?.name ?? t?.label ?? `Tier ${i + 1}`);
    const color = typeof t === 'object' && /^#[0-9a-f]{3,8}$/i.test(t?.color ?? '') ? t.color : FALLBACK_COLORS[i % FALLBACK_COLORS.length];
    return { name: String(name).slice(0, 40), color };
  });
  return tiers;
}

/**
 * Parses an uploaded zip: one JSON file with metadata (optional) plus images.
 * Returns { meta, items } where every item has name/description/extra and either
 * image { data, ext } or imageUrl.
 */
export function parseTierlistZip(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new HttpError(400, 'Die Datei ist kein gültiges ZIP-Archiv');
  }

  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && !e.entryName.startsWith('__MACOSX/') && !path.posix.basename(e.entryName).startsWith('.'));

  const maxImage = config.maxImageMb * 1024 * 1024;
  let total = 0;
  for (const e of entries) {
    total += e.header.size;
    if (total > config.maxUploadMb * 1024 * 1024 * 3) throw new HttpError(413, 'Entpacktes Archiv ist zu groß');
  }

  // Metadata JSON: prefer well-known names, then the shallowest .json file
  const jsonEntries = entries
    .filter((e) => e.entryName.toLowerCase().endsWith('.json'))
    .sort((a, b) => {
      const rank = (e) => (/(^|\/)(tierlist|data|items|meta|index)\.json$/i.test(e.entryName) ? 0 : 1);
      return rank(a) - rank(b) || a.entryName.split('/').length - b.entryName.split('/').length;
    });

  let data = null;
  if (jsonEntries.length) {
    try {
      data = JSON.parse(jsonEntries[0].getData().toString('utf8').replace(/^﻿/, ''));
    } catch (err) {
      throw new HttpError(400, `${jsonEntries[0].entryName} ist kein gültiges JSON: ${err.message}`);
    }
  }

  const images = entries.filter((e) => IMAGE_EXT.has(path.posix.extname(e.entryName).toLowerCase()));
  const byPath = new Map();
  const byBase = new Map();
  const byStem = new Map();
  for (const e of images) {
    byPath.set(norm(e.entryName), e);
    byBase.set(path.posix.basename(norm(e.entryName)), e);
    if (!byStem.has(stem(e.entryName))) byStem.set(stem(e.entryName), e);
  }

  const used = new Set();
  const loadImage = (entry) => {
    if (entry.header.size > maxImage) throw new HttpError(413, `${entry.entryName} ist größer als ${config.maxImageMb} MB`);
    const buf = entry.getData();
    const ext = sniffImage(buf);
    if (!ext) throw new HttpError(400, `${entry.entryName} ist kein unterstütztes Bildformat`);
    used.add(entry);
    return { data: buf, ext };
  };

  const meta = { title: null, description: '', tiers: null };
  let rawItems = [];
  if (Array.isArray(data)) {
    rawItems = data;
  } else if (data && typeof data === 'object') {
    meta.title = typeof (data.title ?? data.name) === 'string' ? (data.title ?? data.name) : null;
    meta.description = typeof data.description === 'string' ? data.description : '';
    meta.tiers = parseTiers(data.tiers ?? data.ranks);
    rawItems = data.items ?? data.entries ?? data.eintraege ?? data.einträge ?? [];
    if (!Array.isArray(rawItems)) throw new HttpError(400, '"items" muss ein Array sein');
  }

  const items = [];
  for (const [i, raw] of rawItems.entries()) {
    const obj = typeof raw === 'string' ? { name: raw } : raw;
    if (!obj || typeof obj !== 'object') continue;

    const [nameKey, nameVal] = pick(obj, NAME_KEYS);
    const [descKey, descVal] = pick(obj, DESC_KEYS);
    const [imgKey, imgVal] = pick(obj, IMAGE_KEYS);

    const item = {
      name: String(nameVal ?? (imgVal ? prettify(String(imgVal)) : `Eintrag ${i + 1}`)).slice(0, 200),
      description: String(descVal ?? '').slice(0, 5000),
      extra: {},
    };
    for (const [k, v] of Object.entries(obj)) {
      if (k === nameKey || k === descKey || k === imgKey || v === null || v === undefined) continue;
      item.extra[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    }

    if (typeof imgVal === 'string' && /^https?:\/\//i.test(imgVal)) {
      item.imageUrl = imgVal;
    } else {
      const ref = typeof imgVal === 'string' ? imgVal : null;
      const entry = ref
        ? (byPath.get(norm(ref)) ?? byBase.get(path.posix.basename(norm(ref))) ?? byStem.get(stem(ref)))
        : byStem.get(stem(item.name));
      if (ref && !entry) throw new HttpError(400, `Bild "${ref}" für "${item.name}" nicht im ZIP gefunden`);
      if (entry) item.image = loadImage(entry);
    }
    items.push(item);
  }

  // Images that no JSON entry referenced become their own items
  for (const e of images) {
    if (used.has(e)) continue;
    items.push({ name: prettify(e.entryName), description: '', extra: {}, image: loadImage(e) });
  }

  if (items.length === 0) throw new HttpError(400, 'Im ZIP wurden weder Bilder noch Einträge gefunden');
  if (items.length > 2000) throw new HttpError(400, 'Maximal 2000 Einträge pro Tierlist');
  return { meta, items };
}
