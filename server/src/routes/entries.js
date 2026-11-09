import express, { Router } from 'express';
import db from '../db.js';
import {
  CATEGORIES, MOODS, ValidationError, allTags, createEntry, deleteEntry, entryStats,
  getEntry, listEntries, saveMedia, updateEntry,
} from '../services/journal.js';
import { chatWithPastSelf } from '../ai/chat.js';
import { rateLimit, sanitizeHtml } from '../security.js';

const r = Router();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Public shape of an entry: owner id and server file path stay private.
const view = ({ userId, mediaPath, ...e }) => ({
  ...e,
  text: sanitizeHtml(e.text),
  hasMedia: !!mediaPath,
  mediaUrl: mediaPath ? `/api/media/${e.id}` : null,
  score: db.scores.find((s) => s.entryId === e.id)?.communication ?? null,
});

const handle = (fn) => (req, res, next) => {
  try { fn(req, res, next); }
  catch (e) { e instanceof ValidationError ? res.status(400).json({ error: e.message }) : next(e); }
};

r.get('/', handle((req, res) => {
  const { q, tag, mood, type, category, from, to } = req.query;
  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) throw new ValidationError('Dates must be YYYY-MM-DD.');
  res.json(listEntries(req.user, { q, tag, mood, type, category, from, to }).map(view));
}));

r.get('/tags', (req, res) => res.json(allTags(req.user)));
r.get('/meta', (req, res) => res.json({ moods: MOODS, categories: CATEGORIES, tags: allTags(req.user) }));
r.get('/stats', (req, res) => res.json(entryStats(req.user)));

r.post('/', handle((req, res) => res.status(201).json(view(createEntry(req.user, req.body)))));

// Me vs Me semantic chat
r.post('/chat', rateLimit({ windowMs: 60_000, max: 20, bucket: 'chat' }), async (req, res, next) => {
  const question = String(req.body?.question || '').trim().slice(0, 2000);
  if (!question) return res.status(400).json({ error: 'Question required.' });
  try {
    res.json({ answer: await chatWithPastSelf(question, listEntries(req.user)) });
  } catch (e) { next(e); }
});

r.get('/:id', (req, res) => {
  const e = getEntry(req.user, req.params.id);
  e ? res.json(view(e)) : res.status(404).json({ error: 'Entry not found.' });
});

r.patch('/:id', handle((req, res) => {
  const e = updateEntry(req.user, req.params.id, req.body);
  e ? res.json(view(e)) : res.status(404).json({ error: 'Entry not found.' });
}));

r.delete('/:id', (req, res) => {
  deleteEntry(req.user, req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Entry not found.' });
});

// Raw recording upload from the browser (MediaRecorder blob)
const MEDIA_TYPES = /^(audio|video)\/(webm|mp4|ogg)\b/;
r.put('/:id/media', express.raw({ type: (req) => MEDIA_TYPES.test(req.headers['content-type'] || ''), limit: '300mb' }), (req, res) => {
  const type = req.headers['content-type'] || '';
  if (!MEDIA_TYPES.test(type)) return res.status(415).json({ error: 'Unsupported recording format.' });
  const ext   = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
  const entry = saveMedia(req.user, req.params.id, req.body, ext);
  entry ? res.json(view(entry)) : res.status(404).json({ error: 'Entry not found or empty file.' });
});

export default r;
