import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { CATEGORIES, MOODS, TYPE_ICON, cap, fmtTime, fmtDate, moodOf, monthKey, plain } from '../lib/format';
import { Spinner, useDebounced } from '../lib/ui';

const EMPTY = { q: '', mood: '', category: '', type: '', tag: '', from: '', to: '' };

export function EntryCard({ e, onOpen }) {
  const m = moodOf(e.mood);
  const text = plain(e.text) || e.transcript;
  return (
    <button onClick={() => onOpen(e)} className="card group block w-full p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-2xl" title={m.label} aria-label={`Mood: ${m.label}`}>{m.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
            <time dateTime={e.createdAt}>{fmtDate(e.createdAt)} · {fmtTime(e.createdAt)}</time>
            {e.type !== 'text' && <span>{TYPE_ICON[e.type]} {e.type}</span>}
            {e.category && <span className="chip py-0">{cap(e.category)}</span>}
            {e.updatedAt && e.updatedAt !== e.createdAt && <span className="italic">edited</span>}
          </div>
          {e.title && <h3 className="mt-1 truncate font-display text-lg text-ink">{e.title}</h3>}
          <p className={`mt-1 line-clamp-2 font-serif text-[0.95rem] leading-relaxed ${text ? 'text-muted' : 'italic text-subtle'}`}>
            {text || (e.hasMedia ? `${cap(e.type)} recording — no note` : 'Empty entry')}
          </p>
          {e.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{e.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function Journal({ meta, version, onOpen }) {
  const [f, setF] = useState(EMPTY);
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const q = useDebounced(f.q, 250);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const active = Object.entries(f).filter(([k, v]) => k !== 'q' && v).length;

  useEffect(() => {
    const ctrl = new AbortController();
    const params = new URLSearchParams(Object.entries({ ...f, q }).filter(([, v]) => v));
    api(`/entries?${params}`, { signal: ctrl.signal })
      .then((d) => { setEntries(d); setError(''); })
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, [q, f.mood, f.category, f.type, f.tag, f.from, f.to, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const out = [];
    for (const e of entries || []) {
      const k = monthKey(e.createdAt);
      if (out.at(-1)?.month !== k) out.push({ month: k, items: [] });
      out.at(-1).items.push(e);
    }
    return out;
  }, [entries]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Past self</p>
          <h1 className="font-display text-3xl">Journal</h1>
        </div>
        {entries && <p className="text-sm text-subtle">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</p>}
      </div>

      <div className="sticky top-0 z-20 -mx-4 mb-5 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:px-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden>⌕</span>
            <input type="search" value={f.q} onChange={set('q')} placeholder="Search titles, text, tags…" aria-label="Search entries" className="field pl-8" />
          </div>
          <button className={`btn-secondary ${showFilters || active ? 'border-accent/40 text-accent' : ''}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            Filters{active ? ` · ${active}` : ''}
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 grid animate-fade-in grid-cols-2 gap-2 rounded-2xl border border-line/10 bg-surface p-3 sm:grid-cols-3">
            <label><span className="label">Mood</span>
              <select value={f.mood} onChange={set('mood')} className="field py-1.5">
                <option value="">Any mood</option>
                {MOODS.map((m) => <option key={m.value} value={m.value}>{m.emoji} {m.label}</option>)}
              </select>
            </label>
            <label><span className="label">Category</span>
              <select value={f.category} onChange={set('category')} className="field py-1.5">
                <option value="">Any category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
              </select>
            </label>
            <label><span className="label">Type</span>
              <select value={f.type} onChange={set('type')} className="field py-1.5">
                <option value="">All types</option>
                <option value="text">✍️ Written</option>
                <option value="voice">🎙️ Voice</option>
                <option value="video">🎥 Video</option>
              </select>
            </label>
            <label><span className="label">Tag</span>
              <select value={f.tag} onChange={set('tag')} className="field py-1.5">
                <option value="">Any tag</option>
                {(meta?.tags || []).map((t) => <option key={t} value={t}>#{t}</option>)}
              </select>
            </label>
            <label><span className="label">From</span><input type="date" value={f.from} max={f.to || undefined} onChange={set('from')} className="field py-1.5" /></label>
            <label><span className="label">To</span><input type="date" value={f.to} min={f.from || undefined} onChange={set('to')} className="field py-1.5" /></label>
            {active > 0 && <button className="btn-ghost col-span-full justify-self-start" onClick={() => setF((x) => ({ ...EMPTY, q: x.q }))}>Clear filters</button>}
          </div>
        )}
      </div>

      {error && <p role="alert" className="card border-danger/30 text-sm text-danger">{error}</p>}
      {!entries && !error && <div className="flex justify-center py-16"><Spinner className="h-7 w-7" /></div>}
      {entries?.length === 0 && (
        <div className="card py-14 text-center">
          <p className="text-3xl">{f.q || active ? '🔍' : '📓'}</p>
          <p className="mt-3 text-muted">{f.q || active ? 'No entries match your search.' : 'No entries yet. Your first one is a click away.'}</p>
          {(f.q || active > 0) && <button className="btn-ghost mt-3" onClick={() => setF(EMPTY)}>Clear search</button>}
        </div>
      )}

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.month} aria-label={g.month}>
            <h2 className="eyebrow mb-3">{g.month}</h2>
            <div className="space-y-3">{g.items.map((e) => <EntryCard key={e.id} e={e} onOpen={onOpen} />)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
