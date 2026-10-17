// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => {
  const auth = { currentUser: null as null | { uid: string; email: string; displayName: string; getIdToken: () => Promise<string>; getIdTokenResult: () => Promise<{ claims: { admin: boolean } }> } };
  return { auth, tokenChanged: null as null | ((user: typeof auth.currentUser) => Promise<void>), emulator: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), createAccount: vi.fn() };
});
vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: () => ({ name: 'test-app' }) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => fixture.auth, browserSessionPersistence: {}, setPersistence: async () => {}, connectAuthEmulator: fixture.emulator,
  onIdTokenChanged: (_auth: unknown, callback: typeof fixture.tokenChanged) => { fixture.tokenChanged = callback; },
  signInWithEmailAndPassword: fixture.signIn, signOut: fixture.signOut, createUserWithEmailAndPassword: fixture.createAccount,
}));
async function client(mode: 'firebase' | 'emulator') {
  vi.stubEnv('VITE_AUTH_MODE', mode); vi.stubEnv('VITE_FIREBASE_PROJECT_ID', mode === 'emulator' ? 'demo-manzil' : 'manzil-example');
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'public-config'); vi.stubEnv('VITE_FIREBASE_APP_ID', 'public-app-id');
  const result = await import('../src/lib/auth');
  await result.signInAccount('user@example.test', 'test'); return result;
}
afterEach(() => { fixture.auth.currentUser = null; fixture.tokenChanged = null; vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); vi.restoreAllMocks(); sessionStorage.clear(); });
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
  expect(auth.DEV_ACCOUNTS).toHaveLength(3); expect(auth.DEV_AUTH_ENABLED).toBe(false);
  expect(auth.DEV_ACCOUNTS.find(account => account.uid === 'dev-user-123')).toMatchObject({ displayName: 'User 123', email: 'user123@manzil.test', password: 'User 123', role: 'user' });
  expect(() => auth.signInDevelopment('admin@manzil.test', 'ManzilAdmin123!')).toThrow('unavailable');
});
it('prompts only a successfully registered UID and remembers its optional choice across reloads', async () => {
  const auth = await client('firebase');
  expect(auth.needsTravelDataChoice('new-user')).toBe(false);
  expect(auth.needsRegistrationTour('new-user')).toBe(false);
  fixture.createAccount.mockResolvedValueOnce({ user: { uid: 'new-user' } });
  expect(await auth.createAccount(' new@example.test ', 'password')).toBe('new-user');
  expect(fixture.createAccount).toHaveBeenCalledWith(fixture.auth, 'new@example.test', 'password');
  expect(auth.needsTravelDataChoice('new-user')).toBe(true);
  expect(auth.needsRegistrationTour('new-user')).toBe(true);
  expect(auth.needsRegistrationTour('other-user')).toBe(false);
  expect(auth.needsTravelDataChoice('other-user')).toBe(false);
  vi.resetModules(); const restored = await client('firebase');
  expect(restored.needsTravelDataChoice('new-user')).toBe(true);
  expect(restored.needsRegistrationTour('new-user')).toBe(true);
  restored.clearTravelDataChoicePrompt('other-user');
  expect(restored.needsTravelDataChoice('new-user')).toBe(true);
  restored.clearTravelDataChoicePrompt('new-user');
  expect(restored.needsTravelDataChoice('new-user')).toBe(false);
  expect(restored.needsRegistrationTour('new-user')).toBe(true);
  restored.clearRegistrationTour('new-user');
  expect(restored.needsRegistrationTour('new-user')).toBe(false);
  vi.resetModules(); expect((await client('firebase')).needsTravelDataChoice('new-user')).toBe(false);
});
it('keeps registration pending when the SDK publishes its new UID before the create call resolves', async () => {
  const auth = await client('firebase');
  let resolve!: (value: { user: { uid: string } }) => void;
  fixture.createAccount.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  expect(auth.isCreatingAccount()).toBe(false);
  const registering = auth.createAccount('new@example.test', 'password');
  await vi.waitFor(() => expect(auth.isCreatingAccount()).toBe(true));
  const user = { uid: 'announced-first', email: 'new@example.test', displayName: 'New traveller', getIdToken: async () => 'new-token', getIdTokenResult: async () => ({ claims: { admin: false } }) };
  fixture.auth.currentUser = user; await fixture.tokenChanged!(user);
  expect(auth.getAuthSession().user?.uid).toBe('announced-first');
  expect(auth.isCreatingAccount()).toBe(true); expect(auth.needsTravelDataChoice('announced-first')).toBe(false);
  resolve({ user });
  expect(await registering).toBe('announced-first');
  expect(auth.isCreatingAccount()).toBe(false); expect(auth.needsTravelDataChoice('announced-first')).toBe(true);
});
it('does not create an onboarding marker for failed registration and still supports a choice when tab storage is unavailable', async () => {
  const auth = await client('firebase');
  fixture.createAccount.mockRejectedValueOnce(new Error('Account could not be created.'));
  await expect(auth.createAccount('failed@example.test', 'password')).rejects.toThrow('could not be created');
  expect(auth.isCreatingAccount()).toBe(false);
  expect(auth.needsTravelDataChoice('failed-user')).toBe(false);
  expect(auth.needsRegistrationTour('failed-user')).toBe(false);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  fixture.createAccount.mockResolvedValueOnce({ user: { uid: 'memory-user' } });
  await auth.createAccount('memory@example.test', 'password');
  expect(auth.needsTravelDataChoice('memory-user')).toBe(true);
  expect(auth.needsRegistrationTour('memory-user')).toBe(true);
  auth.clearTravelDataChoicePrompt('memory-user');
  expect(auth.needsTravelDataChoice('memory-user')).toBe(false);
  auth.signOut(); expect(auth.needsRegistrationTour('memory-user')).toBe(false);
});
it('does not restart a registration tour after sign-out and ordinary sign-in', async () => {
  const auth = await client('firebase');
  fixture.createAccount.mockResolvedValueOnce({ user: { uid: 'new-user' } });
  await auth.createAccount('new@example.test', 'password');
  expect(auth.needsRegistrationTour('new-user')).toBe(true);
  auth.signOut(); await auth.signInAccount('new@example.test', 'password');
  expect(auth.needsRegistrationTour('new-user')).toBe(false);
  expect(sessionStorage.getItem('manzil-registration-tour-v1:new-user')).toBeNull();
});
it('refuses to send requests to a mismatched standalone backend instead of falling back to shared local records', async () => {
  await client('firebase');
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ mode: 'local', auth: 'development', storage: 'sqlite' })));
  vi.stubGlobal('fetch', fetcher);
  const { api } = await import('../src/lib/api');
  await expect(api('/state')).rejects.toThrow('do not match');
  expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledWith('/api/runtime');
});
