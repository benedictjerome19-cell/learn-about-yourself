import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ── Theme ─────────────────────────────────────────────────────────────────────
// 'system' | 'light' | 'dark', remembered per device.
export function useTheme() {
  const [pref, setPref] = useState(() => { try { return localStorage.getItem('jm_theme') || 'system'; } catch { return 'system'; } });
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const d = pref === 'dark' || (pref === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', d);
      setDark(d);
    };
    apply();
    try { localStorage.setItem('jm_theme', pref); } catch { /* storage may be unavailable */ }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
  return { pref, setPref, dark };
}

// ── Toasts ────────────────────────────────────────────────────────────────────
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto animate-fade-in rounded-xl border px-4 py-2.5 text-sm shadow-lift backdrop-blur-xl ${
              t.kind === 'error' ? 'border-danger/30 bg-elevated text-danger' : 'border-line/10 bg-elevated text-ink'}`}>
            {t.kind === 'error' ? '⚠️ ' : '✓ '}{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, wide, labelledBy }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector('[data-autofocus], input, textarea, button')?.focus(), 0);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title} aria-labelledby={labelledBy}
        className={`animate-fade-in max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-line/10 bg-elevated shadow-lift sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}>
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line/10 bg-elevated/95 px-5 py-3 backdrop-blur">
            <h2 className="font-display text-lg">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// Promise-style confirm dialog: const ok = await confirm({ title, body, action })
const ConfirmCtx = createContext(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title}>
        <div className="space-y-5 p-5">
          <p className="text-sm text-muted">{state?.body}</p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => close(false)}>Cancel</button>
            <button className={state?.danger ? 'btn-danger' : 'btn-primary'} data-autofocus onClick={() => close(true)}>{state?.action || 'Confirm'}</button>
          </div>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const Spinner = ({ className = 'h-5 w-5' }) => (
  <span className={`inline-block animate-spin rounded-full border-2 border-accent border-t-transparent ${className}`} aria-label="Loading" />
);

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
