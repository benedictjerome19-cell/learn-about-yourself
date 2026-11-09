import { useState } from 'react';
import { api, passkeyRegister } from '../api';
import { Modal, useToast } from '../lib/ui';

export default function Settings({ open, onClose, user, onUser, theme, onSignOut }) {
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const toast = useToast();

  const run = async (kind, fn) => {
    setBusy(kind); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); }
    setBusy('');
  };

  const addPasskey = () => run('passkey', async () => {
    onUser(await passkeyRegister());
    toast('Biometric sign-in added for this device');
  });

  const changePassword = (e) => {
    e.preventDefault();
    run('password', async () => {
      await api('/auth/password', { method: 'POST', body: pw });
      setPw({ current: '', next: '' });
      onUser({ ...user, hasPassword: true });
      toast('Password updated — other devices were signed out');
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="space-y-6 p-5">
        <section>
          <h3 className="label">Appearance</h3>
          <div className="seg">
            {[['system', '🖥 System'], ['light', '☀️ Light'], ['dark', '🌙 Dark']].map(([v, l]) => (
              <button key={v} aria-pressed={theme.pref === v} onClick={() => theme.setPref(v)}>{l}</button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="label">Account</h3>
          <p className="text-sm text-ink">{user.name}</p>
          <p className="text-sm text-subtle">{user.email}</p>
        </section>

        <section>
          <h3 className="label">Biometric sign-in</h3>
          <p className="mb-2 text-xs text-subtle">{user.passkeys ? `${user.passkeys} passkey${user.passkeys > 1 ? 's' : ''} registered.` : 'Sign in with fingerprint, Face ID or Windows Hello.'}</p>
          <button className="btn-secondary w-full" onClick={addPasskey} disabled={!!busy}>🔐 {busy === 'passkey' ? 'Waiting for your device…' : 'Add this device'}</button>
        </section>

        <form onSubmit={changePassword} className="space-y-2">
          <h3 className="label">{user.hasPassword ? 'Change password' : 'Set a password'}</h3>
          {user.hasPassword && <input type="password" required autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className="field" />}
          <input type="password" required minLength={8} autoComplete="new-password" placeholder="New password (8+ characters)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className="field" />
          <button className="btn-secondary w-full" disabled={!!busy}>{busy === 'password' ? 'Saving…' : 'Update password'}</button>
        </form>

        {err && <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}

        <section>
          <h3 className="label">Your data</h3>
          <p className="mb-2 text-xs text-subtle">Download every entry, reminder and score as a JSON file.</p>
          <a className="btn-secondary w-full" href="/api/account/export" download>⬇ Export journal</a>
        </section>

        <button className="btn-ghost w-full text-danger hover:text-danger" onClick={onSignOut}>Sign out</button>
      </div>
    </Modal>
  );
}
