import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest, type Server } from 'node:http';
import type { ClosureDraft, Commute, GraphStatus, PlanResponse, Trip } from '../shared/types';
import { Store } from '../server/store';
import { createApp, applyRetention } from '../server/app';
import { SourceService } from '../server/source';
import { SpeechService } from '../server/speech';
import { readConfig } from '../server/config';
import { nextOccurrence, checkCommute } from '../server/commutes';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const graph: GraphStatus = { ready: true, source: 'test', version: 'fixture', nodeCount: 2, edgeCount: 2,
  importedAt: null, bounds: [72, 33, 74, 35], limitations: [] };
const emptyPlan: PlanResponse = { options: [], baseline: null, conflicts: [], warnings: [],
  evaluatedAt: '2026-10-14T12:00:00.000Z', graphVersion: 'fixture', eventRevision: 0, source: 'local-osm' };
const closure: ClosureDraft = { title: 'Test closure', description: 'Verified test fixture', reason: 'construction',
  startsAt: '2026-10-14T11:00:00Z', endsAt: '2026-10-14T13:00:00Z', status: 'published',
  geometry: { type: 'Polygon', coordinates: [[[73, 33], [73.01, 33], [73.01, 33.01], [73, 33]]] } };

async function setup(options: Parameters<typeof createApp>[1] = {}) {
  const store = new Store(':memory:'); cleanup.push(() => store.close());
  const source = new SourceService(store, async () => ({ state: 'blocked', posts: [], observedCount: 0, message: 'Signed-out fixture unavailable.' }));
  const { app } = createApp(store, { source, graph: () => graph, planner: () => emptyPlan,
    places: query => [{ name: query || 'Local landmark', coordinate: [73, 33] }], ...options });
  const server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test port');
  const request = (path: string, method = 'GET', body?: unknown, extraHeaders: Record<string, string> = {}) => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
    method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
  return { store, request, port: address.port };
}

