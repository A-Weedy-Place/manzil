import { describe, expect, it, vi } from 'vitest';
import type { Closure, Coordinate, PlanRequest } from '../shared/types';
import { LocalRouter } from '../server/routing/engine';
import { buildGraph, type OsmDocument, type RoutingGraph } from '../server/routing/graph';

const coordinates: Coordinate[] = [[73, 33.68], [73.01, 33.68], [73, 33.69], [73.01, 33.69]];
function square(): RoutingGraph {
  const pairs = [[0, 1, 60], [0, 2, 90], [2, 3, 90], [3, 1, 90]];
  return {
    version: 'test-square', importedAt: '2027-01-01T00:00:00Z', sourceTimestamp: null,
    bounds: [72.99, 33.67, 73.02, 33.70], attribution: 'Unit-test fixture, not map data', source: 'test',
    nodes: coordinates.map((coordinate, i) => ({ id: String(i), coordinate })),
    edges: pairs.flatMap(([from, to, seconds], i) => [{ from, to, seconds, distance: seconds * 10, wayId: String(i), name: `Road ${i}` }, { from: to, to: from, seconds, distance: seconds * 10, wayId: String(i), name: `Road ${i}` }]),
    restrictions: [], importStats: { sourceWays: 4, acceptedWays: 4, excludedConditionalWays: 0, unsupportedRestrictions: 0, blockedViaWays: 0 },
  };
}
const departure = '2027-01-15T11:00:00.000Z';
function request(from = 0, to = 1): PlanRequest { return { origin: { name: 'A', coordinate: coordinates[from] }, destination: { name: 'B', coordinate: coordinates[to] }, departureAt: departure }; }
function closure(overrides: Partial<Closure> = {}): Closure {
  return { id: 'closed', title: 'Middle of Road 0', description: '', reason: 'construction', startsAt: '2027-01-15T10:00:00Z', endsAt: '2027-01-15T12:00:00Z', status: 'published', geometry: { type: 'Polygon', coordinates: [[[73.004, 33.6798], [73.006, 33.6798], [73.006, 33.6802], [73.004, 33.6802], [73.004, 33.6798]]] }, revision: 1, createdAt: departure, updatedAt: departure, ...overrides };
}

describe('connected temporal car routing', () => {
  it('generates an actual connected detour and preserves the blocked baseline as evidence', () => {
    const result = new LocalRouter(square()).plan(request(), [closure()], 4);
    expect(result.baseline?.durationSeconds).toBe(60);
    expect(result.conflicts).toHaveLength(1);
    expect(result.options[0].kind).toBe('detour');
    expect(result.options[0].geometry.coordinates).toEqual([coordinates[0], coordinates[2], coordinates[3], coordinates[1]]);
    expect(result.eventRevision).toBe(4);
  });
  it('detects a closure beginning after departure but before traversal', () => {
    const result = new LocalRouter(square()).plan(request(), [closure({ startsAt: '2027-01-15T11:00:20Z' })], 1);
    expect(result.conflicts[0].entryAt).toBe('2027-01-15T11:00:24.000Z');
    expect(result.conflicts[0].exitAt).toBe('2027-01-15T11:00:36.000Z');
    expect(result.options[0].kind).toBe('detour');
  });
  it('uses half-open closure windows with the disclosed 30-second margin', () => {
    const router = new LocalRouter(square());
    // Route clears the polygon at 36s; +30s uncertainty touches, but does not overlap, start at 66s.
    expect(router.plan(request(), [closure({ startsAt: '2027-01-15T11:01:06Z' })], 1).conflicts).toHaveLength(0);
    expect(router.plan(request(), [closure({ startsAt: '2027-01-15T11:01:05Z' })], 1).conflicts).toHaveLength(1);
  });
  it('keeps unknown-end closures blocked and ignores drafts/cancellations', () => {
    const router = new LocalRouter(square());
    expect(router.plan(request(), [closure({ endsAt: null })], 1).options[0].kind).toBe('detour');
    expect(router.plan(request(), [closure({ status: 'draft' }), closure({ id: 'cancelled', status: 'cancelled' })], 1).options[0].kind).toBe('direct');
  });
  it('does not avoid a future closure that starts well after the trip has cleared', () => {
    const result = new LocalRouter(square()).plan(request(), [closure({ startsAt: '2027-01-15T11:30:00Z' })], 1);
    expect(result.options[0].kind).toBe('direct');
  });
  it('returns unavailable rather than a clear blocked baseline when every exit is closed', () => {
    const blocked = closure({ geometry: { type: 'Polygon', coordinates: [[[72.999, 33.679], [73.001, 33.679], [73.001, 33.681], [72.999, 33.681], [72.999, 33.679]]] } });
    const result = new LocalRouter(square()).plan(request(), [blocked], 1);
    expect(result.options).toHaveLength(0);
    expect(result.baseline).not.toBeNull();
    expect(result.unavailableReason).toMatch(/No verified alternative/);
  });
  it('offers a departure change that is independently checked against its traversal time', () => {
    const result = new LocalRouter(square()).plan({ ...request(), compareDepartures: true }, [closure({ startsAt: '2027-01-15T10:59:00Z', endsAt: '2027-01-15T11:05:00Z' })], 1);
    const earlier = result.options.find((o) => o.kind === 'leave_earlier');
    const later = result.options.find((o) => o.kind === 'leave_later');
    expect(earlier?.durationSeconds).toBe(60);
    expect(later?.durationSeconds).toBe(60);
    expect(earlier?.departureAt).toBe('2027-01-15T10:50:00.000Z');
    expect(later?.departureAt).toBe('2027-01-15T11:10:00.000Z');
  });
  it('never recommends leaving in the past for a current trip, while permitting future earlier departures', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(departure));
    try {
      const router = new LocalRouter(square());
      const nowResult = router.plan({ ...request(), compareDepartures: true }, [closure({ startsAt: '2027-01-15T10:59:00Z', endsAt: '2027-01-15T11:05:00Z' })], 1);
      expect(nowResult.options.some((option) => option.kind === 'leave_earlier')).toBe(false);
      expect(nowResult.options.every((option) => Date.parse(option.departureAt) >= Date.now())).toBe(true);
      const futureResult = router.plan({ ...request(), departureAt: '2027-01-15T11:30:00Z', compareDepartures: true }, [closure({ startsAt: '2027-01-15T11:29:00Z', endsAt: '2027-01-15T11:35:00Z' })], 1);
      expect(futureResult.options.some((option) => option.kind === 'leave_earlier')).toBe(true);
      expect(futureResult.options.every((option) => Date.parse(option.departureAt) >= Date.now())).toBe(true);
    } finally { clock.mockRestore(); }
  });
  it('enforces directed edges and actual node turn restrictions', () => {
    const oneWay = square(); oneWay.edges = [oneWay.edges[0]];
    expect(new LocalRouter(oneWay).plan(request(1, 0), [], 1).options).toHaveLength(0);
    const turns = square();
    turns.restrictions = [{ via: 1, fromWay: '0', toWay: '3', only: false, uTurn: false }];
    const result = new LocalRouter(turns).plan(request(0, 3), [], 1);
    expect(result.options[0].geometry.coordinates).toEqual([coordinates[0], coordinates[2], coordinates[3]]);
  });
  it('rejects distant endpoints rather than drawing a straight-line fake route', () => {
    const result = new LocalRouter(square()).plan({ ...request(), origin: { name: 'Far', coordinate: [73.005, 33.685] } }, [], 1);
    expect(result.options).toHaveLength(0);
    expect(result.baseline).toBeNull();
    expect(result.unavailableReason).toMatch(/within 220 metres/);
  });
  it('does not silently treat malformed published closure schedules as clear', () => {
    const result = new LocalRouter(square()).plan(request(), [closure({ endsAt: 'not-a-date' })], 1);
    expect(result.options).toHaveLength(0);
    expect(result.unavailableReason).toMatch(/invalid time window/);
  });
});

