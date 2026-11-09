import db from '../db.js';

// Local calendar day (YYYY-MM-DD) — streaks and the heatmap count days as the user lives them.
export const dayKey = (d) => {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function getStreaks(user) {
  const days = {};
  db.entries.filter((e) => e.userId === user.id).forEach((e) => { days[dayKey(e.createdAt)] = (days[dayKey(e.createdAt)] || 0) + 1; });
  let current = 0;
  const d = new Date();
  if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (days[dayKey(d)]) { current++; d.setDate(d.getDate() - 1); }
  let longest = 0, run = 0, prev = null;
  const keys = Object.keys(days).sort();
  for (const k of keys) {
    run = prev && new Date(k) - new Date(prev) === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run); prev = k;
  }
  return { current, longest, totalDays: keys.length, days, today: dayKey(new Date()) };
}
