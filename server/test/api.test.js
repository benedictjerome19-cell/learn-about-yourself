// End-to-end API tests. Each run boots the real server against a throwaway data file,
// so your journal (server/data.json) is never touched.  Run: npm test  (in server/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-test-'));
const DATA_FILE = path.join(TMP, 'data.json');
const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
let server;

function boot() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, ['src/index.js'], {
      cwd: SERVER_DIR,
      // Blank AI keys so tests never call external services.
      env: { ...process.env, DATA_FILE, PORT: String(PORT), GEMINI_API_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GROQ_API_KEY: '', SMTP_HOST: '', TWILIO_ACCOUNT_SID: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    server.stdout.on('data', (d) => { if (String(d).includes('JournalMind API')) { clearTimeout(t); resolve(); } });
    server.stderr.on('data', (d) => process.stderr.write(d));
  });
}
const stop = () => new Promise((r) => { server.once('exit', r); server.kill(); });

// Minimal cookie-jar client
function client() {
  let cookie = '';
  return async (method, p, body, { headers = {}, raw } = {}) => {
    const res = await fetch(BASE + p, {
      method,
      headers: {
        'X-JournalMind': '1',
        ...(body !== undefined && !raw && { 'Content-Type': 'application/json' }),
        ...(cookie && { Cookie: cookie }),
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = /jm_session=;|Expires=Thu, 01 Jan 1970/.test(set) ? '' : set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, headers: res.headers, cookie: () => cookie };
  };
}

const alice = client();
const bob = client();
const PASSWORD = 'correct horse battery';

before(boot);
after(async () => { await stop(); fs.rmSync(TMP, { recursive: true, force: true }); });

test('health + unknown api route', async () => {
  const c = client();
  assert.equal((await c('GET', '/api/health')).status, 200);
  assert.equal((await c('GET', '/api/nope')).status, 404);
});

test('security headers are set', async () => {
  const { headers } = await client()('GET', '/api/health');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.match(headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(headers.get('x-powered-by'), null);
});

test('registration validates input', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/register', { email: 'nope', password: PASSWORD })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { email: 'a@b.co', password: 'short' })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', 'not-json-object')).status, 400);
});

test('register, duplicate, login, me', async () => {
  const r = await alice('POST', '/api/auth/register', { email: 'Alice@Example.com', password: PASSWORD, name: 'Alice' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.email, 'alice@example.com');
  assert.equal(r.data.token, undefined, 'token must not be exposed to JS');
  assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(r.headers.get('set-cookie'), /SameSite=Strict/i);

  assert.equal((await client()('POST', '/api/auth/register', { email: 'alice@example.com', password: PASSWORD })).status, 409);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'alice@example.com', password: 'wrong password' })).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'ghost@example.com', password: PASSWORD })).status, 401);

  const me = await alice('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.name, 'Alice');
  assert.equal(me.data.passwordHash, undefined);

  assert.equal((await bob('POST', '/api/auth/register', { email: 'bob@example.com', password: PASSWORD })).status, 201);
});

test('protected routes require a session', async () => {
  const c = client();
  for (const p of ['/api/entries', '/api/entries/stats', '/api/reminders', '/api/reports', '/api/streaks', '/api/account/export']) {
    assert.equal((await c('GET', p)).status, 401, p);
  }
  assert.equal((await c('GET', '/api/entries', undefined, { headers: { Authorization: 'Bearer forged' } })).status, 401);
});

test('state-changing requests need the app header (CSRF)', async () => {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@example.com', password: PASSWORD }),
  });
  assert.equal(res.status, 403);
});

test('passkey registration cannot claim an existing account', async () => {
  const origin = (o) => ({ headers: { Origin: o } });
  const r = await client()('POST', '/api/auth/webauthn/register/start', { email: 'alice@example.com', name: 'Mallory' }, origin('http://localhost:4000'));
  assert.equal(r.status, 409);
  const fresh = await client()('POST', '/api/auth/webauthn/register/start', { email: 'new@example.com' }, origin('http://localhost:4000'));
  assert.equal(fresh.status, 200);
  assert.ok(fresh.data.ceremony && fresh.data.options.challenge);
  assert.equal(fresh.data.options.rp.id, 'localhost');
  // The passkey domain follows the HTTPS address the app is opened on (e.g. Tailscale)
  const ts = await client()('POST', '/api/auth/webauthn/register/start', { email: 'phone@example.com' }, origin('https://my-pc.tail1234.ts.net'));
  assert.equal(ts.data.options.rp.id, 'my-pc.tail1234.ts.net');
  // …but never a plain-HTTP non-local address, where browsers refuse passkeys anyway
  assert.equal((await client()('POST', '/api/auth/webauthn/register/start', { email: 'lan@example.com' }, origin('http://192.168.1.20:4000'))).status, 400);
  const finish = await client()('POST', '/api/auth/webauthn/register/finish', { ceremony: 'made-up', credential: {} });
  assert.equal(finish.status, 400);
});

