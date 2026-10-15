import { useState } from 'react';
import { ArrowRight, Mail, ShieldCheck, X } from 'lucide-react';
import { t } from '../lib/language';
import Modal from './Modal';
import { DEV_ACCOUNTS, DEV_AUTH_ENABLED, signInDevelopment } from '../lib/auth';

/** Explicit localhost development login; Firebase will later supply real identity/tokens. */
export default function AccountPanel({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState('');
  function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (screen !== 'login') return;
    try { signInDevelopment(email, password); setPassword(''); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Development sign-in failed.'); }
  }
  return <Modal titleId="account-title" onClose={onClose} className="account-modal">
    <button className="icon-button modal-close" onClick={onClose} aria-label={t('Continue as guest')}><X size={20} /></button>
    <img className="account-logo" src="/manzil-logo.png" width="64" height="64" alt="Manzil" />
    <span className="eyebrow">MANZIL · منزل</span><h1 id="account-title">{t(screen === 'signup' ? 'Create account' : screen === 'reset' ? 'Reset password' : 'Your journeys, together.')}</h1>
    <p className="muted">{t('Plan a route without an account. Sign in later for personal features.')}</p>
    <div className="notice-box soft"><ShieldCheck size={21} /><div><strong>{t(DEV_AUTH_ENABLED ? 'Development sign-in' : 'Account connection coming soon')}</strong><p>{t(DEV_AUTH_ENABLED ? 'Dummy accounts unlock local testing. They share this local workspace and do not use Firebase.' : 'Firebase sign-in will be connected later. No password is collected or saved here.')}</p></div></div>
    <form onSubmit={submit} aria-label={t(screen === 'reset' ? 'Reset password' : 'Sign in')}>
      <fieldset disabled={!DEV_AUTH_ENABLED || screen !== 'login'} className="account-fields"><label className="field-label">{t('Email')}<input type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="off" placeholder="name@example.com" /></label>
        {screen !== 'reset' && <label className="field-label">{t('Password')}<input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="off" placeholder="••••••••" /></label>}
        <button className="primary-button full" type="submit"><Mail size={18} />{t(screen === 'reset' ? 'Reset password' : screen === 'signup' ? 'Create account' : 'Sign in')}</button>
      </fieldset>
    </form>
    {error && <p className="error-box" role="alert">{t(error)}</p>}
    {DEV_AUTH_ENABLED && screen === 'login' && <div className="dev-accounts"><span className="field-label">{t('Choose a development account')}</span>{DEV_ACCOUNTS.map(account => <button className="dev-account" key={account.uid} type="button" onClick={() => { setEmail(account.email); setPassword(account.password); setError(''); }}><strong>{t(account.role === 'admin' ? 'Admin user' : 'Normal user')}</strong><code>{account.email}</code><small>{t('Password')}: <bdi>{account.password}</bdi></small></button>)}</div>}
    <div className="row wrap"><button className="text-button" onClick={() => setScreen(screen === 'signup' || screen === 'reset' ? 'login' : 'signup')}>{t(screen === 'login' ? 'Create account' : 'Back to sign in')}</button>{screen === 'login' && <button className="text-button" onClick={() => setScreen('reset')}>{t('Forgot password?')}</button>}</div>
    <button className="primary-button full" onClick={onClose}>{t('Continue as guest')}<ArrowRight size={18} /></button>
  </Modal>;
}

export function PersonalFeatureGate({ onSignIn }: { onSignIn: () => void }) {
  return <div className="personal-gate"><ShieldCheck size={34} /><h1>{t('Sign in for personal features')}</h1><p className="muted">{t('Saved journeys, trip history and personal alerts will belong to your account when Firebase is connected.')}</p><button className="primary-button full" onClick={onSignIn}>{t('Sign in')}</button></div>;
}
