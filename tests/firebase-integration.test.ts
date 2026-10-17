import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { deleteApp } from 'firebase-admin/app';
import { deleteApp as deleteClientApp, initializeApp as initializeClientApp } from 'firebase/app';
import { confirmPasswordReset, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, verifyPasswordResetCode } from 'firebase/auth';
import { firebaseServices } from '../server/firebase';
import { FirestoreStore } from '../server/firestore-store';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { SpeechService } from '../server/speech';
import { createJourneyPlanner } from '../server/routing';
import type { Planner } from '../server/commutes';
import type { Alert, Closure, ClosureDraft, Commute, FuelPriceStatus, PlanRequest, PlanResponse, Trip } from '../shared/types';

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
  /** Real auth/storage, injected offline provider: no external routing or paid service. */
  async function plannerServer(online: Planner) {
    const config = readConfig({ MANZIL_MODE: 'emulator', FIREBASE_PROJECT_ID: projectId, FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST });
    const places = [{ name: 'Lahore, Pakistan', coordinate: [74.35, 31.52] as [number, number] }];
    const { app } = createApp(store, { config, planner: createJourneyPlanner(null, async (...args) => online(...args)), places: async () => places });
    const instance = await new Promise<Server>(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
    const url = `http://127.0.0.1:${(instance.address() as { port: number }).port}/api`;
    return {
      places,
      request: (path: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => fetch(`${url}${path}`, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }),
      close: () => new Promise<void>(resolve => { instance.closeAllConnections(); instance.close(() => resolve()); }),
    };
  }
  const nationalRequest: PlanRequest = { origin: { name: 'Lahore fixture', coordinate: [74.35, 31.52] }, destination: { name: 'Karachi fixture', coordinate: [67.01, 24.86] },
    waypoints: [{ name: 'Multan fixture', coordinate: [71.5249, 30.1575] }, { name: 'Sukkur fixture', coordinate: [68.8574, 27.7244] }], departureAt: '2027-01-15T11:00:00.000Z', compareDepartures: false };
  const onlineResult = (revision: number): PlanResponse => ({ options: [], baseline: null, conflicts: [], warnings: [], evaluatedAt: start, eventRevision: revision, graphVersion: 'offline-provider-fixture', source: 'osrm' });
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
  it('creates a disposable ordinary account and completes its password reset with the real client SDK', async () => {
    // This suite uses its isolated demo project, never the running development accounts or production email.
    const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    expect(emulatorHost).toMatch(/^127\.0\.0\.1:\d+$/);
    const client = initializeClientApp({ projectId, apiKey: 'demo', appId: 'isolated-auth-lifecycle-fixture' }, 'isolated-auth-lifecycle-fixture');
    const clientAuth = getAuth(client);
    connectAuthEmulator(clientAuth, `http://${emulatorHost}`, { disableWarnings: true });
    const email = `auth-lifecycle-${crypto.randomUUID()}@manzil.test`;
    const originalPassword = 'DisposableOriginal123!', changedPassword = 'DisposableChanged123!';
    let uid: string | undefined;
    try {
      const created = await createUserWithEmailAndPassword(clientAuth, email, originalPassword);
      uid = created.user.uid;
      expect(created.user.email).toBe(email);
      expect((await created.user.getIdTokenResult()).claims.admin).not.toBe(true);
      const token = await created.user.getIdToken();
      const state = await (await request('/state', token)).json();
      expect(state.membership.role).toBe('user');
      expect(state.profile).toMatchObject({ theme: 'dark', mapStyle: 'night', collectTravelData: false,
        inferFrequentRoutes: false, travelDataChoiceMade: false });
      expect(state.trips).toEqual([]); expect(state.commutes).toEqual([]);
      expect((await request('/admin/users', token)).status).toBe(403);
      expect((await request('/profile', token, { displayName: 'Disposable auth test', city: 'Islamabad' }, 'PATCH')).status).toBe(200);
      await signOut(clientAuth);
      await expect(createUserWithEmailAndPassword(clientAuth, email, originalPassword)).rejects.toMatchObject({ code: 'auth/email-already-in-use' });
      await sendPasswordResetEmail(clientAuth, email);
      // The emulator deliberately does not send mail: inspect its local OOB store without printing links/codes.
      const codesResponse = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/oobCodes`);
      expect(codesResponse.status).toBe(200);
      const { oobCodes } = await codesResponse.json() as { oobCodes: { email: string; requestType: string; oobCode: string }[] };
      const reset = oobCodes.find(value => value.email === email && value.requestType === 'PASSWORD_RESET');
      if (!reset) throw new Error('The isolated emulator did not create the expected password-reset action.');
      expect(await verifyPasswordResetCode(clientAuth, reset.oobCode)).toBe(email);
      await confirmPasswordReset(clientAuth, reset.oobCode, changedPassword);
      await expect(verifyPasswordResetCode(clientAuth, reset.oobCode)).rejects.toMatchObject({ code: 'auth/invalid-action-code' });
      await expect(signInWithEmailAndPassword(clientAuth, email, originalPassword)).rejects.toBeTruthy();
      const signedIn = await signInWithEmailAndPassword(clientAuth, email, changedPassword);
      expect(signedIn.user.uid).toBe(uid);
      expect(await (await request('/profile', await signedIn.user.getIdToken())).json()).toMatchObject({
        displayName: 'Disposable auth test', city: 'Islamabad', collectTravelData: false, inferFrequentRoutes: false,
      });
    } finally {
      await signOut(clientAuth);
      if (uid) await services.auth.deleteUser(uid);
      await deleteClientApp(client);
    }
  }, 30000);
  it('allows guest planning state but requires verified identities/admin claims for protected actions', async () => {
    const state = await (await request('/state')).json();
    expect(state.commutes).toEqual([]); expect(state.trips).toEqual([]); expect(state.notices).toEqual([]);
    vi.stubEnv('X_SCRAPER_ENABLED', 'true');
    try { expect((await store.updateSourceStatus({ state: 'idle' })).enabled).toBe(true); }
    finally { vi.unstubAllEnvs(); }
    await store.updateSourceStatus({ enabled: false, state: 'disabled' });
    expect((await request('/commutes')).status).toBe(401);
    expect((await request('/closures', undefined, draft)).status).toBe(401);
    const submitted = await request('/closures', alice, { ...draft, admin: true, moderation: 'approved' });
    expect(submitted.status).toBe(201); expect(await submitted.json()).toMatchObject({ status: 'draft', moderation: 'pending', author: { uid: 'alice', role: 'user' } });
    expect((await request('/notices', alice)).status).toBe(403);
    expect((await request('/state', 'forged-token')).status).toBe(401);
  });
  it('enforces administrator and personal access checks on case-variant API paths', async () => {
    const revision = (await store.routingSnapshot()).revision;
    const notices = (await store.listNotices()).length;
    const sharedWrites: [string, unknown, string][] = [
      ['/NoTiCeS', { text: 'Case-variant authorization fixture', url: 'https://example.test/case-variant-notice' }, 'POST'],
      ['/SoUrCe/settings', { enabled: false }, 'PATCH'],
    ];
    for (const [path, body, method] of sharedWrites) {
      expect((await request(path, undefined, body, method)).status, `${path} requires sign-in`).toBe(401);
      expect((await request(path, alice, body, method)).status, `${path} requires admin`).toBe(403);
    }
    expect((await store.routingSnapshot()).revision).toBe(revision);
    expect(await store.listNotices()).toHaveLength(notices);
    expect((await request('/COMMUTES')).status).toBe(401);
    expect((await request('/PrOfIlE', undefined, { displayName: 'Unauthenticated fixture' }, 'PATCH')).status).toBe(401);
    expect((await request('/PrOfIlE/', undefined, { displayName: 'Trailing-slash fixture' }, 'PATCH')).status).toBe(401);
    for (const path of ['/speech/', '/SpEeCh/']) expect((await request(path, undefined, { language: 'en', prompt: { kind: 'test' } })).status).toBe(401);
    expect((await request('/PrOfIlE', alice, { displayName: 'Alice case fixture' }, 'PATCH')).status).toBe(200);
    expect((await request('/PrOfIlE', bob, { displayName: 'Bob case fixture' }, 'PATCH')).status).toBe(200);
    expect(await (await request('/PROFILE', alice)).json()).toMatchObject({ displayName: 'Alice case fixture' });
    expect(await (await request('/PROFILE', bob)).json()).toMatchObject({ displayName: 'Bob case fixture' });
    const response = await request('/CoMmUtEs', alice, { name: 'Case-variant private fixture', origin: nationalRequest.origin, destination: nationalRequest.destination,
      days: [1,2,3,4,5], departureTime: '09:00', enabled: false });
    expect(response.status).toBe(201);
    const commute = await response.json() as Commute;
    expect((await (await request('/COMMUTES', bob)).json() as Commute[]).some(item => item.id === commute.id)).toBe(false);
    expect((await request(`/COMMUTES/${commute.id}`, bob, undefined, 'DELETE')).status).toBe(404);
    expect((await request(`/COMMUTES/${commute.id}`, alice, undefined, 'DELETE')).status).toBe(200);
  });
  it('moderates community evidence and revokes verification across requests without changing admin claims', async () => {
    const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/cB8AAAAASUVORK5CYII=';
    const response = await request('/closures', alice, { ...draft, title: 'Pending photo report', photos: [photo], author: { uid: 'administrator', role: 'admin' } });
    expect(response.status).toBe(201); const closure = await response.json() as Closure;
    expect(closure).toMatchObject({ status: 'draft', moderation: 'pending', author: { uid: 'alice', role: 'user' } });
    expect((await request(`/closures/${closure.id}`, bob)).status).toBe(404);
    expect((await (await request('/state')).json()).closures.some((item: Closure) => item.id === closure.id)).toBe(false);
    const own = (await (await request('/state', alice)).json()).closures.find((item: Closure) => item.id === closure.id);
    expect(own.photoCount).toBe(1); expect(own).not.toHaveProperty('photos');
    expect((await request(`/closures/${closure.id}/review`, bob, { revision: 1, decision: 'approve' })).status).toBe(403);
    const directory = await (await request('/admin/users', admin)).json(); expect(directory.users.some((user: { uid: string }) => user.uid === 'bob')).toBe(true);
    expect((await request('/admin/users/bob', admin, { verified: true }, 'PATCH')).status).toBe(200);
    expect((await (await request('/state', bob)).json()).membership.role).toBe('verified');
    expect((await (await request(`/closures/${closure.id}`, bob)).json()).photos).toEqual([photo]);
    const reviewed = await request(`/closures/${closure.id}/review`, bob, { revision: 1, decision: 'approve' });
    expect(reviewed.status).toBe(200); expect(await reviewed.json()).toMatchObject({ status: 'published', reviewedBy: { uid: 'bob', role: 'verified' } });
    expect((await request('/admin/users/bob', admin, { verified: false }, 'PATCH')).status).toBe(200);
    const pending = await request('/closures', bob, { ...draft, title: 'After revocation' });
    expect(await pending.json()).toMatchObject({ status: 'draft', moderation: 'pending', author: { uid: 'bob', role: 'user' } });
    expect((await services.auth.getUser('bob')).customClaims?.admin).toBe(false);
    expect((await request('/admin/users/administrator', admin, { verified: false }, 'PATCH')).status).toBe(409);
  });
  it('stores collection consent per UID and prevents trip and learned-alert writes after opt-out', async () => {
    const personal = store.forUser('alice');
    expect((await request('/profile', alice, { collectTravelData: true, inferFrequentRoutes: true }, 'PATCH')).status).toBe(200);
    expect((await store.forUser('bob').profile()).collectTravelData).toBe(false);
    expect((await request('/profile', alice, { collectTravelData: false }, 'PATCH')).status).toBe(200);
    expect(await personal.profile()).toMatchObject({ collectTravelData: false, inferFrequentRoutes: false });
    const now = Date.now(), trip: Trip = { id: 'optout-atomic-fixture', name: 'Consent race fixture', startedAt: new Date(now-60000).toISOString(), endedAt: new Date(now).toISOString(), createdAt: new Date(now).toISOString(),
      points: [{ coordinate: [73,33.7], timestamp: new Date(now-60000).toISOString(), accuracy: 8 },{ coordinate: [73.001,33.7], timestamp: new Date(now).toISOString(), accuracy: 8 }], contributeToRoadDiscovery: false, distanceMeters: 90, durationSeconds: 60, gaps: 0 };
    await expect(personal.saveTripIfConsented(trip)).rejects.toMatchObject({ status: 403 });
    expect(await personal.get('trip', trip.id)).toBeUndefined();
    await expect(personal.addAlertOnce('optout-alert-fixture', { title: 'Must not be written', message: 'Synthetic fixture', createdAt: trip.createdAt, read: false, frequentRouteId: 'usual-fixture' })).rejects.toMatchObject({ status: 409 });
    expect(await personal.get('alert', 'optout-alert-fixture')).toBeUndefined();
  });
  it('persists a skipped data choice per UID without opting in, defaults missing styles to Night and preserves saved palettes', async () => {
    expect(await (await request('/profile')).json()).toMatchObject({ theme: 'dark', mapStyle: 'night', collectTravelData: false, travelDataChoiceMade: false });
    expect(await store.forUser('bob').profile()).toMatchObject({ theme: 'dark', mapStyle: 'night', collectTravelData: false, travelDataChoiceMade: false });
    const styleStore = store.forUser('legacy-style-fixture');
    const { mapStyle: _oldStyle, ...legacyStyle } = { ...await styleStore.profile(), displayName: 'Legacy style fixture', theme: 'light' as const,
      updatedAt: '2026-10-01T12:00:00.000Z' };
    await styleStore.setMeta('profile', legacyStyle);
    expect(await styleStore.profile()).toEqual({ ...legacyStyle, mapStyle: 'night' });
    expect(await styleStore.meta('profile')).toEqual(legacyStyle);
    for (const mapStyle of ['outdoors', 'minimal', 'night', 'streets', 'contrast'] as const) {
      const chosen = await styleStore.updateProfile({ mapStyle });
      expect(await new FirestoreStore(services.db).forUser('legacy-style-fixture').profile()).toEqual(chosen);
    }
    expect((await request('/profile', undefined, { travelDataChoiceMade: true }, 'PATCH')).status).toBe(401);
    for (const invalid of ['true', 1, null]) expect((await request('/profile', alice, { travelDataChoiceMade: invalid }, 'PATCH')).status).toBe(400);
    expect((await request('/profile', alice, { demoData: true }, 'PATCH')).status).toBe(400);
    expect(await (await request('/profile', alice)).json()).not.toHaveProperty('demoData');
    expect((await request('/profile', alice, { travelDataChoiceMade: true, collectTravelData: false }, 'PATCH')).status).toBe(200);
    expect(await new FirestoreStore(services.db).forUser('alice').profile()).toMatchObject({ travelDataChoiceMade: true, collectTravelData: false, inferFrequentRoutes: false });
    expect(await store.forUser('bob').profile()).toMatchObject({ travelDataChoiceMade: false, collectTravelData: false });
    expect((await request('/profile', alice, { inferFrequentRoutes: true }, 'PATCH')).status).toBe(400);
  });
  it('defaults missing Firestore appearance to Dark and preserves explicit saved Light, Dark and System', async () => {
    const personal = store.forUser('legacy-theme-fixture');
    const { theme: _oldTheme, ...legacy } = { ...await personal.profile(), displayName: 'Legacy appearance fixture', mapStyle: 'minimal' as const,
      createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z' };
    await personal.setMeta('profile', legacy);
    expect(await personal.profile()).toEqual({ ...legacy, theme: 'dark' });
    expect(await personal.meta('profile')).toEqual(legacy);
    const updated = await personal.updateProfile({ displayName: 'Updated legacy fixture' });
    expect(updated).toMatchObject({ theme: 'dark', mapStyle: 'minimal', createdAt: legacy.createdAt });
    expect(await personal.meta('profile')).toEqual(updated);
    for (const theme of ['light', 'dark', 'system'] as const) {
      const chosen = await personal.updateProfile({ theme });
      expect(await new FirestoreStore(services.db).forUser('legacy-theme-fixture').profile()).toEqual(chosen);
      expect(chosen).toMatchObject({ theme, mapStyle: 'minimal', createdAt: legacy.createdAt });
    }
    const { theme: _theme, mapStyle: _style, ...withoutAppearance } = await personal.profile();
    await personal.setMeta('profile', withoutAppearance);
    expect(await personal.profile()).toEqual({ ...withoutAppearance, theme: 'dark', mapStyle: 'night' });
    expect(await personal.meta('profile')).toEqual(withoutAppearance);
    expect(await personal.updateProfile({ displayName: 'Both appearance fields missing' })).toMatchObject({ theme: 'dark', mapStyle: 'night', createdAt: legacy.createdAt });
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
  it('keeps dated fuel estimates private and immutable across vehicle edits in real Firestore', async () => {
    const now = Date.now(), checked = new Date(now).toISOString(), personal = store.forUser('alice');
    const fuel: FuelPriceStatus = { state: 'fresh', lastCheckedAt: checked, lastSuccessAt: checked,
      nextCheckAt: new Date(now + 86400_000).toISOString(), message: 'Synthetic offline integration fixture',
      records: [{ effectiveFrom: new Date(now - 2 * 86400_000).toISOString(), petrolPerLitre: 300, dieselPerLitre: 350,
        sourceName: 'Synthetic price fixture', sourceUrl: 'https://example.test/fuel', retrievedAt: checked }] };
    await store.setMeta('fuel:status', fuel);
    await store.setMeta('fuel:checkedDay', new Date(now + 5 * 3600_000).toISOString().slice(0, 10));
    expect((await request('/fuel/check', undefined, {})).status).toBe(401);
    expect((await request('/FuEl/CHECK/', bob, {})).status).toBe(403);
    expect((await request('/trips/statistics')).status).toBe(401);
    expect(await (await request('/fuel/prices')).json()).toMatchObject({ records: fuel.records });
    const vehicle = { kind: 'car', fuelType: 'petrol', kmPerLitre: 10, label: 'Offline test car' };
    expect((await request('/profile', alice, { vehicle, collectTravelData: true }, 'PATCH')).status).toBe(200);
    expect((await request('/profile', alice, { vehicleUpdatedAt: '2000-01-01T00:00:00Z' }, 'PATCH')).status).toBe(400);
    expect((await request('/profile', alice, { vehicle: { ...vehicle, kmPerLitre: 0 } }, 'PATCH')).status).toBe(400);
    // Fixture represents a vehicle configured before this recorded journey; the API cannot backdate it.
    await personal.setMeta('profile', { ...await personal.profile(), vehicleUpdatedAt: new Date(now - 600_000).toISOString() });
    const draft = { name: 'Synthetic priced journey', startedAt: new Date(now - 120_000).toISOString(), endedAt: new Date(now - 60_000).toISOString(),
      points: [{ coordinate: [73,33.7], timestamp: new Date(now - 120_000).toISOString(), accuracy: 8 },
        { coordinate: [73.002,33.7], timestamp: new Date(now - 60_000).toISOString(), accuracy: 8 }], contributeToRoadDiscovery: false };
    const response = await request('/trips', alice, draft); expect(response.status).toBe(201);
    const trip = await response.json() as Trip;
    expect(trip.fuelEstimate).toMatchObject({ vehicle, distanceMeters: trip.distanceMeters });
    expect(trip.fuelEstimate!.costPkr).toBeCloseTo(trip.distanceMeters / 1000 / 10 * 300, 6);
    expect((await request(`/trips/${trip.id}`, bob)).status).toBe(404);
    expect((await (await request('/profile', bob)).json()).vehicle).toBeUndefined();
    expect((await request('/profile', alice, { vehicle: { ...vehicle, kind: 'motorcycle', kmPerLitre: 40 } }, 'PATCH')).status).toBe(200);
    const retained = await (await request(`/trips/${trip.id}`, alice)).json() as Trip;
    expect(retained.fuelEstimate).toEqual(trip.fuelEstimate);
    expect((await (await request('/trips/statistics', alice)).json()).month).toMatchObject({ pricedTripCount: 1, costPkr: trip.fuelEstimate!.costPkr });
    const tooOld = await (await request('/trips', alice, { ...draft, name: 'Before current vehicle was configured' })).json() as Trip;
    expect(tooOld.fuelEstimate).toBeUndefined();
    expect((await request('/profile', alice, { collectTravelData: false }, 'PATCH')).status).toBe(200);
    expect((await request('/trips', alice, draft)).status).toBe(403);
    expect((await request(`/trips/${trip.id}`, alice, undefined, 'DELETE')).status).toBe(200);
    expect((await request(`/trips/${tooOld.id}`, alice, undefined, 'DELETE')).status).toBe(200);
  });
  it('awaits national place and route providers for guests, preserves stops, and rejects foreign pins before provider access', async () => {
    const online = vi.fn<Planner>().mockImplementation(async (_input, _closures, revision) => onlineResult(revision));
    const fixture = await plannerServer(online);
    try {
      expect(await (await fixture.request('/places?q=Lahore')).json()).toEqual(fixture.places);
      const response = await fixture.request('/plan', undefined, nationalRequest);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ source: 'osrm', graphVersion: 'offline-provider-fixture', eventRevision: (await store.routingSnapshot()).revision });
      expect(online).toHaveBeenCalledTimes(1);
      expect(online.mock.calls[0][0]).toEqual(nationalRequest);
      const foreign = await fixture.request('/plan', undefined, { ...nationalRequest, destination: { name: 'Delhi', coordinate: [77.209, 28.6139] } });
      expect(foreign.status).toBe(200);
      expect(await foreign.json()).toMatchObject({ options: [], unavailableReason: expect.stringContaining('within Pakistan') });
      expect(online).toHaveBeenCalledTimes(1);
    } finally { await fixture.close(); }
  });
  it('replans an online request against a newly committed Firestore closure revision', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const online = vi.fn<Planner>().mockImplementation(async (_input, _closures, revision) => { if (online.mock.calls.length === 1) await pending; return onlineResult(revision); });
    const fixture = await plannerServer(online);
    try {
      const response = fixture.request('/plan', alice, nationalRequest);
      await vi.waitFor(() => expect(online).toHaveBeenCalledTimes(1), { timeout: 10_000 });
      const event = await new FirestoreStore(services.db).saveClosure({ ...draft, title: 'Committed during online planning' });
      release();
      const result = await response;
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ eventRevision: (await store.routingSnapshot()).revision, source: 'osrm' });
      expect(online).toHaveBeenCalledTimes(2);
      expect(online.mock.calls[1][1].some(item => item.id === event.id)).toBe(true);
      expect(online.mock.calls[1][2]).toBeGreaterThan(online.mock.calls[0][2]);
    } finally { release(); await fixture.close(); }
  });
  it('returns a conflict response instead of an online plan if both Firestore snapshots become stale', async () => {
    const online = vi.fn<Planner>().mockImplementation(async (_input, _closures, revision) => {
      await new FirestoreStore(services.db).saveClosure({ ...draft, title: `Concurrent restriction ${revision}` });
      return onlineResult(revision);
    });
    const fixture = await plannerServer(online);
    try {
      const response = await fixture.request('/plan', alice, nationalRequest);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining('changed') });
      expect(online).toHaveBeenCalledTimes(2);
    } finally { await fixture.close(); }
  });
  it('awaits concurrent national commute checks for each UID and keeps ordered stops and alerts private', async () => {
    const aliceEvent = await store.saveClosure({ ...draft, title: 'Alice national route fixture' });
    const bobEvent = await store.saveClosure({ ...draft, title: 'Bob national route fixture' });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const online = vi.fn<Planner>().mockImplementation(async (input, _closures, revision) => {
      await pending;
      const event = input.origin.name.startsWith('Alice') ? aliceEvent : bobEvent;
      return { ...onlineResult(revision), conflicts: [{ closureId: event.id, title: event.title, entryAt: input.departureAt, exitAt: new Date(Date.parse(input.departureAt) + 60_000).toISOString() }] };
    });
    const fixture = await plannerServer(online);
    try {
      const journey = (name: string) => ({ name: `${name} national commute`, origin: { ...nationalRequest.origin, name: `${name} Lahore` }, destination: nationalRequest.destination,
        waypoints: nationalRequest.waypoints, days: [0,1,2,3,4,5,6], departureTime: '09:00', enabled: true });
      const creatingAlice = fixture.request('/commutes', alice, journey('Alice'));
      const creatingBob = fixture.request('/commutes', bob, journey('Bob'));
      await vi.waitFor(() => expect(online).toHaveBeenCalledTimes(2), { timeout: 10_000 });
      release();
      const [aResponse, bResponse] = await Promise.all([creatingAlice, creatingBob]);
      expect(aResponse.status).toBe(201); expect(bResponse.status).toBe(201);
      const [a, b] = await Promise.all([aResponse.json(), bResponse.json()]) as [Commute, Commute];
      expect(a.waypoints).toEqual(nationalRequest.waypoints); expect(b.waypoints).toEqual(nationalRequest.waypoints);
      for (const [input] of online.mock.calls) {
        expect(input.waypoints).toEqual(nationalRequest.waypoints);
        expect(new Date(Date.parse(input.departureAt) + 5 * 3600_000).getUTCHours()).toBe(9);
      }
      const alertFor = async (token: string, commuteId: string) => (await (await fixture.request('/state', token)).json()).alerts.filter((alert: Alert) => alert.commuteId === commuteId) as Alert[];
      expect(await alertFor(alice, a.id)).toEqual([expect.objectContaining({ closureId: aliceEvent.id, commuteId: a.id })]);
      expect(await alertFor(alice, b.id)).toEqual([]);
      expect(await alertFor(bob, b.id)).toEqual([expect.objectContaining({ closureId: bobEvent.id, commuteId: b.id })]);
      expect(await alertFor(bob, a.id)).toEqual([]);
      expect((await fixture.request(`/commutes/${a.id}/check`, bob, {})).status).toBe(404);
      const checked = await fixture.request(`/commutes/${a.id}/check`, alice, {});
      expect(checked.status).toBe(200);
      expect(await checked.json()).toMatchObject({ commuteId: a.id, plan: { source: 'osrm', eventRevision: (await store.routingSnapshot()).revision } });
      expect(await alertFor(alice, a.id)).toHaveLength(1);
      expect((await new FirestoreStore(services.db).forUser('alice').get<Commute>('commute', a.id))?.waypoints).toEqual(nationalRequest.waypoints);
      await Promise.all([fixture.request(`/commutes/${a.id}`, alice, undefined, 'DELETE'), fixture.request(`/commutes/${b.id}`, bob, undefined, 'DELETE')]);
    } finally {
      release(); await fixture.close();
      // Failed assertions must not leave enabled fixtures for the compiled worker
      // smoke test, which deliberately boots the normal (non-mocked) planner.
      for (const uid of ['alice', 'bob']) {
        const personal = store.forUser(uid);
        for (const commute of await personal.list<Commute>('commute')) if (commute.name.endsWith('national commute')) await personal.delete('commute', commute.id);
      }
    }
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
    expect((await request('/profile', alice, { collectTravelData: true }, 'PATCH')).status).toBe(200);
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
