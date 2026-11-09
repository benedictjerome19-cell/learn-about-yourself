import { createHash, randomBytes, randomUUID } from 'crypto';
import db, { save } from './db.js';

// ── Sessions ──────────────────────────────────────────────────────────────────
// Random 256-bit tokens; only their SHA-256 is stored, so a leaked data file cannot be replayed.
export const COOKIE = 'jm_session';
const SESSION_DAYS = 30;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function createSession(user) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  db.sessions.push({
    id: randomUUID(), userId: user.id, tokenHash: sha256(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DAYS * 86400000).toISOString(),
  });
  save();
  return token;
}

export function findSession(token) {
  if (!token) return null;
  const hash = sha256(token);
  const s = db.sessions.find((x) => x.tokenHash === hash);
  if (!s || new Date(s.expiresAt) < new Date()) return null;
  const user = db.users.find((u) => u.id === s.userId);
  return user ? { session: s, user } : null;
}

export function destroySession(session) {
  db.sessions = db.sessions.filter((s) => s.id !== session.id);
  save();
}

export function pruneSessions() {
  const now = new Date();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => new Date(s.expiresAt) > now);
  if (db.sessions.length !== before) save();
}

export function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function setSessionCookie(req, res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/api',
    maxAge: SESSION_DAYS * 86400000,
  });
}

export const clearSessionCookie = (res) => res.clearCookie(COOKIE, { path: '/api', sameSite: 'strict', httpOnly: true });

// ── Rate limiting (in-memory, per IP + bucket) ────────────────────────────────
export function rateLimit({ windowMs, max, bucket }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { count: 1, reset: now + windowMs }); return next(); }
    if (++h.count > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    next();
  };
}

// ── CSRF ──────────────────────────────────────────────────────────────────────
// The session cookie is SameSite=Strict; state-changing requests must also carry a
// custom header, which a cross-site form or image tag cannot send.
export function requireAppHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.get('X-JournalMind') === '1') return next();
  res.status(403).json({ error: 'Missing request header.' });
}

// ── Security headers ──────────────────────────────────────────────────────────
export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  });
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  // Behind an HTTPS host (TRUST_PROXY set), tell browsers to never fall back to plain HTTP.
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
}

// ── HTML sanitising ───────────────────────────────────────────────────────────
// Journal text comes from a contentEditable editor. Only a few formatting tags survive,
// always without attributes, so stored entries can be rendered as HTML safely.
const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'p', 'div', 'br', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3']);
const VOID = new Set(['br']);
const escapeText = (s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sanitizeHtml(input = '') {
  const src = String(input)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|template|svg|math|noscript|textarea|title)\b[\s\S]*?<\/\1\s*>/gi, '');
  let out = '';
  let last = 0;
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/g;
  for (let m; (m = tag.exec(src));) {
    out += escapeText(src.slice(last, m.index));
    last = tag.lastIndex;
    const name = m[2].toLowerCase();
    if (!ALLOWED.has(name)) continue;
    if (VOID.has(name)) { if (!m[1]) out += '<br>'; continue; }
    out += `<${m[1]}${name}>`;
  }
  return out + escapeText(src.slice(last));
}

export const stripHtml = (html = '') =>
  String(html)
    .replace(/<(br|\/p|\/div|\/li|\/h[23]|\/blockquote)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

export const escapeHtml = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
