// JSON file store. Writes are atomic (temp file + rename) and a rolling set of
// startup backups is kept in backups/ (next to data.json) so a bad write can never wipe the journal.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// DATA_DIR puts everything that must survive a redeploy — data.json, backups/ and uploads/ —
// in one folder (a mounted disk on cloud hosts). Without it, they live in server/.
export const STORAGE_ROOT = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : SERVER_DIR;
fs.mkdirSync(STORAGE_ROOT, { recursive: true });
export const FILE = path.resolve(STORAGE_ROOT, process.env.DATA_FILE || 'data.json');
const BACKUP_DIR = path.join(path.dirname(FILE), 'backups');
const KEEP_BACKUPS = 10;
const EMPTY = () => ({ users: [], entries: [], scores: [], reminders: [], sessions: [] });

function load() {
  if (!fs.existsSync(FILE)) return EMPTY();
  const raw = fs.readFileSync(FILE, 'utf8');
  try {
    return { ...EMPTY(), ...JSON.parse(raw) };
  } catch (e) {
    // Never start with an empty DB over a corrupt one — that would destroy the journal on the next save.
    throw new Error(`${FILE} is not valid JSON (${e.message}). Restore it from ${BACKUP_DIR} before starting.`);
  }
}

function backup() {
  if (!fs.existsSync(FILE)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const prefix = path.basename(FILE, '.json') + '-';
  const existing = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith(prefix)).sort();
  // Dev auto-restarts would otherwise fill the rotation with identical copies.
  const newest = existing.at(-1) && fs.readFileSync(path.join(BACKUP_DIR, existing.at(-1)));
  if (newest && newest.equals(fs.readFileSync(FILE))) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(FILE, path.join(BACKUP_DIR, `${prefix}${stamp}.json`));
  const old = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith(prefix)).sort().slice(0, -KEEP_BACKUPS);
  old.forEach((f) => fs.rmSync(path.join(BACKUP_DIR, f), { force: true }));
}

const STRIP = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Placeholder transcripts the old transcription stub invented for voice/video entries.
const FAKE_TRANSCRIPTS = [
  'Today I felt really productive. I basically finished the report',
  'I was nervous before the presentation, but it went well.',
  'Honestly, today was slow. I like to think I handled the setbacks',
];

// Bring older data files up to the current shape. Idempotent.
function migrate(d) {
  let changed = false;
  for (const u of d.users) {
    // Legacy permanent plaintext API tokens are replaced by expiring hashed sessions.
    if ('token' in u) { delete u.token; changed = true; }
  }
  for (const e of d.entries) {
    if (!Array.isArray(e.tags)) { e.tags = []; changed = true; }
    if (!e.mood) { e.mood = 'neutral'; changed = true; }
    if (e.title === undefined) { e.title = ''; changed = true; }
    if (e.category === undefined) { e.category = ''; changed = true; }
    if (!e.updatedAt) { e.updatedAt = e.createdAt; changed = true; }
    if (e.type !== 'text' && !STRIP(e.text) && FAKE_TRANSCRIPTS.some((t) => (e.transcript || '').startsWith(t))) {
      e.transcript = '';
      d.scores = d.scores.filter((s) => s.entryId !== e.id);
      changed = true;
    }
  }
  return changed;
}

const db = load();
backup();
const migrated = migrate(db);

export function save() {
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  try {
    fs.renameSync(tmp, FILE);
  } catch {
    // Windows can refuse the rename while another process (antivirus, editor) holds the file.
    fs.copyFileSync(tmp, FILE);
    fs.rmSync(tmp, { force: true });
  }
}

if (migrated) save();

export default db;
