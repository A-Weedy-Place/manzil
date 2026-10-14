import { describe, expect, it, vi } from 'vitest';
import booleanIntersects from '@turf/boolean-intersects';
import { lineString, polygon } from '@turf/helpers';
import type { Closure, Coordinate, PlanRequest, RouteOption } from '../shared/types';
import { LocalRouter } from '../server/routing/engine';
import { distanceMeters, type RoutingGraph } from '../server/routing/graph';

const departureAt = '2027-01-15T11:00:00.000Z';
function corridors(separation = .005): RoutingGraph {
  const coordinates: Coordinate[] = [[72.996, 33.68], [73.024, 33.68], [73, 33.68], [73.02, 33.68], [73.01, 33.68], [73, 33.68 + separation], [73.02, 33.68 + separation], [73, 33.68 - separation], [73.02, 33.68 - separation]];
  const roads: [number, number, string][] = [[0, 2, 'Access Road'], [3, 1, 'Exit Road'], [2, 4, 'Central Road'], [4, 3, 'Central Road'], [2, 5, 'North Road'], [5, 6, 'North Road'], [6, 3, 'North Road'], [2, 7, 'South Road'], [7, 8, 'South Road'], [8, 3, 'South Road']];
  return {
    version: 'unit-three-corridors', importedAt: departureAt, sourceTimestamp: null, bounds: [72.99, 33.67, 73.03, 33.70], attribution: 'Isolated unit-test fixture', source: 'test',
    nodes: coordinates.map((coordinate, i) => ({ id: String(i), coordinate })),
    edges: roads.flatMap(([from, to, name]) => {
      const distance = distanceMeters(coordinates[from], coordinates[to]);
      const edge = { from, to, wayId: name, name, distance, seconds: distance / 10 };
      return [edge, { ...edge, from: to, to: from }];
    }), restrictions: [], importStats: { sourceWays: roads.length, acceptedWays: roads.length, excludedConditionalWays: 0, unsupportedRestrictions: 0, blockedViaWays: 0 },
  };
}
function request(graph: RoutingGraph): PlanRequest { return { origin: { name: 'Start', coordinate: graph.nodes[0].coordinate }, destination: { name: 'Finish', coordinate: graph.nodes[1].coordinate }, departureAt, compareDepartures: false }; }
function northClosure(): Closure {
  return { id: 'north', title: 'North Road closed', description: 'Test only', reason: 'construction', startsAt: '2027-01-15T10:00:00Z', endsAt: null, status: 'published', revision: 1, createdAt: departureAt, updatedAt: departureAt, geometry: { type: 'Polygon', coordinates: [[[73.009, 33.6848], [73.011, 33.6848], [73.011, 33.6852], [73.009, 33.6852], [73.009, 33.6848]]] } };
}
function sameTime(options: RouteOption[]) { return options.filter((option) => ['direct', 'detour', 'alternative'].includes(option.kind)); }

describe('distinct same-departure alternatives', () => {
  it('returns unavailable rather than an unchecked route when its computation deadline expires', () => {
    const graph = corridors(), router = new LocalRouter(graph);
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(4000);
    try {
      const result = router.plan(request(graph), [], 1);
      expect(result.options).toHaveLength(0);
      expect(result.baseline).toBeNull();
      expect(result.unavailableReason).toMatch(/planning limit/i);
    } finally { clock.mockRestore(); }
  });
  it('offers three connected physical corridors without inflating ETA by search penalties', () => {
    const graph = corridors(), result = new LocalRouter(graph).plan(request(graph), [], 1);
    const routes = sameTime(result.options);
    expect(routes).toHaveLength(3);
    expect(routes.map((route) => route.kind)).toEqual(['direct', 'alternative', 'alternative']);
    expect(new Set(routes.map((route) => route.id)).size).toBe(3);
    expect(new Set(routes.map((route) => JSON.stringify(route.geometry))).size).toBe(3);
    expect(routes.some((route) => route.steps.some((step) => step.roadName === 'North Road'))).toBe(true);
    expect(routes.some((route) => route.steps.some((step) => step.roadName === 'South Road'))).toBe(true);
    for (const route of routes) {
      expect(route.departureAt).toBe(departureAt);
      // Every road has the original 10 m/s speed; two road transitions add 6 s. Shared access edges are penalized only for searching.
      expect(route.durationSeconds).toBeCloseTo(route.distanceMeters / 10 + 6, 6);
      expect(route.steps.reduce((sum, step) => sum + step.durationSeconds, 0)).toBeCloseTo(route.durationSeconds, 6);
      expect((Date.parse(route.arrivalAt) - Date.parse(route.departureAt)) / 1000).toBeCloseTo(route.durationSeconds, 2);
      for (let i = 1; i < route.geometry.coordinates.length; i++) {
        const a = route.geometry.coordinates[i - 1], b = route.geometry.coordinates[i];
        expect(graph.edges.some((edge) => graph.nodes[edge.from].coordinate[0] === a[0] && graph.nodes[edge.from].coordinate[1] === a[1] && graph.nodes[edge.to].coordinate[0] === b[0] && graph.nodes[edge.to].coordinate[1] === b[1])).toBe(true);
      }
    }
  });
  it('validates closures on alternative corridors even when the baseline is unaffected', () => {
    const graph = corridors(), closure = northClosure();
    const result = new LocalRouter(graph).plan(request(graph), [closure], 1);
    expect(result.conflicts).toHaveLength(0);
    const routes = sameTime(result.options);
    expect(routes).toHaveLength(2);
    for (const route of routes) expect(booleanIntersects(lineString(route.geometry.coordinates), polygon(closure.geometry.coordinates))).toBe(false);
    expect(routes.some((route) => route.steps.some((step) => step.roadName === 'South Road'))).toBe(true);
  });
  it('does not count nearby parallel carriageways as separate route choices', () => {
    const graph = corridors(.00015);
    expect(sameTime(new LocalRouter(graph).plan(request(graph), [], 1).options)).toHaveLength(1);
  });
  it('does not use a one-way road backwards to manufacture an additional route', () => {
    const graph = corridors();
    graph.edges = graph.edges.filter((edge) => !(edge.from === 5 && edge.to === 6));
    const result = new LocalRouter(graph).plan(request(graph), [], 1);
    expect(sameTime(result.options)).toHaveLength(2);
    expect(result.options.every((route) => !route.steps.some((step) => step.roadName === 'North Road'))).toBe(true);
  });
  it('does not offer an alternative using an explicitly prohibited turn', () => {
    const graph = corridors();
    graph.restrictions.push({ via: 2, fromWay: 'Access Road', toWay: 'North Road', only: false, uTurn: false });
    const result = new LocalRouter(graph).plan(request(graph), [], 1);
    expect(sameTime(result.options)).toHaveLength(2);
    expect(result.options.every((route) => !route.steps.some((step) => step.roadName === 'North Road'))).toBe(true);
  });
});
