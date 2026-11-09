import { useEffect, useState } from 'react';
import { api } from '../api';
import { Spinner } from '../lib/ui';

const RANGES = [['30', '30 days'], ['90', '90 days'], ['365', '12 months'], ['all', 'All time']];
const TREND = { improving: ['↗ Lifting', 'text-ok'], declining: ['↘ Dipping', 'text-danger'], stable: ['→ Steady', 'text-accent2'], insufficient: ['… Too early', 'text-subtle'] };

// Preview of the emotional analysis plus a PDF download of the full report.
export default function EmotionReport({ version }) {
  const [range, setRange] = useState('30');
  const [a, setA] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    setA(null); setError('');
    api(`/reports/emotions?range=${range}`, { signal: ctrl.signal })
      .then(setA)
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, [range, version]);

  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Report</p>
          <h2 className="h-section">Emotional analysis</h2>
          <p className="text-xs text-subtle">Your moods, patterns and recurring feelings, summarised as a PDF.</p>
        </div>
        <div className="seg text-xs" role="group" aria-label="Report period">
          {RANGES.map(([v, l]) => <button key={v} aria-pressed={range === v} onClick={() => setRange(v)} className="!px-2.5 !text-xs">{l}</button>)}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!a && !error && <div className="flex justify-center py-6"><Spinner /></div>}

      {a && (
        <>
          {!a.empty && (
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="chip">{a.entries} entr{a.entries === 1 ? 'y' : 'ies'}</span>
              <span className="chip text-ok">{a.balance.positive}% positive</span>
              <span className="chip text-danger">{a.balance.difficult}% difficult</span>
              <span className={`chip ${TREND[a.trend.direction][1]}`}>{TREND[a.trend.direction][0]}</span>
            </div>
          )}
          <p className="text-sm leading-relaxed text-muted">{a.summary.join(' ')}</p>
          {a.supportNote && <p className="mt-3 rounded-xl bg-accent/10 px-3 py-2 text-sm text-ink">{a.supportNote}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a className={`btn-primary ${a.empty ? 'pointer-events-none opacity-50' : ''}`} aria-disabled={a.empty}
              href={`/api/reports/emotions.pdf?range=${range}`} download>
              ⬇ Download PDF report
            </a>
            <span className="text-xs text-subtle">Generated on your server — nothing is sent to an AI service.</span>
          </div>
        </>
      )}
    </section>
  );
}
