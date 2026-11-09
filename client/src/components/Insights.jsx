import HeatMap from './HeatMap';
import Reports from './Reports';
import Reminders from './Reminders';
import EmotionReport from './EmotionReport';
import { MOODS, cap } from '../lib/format';

export function StatTiles({ stats, streaks }) {
  const tiles = [
    { label: 'Day streak', value: streaks.current, hint: `Best ${streaks.longest}` },
    { label: 'Entries', value: stats.total, hint: `${stats.thisMonth} this month` },
    { label: 'This week', value: stats.thisWeek, hint: 'last 7 days' },
    { label: 'Words', value: stats.words.toLocaleString(), hint: `${stats.avgWords} per entry` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="card p-4">
          <dt className="text-xs text-subtle">{t.label}</dt>
          <dd className="mt-1 font-display text-3xl tabular-nums text-ink">{t.value}</dd>
          <dd className="text-xs text-subtle">{t.hint}</dd>
        </div>
      ))}
    </dl>
  );
}

function MoodMix({ stats }) {
  const max = Math.max(1, ...Object.values(stats.moods));
  return (
    <section className="card">
      <p className="eyebrow">Emotions</p>
      <h2 className="h-section mb-4">Mood mix</h2>
      {stats.total === 0 ? <p className="text-sm text-subtle">Moods you pick while writing will show up here.</p> : (
        <ul className="space-y-2.5">
          {MOODS.map((m) => {
            const n = stats.moods[m.value] || 0;
            return (
              <li key={m.value} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                <span className="truncate text-muted">{m.emoji} {m.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-line/10">
                  <span className="block h-full rounded-full bg-accent2/80" style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className="text-right font-mono text-xs text-subtle">{n}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Weekly({ stats }) {
  const max = Math.max(1, ...stats.weekly.map((w) => w.count));
  const cats = Object.entries(stats.categories).sort((a, b) => b[1] - a[1]);
  return (
    <section className="card">
      <p className="eyebrow">Rhythm</p>
      <h2 className="h-section mb-4">Entries per week</h2>
      <div className="flex h-28 items-end gap-2" role="img" aria-label={`Entries per week over the last 8 weeks: ${stats.weekly.map((w) => w.count).join(', ')}`}>
        {stats.weekly.map((w, i) => (
          <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] text-subtle">{w.count || ''}</span>
            <div className={`w-full rounded-t-md ${i === stats.weekly.length - 1 ? 'bg-accent' : 'bg-accent/45'}`} style={{ height: `${Math.max(3, (w.count / max) * 80)}px` }} title={`Week of ${w.week}: ${w.count}`} />
            <span className="text-[10px] text-subtle">{new Date(w.week + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
        ))}
      </div>
      {cats.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {cats.map(([c, n]) => <span key={c} className="chip">{cap(c)} · {n}</span>)}
        </div>
      )}
      <p className="mt-4 text-xs text-subtle">✍️ {stats.types.text} written · 🎙️ {stats.types.voice} voice · 🎥 {stats.types.video} video</p>
    </section>
  );
}

export default function Insights({ d, version, onReminders }) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="eyebrow">Past self</p>
        <h1 className="font-display text-3xl">Insights</h1>
      </div>
      <StatTiles stats={d.stats} streaks={d.streaks} />
      <EmotionReport version={version} />
      <div className="grid gap-5 lg:grid-cols-2">
        <MoodMix stats={d.stats} />
        <Weekly stats={d.stats} />
      </div>
      <HeatMap streaks={d.streaks} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Reports report={d.report} />
        <Reminders reminders={d.reminders} onChange={onReminders} />
      </div>
    </div>
  );
}
