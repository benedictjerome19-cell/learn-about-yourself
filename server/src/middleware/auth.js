import { COOKIE, findSession, readCookie } from '../security.js';

// Session from the httpOnly cookie, or an `Authorization: Bearer` header for scripted clients.
export function sessionFrom(req) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return findSession(readCookie(req, COOKIE) || bearer || null);
}

export function auth(req, res, next) {
  const found = sessionFrom(req);
  if (!found) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  req.user = found.user;
  req.session = found.session;
  next();
}
