import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { ClosureDraft, Coordinate, Drawing } from '../shared/types';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { drawingToPolygon } from '../server/geometry';
import { buildGraph } from '../server/routing/graph';
import { RoadSelectionError } from '../server/routing/road-selection';
import { Store } from '../server/store';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const at = '2027-01-15T11:00:00Z';

/** Synthetic disconnected city fixtures: never downloads source roads or claims
 * that these coordinates describe a real street or a live road restriction. */
function roadFixture(base: Coordinate = [74.35, 31.52]) {
  const point = (x: number, y: number): Coordinate => [base[0] + x, base[1] + y];
  const graph = buildGraph({ elements: [
    { type: 'node', id: 1, lon: base[0] - .01, lat: base[1] },
    { type: 'node', id: 2, lon: base[0], lat: base[1] },
    { type: 'node', id: 3, lon: base[0], lat: base[1] + .005 },
    { type: 'node', id: 4, lon: base[0] + .01, lat: base[1] + .005 },
    { type: 'node', id: 5, lon: base[0] - .005, lat: base[1] + .01 },
    { type: 'node', id: 6, lon: base[0] + .005, lat: base[1] + .01 },
    { type: 'way', id: 10, nodes: [1, 2, 3, 4], tags: { highway: 'residential', name: 'Fixture public road' } },
    { type: 'way', id: 11, nodes: [5, 6], tags: { highway: 'service', name: 'Fixture private road', access: 'private' } },
  ] }, [base[0] - .02, base[1] - .01, base[0] + .02, base[1] + .02]);
  const barrier: Drawing = { kind: 'line', coordinates: [point(-.003, -.0001), point(-.003, .0001)], widthMeters: 4 };
  const draft: ClosureDraft = { restrictionType: 'blockade', title: 'Synthetic coverage test barrier', description: 'Isolated integration fixture',
    reason: 'construction', startsAt: at, endsAt: null, status: 'published', drawing: barrier, geometry: drawingToPolygon(barrier) };
  return { graph, point, barrier, draft };
}