describe('local API', () => {
  it('serves Hosting pinned hosts without bypassing origin or account authorization', async () => {
    const service = 'manzil-api-abc123-as.a.run.app';
    const { port } = await setup({ config: readConfig({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'manzil-example',
      ALLOWED_HOSTS: service, ALLOWED_ORIGINS: 'https://manzil-example.web.app', FIREBASE_HOSTING_SERVICE_HOST: service }) });
    const get = (path: string, host: string, origin = 'https://manzil-example.web.app') => new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest({ hostname: '127.0.0.1', port, path: `/api${path}`, headers: { Host: host, Origin: origin } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      }); req.on('error', reject); req.end();
    });
    expect(await get('/health', `fh-080ad782a75264ae---${service}`)).toBe(200);
    expect(await get('/commutes', `fh-080ad782a75264ae---${service}`)).toBe(401);
    expect(await get('/health', `fh-080ad782a75264ae---${service}`, 'https://attacker.example')).toBe(403);
    expect(await get('/health', 'fh-080ad782a75264ae---other-abc123-as.a.run.app')).toBe(403);
  });
  it('protects case-variant and trailing-slash routes before storage or speech synthesis', async () => {
    const config = readConfig({ MANZIL_MODE: 'emulator', FIREBASE_PROJECT_ID: 'demo-manzil-unit', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' });
    const audio = vi.spyOn(SpeechService.prototype, 'audio').mockResolvedValue(Buffer.from('Offline speech authorization fixture'));
    try {
      const { request } = await setup({ config, verifyToken: async () => ({ uid: 'unit-user', admin: false }) });
      for (const path of ['/speech/', '/SpEeCh/']) expect((await request(path, 'POST', { language: 'en', prompt: { kind: 'test' } })).status).toBe(401);
      expect((await request('/PrOfIlE/', 'PATCH', { displayName: 'Guest fixture' })).status).toBe(401);
      expect((await request('/COMMUTES/')).status).toBe(401);
      const shared: [string, string, unknown][] = [['/NoTiCeS/', 'POST', { text: 'Offline fixture' }], ['/SoUrCe/settings/', 'PATCH', { enabled: false }]];
      for (const [path, method, body] of shared) {
        expect((await request(path, method, body)).status).toBe(401);
        expect((await request(path, method, body, { Authorization: 'Bearer offline-unit-token' })).status).toBe(403);
      }
      expect(audio).not.toHaveBeenCalled();
      expect((await request('/SpEeCh/', 'POST', { language: 'en', prompt: { kind: 'test' } }, { Authorization: 'Bearer offline-unit-token' })).status).toBe(200);
      expect(audio).toHaveBeenCalledTimes(1);
    } finally { audio.mockRestore(); }
  });
  it('keeps one local profile, validates partial preferences, and exposes consent-gated proposals', async () => {
    const { request } = await setup();
    const initial = await (await request('/profile')).json();
    expect(initial).toMatchObject({ id: 'local', displayName: 'Traveller', theme: 'dark', mapDetail: 'clean', mapStyle: 'night',
      browserNotifications: false, collectTravelData: false, travelDataChoiceMade: false, inferFrequentRoutes: false, transport: 'car' });
    const changed = await request('/profile', 'PATCH', { displayName: 'Ali', theme: 'dark', browserNotifications: true });
    expect(changed.status).toBe(200); expect(await changed.json()).toMatchObject({ displayName: 'Ali', theme: 'dark', browserNotifications: true, inferFrequentRoutes: false });
    expect((await (await request('/state')).json()).profile.displayName).toBe('Ali');
    expect(await (await request('/frequent-routes')).json()).toEqual([]);
    expect((await request('/profile', 'PATCH', { id: 'another-person' })).status).toBe(400);
    expect((await request('/profile', 'PATCH', { displayName: '   ' })).status).toBe(400);
    expect((await request('/profile', 'PATCH', { transport: 'bus' })).status).toBe(400);
    expect((await request('/profile', 'PATCH', { inferFrequentRoutes: 'yes' })).status).toBe(400);
    expect((await request('/profile', 'PATCH', {})).status).toBe(400);
  });
  it('remembers a declined data choice without granting collection or accepting non-boolean acknowledgements', async () => {
    const { request } = await setup();
    for (const invalid of ['true', 1, null, [], {}]) {
      expect((await request('/profile', 'PATCH', { travelDataChoiceMade: invalid })).status).toBe(400);
    }
    expect((await request('/profile', 'PATCH', { travelDataChoiceMade: true })).status).toBe(200);
    expect(await (await request('/profile')).json()).toMatchObject({ travelDataChoiceMade: true, collectTravelData: false, inferFrequentRoutes: false });
    expect((await request('/profile', 'PATCH', { inferFrequentRoutes: true })).status).toBe(400);
    await request('/profile', 'PATCH', { displayName: 'New name' });
    expect((await (await request('/state')).json()).profile).toMatchObject({ travelDataChoiceMade: true, collectTravelData: false });
  });
  it('saves independent map styles and rejects unsupported styles without changing preferences', async () => {
    const { request } = await setup();
    for (const mapStyle of ['streets', 'outdoors', 'contrast', 'minimal', 'night']) {
      const response = await request('/profile', 'PATCH', { mapStyle }); expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ mapStyle, theme: 'dark', mapDetail: 'clean' });
    }
    await request('/profile', 'PATCH', { theme: 'dark', mapStyle: 'streets' });
    expect((await (await request('/state')).json()).profile).toMatchObject({ theme: 'dark', mapStyle: 'streets' });
    for (const mapStyle of ['satellite', '', null, 1]) expect((await request('/profile', 'PATCH', { mapStyle })).status).toBe(400);
    expect(await (await request('/profile')).json()).toMatchObject({ theme: 'dark', mapStyle: 'streets', displayName: 'Traveller' });
  });
  it('saves explicit Light, Dark and System independently from the default Night map', async () => {
    const { request } = await setup();
    for (const theme of ['light', 'dark', 'system']) {
      const response = await request('/profile', 'PATCH', { theme });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ theme, mapStyle: 'night' });
      expect((await (await request('/state')).json()).profile).toMatchObject({ theme, mapStyle: 'night' });
    }
  });
  it('persists versioned closures, refuses stale edits, and soft-cancels', async () => {
    const { store, request } = await setup();
    const created = await request('/closures', 'POST', closure);
    expect(created.status).toBe(201); const first = await created.json(); expect(first.revision).toBe(1);
    const saved = await request(`/closures/${first.id}`, 'PUT', { ...closure, title: 'Updated', revision: 1 });
    expect(saved.status).toBe(200); expect((await saved.json()).revision).toBe(2);
    expect((await request(`/closures/${first.id}`, 'PUT', { ...closure, revision: 1 })).status).toBe(409);
    const cancelled = await request(`/closures/${first.id}`, 'DELETE');
    expect((await cancelled.json()).status).toBe('cancelled'); expect(store.eventRevision).toBe(3);
    expect((await (await request('/state')).json()).closures).toHaveLength(1);
  });
  it('validates malformed JSON, invalid time ranges, body type, and hostile origins', async () => {
    const { request, port } = await setup();
    expect((await request('/closures', 'POST', '{')).status).toBe(400);
    expect((await request('/closures', 'POST', { ...closure, endsAt: closure.startsAt })).status).toBe(400);
    expect((await request('/source/check', 'POST')).status).toBe(415);
    expect((await request('/source/check', 'POST', {}, { Origin: 'https://attacker.example' })).status).toBe(403);
    const hostileHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest({ hostname: '127.0.0.1', port, path: '/api/health', headers: { Host: 'attacker.example' } }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      }); req.on('error', reject); req.end();
    });
    expect(hostileHostStatus).toBe(403);
    expect((await request('/health', 'GET', undefined, { Origin: 'http://localhost:5173' })).status).toBe(200);
    expect((await request('/places?q=Faisal')).status).toBe(200);
  });
  it('buffers a line and closes polygon rings before routing', async () => {
    const { request } = await setup();
    const line = await request('/geometry', 'POST', { kind: 'line', coordinates: [[73, 33], [73.01, 33.01]], widthMeters: 40 });
    const polygon = await line.json(); expect(polygon.type).toBe('Polygon');
    expect(polygon.coordinates[0][0]).toEqual(polygon.coordinates[0].at(-1));
    expect((await request('/geometry', 'POST', { kind: 'polygon', coordinates: [[73, 33], [73, 33], [73, 33]], widthMeters: 40 })).status).toBe(400);
    expect((await request('/geometry', 'POST', { kind: 'polygon', coordinates: [[73, 33], [73.02, 33.02], [73, 33.02], [73.01, 33]], widthMeters: 40 })).status).toBe(400);
    expect((await request('/closures', 'POST', { ...closure, geometry: { ...closure.geometry, coordinates: [...closure.geometry.coordinates, closure.geometry.coordinates[0]] } })).status).toBe(400);
  });
  it('queues manual notices durably and exposes a pending-agent handoff', async () => {
    const { request } = await setup();
    const first = await (await request('/notices', 'POST', { text: 'A public closure advisory', url: 'https://example.test/notices/1' })).json();
    const repeat = await (await request('/notices', 'POST', { text: 'A public closure advisory', url: 'https://example.test/notices/1' })).json();
    expect(repeat.id).toBe(first.id); expect(repeat.revision).toBe(1);
    expect(await (await request('/agent/outbox')).json()).toHaveLength(1);
    expect((await request(`/notices/${first.id}`, 'PATCH', { status: 'reviewed' })).status).toBe(200);
    expect(await (await request('/agent/outbox')).json()).toHaveLength(0);
    expect((await (await request('/source/check', 'POST', {})).json()).state).toBe('blocked');
    expect((await request('/source/settings', 'PATCH', { enabled: true, intervalMinutes: 1 })).status).toBe(400);
  });
  it('records real points, excludes GPS jumps from distance, and deletes a trip', async () => {
    const { request } = await setup();
    expect((await request('/profile', 'PATCH', { collectTravelData: true })).status).toBe(200);
    const start = Date.now() - 60_000;
    const points = [
      { coordinate: [73, 33], timestamp: new Date(start).toISOString(), accuracy: 5 },
      { coordinate: [73.001, 33], timestamp: new Date(start + 10_000).toISOString(), accuracy: 5 },
      { coordinate: [74, 34], timestamp: new Date(start + 20_000).toISOString(), accuracy: 5 },
    ];
    const created = await request('/trips', 'POST', { name: 'Recorded journey', startedAt: points[0].timestamp,
      endedAt: points[2].timestamp, points, contributeToRoadDiscovery: false });
    expect(created.status).toBe(201); const trip = await created.json();
    expect(trip.gaps).toBe(1); expect(trip.distanceMeters).toBeGreaterThan(80); expect(trip.distanceMeters).toBeLessThan(110);
    const summary = (await (await request('/state')).json()).trips[0];
    expect(summary.points).toEqual([]); expect(summary.pointCount).toBe(3);
    expect((await (await request(`/trips/${trip.id}`)).json()).points).toHaveLength(3);
    expect((await request(`/trips/${trip.id}`, 'PATCH', { contributeToRoadDiscovery: true })).status).toBe(200);
    expect((await request(`/trips/${trip.id}`, 'DELETE')).status).toBe(200);
    expect(await (await request('/trips')).json()).toHaveLength(0);
  });
});

