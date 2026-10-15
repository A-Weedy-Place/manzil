import booleanIntersects from '@turf/boolean-intersects';
import { lineString, polygon } from '@turf/helpers';
import type { FeatureCollection, LineString, Polygon } from 'geojson';
import type { Closure, Coordinate } from '../../shared/types';
import type { RoutingGraph } from './graph';

type Fractions = Map<number, [number, number][]>;
interface GeometryCache { values: Map<string, Fractions>; edgeCount: number }
// Graph objects are immutable imported snapshots. Weak keys let replaced snapshots be
// collected; both entry and edge budgets bound cache memory even for broad polygons.
const geometryCaches = new WeakMap<RoutingGraph, GeometryCache>();
const MAX_CACHED_GEOMETRIES = 64;
const MAX_CACHED_EDGES = 50_000;
const MAX_SINGLE_GEOMETRY_EDGES = 10_000;
const MAX_CACHE_KEY_LENGTH = 128_000;
function checkDeadline(deadline: number): void {
  if (performance.now() > deadline) throw new Error('Closure validation exceeded the planning time limit. Try fewer restrictions or a smaller area.');
}
function cloneFractions(values: Fractions, deadline: number): Fractions {
  const copy: Fractions = new Map();
  let visited = 0;
  for (const [edge, intervals] of values) {
    if (visited++ % 1024 === 0) checkDeadline(deadline);
    copy.set(edge, intervals.map(([a, b]) => [a, b]));
  }
  checkDeadline(deadline);
  return copy;
}

function insideRing(p: Coordinate, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function intervalsInside(a: Coordinate, b: Coordinate, rings: number[][][]): [number, number][] {
  const cuts = [0, 1], dx = b[0] - a[0], dy = b[1] - a[1];
  for (const ring of rings) for (let i = 1; i < ring.length; i++) {
    const c = ring[i - 1], d = ring[i], ex = d[0] - c[0], ey = d[1] - c[1];
    const cross = dx * ey - dy * ex;
    if (Math.abs(cross) < 1e-17) continue;
    const qx = c[0] - a[0], qy = c[1] - a[1];
    const t = (qx * ey - qy * ex) / cross, u = (qx * dy - qy * dx) / cross;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  const intervals: [number, number][] = [];
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i] - cuts[i - 1] < 1e-10) continue;
    const m = (cuts[i] + cuts[i - 1]) / 2;
    const point: Coordinate = [a[0] + dx * m, a[1] + dy * m];
    if (insideRing(point, rings[0]) && !rings.slice(1).some((ring) => insideRing(point, ring))) intervals.push([cuts[i - 1], cuts[i]]);
  }
  // Turf already established intersection: uncertain boundary contact is conservative.
  return intervals.length ? intervals : [[0, 1]];
}

/** Shared by routing validation and the red-road display; fractions retain traversal timing. */
export function closureEdgeFractions(graph: RoutingGraph, geometry: Polygon, deadline = Infinity): Fractions {
  checkDeadline(deadline);
  // Geometry content includes every ring/coordinate. IDs/revisions alone would reuse
  // stale results for unsaved edits, imports or a mutable caller's polygon object.
  const key = JSON.stringify(geometry.coordinates);
  checkDeadline(deadline);
  let cache = geometryCaches.get(graph);
  const cached = cache?.values.get(key);
  if (cached) {
    const copy = cloneFractions(cached, deadline);
    cache!.values.delete(key); cache!.values.set(key, cached);
    return copy;
  }
  const points = geometry.coordinates.flat();
  const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  const fractions = new Map<number, [number, number][]>(), shape = polygon(geometry.coordinates);
  graph.edges.forEach((edge, index) => {
    if (index % 1024 === 0) checkDeadline(deadline);
    const a = graph.nodes[edge.from].coordinate, b = graph.nodes[edge.to].coordinate;
    if (Math.max(a[0], b[0]) < bounds[0] || Math.min(a[0], b[0]) > bounds[2] || Math.max(a[1], b[1]) < bounds[1] || Math.min(a[1], b[1]) > bounds[3]) return;
    if (booleanIntersects(lineString([a, b]), shape)) fractions.set(index, intervalsInside(a, b, geometry.coordinates));
  });
  checkDeadline(deadline);
  if (key.length <= MAX_CACHE_KEY_LENGTH && fractions.size <= MAX_SINGLE_GEOMETRY_EDGES) {
    if (!cache) { cache = { values: new Map(), edgeCount: 0 }; geometryCaches.set(graph, cache); }
    const snapshot = cloneFractions(fractions, deadline);
    while (cache.values.size >= MAX_CACHED_GEOMETRIES || cache.edgeCount + snapshot.size > MAX_CACHED_EDGES) {
      const oldest = cache.values.keys().next().value!;
      cache.edgeCount -= cache.values.get(oldest)!.size; cache.values.delete(oldest);
    }
    cache.values.set(key, snapshot); cache.edgeCount += snapshot.size;
  }
  return fractions;
}

export type ClosureRoadProperties = { closureId: string; title: string };
export function activeClosureRoads(graph: RoutingGraph, closures: Closure[], at: string): FeatureCollection<LineString, ClosureRoadProperties> {
  const instant = Date.parse(at), features: FeatureCollection<LineString, ClosureRoadProperties>['features'] = [];
  for (const closure of closures) {
    if (closure.status !== 'published' || Date.parse(closure.startsAt) > instant || (closure.endsAt !== null && Date.parse(closure.endsAt) <= instant)) continue;
    const seen = new Set<string>();
    for (const index of closureEdgeFractions(graph, closure.geometry).keys()) {
      const edge = graph.edges[index], key = [edge.from, edge.to].sort((a, b) => a - b).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      features.push({ type: 'Feature', properties: { closureId: closure.id, title: closure.title }, geometry: { type: 'LineString', coordinates: [graph.nodes[edge.from].coordinate, graph.nodes[edge.to].coordinate] } });
    }
  }
  return { type: 'FeatureCollection', features };
}