let entryId;
test('create entry: validation, sanitising, scoring', async () => {
  assert.equal((await alice('POST', '/api/entries', { text: '   ' })).status, 400);
  assert.equal((await alice('POST', '/api/entries', { text: '<p></p>' })).status, 400);
  assert.equal((await alice('POST', '/api/entries', { text: 'hi', mood: 'furious' })).status, 400);
  assert.equal((await alice('POST', '/api/entries', { text: 'hi', category: 'nonsense' })).status, 400);
  assert.equal((await alice('POST', '/api/entries', { text: 'hi', type: 'hologram' })).status, 400);
  assert.equal((await alice('POST', '/api/entries', { text: 'x'.repeat(100_001) })).status, 400);

  const r = await alice('POST', '/api/entries', {
    title: 'First light',
    text: '<p>Walked by the river <b onclick="steal()">today</b>.</p><img src=x onerror=alert(1)><script>alert(1)</script>I feel grateful.',
    tags: 'Nature, #gratitude, nature, ',
    mood: 'calm',
    category: 'gratitude',
  });
  assert.equal(r.status, 201);
  entryId = r.data.id;
  assert.equal(r.data.text, '<p>Walked by the river <b>today</b>.</p>I feel grateful.');
  assert.deepEqual(r.data.tags, ['nature', 'gratitude']);
  assert.equal(r.data.mood, 'calm');
  assert.equal(r.data.category, 'gratitude');
  assert.equal(r.data.title, 'First light');
  assert.ok(r.data.createdAt && r.data.updatedAt);
  assert.equal(typeof r.data.score, 'number');
  assert.equal(r.data.userId, undefined);
  assert.match(r.data.transcript, /Walked by the river today/);
});

test('more entries for search & filter', async () => {
  for (const e of [
    { title: 'Deadline week', text: 'Work was stressful, the launch slipped again.', mood: 'stressed', tags: ['work'], category: 'work' },
    { text: 'Long run this morning, legs tired but happy.', mood: 'happy', tags: ['running'], category: 'health' },
  ]) assert.equal((await alice('POST', '/api/entries', e)).status, 201);
  assert.equal((await bob('POST', '/api/entries', { text: 'Bob private thoughts about the river' })).status, 201);
});

test('list, search and filter only return own entries', async () => {
  const all = await alice('GET', '/api/entries');
  assert.equal(all.data.length, 3);
  assert.ok(all.data[0].createdAt >= all.data[2].createdAt, 'newest first');

  const q = async (qs) => (await alice('GET', '/api/entries?' + qs)).data.map((e) => e.title || e.text.slice(0, 10));
  assert.deepEqual(await q('q=river'), ['First light'], 'search must not leak Bob\'s entry');
  assert.deepEqual(await q('q=LAUNCH slipped'), ['Deadline week']);
  assert.deepEqual(await q('q=deadline'), ['Deadline week'], 'search covers titles');
  assert.equal((await q('q=zebra')).length, 0);
  assert.deepEqual(await q('mood=stressed'), ['Deadline week']);
  assert.deepEqual(await q('tag=running'), ['Long run t']);
  assert.deepEqual(await q('category=gratitude'), ['First light']);
  assert.equal((await q('type=voice')).length, 0);
  const today = new Date().toLocaleDateString('en-CA');
  assert.equal((await q(`from=${today}&to=${today}`)).length, 3);
  assert.equal((await q('to=2000-01-01')).length, 0);
  assert.equal((await alice('GET', '/api/entries?from=yesterday')).status, 400);

  const meta = await alice('GET', '/api/entries/meta');
  assert.deepEqual(meta.data.tags, ['gratitude', 'nature', 'running', 'work']);
});

test('other users cannot read, edit or delete an entry', async () => {
  assert.equal((await bob('GET', `/api/entries/${entryId}`)).status, 404);
  assert.equal((await bob('PATCH', `/api/entries/${entryId}`, { text: 'hacked' })).status, 404);
  assert.equal((await bob('DELETE', `/api/entries/${entryId}`)).status, 404);
  assert.equal((await alice('GET', `/api/entries/${entryId}`)).data.title, 'First light');
});

