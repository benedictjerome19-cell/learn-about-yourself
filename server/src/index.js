import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { FILE } from './db.js';
import { auth } from './middleware/auth.js';
import { mediaFile } from './services/journal.js';
import { pruneSessions, requireAppHeader, securityHeaders } from './security.js';
import authRoutes     from './routes/auth.js';
import entryRoutes    from './routes/entries.js';
import reminderRoutes from './routes/reminders.js';
import reportRoutes   from './routes/reports.js';
import streakRoutes   from './routes/streaks.js';
import accountRoutes  from './routes/account.js';
import adminRoutes    from './routes/admin.js';
import { startAlarmScheduler } from './services/alarms.js';

const PORT = Number(process.env.PORT) || 4000;
// Loopback only by default: a personal journal should not be reachable from the network
// unless you deliberately set HOST (and put it behind HTTPS).
const HOST = process.env.HOST || '127.0.0.1';
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

const app = express();
app.disable('x-powered-by');
// Behind a host's HTTPS proxy: "1" = trust one hop (so req.secure / req.ip are real).
// Env vars are strings, and Express reads a string as an IP list, so convert numbers/booleans.
const tp = process.env.TRUST_PROXY;
if (tp) app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp === 'true' ? true : tp);
app.use(securityHeaders);
app.use('/api', express.json({ limit: '1mb' }), requireAppHeader);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth',      authRoutes);
app.use('/api/entries',   auth, entryRoutes);
app.use('/api/reminders', auth, reminderRoutes);
app.use('/api/reports',   auth, reportRoutes);
app.use('/api/streaks',   auth, streakRoutes);
app.use('/api/account',   auth, accountRoutes);

// Media playback is authorised by the session cookie, which <audio>/<video> send automatically.
app.get('/api/media/:id', auth, (req, res) => {
  const file = mediaFile(req.user, req.params.id);
  file ? res.sendFile(file) : res.status(404).json({ error: 'Recording not found.' });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

if (process.env.ENABLE_ADMIN === '1') app.use('/admin', adminRoutes);

// Production: serve the built client from the same origin.
if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  console.error('[error]', req.method, req.path, err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

pruneSessions();
setInterval(pruneSessions, 3600_000).unref();

app.listen(PORT, HOST, () => {
  console.log(`🚀 JournalMind API on http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}  (data: ${FILE}, ${db.entries.length} entries)`);
  startAlarmScheduler();
});
