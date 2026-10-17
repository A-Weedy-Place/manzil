import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const identity = vi.hoisted(() => ({ uid: 'alice', headers: vi.fn() }));
vi.mock('../src/lib/auth', () => ({ AUTH_MODE: 'firebase', FIREBASE_AUTH_ENABLED: true, getAuthSession: () => ({ user: { uid: identity.uid } }), authorizationHeaders: identity.headers }));
const runtime = () => new Response(JSON.stringify({ mode: 'production', auth: 'firebase', storage: 'firestore', projectId: 'manzil-example' }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { identity.uid = 'alice'; identity.headers.mockReset().mockResolvedValue({ Authorization: 'Bearer alice-token' }); vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'manzil-example'); });
afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('never sends a personal payload under an account switched during runtime validation', async () => {
  const pending = deferred<Response>();
  const fetcher = vi.fn(() => pending.promise); vi.stubGlobal('fetch', fetcher);
  const { send } = await import('../src/lib/api');
  const request = send('/trips', { name: 'Alice trip', points: [] });
  identity.uid = 'bob'; pending.resolve(runtime());
  await expect(request).rejects.toThrow('Account changed');
  expect(fetcher.mock.calls).toEqual([['/api/runtime']]);
  expect(identity.headers).not.toHaveBeenCalled();
});

it('never sends a personal payload with another account token after asynchronous token retrieval', async () => {
  const token = deferred<Record<string, string>>(); identity.headers.mockReturnValue(token.promise);
  const fetcher = vi.fn(async () => runtime()); vi.stubGlobal('fetch', fetcher);
  const { send } = await import('../src/lib/api');
  const request = send('/trips', { name: 'Alice trip', points: [] });
  await vi.waitFor(() => expect(identity.headers).toHaveBeenCalledTimes(1));
  identity.uid = 'bob'; token.resolve({ Authorization: 'Bearer bob-token' });
  await expect(request).rejects.toThrow('Account changed');
  expect(fetcher.mock.calls).toEqual([['/api/runtime']]);
});
