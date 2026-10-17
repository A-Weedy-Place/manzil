import { AUTH_MODE, authorizationHeaders, FIREBASE_AUTH_ENABLED, getAuthSession } from './auth';
let runtime: Promise<void> | undefined;
async function checkRuntime() {
  if (!FIREBASE_AUTH_ENABLED) return;
  return runtime ??= fetch('/api/runtime').then(async response => {
    if (!response.ok) throw new Error('Could not verify backend configuration.');
    const value = await response.json();
    if (value.auth !== 'firebase' || value.storage !== 'firestore' || value.projectId !== import.meta.env.VITE_FIREBASE_PROJECT_ID || value.mode !== (AUTH_MODE === 'emulator' ? 'emulator' : 'production')) throw new Error('Frontend and backend environments do not match.');
  }).catch(error => { runtime = undefined; throw error; });
}
const PREFERENCES = 'manzil-guest-appearance-v1';
function guestPreferences(): Record<string, unknown> { try { return JSON.parse(localStorage.getItem(PREFERENCES) ?? '{}'); } catch { return {}; } }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const userId = getAuthSession().user?.uid;
  await checkRuntime();
  if (userId !== getAuthSession().user?.uid) throw new Error('Account changed. Please retry.');
  if (FIREBASE_AUTH_ENABLED && !userId && path === '/profile' && init.method === 'PATCH') {
    const patch = JSON.parse(String(init.body));
    if (Object.keys(patch).some(key => !['theme', 'mapStyle', 'mapDetail'].includes(key))) throw new Error('Sign in for personal settings.');
    const next = { ...guestPreferences(), ...patch };
    localStorage.setItem(PREFERENCES, JSON.stringify(next)); return next as T;
  }
  const accountHeaders = await authorizationHeaders();
  if (userId !== getAuthSession().user?.uid) throw new Error('Account changed. Please retry.');
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...accountHeaders, ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(path.includes('/source/check') ? 75000 : 30000),
  });
  const data = await response.json().catch(() => ({ error: 'The local server returned an unreadable response.' }));
  if (userId !== getAuthSession().user?.uid) throw new Error('Account changed. Please retry.');
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  if (FIREBASE_AUTH_ENABLED && !userId && path === '/state' && data.profile) data.profile = { ...data.profile, ...guestPreferences() };
  return data as T;
}
export function send<T>(path: string, data: unknown, method = 'POST') {
  return api<T>(path, { method, body: JSON.stringify(data) });
}
