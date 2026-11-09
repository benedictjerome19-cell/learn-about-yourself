import { useEffect, useState } from 'react';
import { api, authenticate, passkeyLogin, passkeyRegister } from '../api';
import Mindscape from './Mindscape';

export default function Login({ onAuth, dark }) {
  const [mode, setMode]   = useState('login');
  const [f, setF]         = useState({ name: '', email: '', password: '' });
  const [err, setErr]     = useState('');
  const [busy, setBusy]   = useState('');
  const [signup, setSignup] = useState(true);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // The server may have new sign-ups closed (public deployments)
  useEffect(() => { api('/auth/config').then((c) => setSignup(c.signup)).catch(() => {}); }, []);
  const isLogin = mode === 'login';
  const switchTo = (m) => { setMode(m); setErr(''); };

  const run = async (kind, fn) => {
    setBusy(kind); setErr('');
    try { onAuth(await fn()); }
    catch (x) { setErr(x.message); setBusy(''); }
  };

  const submit = (e) => { e.preventDefault(); run('password', () => authenticate(mode, f)); };

  const biometric = () => {
    if (!/^\S+@\S+\.\S+$/.test(f.email)) { setErr('Enter your email first.'); return; }
    run('passkey', () => (isLogin ? passkeyLogin(f.email.trim()) : passkeyRegister({ email: f.email.trim(), name: f.name.trim() })));
  };

  return (
    <main className="relative grid min-h-screen place-items-center px-4 py-10">
      <Mindscape mood="neutral" dark={dark} />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto mb-4 h-14 w-14 rounded-2xl shadow-lift" />
          <h1 className="font-display text-4xl">JournalMind</h1>
          <p className="mt-2 text-sm text-muted">A private place to write, record and reflect.</p>
        </div>

        {signup && <div className="seg mb-4" role="tablist">
          <button type="button" role="tab" aria-selected={isLogin} onClick={() => switchTo('login')}>Sign in</button>
          <button type="button" role="tab" aria-selected={!isLogin} onClick={() => switchTo('register')}>Create account</button>
        </div>}

        <form onSubmit={submit} className="card space-y-4" noValidate={false}>
          {!isLogin && (
            <label className="block"><span className="label">Your name</span>
              <input value={f.name} onChange={set('name')} autoComplete="name" maxLength={80} placeholder="Alex" className="field" />
            </label>
          )}
          <label className="block"><span className="label">Email</span>
            <input type="email" required value={f.email} onChange={set('email')} autoComplete={isLogin ? 'username webauthn' : 'email'} placeholder="you@example.com" className="field" />
          </label>
          <label className="block"><span className="label">Password</span>
            <input type="password" required minLength={isLogin ? undefined : 8} value={f.password} onChange={set('password')}
              autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder={isLogin ? '••••••••' : 'At least 8 characters'} className="field" />
          </label>

          {err && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}

          <button disabled={!!busy} className="btn-primary w-full py-2.5">
            {busy === 'password' ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
          </button>

          <div className="flex items-center gap-3 text-xs text-subtle"><span className="h-px flex-1 bg-line/10" />or<span className="h-px flex-1 bg-line/10" /></div>

          <button type="button" onClick={biometric} disabled={!!busy} className="btn-secondary w-full py-2.5">
            🔐 {busy === 'passkey' ? 'Waiting for your device…' : isLogin ? 'Sign in with biometrics' : 'Create account with biometrics'}
          </button>
          <p className="text-center text-xs text-subtle">
            {isLogin ? 'Uses a passkey you added in Settings — fingerprint, Face ID or Windows Hello.' : 'Creates a passkey-only account on this device. No password needed.'}
          </p>
        </form>
      </div>
    </main>
  );
}
