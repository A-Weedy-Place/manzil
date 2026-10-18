import { useSyncExternalStore } from 'react';

/** Development identities simulate UI roles only; the local API remains single-user. */
export interface AccountUser { uid: string; displayName: string | null; email: string | null; role: 'user' | 'admin'; provider: 'development' | 'firebase' }
export interface AuthSession { status: 'unconfigured' | 'loading' | 'guest' | 'signed_in'; user: AccountUser | null }
export const AUTH_MODE = import.meta.env.VITE_AUTH_MODE ?? (import.meta.env.DEV ? 'development' : 'unconfigured');
const loopback = typeof window !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
export const DEV_AUTH_ENABLED = import.meta.env.DEV && loopback && AUTH_MODE === 'development';
export const EMULATOR_AUTH_ENABLED = import.meta.env.DEV && loopback && AUTH_MODE === 'emulator';
export const FIREBASE_AUTH_ENABLED = AUTH_MODE === 'firebase' || EMULATOR_AUTH_ENABLED;
export const DEV_ACCOUNTS = DEV_AUTH_ENABLED || EMULATOR_AUTH_ENABLED ? [
  { uid: 'dev-user', displayName: 'Demo traveller', email: 'user@manzil.test', password: 'ManzilUser123!', role: 'user' as const },
  { uid: 'dev-admin', displayName: 'Demo administrator', email: 'admin@manzil.test', password: 'ManzilAdmin123!', role: 'admin' as const },
  { uid: 'dev-user-123', displayName: 'User 123', email: 'user123@manzil.test', password: 'User 123', role: 'user' as const },
] : [];
const KEY = 'manzil-dev-session';
const TRAVEL_CHOICE_KEY = 'manzil-travel-data-choice-v1:';
const REGISTRATION_TOUR_KEY = 'manzil-registration-tour-v1:';
const pendingTravelChoices = new Set<string>();
const pendingRegistrationTours = new Set<string>();
let creatingAccounts = 0;
/** Suppress first-use UI while the SDK may announce a UID before registration resolves. */
export function isCreatingAccount(): boolean { return creatingAccounts > 0; }
/** Only successful registration sets this account-bound, optional onboarding marker. */
export function needsTravelDataChoice(uid: string): boolean {
  if (pendingTravelChoices.has(uid)) return true;
  try { return sessionStorage.getItem(TRAVEL_CHOICE_KEY + encodeURIComponent(uid)) === 'pending'; }
  catch { return false; }
}
export function clearTravelDataChoicePrompt(uid: string): void {
  pendingTravelChoices.delete(uid);
  try { sessionStorage.removeItem(TRAVEL_CHOICE_KEY + encodeURIComponent(uid)); } catch { /* Memory-only acknowledgement still works. */ }
}
/** A successful registration, rather than a device's missing completion flag, starts the tour. */
export function needsRegistrationTour(uid: string): boolean {
  if (pendingRegistrationTours.has(uid)) return true;
  try { return sessionStorage.getItem(REGISTRATION_TOUR_KEY + encodeURIComponent(uid)) === 'pending'; }
  catch { return false; }
}
export function clearRegistrationTour(uid: string): void {
  pendingRegistrationTours.delete(uid);
  try { sessionStorage.removeItem(REGISTRATION_TOUR_KEY + encodeURIComponent(uid)); } catch { /* Tab storage is optional. */ }
}
function markRegistrationTour(uid: string): void {
  pendingRegistrationTours.add(uid);
  try { sessionStorage.setItem(REGISTRATION_TOUR_KEY + encodeURIComponent(uid), 'pending'); } catch { /* Keep the registration intent in memory. */ }
}
function discardRegistrationTours(): void {
  pendingRegistrationTours.clear();
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(REGISTRATION_TOUR_KEY)) sessionStorage.removeItem(key);
    }
  } catch { /* Memory-only sign-out still works. */ }
}
function markTravelDataChoicePrompt(uid: string): void {
  pendingTravelChoices.add(uid);
  try { sessionStorage.setItem(TRAVEL_CHOICE_KEY + encodeURIComponent(uid), 'pending'); } catch { /* The choice remains available for this visit. */ }
}
const empty: AuthSession = { status: DEV_AUTH_ENABLED || FIREBASE_AUTH_ENABLED ? 'guest' : 'unconfigured', user: null };
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
  discardRegistrationTours();
  if (FIREBASE_AUTH_ENABLED) {
    generation++; publish(empty);
    void initializeFirebase().then(({ auth, sdk }) => sdk.signOut(auth)).catch(() => {});
    return;
  }
  try { sessionStorage.removeItem(KEY); } catch { /* Storage is optional in development. */ }
  publish(empty);
}
export const getAuthSession = () => session;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useAuth(): AuthSession { return useSyncExternalStore(subscribe, getAuthSession, () => empty); }

