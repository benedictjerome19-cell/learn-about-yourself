// Accountability Alarm Engine
// Fires every minute, checks if any reminder is due and no entry exists today.
// Extend by setting SMTP_* or TWILIO_* env vars for real delivery.

import db from '../db.js';
import { dayKey, getStreaks } from './streaks.js';
import { escapeHtml } from '../security.js';

async function sendAlarm(user, reminder) {
  const msg = reminder.label;

  // Console fallback (always fires)
  console.log(`🔔 [Alarm] ${user.email} @ ${reminder.time} — "${msg}"`);

  // Email via SMTP (nodemailer — optional)
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const nm = await import('nodemailer');
      const transporter = nm.default.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from:    process.env.SMTP_FROM || process.env.SMTP_USER,
        to:      user.email,
        subject: '🔔 JournalMind Reminder',
        text:    msg,
        html:    `<div style="font-family:sans-serif;padding:24px;background:#0a0b12;color:#e8e8f5">
          <h2 style="color:#c49ef0">JournalMind</h2>
          <p style="font-size:18px">${escapeHtml(msg)}</p>
          <p style="color:#6b7280;font-size:12px">Alarm set for ${reminder.time}. No entry today yet.</p>
        </div>`,
      });
      console.log(`✉️  Email sent to ${user.email}`);
    } catch (e) {
      console.error('Email error:', e.message);
    }
  }

  // SMS via Twilio (optional)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && user.phone) {
    try {
      const tw = await import('twilio');
      const client = tw.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: `JournalMind: ${msg}`,
        from: process.env.TWILIO_PHONE,
        to:   user.phone,
      });
      console.log(`📱 SMS sent to ${user.phone}`);
    } catch (e) {
      console.error('Twilio error:', e.message);
    }
  }
}

function checkAlarms() {
  const now   = new Date();
  const hhmm  = now.toTimeString().slice(0, 5);
  const today = dayKey(now);

  for (const user of db.users) {
    const { days } = getStreaks(user);
    if (days[today]) continue; // Already journaled today

    const due = db.reminders.filter(r =>
      r.userId === user.id && r.enabled && r.time === hhmm
    );
    for (const r of due) {
      sendAlarm(user, r).catch(() => {});
    }
  }
}

export function startAlarmScheduler() {
  // Try node-cron, fall back to setInterval
  import('node-cron').then(mod => {
    mod.default.schedule('* * * * *', checkAlarms);
    console.log('⏰ Alarm scheduler started (node-cron)');
  }).catch(() => {
    setInterval(checkAlarms, 60_000);
    console.log('⏰ Alarm scheduler started (setInterval fallback)');
  });
}
