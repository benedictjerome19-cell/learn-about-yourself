// Emotional analysis of a user's journal over a period. Everything here is local and
// transparent: self-reported moods carry the most weight, and a small word lexicon
// picks out emotional themes in the text. It is a reflection aid, not an assessment.
import { listEntries } from './journal.js';
import { dayKey, getStreaks } from './streaks.js';
import { stripHtml } from '../security.js';

export const MOOD_SCORE = { happy: 2, calm: 1, active: 1, neutral: 0, stressed: -1, sad: -2 };
export const MOOD_LABEL = { happy: 'Happy', calm: 'Calm', active: 'Energised', neutral: 'Neutral', stressed: 'Stressed', sad: 'Low' };
const POSITIVE = ['happy', 'calm', 'active'];
const DIFFICULT = ['stressed', 'sad'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Word stems per theme; matched at the start of a word ("worr" → worry, worried).
export const THEMES = {
  joy:       ['happy', 'happi', 'joy', 'excit', 'fun', 'smil', 'laugh', 'great', 'wonderful', 'amazing', 'love', 'delight', 'proud'],
  gratitude: ['grateful', 'thankful', 'thank', 'appreciat', 'lucky', 'blessed', 'gratitude'],
  calm:      ['calm', 'peace', 'relax', 'quiet', 'rest', 'seren', 'content', 'gentle', 'still', 'breath'],
  anxiety:   ['anxi', 'worr', 'nervous', 'stress', 'overwhelm', 'panic', 'pressure', 'deadline', 'afraid', 'fear', 'tense', 'uneasy'],
  sadness:   ['sad', 'lonely', 'alone', 'cry', 'cried', 'miss', 'hurt', 'empty', 'disappoint', 'heartbr', 'grief', 'unhappy'],
  anger:     ['angry', 'anger', 'frustrat', 'annoy', 'irritat', 'furious', 'unfair', 'upset', 'resent'],
  fatigue:   ['tired', 'exhaust', 'drain', 'sleepy', 'burnout', 'burnt', 'fatigue', 'sick', 'heavy', 'slow'],
};
export const THEME_LABEL = { joy: 'Joy', gratitude: 'Gratitude', calm: 'Calm', anxiety: 'Anxiety', sadness: 'Sadness', anger: 'Frustration', fatigue: 'Fatigue' };
const POSITIVE_THEMES = ['joy', 'gratitude', 'calm'];
const THEME_RE = Object.fromEntries(Object.entries(THEMES).map(([k, stems]) => [k, new RegExp(`\\b(${stems.join('|')})[a-z']*`, 'gi')]));

export const RANGES = { 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last 12 months', all: 'All time' };
const SPAN = { 30: 'the last 30 days', 90: 'the last 90 days', 365: 'the last 12 months', all: 'your whole journal' };

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const textOf = (e) => [e.title, e.transcript || stripHtml(e.text || '')].filter(Boolean).join('. ');

function themesIn(text) {
  const out = {};
  for (const [k, re] of Object.entries(THEME_RE)) out[k] = (text.match(re) || []).length;
  return out;
}

function excerpt(e, len = 180) {
  const t = (e.transcript || stripHtml(e.text || '')).replace(/\s+/g, ' ').trim();
  return t.length > len ? t.slice(0, len - 1).replace(/\s+\S*$/, '') + '…' : t;
}

export function emotionalAnalysis(user, range = '30') {
  const key = RANGES[range] ? String(range) : '30';
  const now = new Date();
  const start = key === 'all' ? null : new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(key) + 1);
  const all = listEntries(user);
  const entries = all.filter((e) => !start || new Date(e.createdAt) >= start).reverse(); // oldest first
  const periodStart = start || (entries[0] ? new Date(entries[0].createdAt) : now);
  const periodDays = Math.max(1, Math.round((now - periodStart) / 86400000) + 1);

  const base = {
    user: { name: user.name },
    range: key, rangeLabel: RANGES[key],
    from: dayKey(periodStart), to: dayKey(now),
    generatedAt: now.toISOString(),
    entries: entries.length,
  };
  if (!entries.length) {
    return { ...base, empty: true, summary: [`There are no journal entries from ${SPAN[key]} yet. Write a few entries, choosing a mood each time, then generate the report again.`], suggestions: [] };
  }

  // ── Mood mix and balance ────────────────────────────────────────────────────
  const moods = Object.fromEntries(Object.keys(MOOD_SCORE).map((m) => [m, 0]));
  entries.forEach((e) => { moods[e.mood] = (moods[e.mood] || 0) + 1; });
  const positive = POSITIVE.reduce((n, m) => n + moods[m], 0);
  const difficult = DIFFICULT.reduce((n, m) => n + moods[m], 0);
  const balance = { positive: pct(positive, entries.length), neutral: pct(moods.neutral, entries.length), difficult: pct(difficult, entries.length) };
  const dominant = Object.entries(moods).sort((a, b) => b[1] - a[1])[0][0];
  const scores = entries.map((e) => MOOD_SCORE[e.mood] ?? 0);
  const avgMood = round(avg(scores));

  // ── Trend: first half vs second half of the entries ─────────────────────────
  let trend = { direction: 'insufficient', delta: 0 };
  if (entries.length >= 4) {
    const half = Math.floor(entries.length / 2);
    const delta = round(avg(scores.slice(half)) - avg(scores.slice(0, half)));
    trend = { direction: delta >= 0.35 ? 'improving' : delta <= -0.35 ? 'declining' : 'stable', delta };
  }

  // ── Timeline: weekly (or monthly for long periods) average mood ─────────────
  const monthly = periodDays > 120;
  const buckets = new Map();
  for (const e of entries) {
    const d = new Date(e.createdAt);
    const k = monthly ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : (() => { const s = new Date(d); s.setDate(d.getDate() - d.getDay()); return dayKey(s); })();
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(MOOD_SCORE[e.mood] ?? 0);
  }
  const timeline = { unit: monthly ? 'month' : 'week', points: [...buckets].map(([period, xs]) => ({ period, avg: round(avg(xs)), count: xs.length })) };

  // ── Patterns: weekdays, tags, categories ────────────────────────────────────
  const byDay = WEEKDAYS.map((name) => ({ name, scores: [] }));
  entries.forEach((e) => byDay[new Date(e.createdAt).getDay()].scores.push(MOOD_SCORE[e.mood] ?? 0));
  const days = byDay.filter((d) => d.scores.length >= 2).map((d) => ({ name: d.name, avg: round(avg(d.scores)), count: d.scores.length }));
  const sortedDays = [...days].sort((a, b) => b.avg - a.avg);
  const weekday = sortedDays.length >= 2 && sortedDays[0].avg - sortedDays.at(-1).avg >= 0.75
    ? { brightest: sortedDays[0], hardest: sortedDays.at(-1) } : null;

  const groupBy = (keysOf) => {
    const m = new Map();
    entries.forEach((e) => keysOf(e).forEach((k) => { if (!m.has(k)) m.set(k, []); m.get(k).push(MOOD_SCORE[e.mood] ?? 0); }));
    return [...m].filter(([, xs]) => xs.length >= 2).map(([name, xs]) => ({ name, avg: round(avg(xs)), count: xs.length }));
  };
  const tags = [...groupBy((e) => e.tags.map((t) => `#${t}`)), ...groupBy((e) => (e.category ? [e.category] : []))];
  const lifts = tags.filter((t) => t.avg >= 1).sort((a, b) => b.avg - a.avg || b.count - a.count).slice(0, 3);
  const weighs = tags.filter((t) => t.avg <= -0.5).sort((a, b) => a.avg - b.avg || b.count - a.count).slice(0, 3);

  // ── Emotions in the user's own words ────────────────────────────────────────
  const themes = Object.fromEntries(Object.keys(THEMES).map((k) => [k, 0]));
  const perEntry = entries.map((e) => {
    const t = themesIn(textOf(e));
    Object.entries(t).forEach(([k, n]) => { themes[k] += n; });
    const pos = POSITIVE_THEMES.reduce((n, k) => n + t[k], 0);
    const neg = Object.keys(THEMES).filter((k) => !POSITIVE_THEMES.includes(k)).reduce((n, k) => n + t[k], 0);
    return { e, tone: (MOOD_SCORE[e.mood] ?? 0) + (pos + neg ? (pos - neg) / (pos + neg) : 0) };
  });
  const topThemes = Object.entries(themes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

  // ── Highlights ──────────────────────────────────────────────────────────────
  const withText = perEntry.filter((p) => excerpt(p.e));
  const brightest = [...withText].sort((a, b) => b.tone - a.tone)[0];
  const hardest = [...withText].sort((a, b) => a.tone - b.tone)[0];
  const highlight = (p) => p && { date: p.e.createdAt, title: p.e.title || '', mood: p.e.mood, excerpt: excerpt(p.e) };

  const daysJournaled = new Set(entries.map((e) => dayKey(e.createdAt))).size;
  const streaks = getStreaks(user);

  // ── Narrative ───────────────────────────────────────────────────────────────
  const s = [];
  s.push(`Over ${SPAN[key]} you wrote ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} on ${daysJournaled} day${daysJournaled === 1 ? '' : 's'}. You most often felt ${MOOD_LABEL[dominant].toLowerCase()} (${pct(moods[dominant], entries.length)}% of entries).`);
  s.push(`${balance.positive}% of entries were positive (happy, calm or energised), ${balance.neutral}% neutral and ${balance.difficult}% difficult (stressed or low).`);
  if (trend.direction === 'improving') s.push('Your mood has been lifting: recent entries are noticeably brighter than earlier ones in this period.');
  else if (trend.direction === 'declining') s.push('Your mood has dipped recently: later entries are heavier than earlier ones in this period.');
  else if (trend.direction === 'stable') s.push('Your mood has held fairly steady through this period.');
  if (weekday) s.push(`${weekday.brightest.name}s tended to be your brightest days and ${weekday.hardest.name}s the hardest.`);
  if (weighs[0]) s.push(`Entries about ${weighs[0].name} were more often difficult${lifts[0] ? `, while ${lifts[0].name} tended to lift you` : ''}.`);
  else if (lifts[0]) s.push(`Entries about ${lifts[0].name} tended to come with a lighter mood.`);
  if (topThemes.length) s.push(`In your own words, ${topThemes.slice(0, 2).map(([k]) => THEME_LABEL[k].toLowerCase()).join(' and ')} came up most.`);

  // ── Gentle suggestions (rule-based, most relevant first) ────────────────────
  const tips = [];
  if (balance.difficult >= 40) tips.push('Stress or low mood showed up often. On hard days, try ending your entry with one small thing that helped, even briefly — over time it becomes a list of what works for you.');
  if (trend.direction === 'declining') tips.push('Things have felt heavier lately. Notice what changed in the last couple of weeks (sleep, workload, people) and write about one thing you could adjust.');
  if (weighs[0]) tips.push(`${weighs[0].name} often comes with difficult feelings. Next time, try writing down one part of it that is within your control.`);
  if (weekday) tips.push(`${weekday.hardest.name}s look tougher. Plan something restorative for that day, or do a short check-in the evening before.`);
  if (trend.direction === 'improving') tips.push('Your mood is improving. Write down what has been different recently so you can come back to it.');
  if (themes.gratitude === 0 && entries.length >= 3) tips.push('Try closing entries with one line of gratitude; it is a simple habit that tends to brighten reflection.');
  if (daysJournaled / periodDays < 0.3 && periodDays >= 14) tips.push('Short, regular check-ins give a clearer picture than occasional long ones. Even two sentences and a mood count.');
  if (tips.length < 3 && lifts[0]) tips.push(`${lifts[0].name} seems to do you good. Make a little more room for it.`);
  if (tips.length < 3) tips.push('Keep choosing a mood with each entry; it is what makes these patterns visible.');

  const lowStretch = entries.length >= 5 && pct(moods.sad + moods.stressed, entries.length) >= 60 && trend.direction !== 'improving';

  return {
    ...base,
    empty: false,
    daysJournaled, periodDays,
    streak: { current: streaks.current, longest: streaks.longest },
    moods, balance, dominant, avgMood, trend, timeline,
    weekday, lifts, weighs,
    themes, topThemes: topThemes.map(([k, n]) => ({ theme: k, label: THEME_LABEL[k], count: n })),
    highlights: { brightest: highlight(brightest), hardest: brightest === hardest ? null : highlight(hardest) },
    summary: s,
    suggestions: tips.slice(0, 3),
    supportNote: lowStretch
      ? 'Many recent entries were stressed or low. If these feelings persist, consider talking with someone you trust or a mental-health professional — reaching out is a strength.'
      : null,
  };
}
