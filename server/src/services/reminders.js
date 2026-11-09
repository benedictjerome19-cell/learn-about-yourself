import { v4 as uuid } from 'uuid';
import db, { save } from '../db.js';
import { dayKey, getStreaks } from './streaks.js';
import { ValidationError } from './journal.js';

const TONES = ['gentle', 'tough', 'custom'];
const hhmmNow = () => new Date().toTimeString().slice(0, 5);

export const listReminders = (user) => db.reminders.filter((r) => r.userId === user.id).sort((a, b) => a.time.localeCompare(b.time));

export function addReminder(user, { time = '20:00', label = 'Time to journal', tone = 'gentle' } = {}) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) throw new ValidationError('Time must be HH:MM (24-hour).');
  if (!TONES.includes(tone)) throw new ValidationError('Unknown reminder tone.');
  const text = String(label || '').trim().slice(0, 280);
  if (!text) throw new ValidationError('Reminder message cannot be empty.');
  if (listReminders(user).length >= 20) throw new ValidationError('You can have at most 20 reminders.');
  const r = { id: uuid(), userId: user.id, time, label: text, tone, enabled: true };
  db.reminders.push(r);
  save();
  return r;
}

export function toggleReminder(user, id) {
  const r = listReminders(user).find((x) => x.id === id);
  if (r) { r.enabled = !r.enabled; save(); }
  return r || null;
}

export function deleteReminder(user, id) {
  const idx = db.reminders.findIndex((r) => r.id === id && r.userId === user.id);
  if (idx >= 0) { db.reminders.splice(idx, 1); save(); }
  return idx >= 0;
}

export function dueReminders(user) {
  const { days, current } = getStreaks(user);
  if (days[dayKey(new Date())]) return [];
  const hhmm = hhmmNow();
  return listReminders(user)
    .filter((r) => r.enabled && r.time <= hhmm)
    .map((r) => ({
      ...r,
      nudge: current > 0
        ? `🔥 Keep your ${current}-day streak alive: ${r.label}`
        : r.label,
    }));
}
