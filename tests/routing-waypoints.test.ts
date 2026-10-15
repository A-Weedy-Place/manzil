import { describe, expect, it } from 'vitest';
import booleanIntersects from '@turf/boolean-intersects';
import type { Closure, Commute, Coordinate, Place, PlanRequest, PlanResponse } from '../shared/types';
import { LocalRouter } from '../server/routing/engine';
import { buildGraph, distanceMeters, type OsmDocument, type RoutingGraph } from '../server/routing/graph';
import { commuteSchema, planSchema } from '../server/validation';
import { checkCommute } from '../server/commutes';
import { Store } from '../server/store';

const departureAt = '2027-01-15T11:00:00.000Z';
const coordinates: Coordinate[] = [[73, 33.68], [73.01, 33.68], [73.02, 33.68], [73.01, 33.69], [73.02, 33.69]];
const place = (index: number): Place => ({ name: `Place ${index}`, coordinate: coordinates[index] });
function graph(roads: [number, number, number, string?][]): RoutingGraph {
  return { version: 'unit-ordered-stops', importedAt: departureAt, sourceTimestamp: null,
    bounds: [72.99, 33.67, 73.03, 33.70], attribution: 'Isolated unit-test fixture', source: 'test',
    nodes: coordinates.map((coordinate, i) => ({ id: String(i), coordinate })),
    edges: roads.map(([from, to, seconds, name], i) => ({ from, to, seconds,
      distance: distanceMeters(coordinates[from], coordinates[to]), wayId: String(i), name: name ?? `Road ${i}` })),
    restrictions: [], importStats: { sourceWays: roads.length, acceptedWays: roads.length, excludedConditionalWays: 0, unsupportedRestrictions: 0, blockedViaWays: 0 } };
}
const request = (waypoints: Place[] = []): PlanRequest => ({ origin: place(0), destination: place(2), waypoints, departureAt, compareDepartures: false });
const event = (overrides: Partial<Closure> = {}): Closure => ({ id: 'test-later-leg', title: 'Synthetic later-leg closure', description: 'Unit test only', reason: 'construction',
  startsAt: '2027-01-15T11:01:40Z', endsAt: '2027-01-15T12:00:00Z', status: 'published', revision: 1, createdAt: departureAt, updatedAt: departureAt,
  geometry: { type: 'Polygon', coordinates: [[[73.014, 33.6798], [73.016, 33.6798], [73.016, 33.6802], [73.014, 33.6802], [73.014, 33.6798]]] }, ...overrides });

