import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, LoaderCircle } from 'lucide-react';
import { completeAccountPasswordReset, FIREBASE_AUTH_ENABLED, verifyAccountPasswordReset } from '../lib/auth';
import { getLanguage } from '../lib/language';
import { hostedEmailActionUrl, passwordResetProblem, type EmailActionRequest, type ResetProblem } from '../lib/emailActions';
import type { Language } from '../../shared/speech';
import '../password-reset.css';

const copy = {
  en: {
    title: 'Choose a new password', checking: 'Checking your reset link…', newPassword: 'New password', repeatPassword: 'Re-enter password',
    show: 'Show password', hide: 'Hide password', save: 'Save new password', saving: 'Saving…', back: 'Back to sign in',
    success: 'Password updated', successBody: 'Sign in with your new password.', mismatch: 'The passwords do not match.',
    minimum: 'Use at least 6 characters.', expired: 'This reset link has expired or has already been used. Request a new link from Forgot password.',
    network: 'Could not reach the account service. Check your connection and try again.', disabled: 'This account is disabled. Contact the administrator.',
    weak: 'Choose a stronger password that meets your account requirements.', configuration: 'Account recovery is unavailable on this site. Contact the administrator.',
    unknown: 'Could not complete this request. Please try again.', retry: 'Try again', invalid: 'This link is incomplete or unsupported. Open the complete link from your email.',
    verifyTitle: 'Verify your email', recoverTitle: 'Recover your email', continue: 'Continue securely', hosted: 'Continue with Firebase to finish this account action.',
  },
  ur: {
    title: 'نیا پاس ورڈ منتخب کریں', checking: 'پاس ورڈ کے لنک کی جانچ ہو رہی ہے…', newPassword: 'نیا پاس ورڈ', repeatPassword: 'پاس ورڈ دوبارہ درج کریں',
    show: 'پاس ورڈ دکھائیں', hide: 'پاس ورڈ چھپائیں', save: 'نیا پاس ورڈ محفوظ کریں', saving: 'محفوظ ہو رہا ہے…', back: 'سائن ان پر واپس جائیں',
    success: 'پاس ورڈ تبدیل ہو گیا', successBody: 'اپنے نئے پاس ورڈ سے سائن ان کریں۔', mismatch: 'دونوں پاس ورڈ ایک جیسے نہیں ہیں۔',
    minimum: 'کم از کم 6 حروف استعمال کریں۔', expired: 'یہ لنک ختم ہو چکا ہے یا استعمال ہو چکا ہے۔ پاس ورڈ بھول گئے سے نیا لنک حاصل کریں۔',
    network: 'اکاؤنٹ سروس سے رابطہ نہیں ہو سکا۔ اپنا انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔', disabled: 'یہ اکاؤنٹ بند ہے۔ منتظم سے رابطہ کریں۔',
    weak: 'اکاؤنٹ کی شرائط کے مطابق زیادہ مضبوط پاس ورڈ منتخب کریں۔', configuration: 'اس سائٹ پر اکاؤنٹ کی بحالی دستیاب نہیں۔ منتظم سے رابطہ کریں۔',
    unknown: 'درخواست مکمل نہیں ہو سکی۔ دوبارہ کوشش کریں۔', retry: 'دوبارہ کوشش کریں', invalid: 'یہ لنک نامکمل ہے یا دستیاب نہیں۔ اپنی ای میل سے مکمل لنک کھولیں۔',
    verifyTitle: 'ای میل کی تصدیق کریں', recoverTitle: 'ای میل بحال کریں', continue: 'محفوظ طریقے سے آگے بڑھیں', hosted: 'یہ کارروائی مکمل کرنے کے لیے Firebase پر جائیں۔',
  },
};

