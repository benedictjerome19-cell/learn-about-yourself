import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';

const STARTERS = ['What patterns do you see in my entries?', 'When did I feel most calm?', 'What have I been worrying about?'];

// "Me vs Me": a chat grounded only in the user's own entries. Slide-over drawer.
export default function MeVsMe({ open, onClose, count }) {
  const [msgs, setMsgs] = useState([
    { role: 'ai', text: "I'm your **Past Self** — I've read your journal. Ask me what you used to worry about, patterns in your thinking, or how you've grown." },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy]   = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const send = async (text = input) => {
    const q = text.trim(); if (!q || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const data = await api('/entries/chat', { method: 'POST', body: { question: q } });
      setMsgs((m) => [...m, { role: 'ai', text: data.answer }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'ai', text: `_Sorry — ${e.message}_`, error: true }]);
    }
    setBusy(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label="Chat with your past self"
        className="flex h-full w-full animate-slide-in flex-col border-l border-line/10 bg-elevated shadow-lift sm:max-w-md">
        <header className="flex items-center justify-between border-b border-line/10 px-5 py-4">
          <div>
            <p className="eyebrow">Me vs Me</p>
            <h2 className="font-display text-lg">Chat with your past self</h2>
            <p className="text-xs text-subtle">Grounded in your {count} entr{count === 1 ? 'y' : 'ies'} — nothing else.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close chat">✕</button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={m.role === 'user'
                ? 'max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-onaccent'
                : `md max-w-[90%] rounded-2xl rounded-bl-md border border-line/10 bg-line/[0.04] px-4 py-2.5 ${m.error ? 'text-danger' : ''}`}>
                {m.role === 'ai' ? <ReactMarkdown>{m.text}</ReactMarkdown> : m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex gap-1 rounded-2xl px-4 py-3" aria-label="Thinking">
              {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          )}
          {msgs.length === 1 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {STARTERS.map((s) => <button key={s} className="chip hover:border-accent/40 hover:text-ink" onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="flex gap-2 border-t border-line/10 p-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} rows={2} maxLength={2000}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask your past self…  (Enter to send)" aria-label="Your question" className="field flex-1 resize-none" />
          <button type="submit" disabled={busy || !input.trim()} className="btn-primary self-end px-3" aria-label="Send">↑</button>
        </form>
      </aside>
    </div>
  );
}