let generation = 0;
let firebaseReady: Promise<{ auth: import('firebase/auth').Auth; sdk: typeof import('firebase/auth') }> | undefined;
async function initializeFirebase() {
  if (!FIREBASE_AUTH_ENABLED) throw new Error('Firebase authentication is not configured.');
  return firebaseReady ??= (async () => {
    const [{ initializeApp, getApps }, sdk] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId || !import.meta.env.VITE_FIREBASE_API_KEY || !import.meta.env.VITE_FIREBASE_APP_ID) throw new Error('Firebase web configuration is missing.');
    if (EMULATOR_AUTH_ENABLED && !projectId.startsWith('demo-')) throw new Error('Local authentication requires a demo project.');
    if (AUTH_MODE === 'firebase' && projectId.startsWith('demo-')) throw new Error('Production authentication cannot use a demo project.');
    const app = getApps().find(value => value.name === 'manzil-web') ?? initializeApp({ projectId, apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      appId: import.meta.env.VITE_FIREBASE_APP_ID, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN }, 'manzil-web');
    const auth = sdk.getAuth(app);
    if (EMULATOR_AUTH_ENABLED) sdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    await sdk.setPersistence(auth, sdk.browserSessionPersistence);
    sdk.onIdTokenChanged(auth, async user => {
      const version = ++generation;
      if (!user) { publish(empty); return; }
      try {
        const token = await user.getIdTokenResult();
        if (version !== generation) return;
        publish({ status: 'signed_in', user: { uid: user.uid, displayName: user.displayName ?? user.email?.split('@')[0] ?? 'Traveller', email: user.email,
          role: token.claims.admin === true ? 'admin' : 'user', provider: 'firebase' } });
      } catch { if (version === generation) publish(empty); }
    });
    return { auth, sdk };
  })();
}
if (FIREBASE_AUTH_ENABLED) {
  session = { status: 'loading', user: null };
  void initializeFirebase().catch(() => publish({ status: 'unconfigured', user: null }));
}
export async function signInAccount(email: string, password: string) {
  if (DEV_AUTH_ENABLED) { signInDevelopment(email, password); return; }
  const { auth, sdk } = await initializeFirebase();
  await sdk.signInWithEmailAndPassword(auth, email.trim(), password);
}
export async function createAccount(email: string, password: string): Promise<string> {
  const { auth, sdk } = await initializeFirebase();
  creatingAccounts++;
  try {
    const account = await sdk.createUserWithEmailAndPassword(auth, email.trim(), password);
    markTravelDataChoicePrompt(account.user.uid);
    markRegistrationTour(account.user.uid);
    return account.user.uid;
  } finally { creatingAccounts--; }
}
export async function resetPassword(email: string) {
  const { auth, sdk } = await initializeFirebase();
  await sdk.sendPasswordResetEmail(auth, email.trim());
}
/** Email action codes and passwords go directly to this build's configured Firebase project. */
export async function verifyAccountPasswordReset(code: string): Promise<string> {
  const { auth, sdk } = await initializeFirebase();
  return sdk.verifyPasswordResetCode(auth, code);
}
export async function completeAccountPasswordReset(code: string, password: string): Promise<void> {
  const { auth, sdk } = await initializeFirebase();
  await sdk.confirmPasswordReset(auth, code, password);
}
export async function authorizationHeaders(): Promise<Record<string, string>> {
  if (!FIREBASE_AUTH_ENABLED || !session.user) return {};
  const { auth } = await initializeFirebase(), user = auth.currentUser;
  if (!user || user.uid !== session.user?.uid) throw new Error('Account changed. Please retry.');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}
