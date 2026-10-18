import { describe, expect, it } from 'vitest';
import type { Closure, Coordinate, Drawing, PlanRequest, PlanResponse, RestrictionType } from '../shared/types';
import { drawingToPolygon } from '../server/geometry';
import { LocalRouter } from '../server/routing/engine';
import { buildGraph, type OsmDocument, type RoutingGraph } from '../server/routing/graph';
import { selectRoadBlockade, selectRoadSection } from '../server/routing/road-selection';
import { activeClosureRoads, closureEdgeFractions } from '../server/routing/closure-segments';
import { Store } from '../server/store';

const at = '2027-01-15T11:00:00.000Z';
const points: Record<string, Coordinate> = {
  A: [73, 33.7], B: [73.001, 33.7], Entry: [73.002, 33.7], Exit: [73.003, 33.7], C: [73.004, 33.7], D: [73.005, 33.7],
  UpperA: [73, 33.701], SideEntry: [73.002, 33.701], SideExit: [73.003, 33.701], UpperD: [73.005, 33.701], LongDetour: [73.0025, 33.703],
  BridgeSouth: [73.0025, 33.699], BridgeNorth: [73.0025, 33.701],
};

/** Main road A--B--Entry--Exit--C--D has legal side entries inside B..C.
 * A longer northern road still connects those entries when the whole interval is closed.
 * This graph represents connected carriageways; it does not invent individual lanes. */
function fixture(withSeparateCrossing = false): RoutingGraph {
  const names = Object.keys(points), ids = new Map(names.map((name, index) => [name, index + 1]));
  const way = (id: number, route: string[], name: string, extra: Record<string, string> = {}): OsmDocument['elements'][number] => ({ type: 'way', id, nodes: route.map(name => ids.get(name)!), tags: { highway: 'residential', name, ...extra } });
  return buildGraph({ elements: [
    ...names.map(name => ({ type: 'node' as const, id: ids.get(name)!, lon: points[name][0], lat: points[name][1] })),
    way(10, ['A', 'B', 'Entry', 'Exit', 'C', 'D'], 'Main Road', { highway: 'primary' }),
    way(11, ['A', 'UpperA', 'SideEntry', 'Entry'], 'Entry Street'),
    way(12, ['Exit', 'SideExit', 'UpperD', 'D'], 'Exit Street'),
    way(13, ['SideEntry', 'LongDetour', 'SideExit'], 'Northern Detour', { maxspeed: '10' }),
    ...(withSeparateCrossing ? [way(14, ['BridgeSouth', 'BridgeNorth'], 'Unconnected Bridge', { bridge: 'yes', layer: '1' })] : []),
  ] }, [72.99, 33.69, 73.02, 33.71]);
}
function request(from: string, to: string): PlanRequest { return { origin: { name: from, coordinate: points[from] }, destination: { name: to, coordinate: points[to] }, departureAt: at }; }
function closure(id: string, drawing: Drawing, restrictionType: RestrictionType, overrides: Partial<Closure> = {}): Closure {
  return { id, revision: 1, createdAt: at, updatedAt: at, title: id, description: '', reason: 'construction', status: 'published', moderation: 'approved', restrictionType,
    startsAt: '2027-01-15T10:00:00.000Z', endsAt: '2027-01-15T12:00:00.000Z', drawing, geometry: drawingToPolygon(drawing), ...overrides };
}
function roadClosure(graph: RoutingGraph): Closure { return closure('whole-B-to-C', selectRoadSection(graph, points.B, points.C).drawing, 'road_closure'); }
function blockade(graph: RoutingGraph, location: 'B' | 'C'): Closure {
  const [longitude, latitude] = points[location];
  return closure(`barrier-${location}`, selectRoadBlockade(graph, [longitude, latitude - .0001], [longitude, latitude + .0001]).drawing, 'blockade');
}
function path(result: PlanResponse): number[][] { expect(result.options.length).toBeGreaterThan(0); expect(result.options[0].validation).toBe('clear'); return result.options[0].geometry.coordinates; }

