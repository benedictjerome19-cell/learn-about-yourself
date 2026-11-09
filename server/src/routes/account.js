import { Router } from 'express';
import db from '../db.js';
import { listEntries } from '../services/journal.js';
import { listReminders } from '../services/reminders.js';
import { stripHtml } from '../security.js';

// Personal data export: everything the user wrote, as JSON. Credentials are never included.
const r = Router();
r.get('/export', (req, res) => {
  const u = req.user;
  const data = {
    exportedAt: new Date().toISOString(),
    account: { email: u.email, name: u.name, createdAt: u.createdAt },
    entries: listEntries(u).map(({ userId, mediaPath, ...e }) => ({ ...e, plainText: stripHtml(e.text), hasRecording: !!mediaPath })),
    reminders: listReminders(u).map(({ userId, ...rem }) => rem),
    scores: db.scores.filter((s) => s.userId === u.id).map(({ userId, ...s }) => s),
  };
  res.set('Content-Disposition', `attachment; filename="journalmind-export-${data.exportedAt.slice(0, 10)}.json"`);
  res.json(data);
});
export default r;
