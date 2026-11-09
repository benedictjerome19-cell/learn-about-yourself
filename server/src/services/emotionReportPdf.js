// Renders emotionalAnalysis() output as a brief, printable A4 PDF.
import PDFDocument from 'pdfkit';
import { MOOD_LABEL } from './emotions.js';

const C = {
  ink: '#1c1917', muted: '#57534e', subtle: '#8a847c', line: '#e7e2d9', paper: '#f7f5f0',
  accent: '#6d4ad3', teal: '#0d8078', good: '#15803d', bad: '#c81e1e',
};
const MOOD_COLOR = { happy: '#f59e0b', calm: '#14b8a6', active: '#8b5cf6', neutral: '#a8a29e', stressed: '#ef4444', sad: '#6366f1' };
const TREND = { improving: ['Lifting', C.good], declining: ['Dipping', C.bad], stable: ['Steady', C.teal], insufficient: ['Too early', C.subtle] };

// The built-in PDF fonts only cover Western European text; drop anything else (e.g. emoji).
const safe = (s = '') => String(s).replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF‘’“”–—…•]/g, '').replace(/\s{2,}/g, ' ').trim();
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtPeriod = (p, unit) => (unit === 'month'
  ? new Date(`${p}-01T00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  : new Date(`${p}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));

