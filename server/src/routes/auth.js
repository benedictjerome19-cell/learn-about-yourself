import { Router } from 'express';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { v4 as uuid } from 'uuid';
import db, { save } from '../db.js';
import { auth, sessionFrom } from '../middleware/auth.js';
import { clearSessionCookie, createSession, destroySession, rateLimit, setSessionCookie } from '../security.js';

const r = Router();
const limitAuth = rateLimit({ windowMs: 15 * 60_000, max: 20, bucket: 'auth' });

// ── Password helpers ──────────────────────────────────────────────────────────
const hash   = (pw, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
const verify = (pw, stored) => {
  try {
    const [salt, h] = stored.split(':');
    if (!salt || !h) return false;
    const a = Buffer.from(h, 'hex');
    const b = scryptSync(pw, salt, 64);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
};
// Burn the same scrypt cost for unknown emails so response time doesn't reveal which accounts exist.
const DUMMY_HASH = hash(randomBytes(16).toString('hex'));

const pub   = (u) => ({ id: u.id, email: u.email, name: u.name, hasPassword: !!u.passwordHash, passkeys: (u.passkeys || []).length });
const clean = (b = {}) => ({
  email:    String(b.email    || '').trim().toLowerCase().slice(0, 254),
  password: String(b.password || '').slice(0, 1024),
  name:     String(b.name     || '').trim().slice(0, 80),
});
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// On a public server you don't want strangers creating accounts:
//   ALLOW_SIGNUP=false  closes registration entirely
//   MAX_USERS=1         lets the first account be created, then closes registration
export function signupOpen() {
  if (process.env.ALLOW_SIGNUP === 'false') return false;
  const max = Number(process.env.MAX_USERS) || 0;
  return !max || db.users.length < max;
}
const SIGNUP_CLOSED = 'New sign-ups are closed on this server.';

function signIn(req, res, u, status = 200) {
  setSessionCookie(req, res, createSession(u));
  res.status(status).json({ user: pub(u) });
}

// ── Password auth ─────────────────────────────────────────────────────────────
r.get('/config', (req, res) => res.json({ signup: signupOpen() }));

r.post('/register', limitAuth, (req, res) => {
  if (!signupOpen()) return res.status(403).json({ error: SIGNUP_CLOSED });
  const { email, password, name } = clean(req.body);
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (db.users.some((x) => x.email === email)) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });

  const u = { id: uuid(), email, name: name || email.split('@')[0], passwordHash: hash(password), createdAt: new Date().toISOString() };
  db.users.push(u);
  save();
  signIn(req, res, u, 201);
});

r.post('/login', limitAuth, (req, res) => {
  const { email, password } = clean(req.body);
  const u = db.users.find((x) => x.email === email);
  const ok = verify(password, u?.passwordHash || DUMMY_HASH) && !!u?.passwordHash;
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });
  signIn(req, res, u);
});

r.post('/logout', (req, res) => {
  const found = sessionFrom(req);
  if (found) destroySession(found.session);
  clearSessionCookie(res);
  res.json({ ok: true });
});

r.get('/me', auth, (req, res) => res.json(pub(req.user)));

r.post('/password', auth, limitAuth, (req, res) => {
  const current = String(req.body?.current || '');
  const next    = String(req.body?.next || '');
  if (req.user.passwordHash && !verify(current, req.user.passwordHash)) return res.status(401).json({ error: 'Current password is incorrect.' });
  if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  req.user.passwordHash = hash(next);
  // Sign out every other device.
  db.sessions = db.sessions.filter((s) => s.userId !== req.user.id || s.id === req.session.id);
  save();
  res.json({ ok: true });
});

// ── WebAuthn (passkeys / biometrics) ──────────────────────────────────────────
// Lazy-load @simplewebauthn/server so the server boots even without the pkg
let webauthn;
const getWA = async () => {
  if (!webauthn) {
    try { webauthn = await import('@simplewebauthn/server'); }
    catch { return null; }
  }
  return webauthn;
};

const RP_NAME = 'JournalMind';
// Passkeys are bound to a domain (the "relying party"). Set RP_ID + WEBAUTHN_ORIGIN to pin it;
// otherwise it follows the address the app was opened on (localhost, a *.ts.net name, your
// domain…), so the same server works on your PC and your phone without extra setup.
function relyingParty(req) {
  if (process.env.RP_ID) {
    return { id: process.env.RP_ID, origins: (process.env.WEBAUTHN_ORIGIN || `https://${process.env.RP_ID}`).split(',').map((s) => s.trim()) };
  }
  let url;
  try { url = new URL(req.get('origin') || ''); } catch { return null; }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null; // browsers require HTTPS
  return { id: url.hostname === '127.0.0.1' ? 'localhost' : url.hostname, origins: [url.origin] };
}
const NO_RP = 'Biometric sign-in needs the app to be opened over HTTPS (or on localhost).';

// Short-lived ceremonies, keyed by a random id the client echoes back.
const ceremonies = new Map();
const CEREMONY_MS = 5 * 60_000;
function startCeremony(data) {
  const id = randomBytes(16).toString('base64url');
  ceremonies.set(id, { ...data, expires: Date.now() + CEREMONY_MS });
  return id;
}
function takeCeremony(id) {
  const c = ceremonies.get(String(id || ''));
  ceremonies.delete(String(id || ''));
  return c && c.expires > Date.now() ? c : null;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of ceremonies) if (v.expires < now) ceremonies.delete(k); }, CEREMONY_MS).unref();

