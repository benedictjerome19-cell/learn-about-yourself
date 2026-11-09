import db from '../db.js';
const KEYS = ['communication', 'pace', 'clarity', 'vocabulary', 'grammar'];

export function monthlyReport(user) {
  const by = {};
  db.scores.filter((s) => s.userId === user.id).forEach((s) => (by[s.month] ??= []).push(s));
  const months = Object.keys(by).sort().map((month) => {
    const list = by[month];
    const row = { month, count: list.length };
    KEYS.forEach((k) => { row[k] = Math.round(list.reduce((a, s) => a + s[k], 0) / list.length); });
    return row;
  });
  const last = months.slice(-2);
  const latest = last.at(-1) || null;
  const prev = last.length === 2 ? last[0] : null;
  const delta = prev ? Object.fromEntries(KEYS.map((k) => [k, latest[k] - prev[k]])) : null;
  const insight = !latest ? 'Write your first entry to see insights.'
    : delta ? `Communication ${delta.communication >= 0 ? 'improved' : 'dipped'} by ${Math.abs(delta.communication)} points vs last month.`
    : `Baseline communication score this month: ${latest.communication}.`;
  return { months, latest, delta, insight };
}
