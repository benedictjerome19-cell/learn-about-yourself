export const MOODS = [
  { value: 'happy',    emoji: '😊', label: 'Happy' },
  { value: 'calm',     emoji: '😌', label: 'Calm' },
  { value: 'neutral',  emoji: '😐', label: 'Neutral' },
  { value: 'active',   emoji: '⚡', label: 'Energised' },
  { value: 'stressed', emoji: '😰', label: 'Stressed' },
  { value: 'sad',      emoji: '😔', label: 'Low' },
];
export const moodOf = (v) => MOODS.find((m) => m.value === v) || MOODS[2];

export const CATEGORIES = ['personal', 'work', 'health', 'relationships', 'gratitude', 'goals', 'ideas', 'travel'];
export const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);

export const TYPE_ICON = { text: '✍️', voice: '🎙️', video: '🎥' };

// Plain text of (server-sanitised) entry HTML, for excerpts and word counts.
export function plain(html = '') {
  const doc = new DOMParser().parseFromString(`<body>${html.replace(/<(br|\/p|\/div|\/li)>/gi, '$& ')}</body>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export const wordCount = (s = '') => (s.match(/[\p{L}\p{N}']+/gu) || []).length;

export const fmtDate = (d, opts) => new Date(d).toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const fmtDateTime = (d) => `${fmtDate(d)} · ${fmtTime(d)}`;
export const monthKey = (d) => new Date(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export function relative(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Local calendar day, matching the server's streak keys.
export const dayKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

export const fmtDuration = (sec = 0) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}${name ? `, ${name}` : ''}`;
}
