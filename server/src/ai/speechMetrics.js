const FILLERS = ['um', 'uh', 'like', 'basically', 'actually', 'literally', 'you know', 'honestly'];
export function speechMetrics(text, durationSec = 0) {
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  const dur = Math.max(durationSec || (words.length / 140) * 60, 1);
  const fillerCount = FILLERS.reduce((n, f) => n + (text.toLowerCase().match(new RegExp(`\\b${f}\\b`, 'g')) || []).length, 0);
  return { words: words.length, wpm: Math.round(words.length / (dur / 60)), fillerCount,
    fillerRate: words.length ? +((fillerCount / words.length) * 100).toFixed(1) : 0 };
}
