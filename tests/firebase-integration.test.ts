import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { deleteApp } from 'firebase-admin/app';
import { firebaseServices } from '../server/firebase';
import { FirestoreStore } from '../server/firestore-store';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { SpeechService } from '../server/speech';
import type { Closure, ClosureDraft, Commute, Trip } from '../shared/types';

const enabled = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
describe.runIf(enabled)('real Auth/Firestore emulator integration', () => {
  const projectId = 'demo-manzil-test';
  let services: ReturnType<typeof firebaseServices>, store: FirestoreStore, server: Server, base: string;
  let alice: string, bob: string, admin: string;
  const children: ChildProcess[] = [];
  async function compiledServer(role: 'api' | 'worker') {
    const port = await new Promise<number>(resolve => { const listener = createServer(); listener.listen(0, '127.0.0.1', () => { const port = (listener.address() as { port: number }).port; listener.close(() => resolve(port)); }); });
    const child = spawn(process.execPath, ['build/server/index.js'], { stdio: 'ignore', env: { ...process.env, NODE_ENV: 'test', MANZIL_MODE: 'emulator', MANZIL_SERVICE_ROLE: role, FIREBASE_PROJECT_ID: projectId, HOST: '127.0.0.1', PORT: String(port), X_SCRAPER_ENABLED: 'false', TTS_ENABLED: 'false' } });
    children.push(child);
    const url = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { if ((await fetch(`${url}/healthz`)).ok) return url; } catch { /* Wait for startup/preflight. */ }
      if (child.exitCode !== null) throw new Error(`Compiled server exited with ${child.exitCode}.`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Compiled server startup timed out.');
  }
  const start = new Date().toISOString();
  const draft: ClosureDraft = { title: 'Test closure', description: 'Synthetic emulator fixture', reason: 'other', status: 'published', startsAt: start, endsAt: null,
    geometry: { type: 'Polygon', coordinates: [[[73.08,33.7],[73.081,33.7],[73.081,33.701],[73.08,33.7]]] } };
  async function request(path: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    return fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  beforeAll(async () => {
    const config = readConfig({ MANZIL_MODE: 'emulator', FIREBASE_PROJECT_ID: projectId, FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST });
    services = firebaseServices(config.projectId); store = new FirestoreStore(services.db);
    async function user(uid: string, isAdmin = false) {
      try { await services.auth.createUser({ uid, email: `${uid}@manzil.test`, password: 'EmulatorTest123!' }); } catch (error) { if ((error as { code: string }).code !== 'auth/uid-already-exists') throw error; }
      await services.auth.setCustomUserClaims(uid, { admin: isAdmin });
      const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${uid}@manzil.test`, password: 'EmulatorTest123!', returnSecureToken: true }) });
      const result = await response.json(); if (!result.idToken) throw new Error('Emulator test sign-in failed.'); return result.idToken as string;
    }
    [alice, bob, admin] = await Promise.all([user('alice'), user('bob'), user('administrator', true)]);
    const { app } = createApp(store, { config });
    server = await new Promise<Server>(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 30000);
  afterAll(async () => { for (const child of children) child.kill('SIGTERM'); if (server) await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }); if (services) { await services.db.terminate(); await deleteApp(services.app); } });
  it('allows guest planning state but requires verified identities/admin claims for protected actions', async () => {
    const state = await (await request('/state')).json();
    expect(state.commutes).toEqual([]); expect(state.trips).toEqual([]); expect(state.notices).toEqual([]);
    vi.stubEnv('X_SCRAPER_ENABLED', 'true');
    try { expect((await store.updateSourceStatus({ state: 'idle' })).enabled).toBe(true); }
    finally { vi.unstubAllEnvs(); }
    await store.updateSourceStatus({ enabled: false, state: 'disabled' });
    expect((await request('/commutes')).status).toBe(401);
    expect((await request('/closures', undefined, draft)).status).toBe(401);
    expect((await request('/closures', alice, { ...draft, admin: true })).status).toBe(403);
    expect((await request('/notices', alice)).status).toBe(403);
    expect((await request('/state', 'forged-token')).status).toBe(401);
  });
  it('isolates simultaneous users, profiles and saved records and persists across repository instances', async () => {
    await Promise.all([request('/profile', alice, { displayName: 'Alice' }, 'PATCH'), request('/profile', bob, { displayName: 'Bob' }, 'PATCH')]);
    const [a, b] = await Promise.all([request('/state', alice).then(r => r.json()), request('/state', bob).then(r => r.json())]);
    expect(a.profile.displayName).toBe('Alice'); expect(b.profile.displayName).toBe('Bob');
    const response = await request('/commutes', alice, { name: 'Private commute', origin: { name: 'A', coordinate: [73.0376503,33.7314163] }, destination: { name: 'B', coordinate: [73.0492744,33.7081776] }, days: [1,2,3,4,5], departureTime: '09:00', enabled: false });
    expect(response.status).toBe(201); const commute = await response.json() as Commute;
    expect((await request(`/commutes/${commute.id}`, bob, undefined, 'DELETE')).status).toBe(404);
    expect(await (await request('/commutes', bob)).json()).toEqual([]);
    expect((await new FirestoreStore(services.db).forUser('alice').list<Commute>('commute')).some(item => item.id === commute.id)).toBe(true);
  });
  it('increments shared routing revisions atomically and rejects concurrent stale closure edits', async () => {
    const reader = new FirestoreStore(services.db); await reader.routingSnapshot();
    const response = await request('/closures', admin, draft); expect(response.status).toBe(201);
    const closure = await response.json() as Closure;
    const results = await Promise.all(['First correction','Second correction'].map(title => request(`/closures/${closure.id}`, admin, { ...draft, title, revision: closure.revision }, 'PUT')));
    expect(results.map(r => r.status).sort()).toEqual([200,409]);
    const snapshot = await reader.routingSnapshot(); expect(snapshot.closures.find(item => item.id === closure.id)?.revision).toBe(2);
    expect(snapshot.revision).toBeGreaterThanOrEqual(2);
  });
  it('chunks large GPS traces, keeps summaries small and enforces private trace access/deletion', async () => {
    const now = Date.now(), count = 12000;
    const points = Array.from({ length: count }, (_, index) => ({ coordinate: [73 + index * 0.0000001,33.7], timestamp: new Date(now - 7200_000 + index * 500).toISOString(), accuracy: 5 }));
    const response = await request('/trips', alice, { name: 'Private GPS fixture', startedAt: new Date(now - 7200_000).toISOString(), endedAt: new Date(now).toISOString(), points, contributeToRoadDiscovery: false });
    expect(response.status).toBe(201); const trip = await response.json() as Trip; expect(trip.points).toHaveLength(count);
    const summaries = await (await request('/trips', alice)).json() as Trip[];
    expect(summaries.find(item => item.id === trip.id)?.points).toEqual([]);
    expect(summaries.find(item => item.id === trip.id)?.pointCount).toBe(count);
    expect((await request(`/trips/${trip.id}`, bob)).status).toBe(404);
    expect((await request(`/trips/${trip.id}`, alice, undefined, 'DELETE')).status).toBe(200);
    expect(await store.forUser('alice').get('trip', trip.id)).toBeUndefined();
  });
  it('deduplicates durable notice revisions and cannot over-reserve speech across instances', async () => {
    const input = { source: 'manual' as const, sourceId: 'test-notice', text: 'Synthetic source', url: '', publishedAt: null, mediaUrls: [], contentHash: 'first' };
    const first = await store.upsertNotice(input); const repeat = await new FirestoreStore(services.db).upsertNotice(input);
    expect(repeat.changed).toBe(false); expect(repeat.notice.id).toBe(first.notice.id);
    const edited = await store.upsertNotice({ ...input, text: 'Edited fixture', contentHash: 'second' });
    expect(edited.notice.revision).toBe(first.notice.revision + 1);
    expect((await store.pendingAgentNotices()).filter(item => item.id === first.notice.id)).toHaveLength(1);
    const source = { ...input, source: 'x' as const, sourceId: 'synthetic-x-fixture' };
    const count = (await store.sourceStatus()).noticesCollected;
    await store.upsertNotice(source); await store.upsertNotice(source); await store.upsertNotice({ ...source, contentHash: 'edited-x' });
    expect((await store.sourceStatus()).noticesCollected).toBe(count + 1);
    const month = 'budget-test';
    const results = await Promise.allSettled([store.reserveSpeech(month, 6, 10), new FirestoreStore(services.db).reserveSpeech(month, 6, 10)]);
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1); expect(await store.speechUsage(month)).toBe(6);
    let calls = 0; const config = { enabled: true, monthlyCharacters: 100000, englishVoice: 'en-GB-Wavenet-A', urduVoice: 'ur-IN-Wavenet-A' };
    const synthesize = async () => { calls++; return Buffer.from('fake emulator audio'); };
    await new SpeechService(store, config, synthesize).audio('en', { kind: 'test' });
    await new SpeechService(new FirestoreStore(services.db), config, synthesize).audio('en', { kind: 'test' });
    expect(calls).toBe(1);
  });
  it('purges GPS across retention pages and eventually removes every expired summary', async () => {
    const personal = store.forUser('retention-fixture'), now = Date.now();
    await Promise.all(Array.from({ length: 201 }, (_, index) => personal.put('trip', {
      id: `retained-${index}`, name: 'Synthetic retention fixture', startedAt: new Date(now - 120000).toISOString(), endedAt: new Date(now).toISOString(),
      points: [{ coordinate: [73,33.7] as [number,number], timestamp: new Date(now - 120000).toISOString(), accuracy: 5 }, { coordinate: [73,33.71] as [number,number], timestamp: new Date(now).toISOString(), accuracy: 5 }],
      contributeToRoadDiscovery: false, createdAt: new Date(now).toISOString(), distanceMeters: 1112, durationSeconds: 120, gaps: 0,
    })));
    await personal.retainTrips(now + 31 * 86400_000);
    expect((await personal.get<Trip>('trip','retained-200'))?.points).toEqual([]);
    await personal.retainTrips(now + 91 * 86400_000);
    expect(await personal.list('trip',500)).toEqual([]);
  }, 60000);
  it('denies direct browser Firestore access and boots the compiled API/worker with the real bundled graph', async () => {
    const direct = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/users/alice`, { headers: { Authorization: `Bearer ${alice}` } });
    expect(direct.status).toBe(403);
    const api = await compiledServer('api');
    const health = await (await fetch(`${api}/api/health`)).json(); expect(health).toMatchObject({ storage: 'firestore', graphReady: true });
    expect((await fetch(`${api}/internal/tick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job: 'commutes' }) })).status).toBe(404);
    const worker = await compiledServer('worker');
    const tick = (token?: string) => fetch(`${worker}/internal/tick`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ job: 'commutes' }) });
    expect((await tick()).status).toBe(401); expect((await tick(bob)).status).toBe(403); expect((await tick(admin)).status).toBe(200);
    expect((await fetch(`${worker}/api/state`)).status).toBe(404);
  }, 30000);
});
