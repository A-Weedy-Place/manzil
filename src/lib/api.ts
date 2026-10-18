import { AUTH_MODE, authorizationHeaders, FIREBASE_AUTH_ENABLED, getAuthSession } from './auth';
const runtimes = new Map<string,Promise<void>>();
function requestOrigin(path: string) {
  const value = import.meta.env.VITE_AGENT_RUN_ORIGIN;
  if (path !== '/agent/run' || AUTH_MODE !== 'firebase' || !value) return '';
  const url = new URL(value);
  if (url.origin !== value || url.protocol !== 'https:' || !/^[a-z0-9-]+\.a\.run\.app$/.test(url.hostname) || url.username || url.password || url.port)
    throw new Error('Analysis API origin is not a valid Cloud Run origin.');
  return value;
}
async function checkRuntime(origin = '') {
  if (!FIREBASE_AUTH_ENABLED) return;
  if (runtimes.has(origin)) return runtimes.get(origin);
  const task = fetch(`${origin}/api/runtime`).then(async response => {
    if (!response.ok) throw new Error('Could not verify backend configuration.');
    const value = await response.json();
    if (value.auth !== 'firebase' || value.storage !== 'firestore' || value.projectId !== import.meta.env.VITE_FIREBASE_PROJECT_ID || value.mode !== (AUTH_MODE === 'emulator' ? 'emulator' : 'production')) throw new Error('Frontend and backend environments do not match.');
  }).catch(error => { runtimes.delete(origin); throw error; });
  runtimes.set(origin,task); return task;
}
const PREFERENCES = 'manzil-guest-appearance-v1';
function guestPreferences(): Record<string, unknown> { try { return JSON.parse(localStorage.getItem(PREFERENCES) ?? '{}'); } catch { return {}; } }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const userId = getAuthSession().user?.uid;
  const origin = requestOrigin(path);
  await checkRuntime();
  if (origin) await checkRuntime(origin);
  if (userId !== getAuthSession().user?.uid) throw new Error('Account changed. Please retry.');
  if (FIREBASE_AUTH_ENABLED && !userId && path === '/profile' && init.method === 'PATCH') {
    const patch = JSON.parse(String(init.body));
    if (Object.keys(patch).some(key => !['theme', 'mapStyle', 'mapDetail'].includes(key))) throw new Error('Sign in for personal settings.');
    const next = { ...guestPreferences(), ...patch };
    localStorage.setItem(PREFERENCES, JSON.stringify(next)); return next as T;
  }
  const accountHeaders = await authorizationHeaders();
  if (userId !== getAuthSession().user?.uid) throw new Error('Account changed. Please retry.');
  const response = await fetch(`${origin}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...accountHeaders, ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(path.includes('/agent/run') ? 170000 : path.includes('/source/check') ? 75000 : path.includes('/agent/notices/') && /\/(prepare|refine)$/.test(path) ? 55000 : 30000),
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
