import { useState } from 'react';
import { api } from '../api';
import Editor from './Editor';
import { TYPE_ICON, cap, fmtDateTime, fmtDuration, moodOf } from '../lib/format';
import { Modal, useConfirm, useToast } from '../lib/ui';

// Read / edit / delete a single entry.
export default function EntryDetail({ entry, userId, tags, onClose, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  if (!entry) return null;
  const m = moodOf(entry.mood);

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this entry?',
      body: `“${entry.title || fmtDateTime(entry.createdAt)}” ${entry.hasMedia ? 'and its recording ' : ''}will be permanently deleted. This cannot be undone.`,
      action: 'Delete entry', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/entries/${entry.id}`, { method: 'DELETE' });
      toast('Entry deleted');
      onChanged(null);
      onClose();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const close = async () => {
    if (editing && !(await confirm({ title: 'Discard changes?', body: 'Your edits to this entry will be lost.', action: 'Discard', danger: true }))) return;
    onClose();
  };

  return (
    <Modal open onClose={close} wide labelledBy="entry-title">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line/10 bg-elevated/95 px-5 py-3 backdrop-blur">
        <span className="text-xl" aria-hidden>{m.emoji}</span>
        <div className="min-w-0 flex-1">
          <h2 id="entry-title" className="truncate font-display text-lg">{entry.title || (entry.type === 'text' ? 'Untitled entry' : `${cap(entry.type)} entry`)}</h2>
          <p className="text-xs text-subtle">{fmtDateTime(entry.createdAt)}</p>
        </div>
        {!editing && (<>
          <button className="btn-secondary py-1.5" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn-ghost py-1.5 text-danger hover:text-danger" onClick={remove} disabled={busy}>Delete</button>
        </>)}
        <button className="icon-btn" onClick={close} aria-label="Close">✕</button>
      </div>

      {editing ? (
        <Editor entry={entry} userId={userId} tags={tags}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => { setEditing(false); onChanged(saved); }} />
      ) : (
        <article className="px-5 py-5 sm:px-8">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-subtle">
            <span className="chip">{m.emoji} {m.label}</span>
            {entry.category && <span className="chip">{cap(entry.category)}</span>}
            {entry.type !== 'text' && <span className="chip">{TYPE_ICON[entry.type]} {cap(entry.type)}{entry.durationSec ? ` · ${fmtDuration(entry.durationSec)}` : ''}</span>}
            {entry.tags?.map((t) => <span key={t} className="chip">#{t}</span>)}
            {entry.score != null && <span className="chip" title="Communication score">✦ {entry.score}/100</span>}
          </div>

          {entry.mediaUrl && entry.type === 'video' && <video src={entry.mediaUrl} controls playsInline preload="metadata" className="mb-5 w-full rounded-xl border border-line/10 bg-black" />}
          {entry.mediaUrl && entry.type === 'voice' && <audio src={entry.mediaUrl} controls preload="metadata" className="mb-5 w-full" />}
          {entry.type !== 'text' && !entry.hasMedia && <p className="mb-4 text-sm italic text-subtle">The recording for this entry is missing.</p>}

          {entry.text
            ? <div className="prose-entry" dangerouslySetInnerHTML={{ __html: entry.text /* sanitised by the server */ }} />
            : entry.type !== 'text' && <p className="text-sm italic text-subtle">No note. Click Edit to add one.</p>}

          {entry.updatedAt && entry.updatedAt !== entry.createdAt && (
            <p className="mt-6 text-xs text-subtle">Last edited {fmtDateTime(entry.updatedAt)}</p>
          )}
        </article>
      )}
    </Modal>
  );
}