test('edit entry updates fields, timestamp and score', async () => {
  const before = (await alice('GET', `/api/entries/${entryId}`)).data;
  await new Promise((r) => setTimeout(r, 15));
  const r = await alice('PATCH', `/api/entries/${entryId}`, { title: 'First light (edited)', text: 'Rewritten: a quiet, clear morning by the water.', mood: 'happy', tags: ['nature'] });
  assert.equal(r.status, 200);
  assert.equal(r.data.title, 'First light (edited)');
  assert.equal(r.data.mood, 'happy');
  assert.deepEqual(r.data.tags, ['nature']);
  assert.equal(r.data.createdAt, before.createdAt);
  assert.ok(r.data.updatedAt > before.updatedAt);
  assert.match(r.data.transcript, /quiet, clear morning/);
  assert.equal((await alice('PATCH', `/api/entries/${entryId}`, { text: '' })).status, 400, 'cannot blank a text entry');
  assert.equal((await alice('PATCH', `/api/entries/${entryId}`, { mood: 'nope' })).status, 400);
  assert.equal((await alice('GET', '/api/entries?q=rewritten')).data.length, 1);
});

let voiceId;
test('voice entry with recording upload and private playback', async () => {
  const r = await alice('POST', '/api/entries', { type: 'voice', text: 'Quick voice note on the bus', durationSec: 12, tags: ['voice'] });
  assert.equal(r.status, 201);
  voiceId = r.data.id;
  assert.equal(r.data.transcript, 'Quick voice note on the bus');

  const silent = await alice('POST', '/api/entries', { type: 'voice' });
  assert.equal(silent.status, 201, 'recordings may be saved without a note');
  assert.equal(silent.data.transcript, '', 'no invented transcript');
  assert.equal(silent.data.score, null);

  const bytes = Buffer.from('fake-webm-bytes-for-testing');
  assert.equal((await alice('PUT', `/api/entries/${voiceId}/media`, undefined, { raw: bytes, headers: { 'Content-Type': 'text/html' } })).status, 415);
  const up = await alice('PUT', `/api/entries/${voiceId}/media`, undefined, { raw: bytes, headers: { 'Content-Type': 'audio/webm;codecs=opus' } });
  assert.equal(up.status, 200);
  assert.equal(up.data.mediaUrl, `/api/media/${voiceId}`);
  assert.equal(up.data.mediaPath, undefined);

  const play = await alice('GET', `/api/media/${voiceId}`);
  assert.equal(play.status, 200);
  assert.equal(Buffer.from(play.data).toString(), bytes.toString());
  assert.equal((await client()('GET', `/api/media/${voiceId}`)).status, 401);
  assert.equal((await bob('GET', `/api/media/${voiceId}`)).status, 404);
  assert.equal((await bob('PUT', `/api/entries/${voiceId}/media`, undefined, { raw: bytes, headers: { 'Content-Type': 'audio/webm' } })).status, 404);

  assert.ok(fs.existsSync(path.join(SERVER_DIR, 'uploads')));
  assert.equal((await alice('DELETE', `/api/entries/${silent.data.id}`)).status, 200);
});

test('stats, streaks, reports', async () => {
  const s = (await alice('GET', '/api/entries/stats')).data;
  assert.equal(s.total, 4);
  assert.equal(s.thisWeek, 4);
  assert.equal(s.moods.happy, 2);
  assert.equal(s.moods.stressed, 1);
  assert.equal(s.types.voice, 1);
  assert.equal(s.weekly.length, 8);
  assert.equal(s.weekly.at(-1).count, 4);
  assert.ok(s.words > 10);

  const st = (await alice('GET', '/api/streaks')).data;
  assert.equal(st.current, 1);
  assert.equal(st.days[st.today], 4);

  const rep = (await alice('GET', '/api/reports')).data;
  assert.equal(rep.latest.count, 4);
  const brief = await alice('POST', '/api/reports/briefing');
  assert.equal(brief.status, 200);
  assert.match(brief.data.briefing, /Briefing Document/);
  assert.doesNotMatch(brief.data.briefing, /Bob private/);
});

test('emotional analysis report: JSON and PDF', async () => {
  const a = (await alice('GET', '/api/reports/emotions?range=30')).data;
  assert.equal(a.empty, false);
  assert.equal(a.entries, 4);
  assert.equal(a.moods.happy, 2);
  assert.equal(a.moods.stressed, 1);
  assert.equal(a.balance.positive + a.balance.neutral + a.balance.difficult, 100);
  assert.ok(a.summary[0].includes('4 entries'));
  assert.ok(a.topThemes.some((t) => t.theme === 'anxiety'), 'detects "stressful" in text');
  assert.ok(a.suggestions.length >= 1 && a.suggestions.length <= 3);
  assert.doesNotMatch(JSON.stringify(a), /Bob private/);
  assert.equal((await alice('GET', '/api/reports/emotions?range=bogus')).data.range, '30', 'unknown range falls back');

  const empty = (await bob('GET', '/api/reports/emotions?range=30')).data;
  assert.equal(empty.entries, 1);
  const none = (await client()('GET', '/api/reports/emotions.pdf')).status;
  assert.equal(none, 401);

  const pdf = await alice('GET', '/api/reports/emotions.pdf?range=all');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(pdf.headers.get('content-disposition'), /attachment; filename="journalmind-emotional-report-\d{4}-\d{2}-\d{2}\.pdf"/);
  const bytes = Buffer.from(pdf.data);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 2000);
});