describe('OSM car topology import', () => {
  const node = (id: number, lon: number, lat: number, tags = {}) => ({ type: 'node' as const, id, lon, lat, tags });
  it('preserves one-way direction and excludes explicit private/non-motor roads', () => {
    const osm: OsmDocument = { elements: [node(1, 73, 33.68), node(2, 73.01, 33.68), node(3, 73.02, 33.68), node(4, 73, 33.69),
      { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'primary', oneway: '-1' } },
      { type: 'way', id: 11, nodes: [2, 3], tags: { highway: 'residential', access: 'private' } },
      { type: 'way', id: 12, nodes: [1, 4], tags: { highway: 'footway' } },
      { type: 'way', id: 13, nodes: [2, 3], tags: { highway: 'primary', oneway: 'reversible' } },
    ] };
    const graph = buildGraph(osm);
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes[graph.edges[0].from].id).toBe('2');
    expect(graph.nodes[graph.edges[0].to].id).toBe('1');
  });
  it('does not connect roads merely because they cross at different grades', () => {
    const osm: OsmDocument = { elements: [node(1, 73, 33.68), node(2, 73.01, 33.69), node(3, 73, 33.69), node(4, 73.01, 33.68),
      { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'primary', bridge: 'yes', layer: '1' } },
      { type: 'way', id: 11, nodes: [3, 4], tags: { highway: 'primary' } },
    ] };
    const graph = buildGraph(osm);
    expect(graph.nodes).toHaveLength(4);
    expect(new LocalRouter({ ...graph, bounds: square().bounds }).plan({ ...request(), destination: { name: 'Other road', coordinate: [73, 33.69] } }, [], 1).options).toHaveLength(0);
  });
  it('excludes conditional-access ways and unsupported via-way turn sequences conservatively', () => {
    const osm: OsmDocument = { elements: [node(1, 73, 33.68), node(2, 73.01, 33.68), node(3, 73.02, 33.68),
      { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'primary', 'access:conditional': 'no @ (Mo-Fr)' } },
      { type: 'way', id: 11, nodes: [2, 3], tags: { highway: 'primary' } },
      { type: 'relation', id: 20, tags: { type: 'restriction', restriction: 'no_left_turn' }, members: [{ type: 'way', ref: 10, role: 'from' }, { type: 'way', ref: 11, role: 'via' }, { type: 'way', ref: 12, role: 'to' }] },
    ] };
    const graph = buildGraph(osm);
    expect(graph.edges).toHaveLength(0);
    expect(graph.importStats.excludedConditionalWays).toBe(1);
    expect(graph.importStats.blockedViaWays).toBe(1);
  });
});