async function setup(base?: Coordinate) {
  const fixture = roadFixture(base), store = new Store(':memory:'); cleanup.push(() => store.close());
  store.setMeta('community:member:reviewer', { verified: true });
  let available = true;
  const graphFor = vi.fn(async (_points: Coordinate[]) => {
    // Keep the adapter asynchronous so serialization and validation must await
    // the provider, rather than accidentally using the imported offline graph.
    await Promise.resolve();
    if (!available) throw new RoadSelectionError('Road data is temporarily unavailable. Try again.', 503);
    return fixture.graph;
  });
  const { app } = createApp(store, {
    config: readConfig({ MANZIL_MODE: 'emulator', FIREBASE_PROJECT_ID: 'demo-road-coverage-test', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' }),
    verifyToken: async uid => ({ uid, admin: uid === 'admin' }),
    roadGraph: () => null,
    roadCoverage: { graphFor },
  });
  const server = await new Promise<Server>(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test port');
  const request = (path: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ...fixture, store, graphFor, request, setAvailable: (value: boolean) => { available = value; } };
}

describe('road tools outside the imported Islamabad graph', () => {
  it.each([
    ['Rawalpindi', [73.05, 33.6]], ['Lahore', [74.35, 31.52]], ['outside Pakistan', [-.12, 51.5]],
  ] as const)('awaits coverage for point, connected road and blockade previews in %s', async (_name, coordinate) => {
    const { request, point, barrier, graphFor } = await setup([...coordinate]);
    const picked = point(-.005, 0), from = point(-.005, 0), to = point(.005, .005);
    const first = await request('/roads/point', undefined, { coordinate: picked });
    expect(first.status).toBe(200); expect(await first.json()).toMatchObject({ roadNames: ['Fixture public road'], drawing: { kind: 'line', widthMeters: 14 }, distanceMeters: 20 });
    const section = await request('/roads/section', undefined, { from, to });
    expect(section.status).toBe(200);
    expect((await section.json()).drawing.coordinates).toEqual([from, point(0, 0), point(0, .005), to]);
    const blockade = await request('/roads/blockade', undefined, { from: barrier.coordinates[0], to: barrier.coordinates[1] });
    expect(blockade.status).toBe(200); expect(await blockade.json()).toMatchObject({ drawing: barrier, roadNames: ['Fixture public road'] });
    expect(graphFor.mock.calls).toEqual([[[picked]], [[from, to]], [barrier.coordinates]]);
  });

  it('keeps an outside blockade private until a reviewer approves and rechecks its mapped intersection', async () => {
    const { request, draft, barrier, graphFor } = await setup();
    expect((await request('/closures', undefined, draft)).status).toBe(401);
    expect(graphFor).not.toHaveBeenCalled();
    const response = await request('/closures', 'alice', draft); expect(response.status).toBe(201);
    const pending = await response.json();
    expect(pending).toMatchObject({ moderation: 'pending', status: 'draft', drawing: barrier, geometry: draft.geometry });
    expect((await (await request('/state')).json()).closures).toEqual([]);
    expect((await request(`/closures/${pending.id}`, 'bob')).status).toBe(404);
    expect((await request(`/closures/${pending.id}/review`, 'alice', { revision: pending.revision, decision: 'approve' })).status).toBe(403);
    expect(graphFor).toHaveBeenCalledTimes(1);
    const approved = await request(`/closures/${pending.id}/review`, 'reviewer', { revision: pending.revision, decision: 'approve' });
    expect(approved.status).toBe(200); expect(graphFor).toHaveBeenCalledTimes(2);
    expect((await (await request('/state')).json()).closures).toEqual([expect.objectContaining({ id: pending.id, moderation: 'approved', status: 'published', restrictionType: 'blockade' })]);
    const roads = await request(`/closures/roads?at=${encodeURIComponent(at)}`); expect(roads.status).toBe(200);
    expect((await roads.json()).features).toEqual([expect.objectContaining({ properties: { closureId: pending.id, title: draft.title }, geometry: { type: 'LineString', coordinates: barrier.coordinates } })]);
  });

  it('revalidates outside blockade updates without allowing an old client to remove the restriction type', async () => {
    const { request, draft, point, graphFor } = await setup();
    const saved = await (await request('/closures', 'admin', draft)).json();
    const { restrictionType: _, ...legacy } = draft;
    const updated = await request(`/closures/${saved.id}`, 'admin', { ...legacy, title: 'Updated outside barrier', revision: saved.revision }, 'PUT');
    expect(updated.status).toBe(200); expect(await updated.json()).toMatchObject({ restrictionType: 'blockade', title: 'Updated outside barrier' });
    expect(graphFor).toHaveBeenCalledTimes(2);
    const offroad: Drawing = { kind: 'line', widthMeters: 4, coordinates: [point(-.003, .0029), point(-.003, .0031)] };
    const invalid = await request('/closures', 'admin', { ...draft, drawing: offroad, geometry: drawingToPolygon(offroad) });
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ error: expect.stringContaining('across a supported public road') });
  });

  it('shows the approved full outside road interval at its selected time even without an imported graph', async () => {
    const { request, draft, point } = await setup();
    const selected = await request('/roads/section', undefined, { from: point(-.005, 0), to: point(.005, .005) });
    expect(selected.status).toBe(200); const { drawing } = await selected.json();
    const interval: ClosureDraft = { ...draft, restrictionType: 'road_closure', title: 'Synthetic outside road interval', drawing,
      geometry: drawingToPolygon(drawing), endsAt: '2027-01-15T12:00:00Z' };
    const saved = await request('/closures', 'alice', interval); expect(saved.status).toBe(201); const pending = await saved.json();
    const roads = async (time: string) => (await (await request(`/closures/roads?at=${encodeURIComponent(time)}`)).json()).features;
    expect(await roads(at)).toEqual([]);
    expect((await request(`/closures/${pending.id}/review`, 'reviewer', { revision: pending.revision, decision: 'approve' })).status).toBe(200);
    expect(await roads('2027-01-15T10:59:59Z')).toEqual([]);
    expect(await roads(at)).toEqual([{ type: 'Feature', properties: { closureId: pending.id, title: interval.title, unverifiedDrawing: true }, geometry: { type: 'LineString', coordinates: drawing.coordinates } }]);
    expect(await roads(interval.endsAt!)).toEqual([]);
  });

  it('returns provider failure honestly without saving or publishing and still permits rejecting a pending report', async () => {
    const { request, draft, barrier, point, store, setAvailable, graphFor } = await setup();
    const pending = await (await request('/closures', 'alice', draft)).json();
    const revision = store.eventRevision;
    setAvailable(false);
    for (const [path, body] of [
      ['/roads/point', { coordinate: point(-.005, 0) }],
      ['/roads/section', { from: point(-.005, 0), to: point(.005, .005) }],
      ['/roads/blockade', { from: barrier.coordinates[0], to: barrier.coordinates[1] }],
    ] as const) {
      const failed = await request(path, undefined, body); expect(failed.status).toBe(503);
      expect(await failed.json()).toEqual({ error: 'Road data is temporarily unavailable. Try again.' });
    }
    expect((await request('/closures', 'admin', draft)).status).toBe(503);
    expect((await request(`/closures/${pending.id}`, 'alice', { ...draft, revision: pending.revision }, 'PUT')).status).toBe(503);
    expect((await request(`/closures/${pending.id}/review`, 'reviewer', { revision: pending.revision, decision: 'approve' })).status).toBe(503);
    expect(store.eventRevision).toBe(revision); expect(store.list('closure')).toHaveLength(1);
    expect((await (await request('/state')).json()).closures).toEqual([]);
    const callsBeforeRejection = graphFor.mock.calls.length;
    expect((await request(`/closures/${pending.id}/review`, 'reviewer', { revision: pending.revision, decision: 'reject' })).status).toBe(200);
    expect(graphFor).toHaveBeenCalledTimes(callsBeforeRejection);
  });

  it('does not admit private roads, parallel barriers or invalid coordinates through remote coverage', async () => {
    const { request, draft, point, graphFor } = await setup();
    for (const coordinates of [[point(-.003, .0099), point(-.003, .0101)], [point(-.0031, 0), point(-.0029, 0)]] as Coordinate[][]) {
      const drawing: Drawing = { kind: 'line', coordinates, widthMeters: 4 };
      expect((await request('/roads/blockade', undefined, { from: coordinates[0], to: coordinates[1] })).status).toBe(422);
      expect((await request('/closures', 'admin', { ...draft, drawing, geometry: drawingToPolygon(drawing) })).status).toBe(422);
    }
    const calls = graphFor.mock.calls.length;
    expect((await request('/roads/point', undefined, { coordinate: [181, 31.52] })).status).toBe(400);
    expect((await request('/roads/section', undefined, { from: point(-.005, 0), to: [74.35, 91] })).status).toBe(400);
    expect(graphFor).toHaveBeenCalledTimes(calls);
  });

  it('does not publish a report rejected while asynchronous road validation is in flight', async () => {
    const { request, draft, graphFor, graph } = await setup();
    const pending = await (await request('/closures', 'alice', draft)).json();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    graphFor.mockImplementationOnce(async () => { await gate; return graph; });
    const approval = request(`/closures/${pending.id}/review`, 'reviewer', { revision: pending.revision, decision: 'approve' });
    try {
      await vi.waitFor(() => expect(graphFor).toHaveBeenCalledTimes(2));
      expect((await request(`/closures/${pending.id}/review`, 'admin', { revision: pending.revision, decision: 'reject' })).status).toBe(200);
    } finally { release(); }
    expect((await approval).status).toBe(409);
    expect((await (await request('/state')).json()).closures).toEqual([]);
    expect(await (await request(`/closures/${pending.id}`, 'alice')).json()).toMatchObject({ moderation: 'rejected', status: 'draft' });
  });
});