// Registration: a signed-in user adds a passkey to their own account, or a new visitor
// creates a passkey-only account. An existing account can never be claimed by email alone.
r.post('/webauthn/register/start', limitAuth, async (req, res) => {
  const wa = await getWA();
  if (!wa) return res.status(503).json({ error: 'Biometric sign-in is not available on this server.' });

  const rp = relyingParty(req);
  if (!rp) return res.status(400).json({ error: NO_RP });
  const signedIn = sessionFrom(req)?.user;
  let email, name, userId, existing = [];
  if (signedIn) {
    ({ email, name, id: userId } = signedIn);
    existing = (signedIn.passkeys || []).filter((pk) => (pk.rpID || 'localhost') === rp.id).map((pk) => ({ id: pk.credentialID, transports: pk.transports }));
  } else {
    if (!signupOpen()) return res.status(403).json({ error: SIGNUP_CLOSED });
    ({ email, name } = clean(req.body));
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (db.users.some((x) => x.email === email)) return res.status(409).json({ error: 'An account with this email already exists. Sign in with your password, then add biometrics from Settings.' });
    name = name || email.split('@')[0];
    userId = uuid();
  }

  const options = await wa.generateRegistrationOptions({
    rpName: RP_NAME, rpID: rp.id,
    userID: new TextEncoder().encode(userId),
    userName: email, userDisplayName: name || email,
    attestationType: 'none',
    excludeCredentials: existing,
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  const ceremony = startCeremony({ kind: 'register', challenge: options.challenge, email, name, userId, existingUser: !!signedIn, rp });
  res.json({ ceremony, options });
});

r.post('/webauthn/register/finish', limitAuth, async (req, res) => {
  const wa = await getWA();
  if (!wa) return res.status(503).json({ error: 'Biometric sign-in is not available on this server.' });
  const c = takeCeremony(req.body?.ceremony);
  if (!c || c.kind !== 'register') return res.status(400).json({ error: 'This request expired. Please try again.' });

  try {
    const { verified, registrationInfo } = await wa.verifyRegistrationResponse({
      response: req.body.credential, expectedChallenge: c.challenge, expectedOrigin: c.rp.origins, expectedRPID: c.rp.id,
    });
    if (!verified) return res.status(400).json({ error: 'Biometric verification failed.' });

    let u;
    if (c.existingUser) {
      u = sessionFrom(req)?.user;
      if (!u || u.id !== c.userId) return res.status(401).json({ error: 'Please sign in again.' });
    } else {
      if (!signupOpen()) return res.status(403).json({ error: SIGNUP_CLOSED });
      if (db.users.some((x) => x.email === c.email)) return res.status(409).json({ error: 'An account with this email already exists.' });
      u = { id: c.userId, email: c.email, name: c.name, createdAt: new Date().toISOString() };
      db.users.push(u);
    }
    u.passkeys = u.passkeys || [];
    u.passkeys.push({
      credentialID:        registrationInfo.credentialID, // already base64url in @simplewebauthn/server v10
      credentialPublicKey: Buffer.from(registrationInfo.credentialPublicKey).toString('base64url'),
      counter:             registrationInfo.counter,
      rpID:                c.rp.id,
      transports:          req.body.credential?.response?.transports || [],
      createdAt:           new Date().toISOString(),
    });
    save();
    if (c.existingUser) return res.json({ user: pub(u) });
    signIn(req, res, u, 201);
  } catch (e) {
    res.status(400).json({ error: `Biometric verification failed: ${e.message}` });
  }
});

r.post('/webauthn/login/start', limitAuth, async (req, res) => {
  const wa = await getWA();
  if (!wa) return res.status(503).json({ error: 'Biometric sign-in is not available on this server.' });

  const rp = relyingParty(req);
  if (!rp) return res.status(400).json({ error: NO_RP });
  const { email } = clean(req.body);
  const u = db.users.find((x) => x.email === email);
  const keys = (u?.passkeys || []).filter((pk) => (pk.rpID || 'localhost') === rp.id);
  if (!keys.length) return res.status(400).json({ error: u?.passkeys?.length ? `No biometrics are registered for this address (${rp.id}). Sign in with your password, then add this device in Settings.` : 'No biometrics are registered for this email.' });

  const options = await wa.generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: 'preferred',
    allowCredentials: keys.map((pk) => ({ id: pk.credentialID, transports: pk.transports })),
  });
  res.json({ ceremony: startCeremony({ kind: 'login', challenge: options.challenge, userId: u.id, rp }), options });
});

r.post('/webauthn/login/finish', limitAuth, async (req, res) => {
  const wa = await getWA();
  if (!wa) return res.status(503).json({ error: 'Biometric sign-in is not available on this server.' });
  const c = takeCeremony(req.body?.ceremony);
  if (!c || c.kind !== 'login') return res.status(400).json({ error: 'This request expired. Please try again.' });

  const u = db.users.find((x) => x.id === c.userId);
  const credential = req.body.credential;
  const passkey = u?.passkeys?.find((pk) => pk.credentialID === credential?.id);
  if (!passkey) return res.status(400).json({ error: 'This passkey is not registered.' });

  try {
    const { verified, authenticationInfo } = await wa.verifyAuthenticationResponse({
      response: credential, expectedChallenge: c.challenge, expectedOrigin: c.rp.origins, expectedRPID: c.rp.id,
      authenticator: {
        credentialID:        passkey.credentialID,
        credentialPublicKey: Buffer.from(passkey.credentialPublicKey, 'base64url'),
        counter:             passkey.counter,
      },
    });
    if (!verified) return res.status(400).json({ error: 'Biometric authentication failed.' });
    passkey.counter = authenticationInfo.newCounter;
    save();
    signIn(req, res, u);
  } catch (e) {
    res.status(400).json({ error: `Biometric authentication failed: ${e.message}` });
  }
});

export default r;
