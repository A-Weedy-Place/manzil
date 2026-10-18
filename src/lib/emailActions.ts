import type { Language } from '../../shared/speech';

export interface EmailActionRequest {
  mode: 'resetPassword' | 'verifyEmail' | 'recoverEmail' | 'unsupported';
  code: string | null;
  language: Language | null;
}

/** Call once before mounting React; no URL-supplied API key or redirect is trusted. */
export function readEmailAction(search: string, pathname = '/'): EmailActionRequest | null {
  const query = new URLSearchParams(search);
  if (pathname !== '/account/action' && !query.has('mode') && !query.has('oobCode')) return null;
  const mode = query.get('mode');
  const rawCode = query.get('oobCode');
  const valid = query.getAll('mode').length === 1 && query.getAll('oobCode').length === 1;
  const code = valid && rawCode && /^[A-Za-z0-9_-]{1,2048}$/.test(rawCode) ? rawCode : null;
  const lang = query.get('lang')?.toLowerCase();
  return {
    mode: mode === 'resetPassword' || mode === 'verifyEmail' || mode === 'recoverEmail' ? mode : 'unsupported',
    code,
    language: lang === 'ur' || lang?.startsWith('ur-') ? 'ur' : lang === 'en' || lang?.startsWith('en-') ? 'en' : null,
  };
}

/** Custom Firebase action URLs affect all templates. Preserve the other actions on Firebase's handler. */
export function hostedEmailActionUrl(request: EmailActionRequest, authDomain: string | undefined, apiKey: string | undefined): string | null {
  if (!request.code || !['verifyEmail', 'recoverEmail'].includes(request.mode) || !authDomain || !apiKey) return null;
  if (!/^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(authDomain) || !authDomain.includes('.') || authDomain.includes('..')) return null;
  const url = new URL(`https://${authDomain}/__/auth/action`);
  url.searchParams.set('mode', request.mode); url.searchParams.set('oobCode', request.code);
  url.searchParams.set('apiKey', apiKey);
  if (request.language) url.searchParams.set('lang', request.language);
  return url.href;
}

export type ResetProblem = 'expired' | 'network' | 'disabled' | 'weak' | 'configuration' | 'unknown';
/** Never render Firebase's raw message, token, email action URL or arbitrary error codes. */
export function passwordResetProblem(error: unknown): ResetProblem {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code' || code === 'auth/user-not-found') return 'expired';
  if (code === 'auth/network-request-failed' || code === 'auth/too-many-requests') return 'network';
  if (code === 'auth/user-disabled') return 'disabled';
  if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') return 'weak';
  if (code === 'auth/invalid-api-key' || code === 'auth/app-not-authorized' || code === 'auth/operation-not-allowed' || code === 'auth/unauthorized-domain') return 'configuration';
  return 'unknown';
}
