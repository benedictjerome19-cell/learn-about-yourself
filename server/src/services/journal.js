import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import db, { save, STORAGE_ROOT } from '../db.js';
import { analyzeEntry } from '../ai/pipeline.js';
import { sanitizeHtml, stripHtml } from '../security.js';
import { dayKey } from './streaks.js';

export const TYPES      = ['text', 'voice', 'video'];
export const MOODS      = ['happy', 'calm', 'neutral', 'active', 'stressed', 'sad'];
export const CATEGORIES = ['personal', 'work', 'health', 'relationships', 'gratitude', 'goals', 'ideas', 'travel'];
const MAX_TEXT = 100_000;

export class ValidationError extends Error {}

function normTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(',');
  const out = [];
  for (const t of list) {
    const tag = String(t).toLowerCase().trim().replace(/^#/, '').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 20);
}

// Validates the editable fields present in `body`; returns only those.
function fields(body = {}, { requireText }) {
  const f = {};
  if ('title' in body) f.title = String(body.title || '').trim().slice(0, 200);
  if ('text' in body) {
    const text = String(body.text || '');
    if (text.length > MAX_TEXT) throw new ValidationError('Entry is too long (max 100,000 characters).');
    f.text = sanitizeHtml(text);
  }
  if (requireText && !stripHtml(f.text || '')) throw new ValidationError('Write something before saving.');
  if ('tags' in body) f.tags = normTags(body.tags);
  if ('mood' in body) {
    if (!MOODS.includes(body.mood)) throw new ValidationError(`Mood must be one of: ${MOODS.join(', ')}.`);
    f.mood = body.mood;
  }
  if ('category' in body) {
    const c = String(body.category || '').toLowerCase();
    if (c && !CATEGORIES.includes(c)) throw new ValidationError(`Category must be one of: ${CATEGORIES.join(', ')}.`);
    f.category = c;
  }
  return f;
}

export function createEntry(user, body = {}) {
  const type = body.type || 'text';
  if (!TYPES.includes(type)) throw new ValidationError('Unknown entry type.');
  const f = fields({ title: '', text: '', tags: [], mood: 'neutral', category: '', ...body }, { requireText: type === 'text' });
  const now = new Date().toISOString();
  const entry = {
    id: uuid(),
    userId: user.id,
    type,
    ...f,
    durationSec: Math.max(0, Math.min(6 * 3600, Math.round(Number(body.durationSec) || 0))),
    mediaPath: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  db.entries.push(entry);
  analyzeEntry(entry);
  save();
  return entry;
}

export function updateEntry(user, id, body = {}) {
  const entry = getEntry(user, id);
  if (!entry) return null;
  const f = fields(body, { requireText: entry.type === 'text' && 'text' in body });
  Object.assign(entry, f, { updatedAt: new Date().toISOString() });
  if ('text' in f) analyzeEntry(entry);
  save();
  return entry;
}

export function deleteEntry(user, id) {
  const entry = getEntry(user, id);
  if (!entry) return false;
  if (entry.mediaPath) fs.rmSync(path.join(STORAGE_ROOT, entry.mediaPath), { force: true });
  db.entries = db.entries.filter((e) => e.id !== id);
  db.scores  = db.scores.filter((s) => s.entryId !== id);
  save();
  return true;
}

export const getEntry = (user, id) => db.entries.find((e) => e.id === id && e.userId === user.id) || null;

export function saveMedia(user, id, buffer, ext) {
  const entry = getEntry(user, id);
  if (!entry || entry.type === 'text' || !buffer?.length) return null;
  const rel = `uploads/${user.id}/${id}.${ext}`;
  const abs = path.join(STORAGE_ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  if (entry.mediaPath && entry.mediaPath !== rel) fs.rmSync(path.join(STORAGE_ROOT, entry.mediaPath), { force: true });
  entry.mediaPath = rel;
  save();
  return entry;
}

export function mediaFile(user, id) {
  const entry = getEntry(user, id);
  if (!entry?.mediaPath) return null;
  const uploads = path.join(STORAGE_ROOT, 'uploads');
  const file = path.resolve(STORAGE_ROOT, entry.mediaPath);
  return file.startsWith(uploads + path.sep) && fs.existsSync(file) ? file : null;
}

// filters: q (full-text), tag, mood, type, category, from/to (YYYY-MM-DD, local days)
export function listEntries(user, filters = {}) {
  const q = String(filters.q || '').toLowerCase().trim();
  const terms = q ? q.split(/\s+/) : [];
  return db.entries
    .filter((e) => {
      if (e.userId !== user.id) return false;
      if (filters.tag && !e.tags.includes(String(filters.tag).toLowerCase())) return false;
      if (filters.mood && e.mood !== filters.mood) return false;
      if (filters.type && e.type !== filters.type) return false;
      if (filters.category && e.category !== filters.category) return false;
      const day = dayKey(e.createdAt);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
      if (terms.length) {
        const hay = [e.title, stripHtml(e.text), e.transcript, e.tags.join(' '), e.category, e.mood].join(' ').toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const allTags = (user) => [...new Set(listEntries(user).flatMap((e) => e.tags))].sort();

const wordCount = (s = '') => (s.match(/[\p{L}\p{N}']+/gu) || []).length;

export function entryStats(user) {
  const entries = listEntries(user);
  const moods = Object.fromEntries(MOODS.map((m) => [m, 0]));
  const categories = {};
  const types = { text: 0, voice: 0, video: 0 };
  let words = 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  let thisWeek = 0, thisMonth = 0;
  // Last 8 calendar weeks (Sunday start), oldest first
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay() - (7 - i) * 7);
    return { week: dayKey(start), count: 0 };
  });

  for (const e of entries) {
    moods[e.mood] = (moods[e.mood] || 0) + 1;
    if (e.category) categories[e.category] = (categories[e.category] || 0) + 1;
    types[e.type] = (types[e.type] || 0) + 1;
    words += wordCount(e.transcript || stripHtml(e.text));
    const d = new Date(e.createdAt);
    if (d >= weekStart) thisWeek++;
    if (d >= monthStart) thisMonth++;
    const k = dayKey(d);
    const bucket = weekly.findLast((w) => k >= w.week);
    if (bucket) bucket.count++;
  }
  return {
    total: entries.length, words, thisWeek, thisMonth, moods, categories, types, weekly,
    avgWords: entries.length ? Math.round(words / entries.length) : 0,
    firstEntryAt: entries.at(-1)?.createdAt || null,
    lastEntryAt: entries[0]?.createdAt || null,
  };
}
