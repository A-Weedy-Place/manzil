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
it('preserves old guest appearance rather than forcing a new map style, including later choices across reloads', async () => {
  localStorage.setItem('manzil-guest-appearance-v1', JSON.stringify({ theme: 'light', mapStyle: 'night', mapDetail: 'detailed' }));
  let client = await import('../src/lib/api');
  expect((await client.api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'light', mapStyle: 'night', mapDetail: 'standard' });
  await client.send('/profile', { theme: 'light', mapStyle: 'minimal' }, 'PATCH');
  vi.resetModules(); client = await import('../src/lib/api');
  expect((await client.api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'light', mapStyle: 'minimal', mapDetail: 'standard' });
});
it('starts a fresh guest Dark/Classic and applies the first explicit appearance change', async () => {
  const { send, api } = await import('../src/lib/api');
  expect((await api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'dark', mapStyle: 'outdoors' });
  await send('/profile', { theme: 'light' }, 'PATCH');
  expect((await api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'light', mapStyle: 'outdoors' });
});
it('supports session-only preferences when browser storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
  const { send, api } = await import('../src/lib/api');
  expect((await api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'dark', mapStyle: 'outdoors' });
  await send('/profile', { theme: 'light', mapStyle: 'minimal' }, 'PATCH');
  expect((await api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'light', mapStyle: 'minimal' });
});
it('retains deliberate v2 Night/System preferences and fills only a missing map field with Classic', async () => {
  localStorage.setItem('manzil-guest-appearance-v2', JSON.stringify({ theme: 'system', mapStyle: 'night', mapDetail: 'standard' }));
  let client = await import('../src/lib/api');
  expect((await client.api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'system', mapStyle: 'night', mapDetail: 'standard' });
  localStorage.setItem('manzil-guest-appearance-v2', JSON.stringify({ theme: 'light', mapDetail: 'clean' }));
  vi.resetModules(); client = await import('../src/lib/api');
  expect((await client.api<{ profile: unknown }>('/state')).profile).toMatchObject({ theme: 'light', mapStyle: 'outdoors', mapDetail: 'clean' });
});
