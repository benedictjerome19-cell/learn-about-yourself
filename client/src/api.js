// The session lives in an httpOnly cookie set by the server, so no token is ever
// stored in JavaScript. Every state-changing call sends X-JournalMind (CSRF guard).
try { localStorage.removeItem('jm_token'); } catch { /* legacy token from older versions */ }

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, signal, raw, contentType } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        'X-JournalMind': '1',
        ...(raw ? { 'Content-Type': contentType } : body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Cannot reach the JournalMind server. Is it running?', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('jm:unauthorized'));
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

// mode: 'login' or 'register'
export async function authenticate(mode, creds) {
  return (await api('/auth/' + mode, { method: 'POST', body: creds })).user;
}

export const logout = () => api('/auth/logout', { method: 'POST' }).catch(() => {});

export const uploadMedia = (id, blob) =>
  api(`/entries/${id}/media`, { method: 'PUT', raw: blob, contentType: (blob.type || 'video/webm').split(';')[0] });

// ── WebAuthn helpers ─────────────────────────────────────────────────────────
// The server returns plain JSON options; the browser needs ArrayBuffer for some
// fields. These helpers handle the base64url ↔ ArrayBuffer conversion.

function b64ToBuffer(b64) {
  const str = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf.buffer;
}

function bufferToB64(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  bytes.forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const creationOptions = (opts) => ({
  ...opts,
  challenge: b64ToBuffer(opts.challenge),
  user: { ...opts.user, id: b64ToBuffer(opts.user.id) },
  excludeCredentials: (opts.excludeCredentials || []).map((c) => ({ ...c, id: b64ToBuffer(c.id) })),
});

const requestOptions = (opts) => ({
  ...opts,
  challenge: b64ToBuffer(opts.challenge),
  allowCredentials: (opts.allowCredentials || []).map((c) => ({ ...c, id: b64ToBuffer(c.id) })),
});

const common = (cred) => ({
  id: cred.id,
  rawId: bufferToB64(cred.rawId),
  type: cred.type,
  clientExtensionResults: cred.getClientExtensionResults?.() || {},
  authenticatorAttachment: cred.authenticatorAttachment || undefined,
});

const attestationJSON = (cred) => ({
  ...common(cred),
  response: {
    clientDataJSON:    bufferToB64(cred.response.clientDataJSON),
    attestationObject: bufferToB64(cred.response.attestationObject),
    transports:        cred.response.getTransports?.() || [],
  },
});

const assertionJSON = (cred) => ({
  ...common(cred),
  response: {
    clientDataJSON:    bufferToB64(cred.response.clientDataJSON),
    authenticatorData: bufferToB64(cred.response.authenticatorData),
    signature:         bufferToB64(cred.response.signature),
    userHandle:        cred.response.userHandle ? bufferToB64(cred.response.userHandle) : undefined,
  },
});

function friendly(e) {
  if (e?.name === 'NotAllowedError') return new Error('Biometric prompt was cancelled or timed out.');
  if (e?.name === 'InvalidStateError') return new Error('This device is already registered for this account.');
  return e;
}

// Register a passkey: for the signed-in user (adds to their account), or a brand-new account.
export async function passkeyRegister({ email, name } = {}) {
  if (!window.PublicKeyCredential) throw new Error('This browser does not support biometric sign-in.');
  const { ceremony, options } = await api('/auth/webauthn/register/start', { method: 'POST', body: { email, name } });
  let cred;
  try { cred = await navigator.credentials.create({ publicKey: creationOptions(options) }); }
  catch (e) { throw friendly(e); }
  return (await api('/auth/webauthn/register/finish', { method: 'POST', body: { ceremony, credential: attestationJSON(cred) } })).user;
}

export async function passkeyLogin(email) {
  if (!window.PublicKeyCredential) throw new Error('This browser does not support biometric sign-in.');
  const { ceremony, options } = await api('/auth/webauthn/login/start', { method: 'POST', body: { email } });
  let cred;
  try { cred = await navigator.credentials.get({ publicKey: requestOptions(options) }); }
  catch (e) { throw friendly(e); }
  return (await api('/auth/webauthn/login/finish', { method: 'POST', body: { ceremony, credential: assertionJSON(cred) } })).user;
}