export function renderEmotionReport(a, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: 'JournalMind — Emotional Analysis Report', Author: 'JournalMind' } });
  doc.pipe(stream);
  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 30;
  const ensure = (h) => { if (doc.y + h > bottom()) doc.addPage(); };

  const heading = (text, h = 60) => {
    ensure(h);
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text(text, L, doc.y);
    doc.moveTo(L, doc.y + 3).lineTo(L + W, doc.y + 3).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.moveDown(0.6);
  };
  const body = (text, opts = {}) => doc.font('Helvetica').fontSize(10.5).fillColor(C.muted).text(safe(text), L, doc.y, { width: W, lineGap: 2.5, ...opts });

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 118).fill(C.paper);
  doc.rect(0, 118, doc.page.width, 2).fill(C.accent);
  doc.font('Helvetica').fontSize(9).fillColor(C.accent).text('JOURNALMIND', L, 38, { characterSpacing: 2 });
  doc.font('Helvetica-Bold').fontSize(22).fillColor(C.ink).text('Emotional Analysis Report', L, 52);
  doc.font('Helvetica').fontSize(10).fillColor(C.muted)
    .text(safe(`${a.user.name || 'Your journal'}  ·  ${a.rangeLabel} (${fmtDay(a.from)} – ${fmtDay(a.to)})  ·  Generated ${fmtDay(a.generatedAt)}`), L, 84, { width: W });
  doc.y = 140;

  if (a.empty) {
    heading('In brief');
    a.summary.forEach((p) => { body(p); doc.moveDown(0.4); });
    return finish(doc);
  }

  // ── Key figures ─────────────────────────────────────────────────────────────
  const [trendLabel, trendColor] = TREND[a.trend.direction];
  const tiles = [
    ['Entries', String(a.entries), C.ink],
    ['Days journaled', String(a.daysJournaled), C.ink],
    ['Positive entries', `${a.balance.positive}%`, C.teal],
    ['Mood trend', trendLabel, trendColor],
  ];
  const gap = 10, tw = (W - gap * 3) / 4, ty = doc.y;
  tiles.forEach(([label, value, color], i) => {
    const x = L + i * (tw + gap);
    doc.roundedRect(x, ty, tw, 58, 8).fillAndStroke('#ffffff', C.line);
    doc.font('Helvetica').fontSize(8.5).fillColor(C.subtle).text(label.toUpperCase(), x + 10, ty + 11, { width: tw - 20, characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(18).fillColor(color).text(value, x + 10, ty + 27, { width: tw - 20 });
  });
  doc.y = ty + 70;

  // ── In brief ────────────────────────────────────────────────────────────────
  heading('In brief');
  body(a.summary.join(' '));

  // ── Mood mix ────────────────────────────────────────────────────────────────
  heading('Mood mix', 190);
  const max = Math.max(1, ...Object.values(a.moods));
  for (const [m, n] of Object.entries(a.moods)) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(MOOD_LABEL[m], L, y + 1, { width: 80 });
    doc.roundedRect(L + 85, y + 2, W - 160, 9, 4.5).fill('#efebe4');
    if (n) doc.roundedRect(L + 85, y + 2, Math.max(9, ((W - 160) * n) / max), 9, 4.5).fill(MOOD_COLOR[m]);
    doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(`${n}  (${Math.round((n / a.entries) * 100)}%)`, L + W - 68, y + 1, { width: 68, align: 'right' });
    doc.y = y + 18;
  }
  // balance bar
  doc.moveDown(0.5);
  const by = doc.y;
  let bx = L;
  [['positive', C.teal, 'Positive'], ['neutral', '#c9c3b8', 'Neutral'], ['difficult', C.bad, 'Difficult']].forEach(([k, color]) => {
    const w = (W * a.balance[k]) / 100;
    if (w > 0) { doc.rect(bx, by, w, 10).fill(color); bx += w; }
  });
  doc.font('Helvetica').fontSize(9).fillColor(C.muted)
    .text(`Positive ${a.balance.positive}%   ·   Neutral ${a.balance.neutral}%   ·   Difficult ${a.balance.difficult}%`, L, by + 16, { width: W, align: 'center' });
  doc.y = by + 32;

  // ── Mood over time ──────────────────────────────────────────────────────────
  heading(`Mood over time (average per ${a.timeline.unit})`, 170);
  const pts = a.timeline.points.slice(-16);
  const ch = 100, cy = doc.y, mid = cy + ch / 2;
  doc.font('Helvetica').fontSize(8).fillColor(C.subtle);
  doc.text('brighter', L, cy - 2).text('heavier', L, cy + ch - 8);
  const cx = L + 46, cw = W - 46;
  doc.moveTo(cx, mid).lineTo(cx + cw, mid).lineWidth(0.6).strokeColor(C.line).stroke();
  const slot = cw / Math.max(pts.length, 1), bw = Math.min(28, slot * 0.6);
  pts.forEach((p, i) => {
    const h = (Math.abs(p.avg) / 2) * (ch / 2 - 6);
    const x = cx + i * slot + (slot - bw) / 2;
    const color = p.avg > 0.25 ? C.teal : p.avg < -0.25 ? C.bad : '#b8b1a6';
    if (h < 1.5) doc.rect(x, mid - 1, bw, 2).fill(color);
    else doc.rect(x, p.avg > 0 ? mid - h : mid, bw, h).fill(color);
    if (pts.length <= 12 || i % 2 === 0) {
      doc.font('Helvetica').fontSize(7.5).fillColor(C.subtle).text(fmtPeriod(p.period, a.timeline.unit), cx + i * slot, cy + ch + 4, { width: slot, align: 'center' });
    }
  });
  doc.y = cy + ch + 20;
  body('Each bar is the average self-reported mood for that period (Happy +2, Calm/Energised +1, Neutral 0, Stressed -1, Low -2).', { fontSize: 8.5 });
  doc.fontSize(10.5);

  // ── Patterns ────────────────────────────────────────────────────────────────
  heading('Patterns', 90);
  const bullets = [];
  if (a.weekday) bullets.push(`Brightest day: ${a.weekday.brightest.name} (average ${a.weekday.brightest.avg > 0 ? '+' : ''}${a.weekday.brightest.avg}). Hardest day: ${a.weekday.hardest.name} (average ${a.weekday.hardest.avg > 0 ? '+' : ''}${a.weekday.hardest.avg}).`);
  if (a.lifts.length) bullets.push(`Tends to lift your mood: ${a.lifts.map((t) => `${t.name} (${t.count} entries)`).join(', ')}.`);
  if (a.weighs.length) bullets.push(`Often comes with difficult feelings: ${a.weighs.map((t) => `${t.name} (${t.count} entries)`).join(', ')}.`);
  if (!bullets.length) bullets.push('Not enough repeated days, tags or categories yet to show reliable patterns. Tagging entries makes these visible.');
  bullets.forEach((b) => { ensure(30); body(`•  ${b}`, { indent: 0 }); doc.moveDown(0.3); });

  // ── Emotions in your words ──────────────────────────────────────────────────
  heading('Emotions in your words', 120);
  if (!a.topThemes.length) body('No strongly emotional words were found in your writing for this period.');
  else {
    const tmax = a.topThemes[0].count;
    a.topThemes.slice(0, 7).forEach((t) => {
      const y = doc.y;
      const color = ['joy', 'gratitude', 'calm'].includes(t.theme) ? C.teal : C.accent;
      doc.font('Helvetica').fontSize(10).fillColor(C.ink).text(t.label, L, y + 1, { width: 80 });
      doc.roundedRect(L + 85, y + 2, Math.max(9, ((W - 160) * t.count) / tmax), 9, 4.5).fill(color);
      doc.font('Helvetica').fontSize(9.5).fillColor(C.muted).text(`${t.count} mention${t.count === 1 ? '' : 's'}`, L + W - 68, y + 1, { width: 68, align: 'right' });
      doc.y = y + 18;
    });
    doc.moveDown(0.3);
    body('Counted from emotion words in your entries (e.g. "worried", "grateful", "tired").', { fontSize: 8.5 });
  }

  // ── Highlights ──────────────────────────────────────────────────────────────
  const hl = [['Brightest moment', a.highlights.brightest, C.teal], ['Hardest moment', a.highlights.hardest, C.bad]].filter(([, h]) => h);
  if (hl.length) {
    heading('Moments that stood out', 110);
    hl.forEach(([label, h, color]) => {
      const text = safe(`${h.title ? `${h.title} — ` : ''}"${h.excerpt}"`);
      doc.font('Helvetica').fontSize(10);
      const th = doc.heightOfString(text, { width: W - 28, lineGap: 2 });
      ensure(th + 40);
      const y = doc.y;
      doc.rect(L, y, 3, th + 26).fill(color);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(color).text(`${label.toUpperCase()}  ·  ${fmtDay(h.date)}  ·  ${MOOD_LABEL[h.mood]}`, L + 14, y + 2, { width: W - 14, characterSpacing: 0.4 });
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(C.ink).text(text, L + 14, y + 17, { width: W - 28, lineGap: 2 });
      doc.y = y + th + 34;
    });
  }

  // ── Suggestions ─────────────────────────────────────────────────────────────
  heading('Gentle suggestions', 100);
  a.suggestions.forEach((t, i) => {
    ensure(36);
    const y = doc.y;
    doc.circle(L + 8, y + 7, 8).fill(C.accent);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text(String(i + 1), L, y + 3, { width: 16, align: 'center' });
    doc.font('Helvetica').fontSize(10.5).fillColor(C.muted).text(safe(t), L + 24, y, { width: W - 24, lineGap: 2.5 });
    doc.moveDown(0.6);
  });

  if (a.supportNote) {
    doc.font('Helvetica').fontSize(10);
    const th = doc.heightOfString(a.supportNote, { width: W - 24 });
    ensure(th + 30);
    doc.moveDown(0.6);
    const y = doc.y;
    doc.roundedRect(L, y, W, th + 20, 8).fill('#f1ecfb');
    doc.fillColor(C.ink).text(safe(a.supportNote), L + 12, y + 10, { width: W - 24 });
    doc.y = y + th + 28;
  }

  return finish(doc);
}

function finish(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 42;
    const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
    doc.page.margins.bottom = 0; // let the footer sit below the content area without adding a page
    doc.moveTo(L, y - 8).lineTo(L + W, y - 8).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(C.subtle)
      .text('Private — generated by JournalMind from your own entries. A reflection aid based on your moods and words, not a clinical assessment.', L, y, { width: W - 60, lineBreak: true })
      .text(`Page ${i - range.start + 1} of ${range.count}`, L + W - 60, y, { width: 60, align: 'right' });
  }
  doc.end();
}
