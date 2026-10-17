import { useState } from 'react';
import { ArrowRight, Mail, ShieldCheck, X } from 'lucide-react';
import { t } from '../lib/language';
import Modal from './Modal';
import { DEV_ACCOUNTS, DEV_AUTH_ENABLED, EMULATOR_AUTH_ENABLED, FIREBASE_AUTH_ENABLED, signInAccount, createAccount, resetPassword } from '../lib/auth';

/** Explicit localhost development login; Firebase will later supply real identity/tokens. */
export default function AccountPanel({ onClose, entry = false, onAuthenticated }: { onClose: () => void; entry?: boolean; onAuthenticated?: () => void }) {
  const [screen, setScreen] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (busy || !DEV_AUTH_ENABLED && !FIREBASE_AUTH_ENABLED || DEV_AUTH_ENABLED && screen !== 'login') return;
    setBusy(true); setMessage('');
    try {
      if (screen === 'reset') { await resetPassword(email); setMessage('Check your email for password reset instructions.'); }
      else { if (screen === 'signup') await createAccount(email, password); else await signInAccount(email, password); setPassword(''); (onAuthenticated ?? onClose)(); }
    } catch { setError('Could not complete account action. Check your details and connection.'); }
    finally { setBusy(false); }
  }
  return <Modal titleId="account-title" onClose={onClose} className={`account-modal${entry ? ' account-entry' : ''}`}>
    <button className="icon-button modal-close" onClick={onClose} aria-label={t('Continue as guest')}><X size={20} /></button>
    <img className="account-logo" src="/manzil-logo.png" width="64" height="64" alt="Manzil" />
    <span className="eyebrow">MANZIL · منزل</span><h1 id="account-title">{t(screen === 'signup' ? 'Create account' : screen === 'reset' ? 'Reset password' : 'Your journeys, together.')}</h1>
    <p className="muted">{t('Plan a route without an account. Sign in later for personal features.')}</p>
    <button className="secondary-button full guest-entry-action" onClick={onClose}>{t('Continue as guest')}<ArrowRight size={18} /></button>
    <div className="notice-box soft"><ShieldCheck size={21} /><div><strong>{t(DEV_AUTH_ENABLED ? 'Development sign-in' : EMULATOR_AUTH_ENABLED ? 'Local Firebase emulators' : FIREBASE_AUTH_ENABLED ? 'Firebase Authentication' : 'Account connection coming soon')}</strong><p>{t(DEV_AUTH_ENABLED ? 'Dummy accounts unlock local testing. They share this local workspace and do not use Firebase.' : EMULATOR_AUTH_ENABLED ? 'Test accounts use local authentication and isolated user records.' : FIREBASE_AUTH_ENABLED ? 'Your account protects saved journeys and personal history.' : 'Firebase sign-in is not configured in this build.')}</p></div></div>
    <form onSubmit={submit} aria-label={t(screen === 'reset' ? 'Reset password' : 'Sign in')}>
      <fieldset disabled={busy || !(DEV_AUTH_ENABLED || FIREBASE_AUTH_ENABLED) || DEV_AUTH_ENABLED && screen !== 'login'} className="account-fields"><label className="field-label">{t('Email')}<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" placeholder="name@example.com" /></label>
        {screen !== 'reset' && <label className="field-label">{t('Password')}<input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="off" placeholder="••••••••" /></label>}
        <button className="primary-button full" type="submit"><Mail size={18} />{t(screen === 'reset' ? 'Reset password' : screen === 'signup' ? 'Create account' : 'Sign in')}</button>
      </fieldset>
    </form>
    {error && <p className="error-box" role="alert">{t(error)}</p>}
    {message && <p role="status">{t(message)}</p>}
    {(DEV_AUTH_ENABLED || EMULATOR_AUTH_ENABLED) && screen === 'login' && <div className="dev-accounts"><span className="field-label">{t('Choose a development account')}</span>{DEV_ACCOUNTS.map(account => <button className="dev-account" key={account.uid} type="button" onClick={() => { setEmail(account.email); setPassword(account.password); setError(''); }}><strong>{t(account.role === 'admin' ? 'Admin user' : 'Normal user')}</strong><code>{account.email}</code><small>{t('Password')}: <bdi>{account.password}</bdi></small></button>)}</div>}
    <div className="row wrap"><button className="text-button" onClick={() => setScreen(screen === 'signup' || screen === 'reset' ? 'login' : 'signup')}>{t(screen === 'login' ? 'Create account' : 'Back to sign in')}</button>{screen === 'login' && <button className="text-button" onClick={() => setScreen('reset')}>{t('Forgot password?')}</button>}</div>
  </Modal>;
}

export function PersonalFeatureGate({ onSignIn }: { onSignIn: () => void }) {
  return <div className="personal-gate"><ShieldCheck size={34} /><h1>{t('Sign in for personal features')}</h1><p className="muted">{t('Sign in to access your saved journeys, trip history and personal alerts.')}</p><button className="primary-button full" onClick={onSignIn}>{t('Sign in')}</button></div>;
}