describe('durability, commute time, and privacy retention', () => {
  it('retains data and revisions after reopening the SQLite database', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'manzil-test-')); cleanup.push(() => rmSync(folder, { recursive: true, force: true }));
    const path = join(folder, 'state.sqlite'); let store = new Store(path);
    const first = store.saveClosure(closure);
    const notice = store.upsertNotice({ source: 'manual', sourceId: 'durable-notice', url: '', text: 'A public notice',
      publishedAt: null, mediaUrls: [], contentHash: 'fixture-hash' }).notice;
    store.updateSourceStatus({ nextCheckAt: '2026-10-14T12:15:00Z', state: 'partial' });
    store.updateProfile({ displayName: 'A local traveller', theme: 'dark', mapDetail: 'clean', mapStyle: 'outdoors', collectTravelData: true, inferFrequentRoutes: true });
    store.close(); store = new Store(path); cleanup.push(() => store.close());
    expect(store.get('closure', first.id)).toMatchObject({ title: closure.title, revision: 1 }); expect(store.eventRevision).toBe(1);
    expect(store.pendingAgentNotices()[0].id).toBe(notice.id); expect(store.pendingAgentCount()).toBe(1);
    expect(store.sourceStatus().nextCheckAt).toBe('2026-10-14T12:15:00Z');
    expect(store.profile()).toMatchObject({ id: 'local', displayName: 'A local traveller', theme: 'dark', mapStyle: 'outdoors', inferFrequentRoutes: true });
  });
  it('backfills a legacy profile map style once without resetting preferences or timestamps', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'manzil-profile-migration-'));
    cleanup.push(() => rmSync(folder, { recursive: true, force: true }));
    const path = join(folder, 'state.sqlite'); let store = new Store(path);
    const { mapStyle: _oldStyle, ...legacy } = { ...store.profile(), displayName: 'Existing traveller', theme: 'dark' as const,
      mapDetail: 'standard' as const, browserNotifications: true, inferFrequentRoutes: true,
      createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z' };
    store.setMeta('profile', legacy); store.close(); store = new Store(path);
    expect(store.profile()).toEqual({ ...legacy, mapStyle: 'night' });
    for (const mapStyle of ['outdoors', 'minimal', 'night', 'streets', 'contrast'] as const) {
      const chosen = store.updateProfile({ mapStyle }); store.close(); store = new Store(path);
      expect(store.profile()).toEqual(chosen); expect(store.profile().createdAt).toBe(legacy.createdAt);
    }
    cleanup.push(() => store.close());
  });
  it('defaults missing SQLite appearance to Dark without changing explicit palettes, System or profile dates', () => {
    const folder = mkdtempSync(join(tmpdir(), 'manzil-theme-migration-'));
    cleanup.push(() => rmSync(folder, { recursive: true, force: true }));
    const path = join(folder, 'state.sqlite'); let store = new Store(path);
    const { theme: _oldTheme, ...legacy } = { ...store.profile(), displayName: 'Legacy appearance fixture', mapStyle: 'minimal' as const,
      createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z' };
    store.setMeta('profile', legacy);
    expect(store.profile()).toEqual({ ...legacy, theme: 'dark' });
    store.close(); store = new Store(path);
    expect(store.profile()).toEqual({ ...legacy, theme: 'dark' });
    expect(store.meta('profile')).toEqual({ ...legacy, theme: 'dark' });
    for (const theme of ['light', 'dark', 'system'] as const) {
      const chosen = store.updateProfile({ theme }); store.close(); store = new Store(path);
      expect(store.profile()).toEqual(chosen);
      expect(store.profile()).toMatchObject({ theme, mapStyle: 'minimal', createdAt: legacy.createdAt });
    }
    const { theme: _theme, mapStyle: _style, ...withoutAppearance } = store.profile();
    store.setMeta('profile', withoutAppearance); store.close(); store = new Store(path);
    expect(store.profile()).toEqual({ ...withoutAppearance, theme: 'dark', mapStyle: 'night' });
    cleanup.push(() => store.close());
  });
  it('calculates weekdays and midnight in Islamabad time, not server timezone', async () => {
    const commute: Commute = { id: 'commute', name: 'Office', origin: { name: 'A', coordinate: [73, 33] },
      destination: { name: 'B', coordinate: [73.1, 33.1] }, days: [4], departureTime: '00:30', enabled: true,
      createdAt: '', updatedAt: '' };
    expect(nextOccurrence(commute, Date.parse('2026-10-14T19:00:00Z'))).toBe('2026-10-14T19:30:00.000Z');
    expect(nextOccurrence(commute, Date.parse('2026-10-14T19:31:00Z'))).toBe('2026-10-21T19:30:00.000Z');
  });
  it('deduplicates commute impact alerts and emits a new alert for an edited closure', async () => {
    const store = new Store(':memory:'); cleanup.push(() => store.close()); const saved = store.saveClosure(closure);
    const commute: Commute = { id: 'commute', name: 'Office', origin: { name: 'A', coordinate: [73, 33] },
      destination: { name: 'B', coordinate: [73.1, 33.1] }, days: [3], departureTime: '17:00', enabled: true,
      createdAt: '', updatedAt: '' };
    const planner = () => ({ ...emptyPlan, conflicts: [{ closureId: saved.id, title: saved.title, entryAt: closure.startsAt, exitAt: closure.endsAt! }] });
    const now = Date.parse('2026-10-14T10:00:00Z'); (await checkCommute(store, commute, planner, now)); (await checkCommute(store, commute, planner, now));
    expect(store.list('alert')).toHaveLength(1);
    store.saveClosure({ ...closure, title: 'Edited advice' }, saved.id, 1); (await checkCommute(store, commute, planner, now));
    expect(store.list('alert')).toHaveLength(2);
  });
  it('purges raw points after day30 and deletes the summary after day90', async () => {
    const store = new Store(':memory:'); cleanup.push(() => store.close()); const now = Date.parse('2026-10-14T12:00:00Z');
    const trip: Trip = { id: 'private-trip', name: 'Personal', startedAt: '2026-09-01T12:00:00Z', endedAt: '2026-09-01T12:01:00Z',
      points: [{ coordinate: [73, 33], timestamp: '2026-09-01T12:00:00Z', accuracy: 5 }],
      contributeToRoadDiscovery: false, distanceMeters: 120, durationSeconds: 60, gaps: 0, createdAt: '2026-09-01T12:01:00Z' };
    store.put('trip', trip); (await applyRetention(store, now));
    expect(store.get<Trip>('trip', trip.id)?.points).toEqual([]); expect(store.get<Trip>('trip', trip.id)?.distanceMeters).toBe(120);
    (await applyRetention(store, now + 100 * 86400_000)); expect(store.get('trip', trip.id)).toBeUndefined();
  });
  it('retains every authoritative published closure and expires old GPS beyond display bounds', async () => {
    const store = new Store(':memory:'); cleanup.push(() => store.close());
    const now = Date.parse('2026-10-14T12:00:00Z');
    store.put('closure', { ...closure, id: 'older-active', revision: 1, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }, '2025-01-01T00:00:00Z');
    store.put('trip', { id: 'old-private', endedAt: '2025-01-01T00:00:00Z', points: [[73, 33]] }, '2025-01-01T00:00:00Z');
    store.transaction(() => {
      for (let i = 0; i < 5001; i++) {
        store.put('trip', { id: `new-${i}`, endedAt: '2026-10-14T11:00:00Z', points: [] });
        if (i < 2001) store.put('closure', { ...closure, id: `cancelled-${i}`, status: 'cancelled' });
      }
    });
    expect(store.routingClosures().map(item => item.id)).toEqual(['older-active']);
    (await applyRetention(store, now)); expect(store.get('trip', 'old-private')).toBeUndefined();
  });
});
