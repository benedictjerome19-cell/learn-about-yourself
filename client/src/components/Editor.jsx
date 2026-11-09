import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { CATEGORIES, MOODS, cap, plain, wordCount } from '../lib/format';
import { useConfirm, useToast } from '../lib/ui';

const TOOLS = [
  { cmd: 'bold', label: 'B', title: 'Bold (Ctrl+B)', cls: 'font-bold' },
  { cmd: 'italic', label: 'I', title: 'Italic (Ctrl+I)', cls: 'italic font-serif' },
  { cmd: 'formatBlock', arg: 'h2', label: 'H', title: 'Heading', cls: 'font-display' },
  { cmd: 'insertUnorderedList', label: '•', title: 'Bulleted list', cls: 'text-lg leading-none' },
  { cmd: 'insertOrderedList', label: '1.', title: 'Numbered list', cls: 'text-xs' },
  { cmd: 'formatBlock', arg: 'blockquote', label: '❝', title: 'Quote', cls: '' },
];

const readDraft = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };

// Create (no `entry`) or edit an entry. New-entry drafts autosave to this device so
// nothing is lost on a refresh, crash or accidental navigation.
export default function Editor({ entry, userId, tags: knownTags = [], onSaved, onCancel, onMoodChange }) {
  const editing = !!entry;
  const needsText = !editing || entry.type === 'text'; // recordings may have an empty note
  const draftKey = `jm_draft:${userId}`;
  const initial = editing ? entry : readDraft(draftKey);

  const ref = useRef();
  const [title, setTitle]       = useState(initial?.title || '');
  const [mood, setMood]         = useState(initial?.mood || 'neutral');
  const [category, setCategory] = useState(initial?.category || '');
  const [tags, setTags]         = useState(Array.isArray(initial?.tags) ? initial.tags.join(', ') : initial?.tags || '');
  const [words, setWords]       = useState(0);
  const [empty, setEmpty]       = useState(true);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [dirty, setDirty]       = useState(false);
  const [draftAt, setDraftAt]   = useState(!editing && initial ? 'restored' : null);
  const [focus, setFocus]       = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const text = plain(el.innerHTML);
    setWords(wordCount(text));
    setEmpty(!text && !el.querySelector('li'));
  }, []);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = (editing ? entry.text : initial?.html) || '';
    sync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced draft autosave (new entries only)
  useEffect(() => {
    if (editing || !dirty) return;
    const t = setTimeout(() => {
      const html = ref.current?.innerHTML || '';
      try {
        if (!plain(html) && !title.trim()) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify({ title, html, mood, category, tags }));
        setDraftAt(new Date());
      } catch { /* storage full or disabled */ }
    }, 600);
    return () => clearTimeout(t);
  }, [dirty, title, mood, category, tags, words, editing, draftKey]);

  // Warn before closing the tab with unsaved edits (new entries are kept as a draft instead)
  useEffect(() => {
    if (!dirty || !editing) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, editing]);

  const touch = () => { setDirty(true); setError(''); };

  const tool = (t) => {
    ref.current?.focus();
    if (t.cmd === 'formatBlock') {
      const current = document.queryCommandValue('formatBlock').toLowerCase();
      document.execCommand('formatBlock', false, current === t.arg ? 'div' : t.arg);
    } else document.execCommand(t.cmd, false, t.arg);
    sync(); touch();
  };

  const onPaste = (e) => {
    // Paste as plain text: keeps entries clean and free of foreign markup.
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  };

  const reset = () => {
    if (ref.current) ref.current.innerHTML = '';
    setTitle(''); setTags(''); setCategory(''); setMood('neutral');
    setDirty(false); setDraftAt(null); sync();
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  };

  const save = async () => {
    if (busy) return;
    const html = ref.current?.innerHTML || '';
    if (needsText && !plain(html)) { setError('Write something before saving.'); ref.current?.focus(); return; }
    setBusy(true); setError('');
    const body = { title, text: html, tags, mood, category };
    try {
      const saved = editing
        ? await api(`/entries/${entry.id}`, { method: 'PATCH', body })
        : await api('/entries', { method: 'POST', body: { type: 'text', ...body } });
      toast(editing ? 'Entry updated' : 'Entry saved');
      if (!editing) reset(); else setDirty(false);
      setFocus(false);
      onMoodChange?.(mood);
      onSaved?.(saved);
    } catch (e) {
      // Draft stays in place (and in local storage) so nothing is lost.
      setError(e.message);
    }
    setBusy(false);
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); save(); }
    if (e.key === 'Escape' && focus) setFocus(false);
  };

  const tagList = tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);

  return (
    <section
      onKeyDown={onKeyDown}
      className={focus ? 'fixed inset-0 z-40 overflow-y-auto bg-bg px-4 py-6 sm:py-12' : editing ? '' : 'card p-0 overflow-hidden'}
      aria-label={editing ? 'Edit entry' : 'New entry'}
    >
      <div className={focus ? 'mx-auto max-w-2xl' : ''}>
        {/* Mood + category row */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line/10 px-5 py-3">
          <div className="flex items-center gap-0.5" role="group" aria-label="Mood">
            {MOODS.map((m) => (
              <button key={m.value} type="button" title={m.label} aria-label={m.label} aria-pressed={mood === m.value}
                onClick={() => { setMood(m.value); onMoodChange?.(m.value); touch(); }}
                className={`h-9 w-9 rounded-xl text-lg transition ${mood === m.value ? 'bg-accent/15 ring-1 ring-accent/40 scale-105' : 'opacity-60 hover:bg-line/5 hover:opacity-100'}`}>
                {m.emoji}
              </button>
            ))}
          </div>
          <span className="hidden text-xs text-subtle sm:inline">{MOODS.find((m) => m.value === mood)?.label}</span>
          <select value={category} onChange={(e) => { setCategory(e.target.value); touch(); }}
            aria-label="Category" className="field ml-auto w-auto py-1.5 text-xs">
            <option value="">No category</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
          </select>
          <button type="button" className="icon-btn" onClick={() => setFocus((f) => !f)} title={focus ? 'Exit focus mode (Esc)' : 'Focus mode'} aria-label={focus ? 'Exit focus mode' : 'Focus mode'}>
            {focus ? '⤡' : '⤢'}
          </button>
        </div>

        <div className="px-5 pt-4">
          <input value={title} onChange={(e) => { setTitle(e.target.value); touch(); }} maxLength={200}
            placeholder="Title (optional)" aria-label="Title"
            className="w-full bg-transparent font-display text-2xl text-ink placeholder:text-subtle/70 focus:outline-none" />

          {/* Toolbar */}
          <div className="mt-2 flex flex-wrap gap-1" role="toolbar" aria-label="Formatting">
            {TOOLS.map((t) => (
              <button key={t.cmd + (t.arg || '')} type="button" title={t.title} aria-label={t.title}
                onMouseDown={(e) => e.preventDefault()} onClick={() => tool(t)}
                className={`h-8 min-w-8 rounded-lg px-2 text-sm text-muted transition hover:bg-line/5 hover:text-ink ${t.cls}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div
            ref={ref}
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label="Journal entry"
            data-placeholder={needsText ? "What's on your mind today?" : 'Add a note about this recording…'}
            data-empty={empty}
            suppressContentEditableWarning
            onInput={() => { sync(); touch(); }}
            onPaste={onPaste}
            className={`prose-entry relative mt-2 rounded-xl py-2 focus:outline-none ${focus ? 'min-h-[60vh]' : 'min-h-[220px]'}`}
          />
        </div>

        <div className="px-5 pb-4">
          <label className="sr-only" htmlFor={`tags-${entry?.id || 'new'}`}>Tags</label>
          <input id={`tags-${entry?.id || 'new'}`} value={tags} onChange={(e) => { setTags(e.target.value); touch(); }}
            list="jm-tags" placeholder="Tags, comma separated — e.g. work, gratitude"
            className="field mt-2" />
          <datalist id="jm-tags">{knownTags.map((t) => <option key={t} value={t} />)}</datalist>
          {tagList.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{tagList.map((t) => <span key={t} className="chip">#{t.toLowerCase()}</span>)}</div>
          )}

          {error && <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-xs text-subtle">
              {words} word{words === 1 ? '' : 's'}
              {!editing && draftAt && <> · {draftAt === 'restored' ? 'draft restored' : 'draft saved on this device'}</>}
            </span>
            <span className="hidden text-xs text-subtle md:inline">· Ctrl+S to save</span>
            <div className="ml-auto flex gap-2">
              {editing && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
              {!editing && (dirty || draftAt) && <button type="button" className="btn-ghost" onClick={async () => (await confirm({ title: 'Discard this draft?', body: 'The text you have written here will be removed.', action: 'Discard', danger: true })) && reset()}>Discard</button>}
              <button type="button" onClick={save} disabled={busy || (needsText && empty)} className="btn-primary">
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Save entry'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
