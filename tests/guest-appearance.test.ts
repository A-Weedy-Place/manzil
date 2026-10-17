// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/lib/auth', () => ({ AUTH_MODE: 'emulator', FIREBASE_AUTH_ENABLED: true, getAuthSession: () => ({ user: null }), authorizationHeaders: async () => ({}) }));
beforeEach(() => {
  localStorage.clear(); vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-manzil');
  vi.stubGlobal('fetch', vi.fn(async (path: string) => new Response(JSON.stringify(path === '/api/runtime'
    ? { mode: 'emulator', auth: 'firebase', storage: 'firestore', projectId: 'demo-manzil' }
    : { profile: { theme: 'light', mapStyle: 'outdoors', mapDetail: 'clean', displayName: 'Traveller' } }))));
});
afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); localStorage.clear(); });
it('corrects old guest appearance once, preserving detail and later deliberate choices across reloads', async () => {
  localStorage.setItem('manzil-guest-appearance-v1', JSON.stringify({ theme: 'light', mapStyle: 'outdoors', mapDetail: 'detailed' }));
  let client = await import('../src/lib/api');
  expect((await client.api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'dark', mapStyle: 'night', mapDetail: 'detailed' });
  await client.send('/profile', { theme: 'light', mapStyle: 'minimal' }, 'PATCH');
  vi.resetModules(); client = await import('../src/lib/api');
  expect((await client.api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'light', mapStyle: 'minimal', mapDetail: 'detailed' });
});
it('applies an explicit first change after migrating instead of discarding that choice', async () => {
  const { send, api } = await import('../src/lib/api');
  await send('/profile', { theme: 'light' }, 'PATCH');
  expect((await api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'light', mapStyle: 'night' });
});
it('supports session-only preferences when browser storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
  const { send, api } = await import('../src/lib/api');
  expect((await api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'dark', mapStyle: 'night' });
  await send('/profile', { theme: 'light', mapStyle: 'minimal' }, 'PATCH');
  expect((await api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'light', mapStyle: 'minimal' });
});
