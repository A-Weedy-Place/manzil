import { useState } from 'react';
import { ArrowRight, ChevronDown, LoaderCircle, Mail, MapPin, Pause, Play, ShieldCheck, X } from 'lucide-react';
import { t } from '../lib/language';
import Modal from './Modal';
import EntryDoodles from './EntryDoodles';
import { DEV_ACCOUNTS, DEV_AUTH_ENABLED, EMULATOR_AUTH_ENABLED, FIREBASE_AUTH_ENABLED, signInAccount, createAccount, resetPassword } from '../lib/auth';

type AccountScreen = 'login' | 'signup' | 'reset';

export default function AccountPanel({ onClose, entry = false, onAuthenticated, onAccountCreated }: {
  onClose: () => void;
  entry?: boolean;
  onAuthenticated?: () => void;
  onAccountCreated?: (uid: string) => void;
}) {
  const [screen, setScreen] = useState<AccountScreen>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [backgroundPaused, setBackgroundPaused] = useState(false);
  const action = screen === 'signup' ? 'Create account' : screen === 'reset' ? 'Reset password' : 'Sign in';
  const unavailable = !(DEV_AUTH_ENABLED || FIREBASE_AUTH_ENABLED) || DEV_AUTH_ENABLED && screen !== 'login';

  function changeScreen(next: AccountScreen) {
    setScreen(next); setPassword(''); setError(''); setMessage('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (busy || unavailable) return;
    setBusy(true); setMessage('');
    try {
      if (screen === 'reset') {
        await resetPassword(email);
        setMessage('Check your email for password reset instructions.');
      } else {
        if (screen === 'signup') {
          const uid = await createAccount(email, password);
          onAccountCreated?.(uid);
        }
        else await signInAccount(email, password);
        setPassword(''); (onAuthenticated ?? onClose)();
      }
    } catch { setError('Could not complete account action. Check your details and connection.'); }
    finally { setBusy(false); }
  }

  return <Modal titleId="account-title" onClose={onClose} className={`account-modal${entry ? ' account-entry' : ''}`} overlay={entry ? <EntryDoodles paused={backgroundPaused} /> : undefined}>
    <button className="icon-button modal-close" onClick={onClose} aria-label={t('Continue as guest')}><X size={20} /></button>
    <div className="account-layout">
      <section className="account-form-column">
        <div className="account-form-inner">
          <header className="account-brand">
            <img className="account-logo" src="/manzil-logo.png" width="84" height="84" alt="" />
            {screen === 'login' ? <h1 id="account-title" className="account-brand-name">Manzil</h1> : <span className="account-brand-name">Manzil</span>}
          </header>
          {screen !== 'login' && <h1 id="account-title" className="account-screen-title">{t(action)}</h1>}
          <button className="primary-button full guest-entry-action" onClick={onClose}>{t('Continue as guest')}<ArrowRight size={20} /></button>
          <div className="account-divider" aria-hidden="true"><span>{t(action)}</span></div>
          <form onSubmit={submit} aria-label={t(action)} aria-busy={busy}>
            <fieldset disabled={busy || unavailable} className="account-fields">
              <label className="field-label">{t('Email')}<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" placeholder="name@example.com" dir="ltr" /></label>
              {screen !== 'reset' && <label className="field-label">{t('Password')}<input type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={screen === 'signup' ? 6 : undefined} autoComplete={screen === 'signup' ? 'new-password' : 'current-password'} placeholder="••••••••" dir="ltr" /></label>}
              <button className="secondary-button full account-submit" type="submit">{busy ? <LoaderCircle size={18} className="account-spinner" aria-hidden="true" /> : <Mail size={18} aria-hidden="true" />}{t(action)}</button>
            </fieldset>
          </form>
          {error && <p className="error-box" role="alert">{t(error)}</p>}
          {message && <p className="account-success" role="status">{t(message)}</p>}
          {!(DEV_AUTH_ENABLED || FIREBASE_AUTH_ENABLED) && <p className="account-unavailable" role="status">{t('Account connection coming soon')}</p>}
          <div className="account-links">
            <button className="text-button" disabled={busy} onClick={() => changeScreen(screen === 'login' ? 'signup' : 'login')}>{t(screen === 'login' ? 'Create account' : 'Back to sign in')}</button>
            {screen === 'login' && <button className="text-button" disabled={busy} onClick={() => changeScreen('reset')}>{t('Forgot password?')}</button>}
          </div>
          {(DEV_AUTH_ENABLED || EMULATOR_AUTH_ENABLED) && screen === 'login' && <details className="account-development">
            <summary tabIndex={0}><span>{t('Choose a development account')}</span><ChevronDown size={16} aria-hidden="true" /></summary>
            <div className="dev-accounts">{DEV_ACCOUNTS.map(account => <button className="dev-account" key={account.uid} type="button" disabled={busy} onClick={() => { setEmail(account.email); setPassword(account.password); setError(''); }}><strong>{account.uid === 'dev-user-123' ? account.displayName : t(account.role === 'admin' ? 'Admin user' : 'Normal user')}</strong><code>{account.email}</code><small>{t('Password')}: <bdi>{account.password}</bdi></small></button>)}</div>
          </details>}
        </div>
      </section>
      {entry && <aside className="account-map-preview" aria-label={t('Route preview')}>
        <img src="/manzil-route-preview.svg" alt="" className="account-map-art" />
        <div className="account-preview-city"><MapPin size={18} aria-hidden="true" />{t('Islamabad')}</div>
        <button type="button" className="entry-motion-control" aria-label={t(backgroundPaused ? 'Play background animation' : 'Pause background animation')} title={t(backgroundPaused ? 'Play background animation' : 'Pause background animation')} aria-pressed={backgroundPaused} onClick={() => setBackgroundPaused(value => !value)}>{backgroundPaused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}</button>
        <div className="account-preview-legend" aria-hidden="true"><span><i className="preview-route-key" />{t('Recommended route')}</span><span><i className="preview-closed-key" />{t('Closed')}</span></div>
      </aside>}
    </div>
  </Modal>;
}

export function PersonalFeatureGate({ onSignIn }: { onSignIn: () => void }) {
  return <div className="personal-gate"><ShieldCheck size={34} /><h1>{t('Sign in for personal features')}</h1><p className="muted">{t('Sign in to access your saved journeys, trip history and personal alerts.')}</p><button className="primary-button full" onClick={onSignIn}>{t('Sign in')}</button></div>;
}
