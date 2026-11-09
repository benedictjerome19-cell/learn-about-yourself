import { dayKey, fmtDate } from '../lib/format';

// GitHub-style consistency grid for the last 26 weeks (local days, Sunday-first columns).
const shade = (n) =>
  n >= 4 ? 'bg-accent' : n === 3 ? 'bg-accent/75' : n === 2 ? 'bg-accent/50' : n === 1 ? 'bg-accent/30' : 'bg-line/[0.07]';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKS = 26;

export default function HeatMap({ streaks }) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - (WEEKS - 1) * 7);

  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
    const k = dayKey(dt);
    return { k, dt, count: streaks.days[k] || 0, future: dt > today };
  }));

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Consistency</p>
          <h2 className="h-section">{streaks.current} day streak {streaks.current > 0 && '🔥'}</h2>
        </div>
        <dl className="flex gap-5 text-right">
          <div><dt className="text-xs text-subtle">Days journaled</dt><dd className="font-display text-xl text-accent2">{streaks.totalDays}</dd></div>
          <div><dt className="text-xs text-subtle">Longest streak</dt><dd className="font-display text-xl text-accent">{streaks.longest}</dd></div>
        </dl>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-[3px] pl-0 text-[10px] text-subtle" aria-hidden>
            {weeks.map((w, i) => (
              <span key={i} className="w-3 overflow-visible whitespace-nowrap">
                {w[0].dt.getDate() <= 7 ? MONTHS[w[0].dt.getMonth()] : ''}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]" role="img" aria-label={`${streaks.totalDays} days journaled in total; current streak ${streaks.current} days`}>
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {w.map((c) => (
                  <span key={c.k} title={c.future ? '' : `${fmtDate(c.dt)}: ${c.count} entr${c.count === 1 ? 'y' : 'ies'}`}
                    className={`h-3 w-3 rounded-[3px] ${c.future ? 'opacity-0' : shade(c.count)} ${c.k === streaks.today ? 'ring-1 ring-accent2' : ''}`} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((n) => <span key={n} className={`h-3 w-3 rounded-[3px] ${shade(n)}`} />)}
        <span>More</span>
      </div>
    </section>
  );
}