describe('whole road sections versus short physical blockade routing', () => {
  it('excludes the whole selected road interval, including entry into its middle, while preserving a connected longer detour', () => {
    const graph = fixture(), event = roadClosure(graph), router = new LocalRouter(graph);
    const baseline = router.plan(request('SideEntry', 'SideExit'), [], 0);
    expect(path(baseline)).toEqual([points.SideEntry, points.Entry, points.Exit, points.SideExit]);
    const closed = router.plan(request('SideEntry', 'SideExit'), [event], 1);
    expect(closed.conflicts.map(conflict => conflict.closureId)).toEqual([event.id]);
    expect(path(closed)).toEqual([points.SideEntry, points.LongDetour, points.SideExit]);
    expect(path(closed)).not.toContainEqual(points.Entry); expect(path(closed)).not.toContainEqual(points.Exit);
    expect(event.drawing!.coordinates).toEqual([points.B, points.Entry, points.Exit, points.C]);
  });

  it('blocks crossing the first short barrier but still reaches the open middle through a legal side street', () => {
    const graph = fixture(), barrier = blockade(graph, 'B');
    const result = new LocalRouter(graph).plan(request('A', 'D'), [barrier], 2), route = path(result);
    expect(result.conflicts.map(conflict => conflict.closureId)).toEqual([barrier.id]);
    expect(result.options[0].kind).toBe('detour');
    expect(route).toEqual([points.A, points.UpperA, points.SideEntry, points.Entry, points.Exit, points.C, points.D]);
    expect(route).not.toContainEqual(points.B); expect(route).not.toContainEqual(points.LongDetour);
    expect(barrier.drawing!.widthMeters).toBe(4); expect(barrier.drawing!.coordinates).toHaveLength(2);
  });

  it('retains access to the middle between two separately blocked ends and exits through another side street', () => {
    const graph = fixture(), barriers = [blockade(graph, 'B'), blockade(graph, 'C')], router = new LocalRouter(graph);
    const through = router.plan(request('A', 'D'), barriers, 3), route = path(through);
    expect(new Set(through.conflicts.map(conflict => conflict.closureId))).toEqual(new Set(['barrier-B', 'barrier-C']));
    expect(route).toEqual([points.A, points.UpperA, points.SideEntry, points.Entry, points.Exit, points.SideExit, points.UpperD, points.D]);
    expect(route).not.toContainEqual(points.B); expect(route).not.toContainEqual(points.C); expect(route).not.toContainEqual(points.LongDetour);
    const middle = router.plan(request('SideEntry', 'SideExit'), barriers, 3);
    expect(path(middle)).toEqual([points.SideEntry, points.Entry, points.Exit, points.SideExit]); expect(middle.conflicts).toEqual([]);
    const index = graph.edges.findIndex(edge => graph.nodes[edge.from].coordinate.join(',') === points.Entry.join(',') && graph.nodes[edge.to].coordinate.join(',') === points.Exit.join(','));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(closureEdgeFractions(graph, roadClosure(graph).geometry).has(index)).toBe(true);
    for (const barrier of barriers) expect(closureEdgeFractions(graph, barrier.geometry).has(index)).toBe(false);
    const coating = activeClosureRoads(graph, barriers, at);
    expect(coating.features.length).toBeGreaterThan(0);
    expect(coating.features.every(feature => feature.geometry.coordinates.every(point => Math.abs(point[0] - points.B[0]) < .0001 || Math.abs(point[0] - points.C[0]) < .0001))).toBe(true);
  });

  it.each([['A', 'B'], ['B', 'A'], ['D', 'C'], ['C', 'D']])('never tunnels through a blocked endpoint when planning %s to %s', (from, to) => {
    const graph = fixture(), result = new LocalRouter(graph).plan(request(from, to), [blockade(graph, 'B'), blockade(graph, 'C')], 4);
    expect(result.baseline).not.toBeNull(); expect(result.conflicts.length).toBeGreaterThan(0); expect(result.options).toEqual([]); expect(result.unavailableReason).toMatch(/No verified alternative/);
  });

  it('uses the published moderation snapshot and does not activate an expired or future barrier at the requested time', () => {
    const graph = fixture(), store = new Store(':memory:');
    try {
      const expired = { ...blockade(graph, 'B'), id: 'expired', endsAt: '2027-01-15T10:59:00.000Z' };
      const future = { ...blockade(graph, 'C'), id: 'future', startsAt: '2027-01-15T11:30:00.000Z' };
      const pending = { ...roadClosure(graph), id: 'pending', status: 'draft' as const, moderation: 'pending' as const };
      const unverifiedPublished = { ...roadClosure(graph), id: 'unverified-published', moderation: 'pending' as const };
      for (const event of [expired, future, pending, unverifiedPublished]) store.put('closure', event);
      const snapshot = store.routingSnapshot();
      expect(new Set(snapshot.closures.map(event => event.id))).toEqual(new Set(['expired', 'future']));
      const result = new LocalRouter(graph).plan(request('A', 'D'), snapshot.closures, snapshot.revision);
      expect(path(result)).toEqual([points.A, points.B, points.Entry, points.Exit, points.C, points.D]); expect(result.conflicts).toEqual([]);
      expect(activeClosureRoads(graph, snapshot.closures, at).features).toEqual([]);
      expect(result.upcoming?.map(event => event.closureId)).toEqual(['future']);
    } finally { store.close(); }
  });

  it('does not invent a side entry at a visual crossing without a shared graph node', () => {
    const graph = fixture(true), result = new LocalRouter(graph).plan(request('BridgeSouth', 'Exit'), [blockade(graph, 'B')], 5);
    expect(result.baseline).toBeNull(); expect(result.options).toEqual([]); expect(result.unavailableReason).toMatch(/No connected public car route/);
  });
});
