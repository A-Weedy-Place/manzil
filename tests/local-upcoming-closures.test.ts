import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_UPCOMING_CLOSURE_IDS, localUpcomingClosureDrafts, seedLocalUpcomingClosures } from '../scripts/lib/local-upcoming-closures';
import { LOCAL_TEST_CLOSURE_IDS } from '../scripts/lib/local-test-closures';
import { demoCatalogue } from '../server/demos';
import { Store } from '../server/store';
import { getRoutingGraph } from '../server/routing';
import { activeClosureRoads, closureEdgeFractions } from '../server/routing/closure-segments';
import type { Closure } from '../shared/types';

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
async function examples(now = at) {
  const graph = getRoutingGraph()!; expect(graph).toBeTruthy();
  const store = new Store(':memory:'); opened.push(store);
  const catalogue = await demoCatalogue(store, graph, new Date(now).toISOString());
  const drafts = localUpcomingClosureDrafts(catalogue, now);
  const closures: Closure[] = drafts.map((draft, index) => ({ ...draft, id: LOCAL_UPCOMING_CLOSURE_IDS[index],
    moderation: 'approved', revision: 1, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() }));
  return { graph, catalogue, drafts, closures };
}

describe('explicit upcoming localhost closures', () => {
  it('rejects cloud and unsafe emulator targets before opening Firebase', async () => {
    const fixture = services();
    for (const override of [{ MANZIL_MODE: 'production' }, { MANZIL_MODE: 'local' }, { FIREBASE_PROJECT_ID: 'manzil-app-v1' },
      { FIREBASE_AUTH_EMULATOR_HOST: '' }, { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' },
      { FIRESTORE_EMULATOR_HOST: 'remote.example:8080' }, { K_SERVICE: 'cloud-run-service' }]) {
      await expect(seedLocalUpcomingClosures({ ...env, ...override }, fixture.factory, at)).rejects.toThrow();
    }
    expect(fixture.factory).not.toHaveBeenCalled(); expect(fixture.documents.size).toBe(0);
  });

  it('keeps all three real OSM chains inactive now and activates precisely at each scheduled start', async () => {
    const { graph, closures } = await examples();
    expect(closures.map(value => value.startsAt)).toEqual(['2026-11-18T04:00:00.000Z', '2026-11-19T04:00:00.000Z', '2026-11-20T04:00:00.000Z']);
    expect(activeClosureRoads(graph, closures, new Date(at).toISOString()).features).toHaveLength(0);
    for (const closure of closures) {
      expect(closure.description).toMatch(/Synthetic upcoming/); expect(closure.title).toMatch(/^Test · Upcoming · /);
      expect(Date.parse(closure.endsAt!) - Date.parse(closure.startsAt)).toBe(32 * DAY);
      expect(closure.drawing?.kind).toBe('line'); expect(closureEdgeFractions(graph, closure.geometry).size).toBeGreaterThan(0);
      expect(activeClosureRoads(graph, [closure], new Date(Date.parse(closure.startsAt) - 1).toISOString()).features).toHaveLength(0);
      const roads = activeClosureRoads(graph, [closure], closure.startsAt);
      expect(roads.features.length).toBeGreaterThan(0); expect(roads.features.every(value => value.properties.closureId === closure.id && !value.properties.unverifiedDrawing)).toBe(true);
      expect(activeClosureRoads(graph, [closure], closure.endsAt!).features).toHaveLength(0);
    }
  });

  it('uses the PKT date across UTC midnight and clamps the next-month date', async () => {
    const { catalogue } = await examples();
    const first = (date: string) => localUpcomingClosureDrafts(catalogue, Date.parse(date))[0].startsAt;
    expect(first('2026-10-17T20:30:00Z')).toBe('2026-11-18T04:00:00.000Z');
    expect(first('2026-01-31T10:00:00Z')).toBe('2026-02-28T04:00:00.000Z');
    expect(first('2027-12-31T10:00:00Z')).toBe('2028-01-31T04:00:00.000Z');
    expect(() => localUpcomingClosureDrafts(catalogue, NaN)).toThrow(/valid local fixture time/);
    expect(() => localUpcomingClosureDrafts({ ...catalogue, scenarios: [] }, at)).toThrow(/road section unavailable/);
  });

  it('atomically increments revision, preserves active fixtures and never resets owner edits or deletions', async () => {
    const fixture = services(); fixture.documents.set(`${root}/meta/${hash('eventRevision')}`, { json: '15' });
    for (const id of LOCAL_TEST_CLOSURE_IDS) fixture.documents.set(closurePath(id), { json: JSON.stringify({ id, title: 'Existing active fixture' }), status: 'published' });
    const activeBefore = LOCAL_TEST_CLOSURE_IDS.map(id => [closurePath(id), fixture.documents.get(closurePath(id))]);
    expect(await seedLocalUpcomingClosures(env, fixture.factory, at)).toMatchObject({ result: 'created', createdCount: 3, closureIds: LOCAL_UPCOMING_CLOSURE_IDS });
    expect(JSON.parse(fixture.documents.get(`${root}/meta/${hash('eventRevision')}`)!.json)).toBe(18);
    expect(LOCAL_TEST_CLOSURE_IDS.map(id => [closurePath(id), fixture.documents.get(closurePath(id))])).toEqual(activeBefore);
    const modified = closurePath(LOCAL_UPCOMING_CLOSURE_IDS[0]);
    const current = JSON.parse(fixture.documents.get(modified)!.json) as Closure;
    fixture.documents.set(modified, { json: JSON.stringify({ ...current, title: 'Owner edit', status: 'cancelled', revision: 2 }), status: 'cancelled' });
    fixture.documents.delete(closurePath(LOCAL_UPCOMING_CLOSURE_IDS[1]));
    const before = structuredClone([...fixture.documents]);
    expect(await seedLocalUpcomingClosures(env, fixture.factory, at + 70 * DAY)).toMatchObject({ result: 'already-seeded', createdCount: 0 });
    expect([...fixture.documents]).toEqual(before);
  });

  it('does not overwrite an existing deterministic ID when its marker is missing', async () => {
    const fixture = services(), path = closurePath(LOCAL_UPCOMING_CLOSURE_IDS[0]);
    fixture.documents.set(path, { json: '{"title":"Existing owner edit"}', status: 'cancelled' });
    expect((await seedLocalUpcomingClosures(env, fixture.factory, at)).createdCount).toBe(2);
    expect(fixture.documents.get(path)).toEqual({ json: '{"title":"Existing owner edit"}', status: 'cancelled' });
  });
});
