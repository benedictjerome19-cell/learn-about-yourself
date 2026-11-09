// Boots the server the way a cloud host runs it (Dockerfile settings): persistent DATA_DIR,
// behind an HTTPS proxy, with sign-ups limited to the first account.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-deploy-'));
const PORT = 4900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(() => new Promise((resolve, reject) => {
  server = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, DATA_DIR, DATA_FILE: '', PORT: String(PORT), TRUST_PROXY: '1', MAX_USERS: '1', NODE_ENV: 'production',
      GEMINI_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GROQ_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const t = setTimeout(() => reject(new Error('server did not start')), 15000);
  server.stdout.on('data', (d) => { if (String(d).includes('JournalMind API')) { clearTimeout(t); resolve(); } });
  server.stderr.on('data', (d) => process.stderr.write(d));
}));
after(async () => { await new Promise((r) => { server.once('exit', r); server.kill(); }); fs.rmSync(DATA_DIR, { recursive: true, force: true }); });

// Requests arrive through the host's HTTPS proxy
const req = (method, p, body, headers = {}) => fetch(BASE + p, {
  method,
  headers: { 'X-JournalMind': '1', 'X-Forwarded-Proto': 'https', ...(body && { 'Content-Type': 'application/json' }), ...headers },
  body: body && (Buffer.isBuffer(body) ? body : JSON.stringify(body)),
});

let cookie;
test('first account can sign up, over HTTPS with secure cookies', async () => {
  assert.deepEqual(await (await req('GET', '/api/auth/config')).json(), { signup: true });
  const r = await req('POST', '/api/auth/register', { email: 'owner@example.com', password: 'a long passphrase', name: 'Owner' });
  assert.equal(r.status, 201);
  const set = r.headers.get('set-cookie');
  assert.match(set, /;\s*Secure/i, 'cookie must be Secure behind HTTPS');
  assert.match(r.headers.get('strict-transport-security'), /max-age=\d+/);
  cookie = set.split(';')[0];
});

test('after that, sign-ups are closed', async () => {
  assert.deepEqual(await (await req('GET', '/api/auth/config')).json(), { signup: false });
  assert.equal((await req('POST', '/api/auth/register', { email: 'stranger@example.com', password: 'a long passphrase' })).status, 403);
  assert.equal((await req('POST', '/api/auth/webauthn/register/start', { email: 'stranger@example.com' }, { Origin: 'https://journal.example.com' })).status, 403);
  // the owner can still sign in
  assert.equal((await req('POST', '/api/auth/login', { email: 'owner@example.com', password: 'a long passphrase' })).status, 200);
});

test('journal, recordings and backups all live in DATA_DIR', async () => {
  const e = await (await req('POST', '/api/entries', { type: 'voice', text: 'note' }, { Cookie: cookie })).json();
  const up = await req('PUT', `/api/entries/${e.id}/media`, Buffer.from('fake-audio'), { Cookie: cookie, 'Content-Type': 'audio/webm' });
  assert.equal(up.status, 200);
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'data.json')));
  const stored = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'data.json'), 'utf8'));
  assert.equal(stored.users.length, 1);
  const media = path.join(DATA_DIR, stored.entries[0].mediaPath);
  assert.ok(media.startsWith(path.join(DATA_DIR, 'uploads')) && fs.existsSync(media));
  assert.equal((await req('GET', `/api/media/${e.id}`, undefined, { Cookie: cookie })).status, 200);
});

test('the built web app is served from the same origin', async () => {
  const dist = path.resolve(SERVER_DIR, '../client/dist/index.html');
  if (!fs.existsSync(dist)) return; // client not built in this checkout
  const r = await req('GET', '/journal');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<div id="root">/);
  assert.equal((await req('GET', '/manifest.webmanifest')).status, 200);
});
