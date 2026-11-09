import { Router } from 'express';
import { listReminders, addReminder, toggleReminder, dueReminders, deleteReminder } from '../services/reminders.js';
import { ValidationError } from '../services/journal.js';

const r = Router();
r.get('/',        (req, res) => res.json(listReminders(req.user)));
r.get('/due',     (req, res) => res.json(dueReminders(req.user)));
r.post('/',       (req, res, next) => {
  try { res.status(201).json(addReminder(req.user, req.body)); }
  catch (e) { e instanceof ValidationError ? res.status(400).json({ error: e.message }) : next(e); }
});
r.patch('/:id',   (req, res) => {
  const rem = toggleReminder(req.user, req.params.id);
  rem ? res.json(rem) : res.status(404).json({ error: 'Reminder not found.' });
});
r.delete('/:id',  (req, res) => {
  deleteReminder(req.user, req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Reminder not found.' });
});
export default r;
