import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Polygon } from 'geojson';
import { activeClosureRoads, closureEdgeFractions } from '../server/routing/closure-segments';
import type { RoutingGraph } from '../server/routing/graph';
import type { Closure, Coordinate } from '../shared/types';

afterEach(() => vi.restoreAllMocks());
const at = '2027-01-15T11:00:00.000Z';
function graph(offset = 0): RoutingGraph {
  return {
    version: 'same-version-for-every-fixture', source: 'Synthetic cache test only', importedAt: at, sourceTimestamp: null,
    bounds: [-1, -1, 11, 21], attribution: 'Test only',
    nodes: [[0, offset], [10, offset]].map((coordinate, i) => ({ id: String(i), coordinate: coordinate as Coordinate })),
    edges: [{ from: 0, to: 1, wayId: '1', name: 'Test road', distance: 1000, seconds: 60 },
      { from: 1, to: 0, wayId: '1', name: 'Test road', distance: 1000, seconds: 60 }],
    restrictions: [], importStats: { sourceWays: 1, acceptedWays: 1, excludedConditionalWays: 0, unsupportedRestrictions: 0, blockedViaWays: 0 },
  };
}
const rectangle = (left = 4, right = 6): Polygon => ({ type: 'Polygon', coordinates: [[[left, -1], [right, -1], [right, 1], [left, 1], [left, -1]]] });
const closure = (geometry: Polygon): Closure => ({ id: 'same-id', revision: 1, title: 'Synthetic cache test', description: '',
  geometry, reason: 'other', status: 'published', startsAt: at, endsAt: null, createdAt: at, updatedAt: at });

describe('bounded, content-keyed closure geometry cache', () => {
  it('reuses geometry content across cloned inputs and routing/display callers without rescanning the graph', () => {
    const roads = graph(), scan = vi.spyOn(roads.edges, 'forEach');
    const first = closureEdgeFractions(roads, rectangle());
    expect(scan).toHaveBeenCalledTimes(1);
    const second = closureEdgeFractions(roads, structuredClone(rectangle()));
    expect(second).toEqual(first); expect(second).not.toBe(first);
    expect(activeClosureRoads(roads, [closure(rectangle())], at).features).toHaveLength(1);
    expect(scan).toHaveBeenCalledTimes(1);
  });
  it('invalidates unsaved coordinate edits on the same polygon object and retains exact direction-dependent fractions', () => {
    const roads = graph(), geometry = rectangle();
    expect(closureEdgeFractions(roads, geometry).get(0)).toEqual([[.4, .6]]);
    geometry.coordinates = rectangle(1, 2).coordinates;
    const edited = closureEdgeFractions(roads, geometry);
    expect(edited.get(0)).toEqual([[.1, .2]]); expect(edited.get(1)).toEqual([[.8, .9]]);
    geometry.coordinates = rectangle().coordinates;
    expect(closureEdgeFractions(roads, geometry).get(0)).toEqual([[.4, .6]]);
  });
  it('includes holes in the cache key and retains disjoint traversal intervals', () => {
    const roads = graph(), geometry = rectangle(-1, 11);
    expect(closureEdgeFractions(roads, geometry).get(0)).toEqual([[0, 1]]);
    geometry.coordinates.push([[3, -.5], [7, -.5], [7, .5], [3, .5], [3, -.5]]);
    expect(closureEdgeFractions(roads, geometry).get(0)).toEqual([[0, .3], [.7, 1]]);
    geometry.coordinates = [rectangle(-1, 11).coordinates[0], [[-1, -.5], [11, -.5], [11, .5], [-1, .5], [-1, -.5]]];
    expect(closureEdgeFractions(roads, geometry).size).toBe(0);
  });
  it('isolates separate graph snapshots even when their version strings match', () => {
    expect(closureEdgeFractions(graph(), rectangle()).size).toBe(2);
    expect(closureEdgeFractions(graph(10), rectangle()).size).toBe(0);
  });
  it('does not expose cached maps, interval arrays or tuples to caller mutations', () => {
    const roads = graph(), geometry = rectangle();
    const first = closureEdgeFractions(roads, geometry);
    first.get(0)![0][0] = .99; first.get(1)!.push([0, 1]); first.set(100, [[0, 1]]);
    const second = closureEdgeFractions(roads, geometry);
    expect([...second]).toEqual([[0, [[.4, .6]]], [1, [[.4, .6]]]]);
    second.get(0)!.splice(0); second.clear();
    expect(closureEdgeFractions(roads, geometry).size).toBe(2);
    expect(closureEdgeFractions(roads, geometry).get(0)).toEqual([[.4, .6]]);
  });
  it('keeps published, cancelled and reopening state outside the geometry cache', () => {
    const roads = graph(), event = closure(rectangle());
    expect(activeClosureRoads(roads, [event], at).features).toHaveLength(1);
    expect(activeClosureRoads(roads, [{ ...event, status: 'cancelled' }], at).features).toHaveLength(0);
    expect(activeClosureRoads(roads, [{ ...event, endsAt: at }], at).features).toHaveLength(0);
    expect(activeClosureRoads(roads, [{ ...event, startsAt: '2027-01-15T12:00:00.000Z' }], at).features).toHaveLength(0);
    expect(activeClosureRoads(roads, [event], at).features).toHaveLength(1);
  });
  it('retains conservative boundary contact behavior', () => {
    const roads = graph(), geometry: Polygon = { type: 'Polygon', coordinates: [[[4, 0], [6, 0], [6, 1], [4, 1], [4, 0]]] };
    expect(closureEdgeFractions(roads, geometry).size).toBe(2);
    expect(closureEdgeFractions(roads, geometry)).toEqual(closureEdgeFractions(roads, structuredClone(geometry)));
  });
  it('enforces deadlines for fresh computations and cached hits without poisoning subsequent results', () => {
    const roads = graph(), geometry = rectangle(), now = vi.spyOn(performance, 'now').mockReturnValue(100);
    expect(() => closureEdgeFractions(roads, geometry, 99)).toThrow('planning time limit');
    expect(closureEdgeFractions(roads, geometry, 101).size).toBe(2);
    now.mockReturnValue(102);
    expect(() => closureEdgeFractions(roads, geometry, 101)).toThrow('planning time limit');
    expect(closureEdgeFractions(roads, geometry, 103).size).toBe(2);
  });
  it('does not publish partially computed entries after a deadline expires during scanning', () => {
    const roads = graph(), geometry = rectangle(), now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(2);
    expect(() => closureEdgeFractions(roads, geometry, 1)).toThrow('planning time limit');
    now.mockReturnValue(0);
    expect(closureEdgeFractions(roads, geometry, 1).size).toBe(2);
  });
  it('evicts old geometry content when the bounded entry budget is reached', () => {
    const roads = graph(), scan = vi.spyOn(roads.edges, 'forEach');
    closureEdgeFractions(roads, rectangle());
    for (let i = 0; i < 64; i++) closureEdgeFractions(roads, rectangle(20 + i, 20.5 + i));
    expect(scan).toHaveBeenCalledTimes(65);
    expect(closureEdgeFractions(roads, rectangle()).size).toBe(2);
    expect(scan).toHaveBeenCalledTimes(66);
  });
});
