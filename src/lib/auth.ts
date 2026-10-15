import { useSyncExternalStore } from 'react';

/** Development identities simulate UI roles only; the local API remains single-user. */
export interface AccountUser { uid: string; displayName: string | null; email: string | null; role: 'user' | 'admin'; provider: 'development' }
export interface AuthSession { status: 'unconfigured' | 'loading' | 'guest' | 'signed_in'; user: AccountUser | null }
export const DEV_AUTH_ENABLED = import.meta.env.DEV && typeof window !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
export const DEV_ACCOUNTS = DEV_AUTH_ENABLED ? [
  { uid: 'dev-user', displayName: 'Demo traveller', email: 'user@manzil.test', password: 'ManzilUser123!', role: 'user' as const },
  { uid: 'dev-admin', displayName: 'Demo administrator', email: 'admin@manzil.test', password: 'ManzilAdmin123!', role: 'admin' as const },
] : [];
const KEY = 'manzil-dev-session';
const empty: AuthSession = { status: DEV_AUTH_ENABLED ? 'guest' : 'unconfigured', user: null };
let session = empty;
const listeners = new Set<() => void>();
function identity(account: (typeof DEV_ACCOUNTS)[number]): AccountUser {
  return { uid: account.uid, displayName: account.displayName, email: account.email, role: account.role, provider: 'development' };
}
function restore() {
  if (!DEV_AUTH_ENABLED) return empty;
  try { const account = DEV_ACCOUNTS.find(value => value.uid === sessionStorage.getItem(KEY)); return account ? { status: 'signed_in' as const, user: identity(account) } : empty; }
  catch { return empty; }
}
session = restore();
function publish(next: AuthSession) { session = next; for (const listener of listeners) listener(); }
export function signInDevelopment(email: string, password: string) {
  if (!DEV_AUTH_ENABLED) throw new Error('Development sign-in is unavailable outside localhost development.');
  const account = DEV_ACCOUNTS.find(value => value.email === email.trim().toLowerCase() && value.password === password);
  if (!account) throw new Error('Use one of the development accounts shown below.');
  try { sessionStorage.setItem(KEY, account.uid); } catch { /* Memory-only login still works. */ }
  publish({ status: 'signed_in', user: identity(account) });
}
export function signOut() {
  try { sessionStorage.removeItem(KEY); } catch { /* Storage is optional in development. */ }
  publish(empty);
}
export const getAuthSession = () => session;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useAuth(): AuthSession { return useSyncExternalStore(subscribe, getAuthSession, () => empty); }
