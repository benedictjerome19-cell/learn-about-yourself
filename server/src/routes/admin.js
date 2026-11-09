import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

// Dev-only database viewer: http://localhost:4000/admin
// It has no login and shows every user's entries, so it is only mounted when
// ENABLE_ADMIN=1 is set, and only answers requests from this machine.
const r = Router();
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.join(dir, 'admin.html');
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
// A local reverse proxy (tailscale serve, nginx…) also connects from loopback, so any
// forwarded request is treated as remote.
const PROXIED = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'tailscale-user-login'];
const isLocal = (req) => LOOPBACK.has(req.socket.remoteAddress) && !PROXIED.some((h) => req.headers[h]);
r.use((req, res, next) => (isLocal(req) ? next() : res.sendStatus(404)));
r.get('/', (req, res) => res.sendFile(page));
r.get('/admin.js', (req, res) => res.sendFile(path.join(dir, 'admin.js')));
r.get('/data', (req, res) => res.json({
  users: db.users.map(({ passwordHash, passkeys, ...u }) => ({ ...u, password: !!passwordHash, passkeys: (passkeys || []).length })),
  entries: db.entries, scores: db.scores, reminders: db.reminders,
}));
export default r;
