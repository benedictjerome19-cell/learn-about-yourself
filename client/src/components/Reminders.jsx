import { useState } from 'react';
import { api } from '../api';
import { useConfirm, useToast } from '../lib/ui';

const TONES = [
  { value: 'gentle', label: '🌙 Gentle',     message: 'A quiet moment of reflection awaits you. Your mind deserves it.' },
  { value: 'tough',  label: '⚡ Tough love', message: "You promised yourself you'd reflect today. Don't let your mind clutter." },
  { value: 'custom', label: '✏️ Custom',     message: '' },
];

export default function Reminders({ reminders, onChange }) {
  const [time, setTime]     = useState('20:00');
  const [tone, setTone]     = useState('gentle');
  const [custom, setCustom] = useState('');
  const [busy, setBusy]     = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const label = tone === 'custom' ? custom.trim() : TONES.find((t) => t.value === tone).message;

  const run = async (fn, ok) => {
    try { await fn(); ok && toast(ok); onChange(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const add = async () => {
    setBusy(true);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    await run(async () => { await api('/reminders', { method: 'POST', body: { time, label, tone } }); setCustom(''); }, `Reminder set for ${time}`);
    setBusy(false);
  };

  return (
    <section className="card">
      <p className="eyebrow">Accountability</p>
      <h2 className="h-section mb-1">Reminders</h2>
      <p className="mb-4 text-xs text-subtle">Shown here (and emailed/texted if configured on the server) when you haven't journaled by that time.</p>

      <ul className="mb-4 space-y-2">
        {reminders.length === 0 && <li className="text-sm italic text-subtle">No reminders yet.</li>}
        {reminders.map((r) => (
          <li key={r.id} className={`flex items-start gap-3 rounded-xl border border-line/10 p-3 ${r.enabled ? 'bg-line/[0.03]' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-accent2">{r.time}</span>
                <span className="text-xs capitalize text-subtle">{r.tone}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{r.label}</p>
            </div>
            <button role="switch" aria-checked={r.enabled} aria-label={`Reminder at ${r.time}`}
              onClick={() => run(() => api(`/reminders/${r.id}`, { method: 'PATCH' }))}
              className={`relative h-6 w-10 flex-shrink-0 rounded-full transition ${r.enabled ? 'bg-accent' : 'bg-line/20'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.enabled ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <button aria-label={`Delete reminder at ${r.time}`} className="icon-btn h-7 w-7 text-xs hover:text-danger"
              onClick={async () => (await confirm({ title: 'Delete reminder?', body: `The ${r.time} reminder will be removed.`, action: 'Delete', danger: true }))
                && run(() => api(`/reminders/${r.id}`, { method: 'DELETE' }), 'Reminder deleted')}>✕</button>
          </li>
        ))}
      </ul>

      <div className="space-y-3 rounded-xl border border-line/10 bg-line/[0.03] p-3">
        <div className="flex gap-2">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required aria-label="Reminder time" className="field w-auto font-mono" />
          <select value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Tone" className="field flex-1">
            {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {tone === 'custom'
          ? <textarea value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={280} rows={2} aria-label="Custom message"
              placeholder='e.g. "Your future self will thank you for journaling today."' className="field resize-none" />
          : <p className="text-xs italic text-subtle">“{label}”</p>}
        <button onClick={add} disabled={busy || !label || !time} className="btn-primary w-full">{busy ? 'Adding…' : 'Add reminder'}</button>
      </div>
    </section>
  );
}
