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

it('uses the configured public Cloud Run API only for analysis after checking its project without credentials',async()=>{
  const origin='https://manzil-api-example-as.a.run.app'; vi.stubEnv('VITE_AGENT_RUN_ORIGIN',origin);
  const fetcher=vi.fn(async(url:string)=>url.endsWith('/runtime')?runtime():new Response('{"processed":1}')); vi.stubGlobal('fetch',fetcher);
  const {send}=await import('../src/lib/api'); await send('/agent/run',{});
  expect(fetcher.mock.calls.slice(0,2)).toEqual([['/api/runtime'],[origin+'/api/runtime']]);
  expect(fetcher).toHaveBeenLastCalledWith(origin+'/api/agent/run',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer alice-token'})}));
  await send('/profile',{}); expect(fetcher).toHaveBeenLastCalledWith('/api/profile',expect.anything());
});
it('never forwards an account token to an invalid or different-project analysis API',async()=>{
  vi.stubEnv('VITE_AGENT_RUN_ORIGIN','https://foreign.example'); const fetcher=vi.fn(); vi.stubGlobal('fetch',fetcher);
  const {send}=await import('../src/lib/api'); await expect(send('/agent/run',{})).rejects.toThrow(/valid Cloud Run/);
  expect(fetcher).not.toHaveBeenCalled(); expect(identity.headers).not.toHaveBeenCalled();
  vi.stubEnv('VITE_AGENT_RUN_ORIGIN','https://manzil-api-example-as.a.run.app');
  fetcher.mockResolvedValueOnce(runtime()).mockResolvedValueOnce(new Response('{"mode":"production","auth":"firebase","storage":"firestore","projectId":"wrong-project"}'));
  await expect(send('/agent/run',{})).rejects.toThrow(/do not match/); expect(identity.headers).not.toHaveBeenCalled();
});
