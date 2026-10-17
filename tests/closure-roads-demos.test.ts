import { afterEach, describe, expect, it } from 'vitest';
import booleanIntersects from '@turf/boolean-intersects';
import type { Server } from 'node:http';
import type { Closure, ClosureDraft, Coordinate } from '../shared/types';
import { Store } from '../server/store';
import { createApp } from '../server/app';
import { SourceService } from '../server/source';
import { activeClosureRoads, closureEdgeFractions } from '../server/routing/closure-segments';
import { getRoutingGraph, planJourney } from '../server/routing/index';
import { demoCatalogue, toggleDemo } from '../server/demos';
import type { RoutingGraph } from '../server/routing/graph';
import { LocalRouter } from '../server/routing/engine';
import type { DemoCatalogue } from '../server/demos';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const at = '2027-01-15T11:00:00.000Z';
const coordinates: Coordinate[] = [[73, 33.68], [73.01, 33.68], [73.01, 33.69]];
const graph: RoutingGraph = {
  version: 'test', source: 'Synthetic test graph', importedAt: at, sourceTimestamp: null,
  bounds: [72.99, 33.67, 73.02, 33.70], attribution: 'Test only', nodes: coordinates.map((coordinate, id) => ({ id: String(id), coordinate })),
  edges: [{ from: 0, to: 1, seconds: 60, distance: 900, name: 'Test road', wayId: '1' },
    { from: 1, to: 0, seconds: 60, distance: 900, name: 'Test road', wayId: '1' },
    { from: 1, to: 2, seconds: 80, distance: 1100, name: 'Clear road', wayId: '2' }],
  restrictions: [], importStats: { sourceWays: 2, acceptedWays: 2, excludedConditionalWays: 0, unsupportedRestrictions: 0, blockedViaWays: 0 },
};
const draft: ClosureDraft = { title: 'Ordinary user closure', description: 'Preserve this record', reason: 'construction', status: 'published',
  startsAt: at, endsAt: '2027-01-15T12:00:00.000Z',
  geometry: { type: 'Polygon', coordinates: [[[73.004, 33.6798], [73.006, 33.6798], [73.006, 33.6802], [73.004, 33.6802], [73.004, 33.6798]]] } };