test('Me vs Me chat is grounded in own entries', async () => {
  assert.equal((await alice('POST', '/api/entries/chat', { question: '  ' })).status, 400);
  const r = await alice('POST', '/api/entries/chat', { question: 'What did I write about the morning run?' });
  assert.equal(r.status, 200);
  assert.match(r.data.answer, /run/i);
  assert.doesNotMatch(r.data.answer, /Bob/);
});

test('reminders: validate, create, toggle, delete, isolate', async () => {
  assert.equal((await alice('POST', '/api/reminders', { time: '25:99', label: 'x' })).status, 400);
  assert.equal((await alice('POST', '/api/reminders', { time: '20:00', label: '   ' })).status, 400);
  assert.equal((await alice('POST', '/api/reminders', { time: '20:00', label: 'x', tone: 'shouty' })).status, 400);
  const r = await alice('POST', '/api/reminders', { time: '21:30', label: 'Wind down and write', tone: 'gentle' });
  assert.equal(r.status, 201);
  assert.equal((await bob('PATCH', `/api/reminders/${r.data.id}`)).status, 404);
  assert.equal((await alice('PATCH', `/api/reminders/${r.data.id}`)).data.enabled, false);
  assert.equal((await alice('GET', '/api/reminders')).data.length, 1);
  assert.equal((await bob('DELETE', `/api/reminders/${r.data.id}`)).status, 404);
  assert.equal((await alice('DELETE', `/api/reminders/${r.data.id}`)).status, 200);
  assert.equal((await alice('DELETE', `/api/reminders/${r.data.id}`)).status, 404);
});

test('data export has entries but no credentials', async () => {
  const r = await alice('GET', '/api/account/export');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.equal(r.data.entries.length, 4);
  const blob = JSON.stringify(r.data);
  assert.doesNotMatch(blob, /passwordHash|tokenHash|Bob private/);
});

test('entries persist across a server restart', async () => {
  await stop();
  await boot();
  const c = client();
  assert.equal((await c('POST', '/api/auth/login', { email: 'alice@example.com', password: PASSWORD })).status, 200);
  const list = (await c('GET', '/api/entries')).data;
  assert.equal(list.length, 4);
  assert.ok(list.some((e) => e.title === 'First light (edited)'));
  // existing sessions survive restarts too
  assert.equal((await alice('GET', '/api/auth/me')).status, 200);
  const stored = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  assert.ok(stored.sessions.every((s) => s.tokenHash && !s.token), 'only hashed session tokens on disk');
  assert.ok(fs.readdirSync(path.join(TMP, 'backups')).length >= 1, 'startup backup written');
});

test('delete entry removes it and its recording', async () => {
  const stored = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const media = path.join(SERVER_DIR, stored.entries.find((e) => e.id === voiceId).mediaPath);
  assert.ok(fs.existsSync(media));
  assert.equal((await alice('DELETE', `/api/entries/${voiceId}`)).status, 200);
  assert.ok(!fs.existsSync(media));
  assert.equal((await alice('GET', `/api/entries/${voiceId}`)).status, 404);
  assert.equal((await alice('GET', '/api/entries')).data.length, 3);
  fs.rmSync(path.dirname(media), { recursive: true, force: true });
});

test('change password signs out other sessions', async () => {
  const other = client();
  await other('POST', '/api/auth/login', { email: 'bob@example.com', password: PASSWORD });
  assert.equal((await bob('POST', '/api/auth/password', { current: 'wrong', next: 'another long one' })).status, 401);
  assert.equal((await bob('POST', '/api/auth/password', { current: PASSWORD, next: 'short' })).status, 400);
  assert.equal((await bob('POST', '/api/auth/password', { current: PASSWORD, next: 'another long one' })).status, 200);
  assert.equal((await other('GET', '/api/auth/me')).status, 401);
  assert.equal((await bob('GET', '/api/auth/me')).status, 200);
});

test('logout revokes the session server-side', async () => {
  const c = client();
  await c('POST', '/api/auth/login', { email: 'alice@example.com', password: PASSWORD });
  const me = await c('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  const cookie = me.cookie(); // a copy of the cookie, as if stolen before logout
  assert.equal((await c('POST', '/api/auth/logout')).status, 200);
  const replay = await fetch(BASE + '/api/auth/me', { headers: { Cookie: cookie } });
  assert.equal(replay.status, 401, 'old cookie must not work after logout');
});

test('login is rate limited', async () => {
  const c = client();
  let last;
  for (let i = 0; i < 25; i++) last = await c('POST', '/api/auth/login', { email: 'alice@example.com', password: 'nope nope' });
  assert.equal(last.status, 429);
});
