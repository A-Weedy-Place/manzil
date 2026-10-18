import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_TEST_CLOSURE_IDS, localTestClosureDrafts, seedLocalTestClosures } from '../scripts/lib/local-test-closures';
import { demoCatalogue } from '../server/demos';
import { Store } from '../server/store';
import { getRoutingGraph } from '../server/routing';
import { activeClosureRoads, closureEdgeFractions } from '../server/routing/closure-segments';
import { drawingToPolygon } from '../server/geometry';
import type { Closure, ClosureDraft, Drawing } from '../shared/types';

const at = Date.parse('2026-10-18T06:00:00Z'), DAY = 86400_000;
const env = { MANZIL_MODE: 'emulator', FIREBASE_PROJECT_ID: 'demo-manzil', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const root = 'manzil/v1', closurePath = (id: string) => `${root}/closure/${hash(id)}`;
const opened: Store[] = []; afterEach(() => opened.splice(0).forEach(store => store.close()));
function services() {
  const documents = new Map<string, { json: string; status?: string; updatedAt?: string }>();
  const snapshot = (path: string) => ({ exists: documents.has(path), data: () => documents.get(path) });
  function collection(path: string) {
    return { doc: (id: string) => ({ path: `${path}/${id}`, get: async () => snapshot(`${path}/${id}`), collection: (name: string) => collection(`${path}/${id}/${name}`) }) };
  }
  const db = { collection, runTransaction: vi.fn(async (run: (transaction: unknown) => unknown) => {
    const writes: [string, { json: string }][] = [];
    const tx = { getAll: async (...refs: { path: string }[]) => refs.map(ref => snapshot(ref.path)),
      create: (ref: { path: string }, value: { json: string }) => { if (documents.has(ref.path)) throw new Error('Already exists'); writes.push([ref.path, value]); },
      set: (ref: { path: string }, value: { json: string }) => { writes.push([ref.path, value]); } };
    const result = await run(tx); for (const [path, value] of writes) documents.set(path, value); return result;
  }) };
  return { documents, db, factory: vi.fn(() => ({ db: db as unknown as Firestore })) };
}
async function examples() {
  const graph = getRoutingGraph()!; expect(graph).toBeTruthy();
  const store = new Store(':memory:'); opened.push(store);
  const drafts = localTestClosureDrafts(graph, await demoCatalogue(store, graph, new Date(at).toISOString()), at);
  const closures: Closure[] = drafts.map((draft, index) => ({ ...draft, id: LOCAL_TEST_CLOSURE_IDS[index], moderation: 'approved', revision: 1, createdAt: new Date(at).toISOString(), updatedAt: new Date(at).toISOString() }));
  return { graph, drafts, closures };
}

describe('explicit month-long localhost test closures', () => {
  it('refuses cloud, other projects and alternate/missing hosts before any Firebase service', async () => {
    const fixture = services();
    for (const override of [{ MANZIL_MODE: 'production' }, { MANZIL_MODE: 'local' }, { FIREBASE_PROJECT_ID: 'manzil-app-v1' },
      { FIREBASE_AUTH_EMULATOR_HOST: '' }, { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' },
      { FIRESTORE_EMULATOR_HOST: 'remote.example:8080' }, { K_SERVICE: 'cloud-run-service' }]) {
      await expect(seedLocalTestClosures({ ...env, ...override }, fixture.factory, at)).rejects.toThrow();
    }
    expect(fixture.factory).not.toHaveBeenCalled(); expect(fixture.documents.size).toBe(0);
  });

  it('creates seven explicit synthetic 32-day fixtures and paints six real sections plus the outside drawing', async () => {
    const { graph, closures } = await examples();
    expect(closures).toHaveLength(7);
    for (const closure of closures) {
      expect(closure.title).toMatch(/^Test · /); expect(closure.description).toMatch(/Synthetic/);
      expect(Date.parse(closure.endsAt!) - Date.parse(closure.startsAt)).toBe(32 * DAY);
      expect(closure.drawing?.kind).toBe('line'); expect(closure.drawing!.coordinates.length).toBeGreaterThanOrEqual(2);
    }
    const roads = activeClosureRoads(graph, closures, new Date(at).toISOString());
    expect(new Set(roads.features.map(feature => feature.properties.closureId))).toEqual(new Set(LOCAL_TEST_CLOSURE_IDS));
    expect(roads.features.filter(feature => feature.properties.unverifiedDrawing)).toHaveLength(1);
    const outside = closures[6];
    expect(outside.sourceUrl).toBe('https://www.openstreetmap.org/node/5318062321');
    expect(outside.description).toMatch(/not a verified road alignment/);
    expect(outside.drawing!.coordinates.every(coordinate => coordinate[0] < graph.bounds[0])).toBe(true);
    expect(closureEdgeFractions(graph, outside.geometry).size).toBe(0);
    expect(activeClosureRoads(graph, closures, new Date(at - 1).toISOString()).features).toHaveLength(0);
    expect(activeClosureRoads(graph, closures, new Date(at + 32 * DAY).toISOString()).features).toHaveLength(0);
  });

  it('atomically writes deterministic IDs and never resets edited, cancelled or deleted fixtures', async () => {
    const fixture = services(); fixture.documents.set(`${root}/meta/${hash('eventRevision')}`, { json: '40' });
    fixture.documents.set('users/existing/meta/profile', { json: '{"collectTravelData":true}' });
    expect(await seedLocalTestClosures(env, fixture.factory, at)).toMatchObject({ result: 'created', createdCount: 7, closureIds: LOCAL_TEST_CLOSURE_IDS });
    expect(JSON.parse(fixture.documents.get(`${root}/meta/${hash('eventRevision')}`)!.json)).toBe(47);
    expect([...fixture.documents.keys()].filter(path => path.startsWith(`${root}/closure/`))).toHaveLength(7);
    const modified = closurePath(LOCAL_TEST_CLOSURE_IDS[0]), current = JSON.parse(fixture.documents.get(modified)!.json) as Closure;
    fixture.documents.set(modified, { json: JSON.stringify({ ...current, title: 'Edited fixture', status: 'cancelled', revision: 2 }), status: 'cancelled' });
    fixture.documents.delete(closurePath(LOCAL_TEST_CLOSURE_IDS[1]));
    const before = structuredClone([...fixture.documents]);
    expect(await seedLocalTestClosures(env, fixture.factory, at + 40 * DAY)).toMatchObject({ result: 'already-seeded', createdCount: 0 });
    expect([...fixture.documents]).toEqual(before);
  });

  it('preserves an existing deterministic fixture even if the marker is absent', async () => {
    const fixture = services(), path = closurePath(LOCAL_TEST_CLOSURE_IDS[0]);
    fixture.documents.set(path, { json: '{"title":"Existing owner edit"}', status: 'cancelled' });
    expect((await seedLocalTestClosures(env, fixture.factory, at)).createdCount).toBe(6);
    expect(fixture.documents.get(path)).toEqual({ json: '{"title":"Existing owner edit"}', status: 'cancelled' });
  });

  it('does not paint an inactive, in-coverage, non-line or uncontained outside drawing as a matched road', async () => {
    const { graph, closures } = await examples(), outside = closures[6];
    for (const status of ['draft', 'cancelled'] as const) expect(activeClosureRoads(graph, [{ ...outside, status }], new Date(at).toISOString()).features).toHaveLength(0);
    expect(activeClosureRoads(graph, [{ ...outside, drawing: { kind: 'point', coordinates: [outside.drawing!.coordinates[0]], widthMeters: 20 } }], new Date(at).toISOString()).features).toHaveLength(0);
    const uncontained: Drawing = { kind: 'line', widthMeters: 20, coordinates: [[72.9348, 33.63285], [72.94, 33.64]] };
    expect(activeClosureRoads(graph, [{ ...outside, drawing: uncontained }], new Date(at).toISOString()).features).toHaveLength(0);
    // Empty in-coverage area cannot become an invented red road even with a line drawing.
    const local: Drawing = { kind: 'line', widthMeters: 2, coordinates: [[73.03, 33.6], [73.031, 33.6]] };
    const inCoverage: ClosureDraft = { ...outside, drawing: local, geometry: drawingToPolygon(local) };
    expect(activeClosureRoads(graph, [{ ...outside, ...inCoverage }], new Date(at).toISOString()).features.every(feature => !feature.properties.unverifiedDrawing)).toBe(true);
    const roads = activeClosureRoads(graph, [outside], new Date(at).toISOString());
    roads.features[0].geometry.coordinates[0][0] = 0;
    expect(activeClosureRoads(graph, [outside], new Date(at).toISOString()).features[0].geometry.coordinates[0][0]).not.toBe(0);
  });
});