async function setup(roadGraph: RoutingGraph = graph) {
  const store = new Store(':memory:'); cleanup.push(() => store.close());
  const source = new SourceService(store, async () => ({ state: 'blocked', posts: [], observedCount: 0, message: 'Test only' }));
  const { app } = createApp(store, { source, roadGraph: () => roadGraph, planner: () => ({ options: [], baseline: null, conflicts: [], warnings: [], evaluatedAt: at, graphVersion: 'test', eventRevision: 0, source: 'local-osm' }) });
  const server = await new Promise<Server>(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port');
  const request = (path: string, body?: unknown) => fetch(`http://127.0.0.1:${address.port}/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { store, request };
}

describe('active road display and independently toggled demos', () => {
  it('coats only the affected part of a road edge, deduplicates reverse direction, and retains exact routing fractions', async () => {
    const closure: Closure = { ...draft, id: 'test', revision: 1, createdAt: at, updatedAt: at };
    const roads = activeClosureRoads(graph, [closure], at);
    expect(roads.features).toHaveLength(1);
    expect(roads.features[0].geometry.coordinates).toEqual([[73.004, 33.68], [73.006, 33.68]]);
    expect(roads.features[0].properties).toEqual({ closureId: 'test', title: draft.title });
    const fractions = closureEdgeFractions(graph, draft.geometry);
    expect(fractions.size).toBe(2); expect(fractions.get(0)![0][0]).toBeCloseTo(.4); expect(fractions.get(0)![0][1]).toBeCloseTo(.6);
  });
  it('does not extend the red main-road coating across a legal side-street detour at either junction', async () => {
    const detourGraph: RoutingGraph = { ...graph,
      nodes: [coordinates[0], coordinates[1], [73, 33.69] as Coordinate, [73.01, 33.69] as Coordinate].map((coordinate, i) => ({ id: String(i), coordinate })),
      edges: [[0, 1, 60], [0, 2, 90], [2, 3, 90], [3, 1, 90]].flatMap(([from, to, seconds], i) => [
        { from, to, seconds, distance: seconds * 10, wayId: String(i), name: i ? 'Residential street' : 'Main road' },
        { from: to, to: from, seconds, distance: seconds * 10, wayId: String(i), name: i ? 'Residential street' : 'Main road' },
      ]),
    };
    const event: Closure = { ...draft, id: 'detour-test', revision: 1, createdAt: at, updatedAt: at };
    const plan = new LocalRouter(detourGraph).plan({ origin: { name: 'Start', coordinate: coordinates[0] }, destination: { name: 'End', coordinate: coordinates[1] }, departureAt: at }, [event], 1);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.options[0].kind).toBe('detour');
    expect(plan.options[0].steps.some(step => step.roadName === 'Residential street')).toBe(true);
    const roads = activeClosureRoads(detourGraph, [event], at);
    expect(roads.features).toHaveLength(1);
    for (const feature of roads.features) expect(booleanIntersects(plan.options[0].geometry, feature.geometry)).toBe(false);
  });
  it('uses the requested snapshot time with inclusive start, exclusive end, and no routing uncertainty margin', async () => {
    const { store, request } = await setup();
    store.saveClosure(draft);
    store.saveClosure({ ...draft, title: 'Draft', status: 'draft' });
    store.saveClosure({ ...draft, title: 'Cancelled', status: 'cancelled' });
    const roads = async (time: string) => (await (await request(`/closures/roads?at=${encodeURIComponent(time)}`)).json()).features;
    expect(await roads('2027-01-15T10:59:59.999Z')).toHaveLength(0);
    expect(await roads(at)).toHaveLength(1);
    expect(await roads('2027-01-15T11:59:59.999Z')).toHaveLength(1);
    expect(await roads('2027-01-15T12:00:00.000Z')).toHaveLength(0);
    store.saveClosure({ ...draft, title: 'Unknown end', endsAt: null });
    expect(await roads('2027-02-01T00:00:00Z')).toHaveLength(1);
    expect((await request('/closures/roads?at=not-a-date')).status).toBe(400);
  });
  it('offers six road chains and four optional street-route examples with independent schedules', async () => {
    const { store, request } = await setup(getRoutingGraph()!);
    const initial: DemoCatalogue = await (await request(`/demos?at=${at}`)).json();
    expect(initial.scenarios).toHaveLength(10);
    expect(initial.scenarios.every(s => !s.enabled)).toBe(true);
    expect(initial.scenarios.filter(s => s.includeInBulk !== false)).toHaveLength(6);
    for (const scenario of initial.scenarios) {
      expect(scenario.coordinates.length).toBeGreaterThanOrEqual(scenario.suggestedJourney ? 1 : 3);
      expect(scenario.suggestedJourney ? scenario.includeInBulk : true).toBe(scenario.suggestedJourney ? false : true);
    }
    for (const scenario of initial.scenarios) {
      const result = await request('/demos', { scenario: scenario.id, at, enabled: true }); expect(result.status).toBe(200);
    }
    expect(store.routingClosures()).toHaveLength(10);
    const activeIds = new Set(activeClosureRoads(getRoutingGraph()!, store.routingClosures(), at).features.map(feature => feature.properties.closureId));
    const current: DemoCatalogue = await (await request(`/demos?at=${at}`)).json();
    for (const scenario of current.scenarios) {
      expect(scenario.enabled).toBe(true); expect(scenario.title).toMatch(/^Demo · /);
      expect(activeIds.has(scenario.closureIds[0])).toBe(scenario.timing === 'active');
      expect(activeClosureRoads(getRoutingGraph()!, [store.get<Closure>('closure', scenario.closureIds[0])!], scenario.startsAt).features.length).toBeGreaterThan(0);
    }
  });
  it('keeps repeat toggles idempotent, preserves schedules on timeline moves, and never cancels unrelated closures', async () => {
    const { store, request } = await setup(getRoutingGraph()!);
    const real = store.saveClosure(draft);
    const enable = { scenario: 'faisal-avenue', at, enabled: true };
    const first: DemoCatalogue = await (await request('/demos', enable)).json();
    const firstScenario = first.scenarios.find(s => s.id === enable.scenario)!;
    const revision = store.eventRevision;
    const repeat: DemoCatalogue = await (await request('/demos', { ...enable, at: '2027-01-15T14:00:00Z' })).json();
    expect(repeat.scenarios.find(s => s.id === enable.scenario)).toEqual(firstScenario);
    expect(store.eventRevision).toBe(revision); expect(store.list('closure')).toHaveLength(2);
    await request('/demos', { ...enable, enabled: false });
    expect(store.get<Closure>('closure', firstScenario.closureIds[0])!.status).toBe('cancelled');
    expect(store.get<Closure>('closure', real.id)).toEqual(real);
    const cancelledRevision = store.eventRevision;
    await request('/demos', { ...enable, enabled: false }); expect(store.eventRevision).toBe(cancelledRevision);
    const reenabled: DemoCatalogue = await (await request('/demos', enable)).json();
    expect(reenabled.scenarios.find(s => s.id === enable.scenario)!.closureIds).toEqual(firstScenario.closureIds);
    expect(store.list('closure')).toHaveLength(2);
  });
  it('keeps the default destination and Kaghan Road detour junctions clear with every active demo enabled', async () => {
    const store = new Store(':memory:'); cleanup.push(() => store.close());
    const realGraph = getRoutingGraph()!;
    for (const scenario of (await demoCatalogue(store, realGraph, at)).scenarios.filter(s => s.timing === 'active' && s.includeInBulk !== false)) (await toggleDemo(store, realGraph, scenario.id, at, true));
    const request = { origin: { name: 'Faisal Mosque', coordinate: [73.0376503, 33.7314163] as Coordinate },
      destination: { name: 'Centaurus', coordinate: [73.0492744, 33.7081776] as Coordinate }, departureAt: at };
    const closures = store.routingClosures(), result = await planJourney(request, closures, store.eventRevision);
    expect(result.conflicts.length).toBeGreaterThan(0); expect(result.options.length).toBeGreaterThan(0);
    expect(result.options[0].kind).toBe('detour');
    for (const option of result.options) for (const closure of closures) expect(booleanIntersects(option.geometry, closure.geometry)).toBe(false);
    const roads = activeClosureRoads(realGraph, closures, at);
    expect(roads.features.some(feature => feature.geometry.coordinates.some(p => p[0] === request.destination.coordinate[0] && p[1] === request.destination.coordinate[1]))).toBe(false);
    // These are the real Kaghan Road junctions from the owner's screenshot: the
    // closure covers the far end of each long main-road edge, not the ramp join.
    const clearJoins = [[73.0492736, 33.7137383], [73.0493346, 33.7136299]];
    for (const join of clearJoins) expect(roads.features.some(feature => feature.geometry.coordinates.some(p => p[0] === join[0] && p[1] === join[1]))).toBe(false);
    for (const option of result.options) for (const feature of roads.features) expect(booleanIntersects(option.geometry, feature.geometry)).toBe(false);
  });
  it('rejects unknown demos and invalid instants without changing saved closures', async () => {
    const { store, request } = await setup(getRoutingGraph()!);
    expect((await request('/demos', { scenario: 'other', at, enabled: true })).status).toBe(400);
    expect((await request('/demos', { scenario: 'faisal-avenue', at: 'tomorrow', enabled: true })).status).toBe(400);
    expect((await request('/demos?at=tomorrow')).status).toBe(400);
    expect(store.list('closure')).toHaveLength(0);
  });
});