describe('ordered intermediate stops', () => {
  it('visits every stop in the requested order in one connected journey', () => {
    const router = new LocalRouter(graph([[0, 1, 20], [0, 3, 40], [3, 1, 40], [1, 2, 20]]));
    const result = router.plan(request([place(3), place(1)]), [], 0);
    expect(result.options[0].geometry.coordinates).toEqual([coordinates[0], coordinates[3], coordinates[1], coordinates[2]]);
    expect(result.options[0].snappedWaypoints).toEqual([coordinates[3], coordinates[1]]);
    expect(result.options[0].durationSeconds).toBe(106);
    expect(result.options[0].steps.reduce((sum, step) => sum + step.durationSeconds, 0)).toBe(106);
  });

  it('carries elapsed travel time and turn delay into closure checks after a stop', () => {
    const router = new LocalRouter(graph([[0, 1, 90], [1, 2, 60], [1, 3, 90], [3, 4, 90], [4, 2, 90]]));
    const closure = event(), result = router.plan(request([place(1)]), [closure], 1);
    expect(result.baseline?.durationSeconds).toBe(153);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].entryAt).toBe('2027-01-15T11:01:57.000Z');
    expect(result.conflicts[0].exitAt).toBe('2027-01-15T11:02:09.000Z');
    expect(result.options[0].kind).toBe('detour');
    for (const route of result.options) {
      expect(route.snappedWaypoints).toEqual([coordinates[1]]);
      expect(route.geometry.coordinates).toContainEqual(coordinates[1]);
      expect(booleanIntersects(route.geometry, closure.geometry)).toBe(false);
    }
  });

  it('allows a later leg once its closure has ended before the traversal margin', () => {
    const router = new LocalRouter(graph([[0, 1, 90], [1, 2, 60]]));
    const result = router.plan(request([place(1)]), [event({ startsAt: '2027-01-15T10:00:00Z', endsAt: '2027-01-15T11:01:20Z' })], 1);
    expect(result.conflicts).toHaveLength(0);
    expect(result.options[0].kind).toBe('direct');
    expect(result.options[0].durationSeconds).toBe(153);
  });

  it('preserves the incoming edge at a stop and finds another legal approach', () => {
    const fixture = graph([[0, 1, 10], [0, 3, 20], [3, 1, 20], [1, 2, 10]]);
    fixture.restrictions = [{ via: 1, fromWay: '0', toWay: '3', only: false, uTurn: false }];
    const result = new LocalRouter(fixture).plan(request([place(1)]), [], 0);
    // Resetting the incoming edge between legs would incorrectly permit 0 → 1 → 2.
    expect(result.options[0].geometry.coordinates).toEqual([coordinates[0], coordinates[3], coordinates[1], coordinates[2]]);
    expect(result.options[0].durationSeconds).toBe(56);
  });

  it('returns unavailable when the only exit from a required stop is prohibited', () => {
    const fixture = graph([[0, 1, 10], [1, 2, 10]]);
    fixture.restrictions = [{ via: 1, fromWay: '0', toWay: '1', only: false, uTurn: false }];
    const result = new LocalRouter(fixture).plan(request([place(1)]), [], 0);
    expect(result.options).toHaveLength(0);
    expect(result.baseline).toBeNull();
    expect(result.unavailableReason).toMatch(/No connected public car route/);
  });

  it('handles consecutive stops on the same snapped node without creating fake edges', () => {
    const result = new LocalRouter(graph([[0, 1, 10], [1, 2, 10]])).plan(request([place(0), place(1), place(1)]), [], 0);
    expect(result.options[0].geometry.coordinates).toEqual([coordinates[0], coordinates[1], coordinates[2]]);
    expect(result.options[0].snappedWaypoints).toEqual([coordinates[0], coordinates[1], coordinates[1]]);
    expect(result.options[0].durationSeconds).toBe(23);
  });

  it('returns unavailable for an unsupported or disconnected intermediate stop', () => {
    const router = new LocalRouter(graph([[0, 1, 10], [1, 2, 10], [3, 4, 10]]));
    expect(router.plan(request([place(3)]), [], 0).options).toHaveLength(0);
    const outside = router.plan(request([{ name: 'Outside', coordinate: [74, 34] }]), [], 0);
    expect(outside.options).toHaveLength(0); expect(outside.unavailableReason).toMatch(/every stop must be inside/);
    const distant = router.plan(request([{ name: 'Not on a road', coordinate: [73.005, 33.685] }]), [], 0);
    expect(distant.options).toHaveLength(0); expect(distant.unavailableReason).toMatch(/within 220 metres/);
  });

  it('validates at most five stops and retains them in saved-commute inputs', () => {
    expect(planSchema.parse(request([place(1)] )).waypoints).toEqual([place(1)]);
    expect(planSchema.safeParse(request(Array.from({ length: 5 }, () => place(1)))).success).toBe(true);
    expect(planSchema.safeParse(request(Array.from({ length: 6 }, () => place(1)))).success).toBe(false);
    expect(planSchema.safeParse(request([{ name: 'Bad', coordinate: [200, 40] }])).success).toBe(false);
    const commute = { name: 'School then office', origin: place(0), destination: place(2), waypoints: [place(1)], days: [5], departureTime: '16:00', enabled: true };
    expect(commuteSchema.parse(commute).waypoints).toEqual([place(1)]);
    expect(commuteSchema.safeParse({ ...commute, waypoints: Array.from({ length: 6 }, () => place(1)) }).success).toBe(false);
  });

  it('passes saved stops through every recurring-commute check', () => {
    const store = new Store(':memory:');
    try {
      const commute: Commute = { id: 'with-stop', name: 'School then office', origin: place(0), destination: place(2), waypoints: [place(1)],
        days: [5], departureTime: '16:00', enabled: true, createdAt: departureAt, updatedAt: departureAt };
      const empty: PlanResponse = { options: [], baseline: null, conflicts: [], warnings: [], evaluatedAt: departureAt, graphVersion: 'test', eventRevision: 0, source: 'local-osm' };
      let planned: PlanRequest | undefined;
      checkCommute(store, commute, (input) => { planned = input; return empty; }, Date.parse(departureAt));
      expect(planned).toMatchObject({ origin: place(0), destination: place(2), waypoints: [place(1)] });
    } finally { store.close(); }
  });

  it('reports nearby scheduled closures on the original route without marking it blocked before traversal', () => {
    const router = new LocalRouter(graph([[0, 1, 90], [1, 2, 60]]));
    const future = event({ startsAt: '2027-01-15T11:30:00Z' });
    const farFuture = event({ id: 'beyond-window', startsAt: '2027-01-17T11:30:00Z', endsAt: null });
    const result = router.plan(request([place(1)]), [future, farFuture], 1);
    expect(result.options[0].kind).toBe('direct'); expect(result.conflicts).toHaveLength(0);
    expect(result.upcoming).toEqual([{ closureId: future.id, title: future.title, startsAt: future.startsAt, endsAt: future.endsAt }]);
  });
});

describe('public street detours', () => {
  it('uses connected residential streets when a primary road is blocked, while excluding private streets', () => {
    const node = (index: number) => ({ type: 'node' as const, id: index + 1, lon: coordinates[index][0], lat: coordinates[index][1] });
    const osm: OsmDocument = { elements: [0, 1, 2, 3, 4].map(node).concat() };
    osm.elements.push(
      { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'primary', name: 'Main Road' } },
      { type: 'way', id: 11, nodes: [2, 4, 5, 3], tags: { highway: 'residential', name: 'Public Local Street' } },
      { type: 'way', id: 12, nodes: [2, 3], tags: { highway: 'residential', name: 'Private Shortcut', access: 'private' } },
    );
    const imported = buildGraph(osm, [72.99, 33.67, 73.03, 33.70]), closure = event({ startsAt: '2027-01-15T10:00:00Z' });
    const result = new LocalRouter(imported).plan(request(), [closure], 1);
    expect(imported.edges.some(edge => edge.name === 'Private Shortcut')).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.options[0].kind).toBe('detour');
    expect(result.options[0].steps.some(step => step.roadName === 'Public Local Street')).toBe(true);
    expect(booleanIntersects(result.options[0].geometry, closure.geometry)).toBe(false);
  });
});