type State = 'checking' | 'ready' | 'failed' | 'complete';
export default function PasswordResetPage({ request }: { request: EmailActionRequest }) {
  const [language, setLanguage] = useState<Language>(request.language ?? getLanguage());
  const text = copy[language], [state, setState] = useState<State>('checking');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [repeat, setRepeat] = useState('');
  const [visible, setVisible] = useState(false), [repeatVisible, setRepeatVisible] = useState(false);
  const [problem, setProblem] = useState<ResetProblem | null>(null), [fieldError, setFieldError] = useState<'minimum' | 'mismatch' | null>(null);
  const [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  const passwordId = useId(), repeatId = useId(), errorId = useId();
  const passwordField = useRef<HTMLInputElement>(null), repeatField = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null), operation = useRef(0), submitting = useRef(false);
  const reset = request.mode === 'resetPassword' && !!request.code;
  const forward = hostedEmailActionUrl(request, import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, import.meta.env.VITE_FIREBASE_API_KEY);

  useEffect(() => {
    // Avoid leaking a one-time code to another origin through referrer headers.
    const previous = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const meta = previous ?? document.createElement('meta'), original = previous?.content;
    meta.name = 'referrer'; meta.content = 'no-referrer'; if (!previous) document.head.append(meta);
    return () => { if (previous) meta.content = original ?? ''; else meta.remove(); };
  }, []);

  useEffect(() => {
    const version = ++operation.current;
    setPassword(''); setRepeat(''); setVisible(false); setRepeatVisible(false); setEmail('');
    setProblem(null); setFieldError(null); setBusy(false); submitting.current = false;
    if (!reset) { setState('failed'); return; }
    if (!FIREBASE_AUTH_ENABLED) { setState('failed'); setProblem('configuration'); return; }
    setState('checking');
    void verifyAccountPasswordReset(request.code!).then(value => {
      if (version !== operation.current) return;
      setEmail(value); setState('ready');
    }, error => {
      if (version !== operation.current) return;
      setState('failed'); setProblem(passwordResetProblem(error));
    });
    return () => { operation.current++; };
  }, [reset, request.code, attempt]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state !== 'ready' || submitting.current || !request.code) return;
    setProblem(null); setFieldError(null);
    if (password.length < 6) { setFieldError('minimum'); passwordField.current?.focus(); return; }
    if (password !== repeat) { setFieldError('mismatch'); repeatField.current?.focus(); return; }
    submitting.current = true; setBusy(true); const version = operation.current;
    try {
      await completeAccountPasswordReset(request.code, password);
      if (version !== operation.current) return;
      setPassword(''); setRepeat(''); setVisible(false); setRepeatVisible(false); setState('complete');
      // A used action code should not remain in the address bar or browser history entry.
      window.history.replaceState(null, '', '/account/action');
    } catch (error) {
      if (version !== operation.current) return;
      const next = passwordResetProblem(error); setProblem(next);
      if (['expired', 'disabled', 'configuration'].includes(next)) { setState('failed'); setPassword(''); setRepeat(''); }
      requestAnimationFrame(() => errorBox.current?.focus());
    } finally {
      if (version === operation.current) { submitting.current = false; setBusy(false); }
    }
  }

  const title = state === 'complete' ? text.success : request.mode === 'verifyEmail' ? text.verifyTitle : request.mode === 'recoverEmail' ? text.recoverTitle : text.title;
  return <main className="password-reset-page" lang={language} dir={language === 'ur' ? 'rtl' : 'ltr'}>
    <section className="password-reset-card" aria-labelledby="password-reset-title">
      <button type="button" className="password-reset-language" aria-label={language === 'en' ? 'Switch to Urdu' : 'Switch to English'} onClick={() => setLanguage(value => value === 'en' ? 'ur' : 'en')}>{language === 'en' ? 'اردو' : 'English'}</button>
      <header className="password-reset-brand"><img src="/manzil-logo.png" width="76" height="76" alt="" /><span>Manzil</span></header>
      <div className={`password-reset-symbol${state === 'complete' ? ' complete' : ''}`} aria-hidden="true">{state === 'complete' ? <Check size={26} /> : <KeyRound size={26} />}</div>
      <h1 id="password-reset-title">{title}</h1>
      {state === 'checking' && reset && <p className="password-reset-status" role="status"><LoaderCircle size={19} className="password-reset-spinner" aria-hidden="true" />{text.checking}</p>}
      {state === 'ready' && <>
        <p className="password-reset-email" dir="ltr">{email}</p>
        <form onSubmit={submit} aria-label={text.title} aria-busy={busy} noValidate>
          <fieldset disabled={busy}>
            <div className="password-reset-field"><label htmlFor={passwordId}>{text.newPassword}</label><div className="password-reset-input"><input id={passwordId} ref={passwordField} type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} minLength={6} required dir="ltr" aria-invalid={fieldError === 'minimum' || problem === 'weak'} aria-describedby={fieldError === 'minimum' || problem === 'weak' ? errorId : undefined} onChange={event => { setPassword(event.target.value); setFieldError(null); setProblem(null); }} /><button type="button" aria-label={`${visible ? text.hide : text.show} · ${text.newPassword}`} aria-pressed={visible} aria-controls={passwordId} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button></div></div>
            <div className="password-reset-field"><label htmlFor={repeatId}>{text.repeatPassword}</label><div className="password-reset-input"><input id={repeatId} ref={repeatField} type={repeatVisible ? 'text' : 'password'} autoComplete="new-password" value={repeat} required dir="ltr" aria-invalid={fieldError === 'mismatch'} aria-describedby={fieldError === 'mismatch' ? errorId : undefined} onChange={event => { setRepeat(event.target.value); setFieldError(null); }} /><button type="button" aria-label={`${repeatVisible ? text.hide : text.show} · ${text.repeatPassword}`} aria-pressed={repeatVisible} aria-controls={repeatId} onClick={() => setRepeatVisible(value => !value)}>{repeatVisible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button></div></div>
            <button type="submit" className="password-reset-submit">{busy && <LoaderCircle size={18} className="password-reset-spinner" aria-hidden="true" />}{busy ? text.saving : text.save}</button>
          </fieldset>
        </form>
      </>}
      {(fieldError || problem) && <div id={errorId} className="password-reset-error" role="alert" tabIndex={-1} ref={errorBox}>{fieldError ? text[fieldError] : text[problem!]}</div>}
      {state === 'failed' && !problem && <p className="password-reset-status">{forward ? text.hosted : text.invalid}</p>}
      {state === 'failed' && problem && ['network', 'unknown'].includes(problem) && <button type="button" className="password-reset-retry" onClick={() => setAttempt(value => value + 1)}>{text.retry}</button>}
      {forward && <a className="password-reset-submit" href={forward} rel="noreferrer">{text.continue}</a>}
      {state === 'complete' && <p className="password-reset-status" role="status">{text.successBody}</p>}
      <a className="password-reset-back" href="/"><ArrowLeft size={17} aria-hidden="true" />{text.back}</a>
    </section>
  </main>;
}
