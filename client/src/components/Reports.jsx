import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';
import { Spinner } from '../lib/ui';

const LABELS = {
  communication: 'Communication',
  pace:          'Pace',
  clarity:       'Clarity',
  vocabulary:    'Vocabulary',
  grammar:       'Grammar',
};

const barColor = (n) => (n >= 80 ? 'bg-ok' : n >= 60 ? 'bg-accent2' : n >= 40 ? 'bg-warn' : 'bg-danger');

export default function Reports({ report }) {
  const { latest, delta, insight, months } = report;
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('scores'); // 'scores' | 'brief'

  const generateBriefing = async () => {
    setLoading(true);
    setTab('brief');
    try {
      setBriefing((await api('/reports/briefing', { method: 'POST' })).briefing);
    } catch (e) {
      setBriefing(`_Could not generate a briefing: ${e.message}_`);
    }
    setLoading(false);
  };

  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2 className="h-section">Monthly report</h2>
        </div>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'scores'} onClick={() => setTab('scores')}>Scores</button>
          <button role="tab" aria-selected={tab === 'brief'} onClick={() => setTab('brief')}>Briefing</button>
        </div>
      </div>

      {tab === 'scores' ? (
        <>
          <p className="mb-4 border-l-2 border-accent/60 pl-3 text-sm italic text-muted">{insight}</p>
          {latest ? (
            <div className="space-y-3">
              {Object.entries(LABELS).map(([k, label]) => (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted">{label}</span>
                    <span className="font-mono text-ink">
                      {latest[k]}
                      {delta && <span className={`ml-2 text-xs ${delta[k] >= 0 ? 'text-ok' : 'text-danger'}`}>{delta[k] >= 0 ? '+' : ''}{delta[k]}</span>}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line/10" role="meter" aria-valuenow={latest[k]} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                    <div className={`h-full rounded-full ${barColor(latest[k])} transition-all duration-700`} style={{ width: `${latest[k]}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-subtle">Heuristic writing scores across {latest.count} entr{latest.count === 1 ? 'y' : 'ies'} this month.</p>
            </div>
          ) : (
            <p className="text-sm text-subtle">Write your first entry to see scores.</p>
          )}

          {months.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-xs text-subtle">Communication by month</p>
              <div className="flex h-20 items-end gap-1.5">
                {months.slice(-12).map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div title={`${m.month}: ${m.communication}`} className="w-full rounded-t bg-accent/70" style={{ height: `${Math.max(4, m.communication * 0.6)}px` }} />
                    <span className="text-[10px] text-subtle">{m.month.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={generateBriefing} disabled={loading} className="btn-secondary mt-5 w-full">📋 Generate briefing document</button>
        </>
      ) : loading ? (
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted"><Spinner /> Reading your entries…</div>
      ) : briefing ? (
        <div>
          <div className="md"><ReactMarkdown>{briefing}</ReactMarkdown></div>
          <button onClick={generateBriefing} className="btn-ghost mt-3">↻ Regenerate</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="text-3xl">📋</span>
          <p className="max-w-sm text-sm text-muted">An executive summary of your journal: themes, mood mix, timeline and what keeps coming up.</p>
          <button onClick={generateBriefing} className="btn-primary">Generate now</button>
        </div>
      )}
    </section>
  );
}
