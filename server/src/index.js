import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { config } from './config.js';
import { HttpError, ensureAdmin, loadUser, requireAuth } from './auth.js';
import { authRouter } from './routes/auth.js';
import { tierlistRouter } from './routes/tierlists.js';
import { adminRouter } from './routes/admin.js';

await ensureAdmin();

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal');
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(loadUser);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/tierlists', tierlistRouter);
app.use('/api/admin', adminRouter);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Nicht gefunden')));

// Uploaded images are only visible to signed-in users
app.use(
  '/uploads',
  requireAuth,
  express.static(config.uploadDir, { maxAge: '7d', immutable: true, fallthrough: false }),
);

// Built React client (single page app)
if (config.staticDir && fs.existsSync(config.staticDir)) {
  app.use(express.static(config.staticDir, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(config.staticDir, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `Datei ist größer als ${config.maxUploadMb} MB` : err.message;
    return res.status(413).json({ error: msg });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Interner Serverfehler' : err.message });
});

app.listen(config.port, () => {
  console.log(`TierMaker läuft auf Port ${config.port} (${config.publicUrl})`);
  console.log(`  Google-Login: ${config.googleAuth ? 'aktiv' : 'aus'} · Passwort-Login: ${config.passwordAuth ? 'aktiv' : 'aus'}`);
});
