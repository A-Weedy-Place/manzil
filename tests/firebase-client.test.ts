// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => {
  const auth = { currentUser: null as null | { uid: string; email: string; displayName: string; getIdToken: () => Promise<string>; getIdTokenResult: () => Promise<{ claims: { admin: boolean } }> } };
  return { auth, tokenChanged: null as null | ((user: typeof auth.currentUser) => Promise<void>), emulator: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
});
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: () => ({ name: 'test-app' }) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => fixture.auth, browserSessionPersistence: {}, setPersistence: async () => {}, connectAuthEmulator: fixture.emulator,
  onIdTokenChanged: (_auth: unknown, callback: typeof fixture.tokenChanged) => { fixture.tokenChanged = callback; },
  signInWithEmailAndPassword: fixture.signIn, signOut: fixture.signOut,
}));
async function client(mode: 'firebase' | 'emulator') {
  vi.stubEnv('VITE_AUTH_MODE', mode); vi.stubEnv('VITE_FIREBASE_PROJECT_ID', mode === 'emulator' ? 'demo-manzil' : 'manzil-example');
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'public-config'); vi.stubEnv('VITE_FIREBASE_APP_ID', 'public-app-id');
  const result = await import('../src/lib/auth');
  await result.signInAccount('user@example.test', 'test'); return result;
}
afterEach(() => { fixture.auth.currentUser = null; fixture.tokenChanged = null; vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('uses real SDK tokens and signed claims in Firebase mode, without dummy identities or emulator connections', async () => {
  const auth = await client('firebase');
  expect(auth.DEV_AUTH_ENABLED).toBe(false); expect(auth.DEV_ACCOUNTS).toEqual([]); expect(fixture.emulator).not.toHaveBeenCalled();
  const user = { uid: 'alice', email: 'alice@example.test', displayName: 'Alice', getIdToken: async () => 'verified-sdk-token', getIdTokenResult: async () => ({ claims: { admin: true } }) };
  fixture.auth.currentUser = user; await fixture.tokenChanged!(user);
  expect(auth.getAuthSession().user).toMatchObject({ uid: 'alice', role: 'admin', provider: 'firebase' });
  expect(await auth.authorizationHeaders()).toEqual({ Authorization: 'Bearer verified-sdk-token' });
  auth.signOut(); expect(await auth.authorizationHeaders()).toEqual({});
});
it('explicitly connects emulator mode to loopback and retains the test account picker only in development', async () => {
  const auth = await client('emulator');
  expect(fixture.emulator).toHaveBeenCalledWith(fixture.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  expect(auth.DEV_ACCOUNTS).toHaveLength(2); expect(auth.DEV_AUTH_ENABLED).toBe(false);
  expect(() => auth.signInDevelopment('admin@manzil.test', 'ManzilAdmin123!')).toThrow('unavailable');
});
it('refuses to send requests to a mismatched standalone backend instead of falling back to shared local records', async () => {
  await client('firebase');
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ mode: 'local', auth: 'development', storage: 'sqlite' })));
  vi.stubGlobal('fetch', fetcher);
  const { api } = await import('../src/lib/api');
  await expect(api('/state')).rejects.toThrow('do not match');
  expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledWith('/api/runtime');
});
