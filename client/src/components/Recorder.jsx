import { useEffect, useRef, useState } from 'react';
import { api, uploadMedia } from '../api';
import useRecorder from '../useRecorder';
import { MOODS, fmtDuration } from '../lib/format';
import { useToast } from '../lib/ui';

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

// Voice (video=false) or video journal: open device → record → review → add a note → save.
export default function Recorder({ video = false, onSaved }) {
  const rec = useRecorder({ video });
  const previewRef = useRef();
  const [note, setNote] = useState('');
  const [mood, setMood] = useState('neutral');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const kind = video ? 'video' : 'voice';

  useEffect(() => {
    if (previewRef.current && rec.stream) {
      previewRef.current.srcObject = rec.stream;
      previewRef.current.play().catch(() => {});
    }
  }, [rec.stream]);

  const discard = () => { rec.reset(); setNote(''); setTags(''); setMood('neutral'); setError(''); };

  const save = async () => {
    if (!rec.blob) return;
    setBusy(true); setError('');
    let entry;
    try {
      entry = await api('/entries', {
        method: 'POST',
        body: { type: kind, text: escape(note.trim()), tags: [kind, ...tags.split(',')], mood, durationSec: rec.sec },
      });
      await uploadMedia(entry.id, rec.blob);
      toast(`${video ? 'Video' : 'Voice'} entry saved`);
      discard();
      onSaved?.();
    } catch (e) {
      // Don't leave an entry without its recording; the recording stays here so you can retry.
      if (entry) await api(`/entries/${entry.id}`, { method: 'DELETE' }).catch(() => {});
      setError(`${e.message} — your recording is still here, try saving again.`);
    }
    setBusy(false);
  };

  return (
    <section className="card" aria-label={`${video ? 'Video' : 'Voice'} journal`}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="eyebrow">{video ? 'Video' : 'Voice'}</p>
          <h2 className="h-section">{video ? 'Video journal' : 'Voice journal'}</h2>
        </div>
        {rec.state === 'recording' && (
          <span className="flex items-center gap-2 rounded-full bg-danger/10 px-3 py-1 font-mono text-xs text-danger">
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger" /> REC {fmtDuration(rec.sec)}
          </span>
        )}
      </div>

      {video && (rec.state === 'live' || rec.state === 'recording') && (
        <div className="relative mb-4 aspect-video overflow-hidden rounded-xl border border-line/10 bg-black">
          <video ref={previewRef} muted playsInline className="h-full w-full object-cover" />
        </div>
      )}

      {rec.state === 'recorded' && rec.url && (
        <div className="mb-4 space-y-3">
          {video
            ? <video src={rec.url} controls playsInline className="aspect-video w-full rounded-xl border border-line/10 bg-black" />
            : <audio src={rec.url} controls className="w-full" />}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={5000}
            placeholder="Add a note or summary (optional) — makes it searchable and gives your past self something to recall"
            className="field resize-y" aria-label="Note" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex" role="group" aria-label="Mood">
              {MOODS.map((m) => (
                <button key={m.value} type="button" title={m.label} aria-label={m.label} aria-pressed={mood === m.value} onClick={() => setMood(m.value)}
                  className={`h-8 w-8 rounded-lg transition ${mood === m.value ? 'bg-accent/15 ring-1 ring-accent/40' : 'opacity-60 hover:opacity-100'}`}>{m.emoji}</button>
              ))}
            </div>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (optional)" aria-label="Tags" className="field min-w-0 flex-1 py-1.5" />
          </div>
        </div>
      )}

      {(rec.error || error) && <p role="alert" className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{rec.error || error}</p>}

      <div className="flex flex-wrap gap-2">
        {rec.state === 'idle' && (
          <button className="btn-secondary w-full" onClick={() => rec.open()}>
            {video ? '🎥 Turn on camera' : '🎙️ Turn on microphone'}
          </button>
        )}
        {rec.state === 'live' && (<>
          <button className="btn-primary flex-1" onClick={rec.start}>● Start recording</button>
          <button className="btn-ghost" onClick={rec.close}>Cancel</button>
        </>)}
        {rec.state === 'recording' && <button className="btn-danger w-full" onClick={rec.stop}>■ Stop</button>}
        {rec.state === 'recorded' && (<>
          <button className="btn-primary flex-1" onClick={save} disabled={busy}>{busy ? 'Saving…' : `Save ${kind} entry`}</button>
          <button className="btn-ghost" onClick={discard} disabled={busy}>Discard</button>
        </>)}
      </div>
      {rec.state === 'idle' && <p className="mt-2 text-xs text-subtle">Recordings stay on your JournalMind server and are only playable when you're signed in.</p>}
    </section>
  );
}
