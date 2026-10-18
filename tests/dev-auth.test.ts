// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); sessionStorage.clear(); });
it('rejects unknown credentials and restores only a known development identity, never a stored role/password', async () => {
  vi.resetModules(); sessionStorage.clear();
  const auth = await import('../src/lib/auth');
  expect(auth.DEV_AUTH_ENABLED).toBe(true);
  expect(() => auth.signInDevelopment('admin@manzil.test', 'wrong')).toThrow('development accounts');
  expect(auth.getAuthSession().user).toBeNull();
  auth.signInDevelopment(' USER@MANZIL.TEST ', 'ManzilUser123!');
  expect(sessionStorage.getItem('manzil-dev-session')).toBe('dev-user');
  vi.resetModules(); const restored = await import('../src/lib/auth');
  expect(restored.getAuthSession().user).toMatchObject({ uid: 'dev-user', role: 'user' });
  restored.signOut(); expect(restored.getAuthSession().user).toBeNull();
});
it('does not expose working dummy accounts in production mode', async () => {
  vi.stubEnv('DEV', false); vi.resetModules();
  const auth = await import('../src/lib/auth');
  expect(auth.DEV_AUTH_ENABLED).toBe(false); expect(auth.DEV_ACCOUNTS).toEqual([]);
  expect(() => auth.signInDevelopment('admin@manzil.test', 'ManzilAdmin123!')).toThrow('unavailable');
});
it('accepts the exact User 123 sample credentials only as an ordinary development identity', async () => {
  const auth = await import('../src/lib/auth');
  expect(() => auth.signInDevelopment('user123@manzil.test', 'User123')).toThrow('development accounts');
  auth.signInDevelopment('user123@manzil.test', 'User 123');
  expect(auth.getAuthSession().user).toMatchObject({ uid: 'dev-user-123', displayName: 'User 123', role: 'user' });
});
it('does not enable dummy sign-in on a non-loopback host', async () => {
  vi.stubGlobal('window', { location: { hostname: 'example.org' } }); vi.resetModules();
  const auth = await import('../src/lib/auth');
  expect(auth.DEV_AUTH_ENABLED).toBe(false); expect(auth.getAuthSession().status).toBe('unconfigured');
});
