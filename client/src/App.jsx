import { useCallback, useEffect, useRef, useState } from 'react';
import { api, logout } from './api';
import Login from './components/Login';
import Editor from './components/Editor';
import Recorder from './components/Recorder';
import Journal, { EntryCard } from './components/Journal';
import EntryDetail from './components/EntryDetail';
import Insights from './components/Insights';
import MeVsMe from './components/MeVsMe';
import Mindscape from './components/Mindscape';
import Settings from './components/Settings';
import { fmtDate, greeting } from './lib/format';
import { ConfirmProvider, Spinner, ToastProvider, useTheme, useToast } from './lib/ui';

const VIEWS = [
  { id: 'write',    label: 'Write',    icon: '✍️' },
  { id: 'journal',  label: 'Journal',  icon: '📓' },
  { id: 'insights', label: 'Insights', icon: '📈' },
];
const viewFromHash = () => (VIEWS.some((v) => `#${v.id}` === location.hash) ? location.hash.slice(1) : 'write');

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Shell() {
  const theme = useTheme();
  const toast = useToast();
  const [user, setUser]         = useState(null);
  const [checking, setChecking] = useState(true);
  const [d, setD]               = useState(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView]         = useState(viewFromHash);
  const [mood, setMood]         = useState('neutral');
  const [openEntry, setOpenEntry] = useState(null);
  const [chat, setChat]         = useState(false);
  const [settings, setSettings] = useState(false);
  const [version, setVersion]   = useState(0);
  const notified = useRef(new Set());

  const load = useCallback(async () => {
    const [entries, streaks, report, reminders, due, stats, meta] = await Promise.all(
      ['/entries', '/streaks', '/reports', '/reminders', '/reminders/due', '/entries/stats', '/entries/meta'].map((p) => api(p)),
    );
    setD({ entries, streaks, report, reminders, due, stats, meta });
    setLoadError('');
    return entries;
  }, []);

  // Restore the session from the httpOnly cookie
  useEffect(() => {
    api('/auth/me').then(setUser).catch(() => {}).finally(() => setChecking(false));
    const expired = () => { setUser(null); setD(null); toast('Your session ended. Please sign in again.', 'error'); };
    window.addEventListener('jm:unauthorized', expired);
    return () => window.removeEventListener('jm:unauthorized', expired);
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    load().then((entries) => entries[0] && setMood(entries[0].mood)).catch((e) => setLoadError(e.message));
    const t = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 60_000);
    return () => clearInterval(t);
  }, [user, load]);

  // Hash routing keeps the browser back button working between views
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (id) => { location.hash = id; window.scrollTo({ top: 0 }); };

  // Desktop notification for reminders that just became due
  useEffect(() => {
    if (!d?.due?.length || !('Notification' in window) || Notification.permission !== 'granted') return;
    for (const r of d.due) {
      const key = `${r.id}:${new Date().toDateString()}`;
      if (!notified.current.has(key)) { notified.current.add(key); new Notification('JournalMind', { body: r.nudge, icon: '/favicon.svg' }); }
    }
  }, [d?.due]);

  const changed = useCallback(async (saved) => {
    setVersion((v) => v + 1);
    if (saved !== undefined) setOpenEntry(saved);
    await load().catch(() => {});
  }, [load]);

  const signOut = async () => { await logout(); setUser(null); setD(null); setSettings(false); location.hash = ''; };

  if (checking) return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8" /></div>;
  if (!user) return <Login onAuth={setUser} dark={theme.dark} />;

  return (
    <div className="relative min-h-screen">
      <Mindscape mood={mood} dark={theme.dark} />

      <header className="sticky top-0 z-30 border-b border-line/10 bg-bg/75 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <a href="#write" className="flex items-center gap-2" aria-label="JournalMind home">
            <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-lg" />
            <span className="font-display text-lg">JournalMind</span>
          </a>
          <nav className="ml-6 hidden gap-1 sm:flex" aria-label="Main">
            {VIEWS.map((v) => (
              <a key={v.id} href={`#${v.id}`} aria-current={view === v.id ? 'page' : undefined}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${view === v.id ? 'bg-line/[0.07] text-ink' : 'text-muted hover:text-ink'}`}>{v.label}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {d?.streaks.current > 0 && <span className="chip mr-1 hidden sm:inline-flex" title="Current streak">🔥 {d.streaks.current}</span>}
            <button className="btn-secondary hidden py-1.5 sm:inline-flex" onClick={() => setChat(true)}>💬 Me vs Me</button>
            <button className="icon-btn" onClick={() => theme.setPref(theme.dark ? 'light' : 'dark')} aria-label={theme.dark ? 'Switch to light theme' : 'Switch to dark theme'} title="Toggle theme">{theme.dark ? '☀️' : '🌙'}</button>
            <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Settings" title="Settings">⚙️</button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-28 pt-6 sm:pb-12">
        {d?.due?.length > 0 && (
          <div className="mx-auto mb-5 max-w-3xl space-y-2">
            {d.due.map((r) => (
              <div key={r.id} role="status" className="flex items-center gap-3 rounded-2xl border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm text-ink">
                <span aria-hidden>🔔</span><span className="flex-1">{r.nudge}</span>
                {view !== 'write' && <a href="#write" className="font-medium text-accent">Write now</a>}
              </div>
            ))}
          </div>
        )}

        {loadError && !d && (
          <div className="card mx-auto max-w-md text-center">
            <p className="text-danger">{loadError}</p>
            <button className="btn-secondary mt-3" onClick={() => load().catch((e) => setLoadError(e.message))}>Retry</button>
          </div>
        )}
        {!d && !loadError && <div className="grid place-items-center py-24"><Spinner className="h-8 w-8" /></div>}

        {d && view === 'write' && (
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">{fmtDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                <h1 className="font-display text-3xl">{greeting(user.name)}</h1>
              </div>
              <p className="text-sm text-subtle">
                {d.stats.thisWeek} this week · {d.stats.total} total{d.streaks.current ? ` · ${d.streaks.current}-day streak` : ''}
              </p>
            </div>

            <Editor userId={user.id} tags={d.meta.tags} onMoodChange={setMood} onSaved={() => changed()} />

            <div>
              <p className="eyebrow mb-3">Or record instead</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Recorder onSaved={() => changed()} />
                <Recorder video onSaved={() => changed()} />
              </div>
            </div>

            {d.entries.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <p className="eyebrow">Recent entries</p>
                  <button className="text-sm font-medium text-accent" onClick={() => go('journal')}>View all →</button>
                </div>
                <div className="space-y-3">{d.entries.slice(0, 3).map((e) => <EntryCard key={e.id} e={e} onOpen={setOpenEntry} />)}</div>
              </section>
            )}
          </div>
        )}

        {d && view === 'journal' && <Journal meta={d.meta} version={version} onOpen={setOpenEntry} />}
        {d && view === 'insights' && <Insights d={d} version={version} onReminders={() => load().catch(() => {})} />}
      </main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line/10 bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden" aria-label="Main">
        {VIEWS.map((v) => (
          <a key={v.id} href={`#${v.id}`} aria-current={view === v.id ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${view === v.id ? 'text-accent' : 'text-subtle'}`}>
            <span className="text-lg" aria-hidden>{v.icon}</span>{v.label}
          </a>
        ))}
        <button onClick={() => setChat(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-subtle">
          <span className="text-lg" aria-hidden>💬</span>Me vs Me
        </button>
      </nav>

      {openEntry && (
        <EntryDetail key={openEntry.id} entry={openEntry} userId={user.id} tags={d?.meta.tags || []}
          onClose={() => setOpenEntry(null)} onChanged={changed} />
      )}
      <MeVsMe open={chat} onClose={() => setChat(false)} count={d?.stats.total || 0} />
      <Settings open={settings} onClose={() => setSettings(false)} user={user} onUser={setUser} theme={theme} onSignOut={signOut} />
    </div>
  );
}
