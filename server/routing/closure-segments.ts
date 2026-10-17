import booleanIntersects from '@turf/boolean-intersects';
import { lineString, polygon } from '@turf/helpers';
import type { FeatureCollection, LineString, Polygon } from 'geojson';
import type { Closure, Coordinate } from '../../shared/types';
import type { RoutingGraph } from './graph';

type Fractions = Map<number, [number, number][]>;
interface GeometryFractions { routing: Fractions; display: Fractions }
interface GeometryCache { values: Map<string, GeometryFractions>; edgeCount: number }
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
  return intervals;
}

function pointOnRing(point: Coordinate, ring: number[][]): boolean {
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const qx = point[0] - a[0], qy = point[1] - a[1], length = dx * dx + dy * dy;
    if (!length) continue;
    const cross = qx * dy - qy * dx, projection = (qx * dx + qy * dy) / length;
    if (Math.abs(cross) <= 1e-12 * Math.sqrt((qx * qx + qy * qy) * length) + 1e-24 && projection >= -1e-12 && projection <= 1 + 1e-12) return true;
  }
  return false;
}

/** Exact positive-length display clips, including partial collinear boundary segments.
 * A tangent point is not a road section; it must never colour a complete edge red.
 * Routing retains its conservative contact fallback separately below.
 */
function displayIntervals(a: Coordinate, b: Coordinate, rings: number[][][]): [number, number][] {
  const cuts = [0, 1], dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  if (!length) return [];
  const cut = (t: number) => { if (t >= -1e-12 && t <= 1 + 1e-12) cuts.push(Math.max(0, Math.min(1, t))); };
  for (const ring of rings) for (let i = 1; i < ring.length; i++) {
    const c = ring[i - 1], d = ring[i], ex = d[0] - c[0], ey = d[1] - c[1];
    const cross = dx * ey - dy * ex, qx = c[0] - a[0], qy = c[1] - a[1];
    const tolerance = 1e-12 * Math.sqrt(length * (ex * ex + ey * ey)) + 1e-24;
    if (Math.abs(cross) <= tolerance) {
      if (Math.abs(qx * dy - qy * dx) <= 1e-12 * Math.sqrt(length * (qx * qx + qy * qy)) + 1e-24) {
        cut((qx * dx + qy * dy) / length);
        cut(((d[0] - a[0]) * dx + (d[1] - a[1]) * dy) / length);
      }
      continue;
    }
    const t = (qx * ey - qy * ex) / cross, u = (qx * dy - qy * dx) / cross;
    if (u >= -1e-12 && u <= 1 + 1e-12) cut(t);
  }
  cuts.sort((x, y) => x - y);
  const intervals: [number, number][] = [];
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1], end = cuts[i];
    if (end - start < 1e-10) continue;
    const middle = (start + end) / 2, point: Coordinate = [a[0] + dx * middle, a[1] + dy * middle];
    const onBoundary = rings.some(ring => pointOnRing(point, ring));
    if (onBoundary || (insideRing(point, rings[0]) && !rings.slice(1).some(ring => insideRing(point, ring)))) intervals.push([start, end]);
  }
  return intervals;
}

/** Geometric intervals only: useful for private observed traces without making a routable graph. */
export function closureSegmentFractions(a: Coordinate, b: Coordinate, geometry: Polygon): [number, number][] {
  return displayIntervals(a, b, geometry.coordinates);
}

function geometryFractions(graph: RoutingGraph, geometry: Polygon, deadline = Infinity): GeometryFractions {
  checkDeadline(deadline);
  // Geometry content includes every ring/coordinate. IDs/revisions alone would reuse
  // stale results for unsaved edits, imports or a mutable caller's polygon object.
  const key = JSON.stringify(geometry.coordinates);
  checkDeadline(deadline);
  let cache = geometryCaches.get(graph);
  const cached = cache?.values.get(key);
  if (cached) {
    cache!.values.delete(key); cache!.values.set(key, cached);
    checkDeadline(deadline);
    return cached;
  }
  const points = geometry.coordinates.flat();
  const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  const routing: Fractions = new Map(), display: Fractions = new Map(), shape = polygon(geometry.coordinates);
  graph.edges.forEach((edge, index) => {
    if (index % 1024 === 0) checkDeadline(deadline);
    const a = graph.nodes[edge.from].coordinate, b = graph.nodes[edge.to].coordinate;
    if (Math.max(a[0], b[0]) < bounds[0] || Math.min(a[0], b[0]) > bounds[2] || Math.max(a[1], b[1]) < bounds[1] || Math.min(a[1], b[1]) > bounds[3]) return;
    if (booleanIntersects(lineString([a, b]), shape)) {
      const intervals = intervalsInside(a, b, geometry.coordinates);
      // Turf established contact. Keep uncertain boundary contacts conservative for
      // routing, without exaggerating their painted footprint on the map.
      routing.set(index, intervals.length ? intervals : [[0, 1]]);
      const clips = displayIntervals(a, b, geometry.coordinates);
      if (clips.length) display.set(index, clips);
    }
  });
  checkDeadline(deadline);
  const result: GeometryFractions = { routing, display }, edgeCount = routing.size + display.size;
  if (key.length <= MAX_CACHE_KEY_LENGTH && routing.size <= MAX_SINGLE_GEOMETRY_EDGES) {
    if (!cache) { cache = { values: new Map(), edgeCount: 0 }; geometryCaches.set(graph, cache); }
    while (cache.values.size >= MAX_CACHED_GEOMETRIES || cache.edgeCount + edgeCount > MAX_CACHED_EDGES) {
      const oldest = cache.values.keys().next().value!;
      const removed = cache.values.get(oldest)!;
      cache.edgeCount -= removed.routing.size + removed.display.size; cache.values.delete(oldest);
    }
    cache.values.set(key, result); cache.edgeCount += edgeCount;
  }
  return result;
}

/** Routing fractions retain traversal timing and conservative boundary contacts. */
export function closureEdgeFractions(graph: RoutingGraph, geometry: Polygon, deadline = Infinity): Fractions {
  return cloneFractions(geometryFractions(graph, geometry, deadline).routing, deadline);
}

export type ClosureRoadProperties = { closureId: string; title: string };
export function activeClosureRoads(graph: RoutingGraph, closures: Closure[], at: string): FeatureCollection<LineString, ClosureRoadProperties> {
  const instant = Date.parse(at), features: FeatureCollection<LineString, ClosureRoadProperties>['features'] = [];
  for (const closure of closures) {
    if (closure.status !== 'published' || Date.parse(closure.startsAt) > instant || (closure.endsAt !== null && Date.parse(closure.endsAt) <= instant)) continue;
    const seen = new Set<string>();
    for (const [index, intervals] of geometryFractions(graph, closure.geometry).display) {
      const edge = graph.edges[index], key = [edge.from, edge.to].sort((a, b) => a - b).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      const a = graph.nodes[edge.from].coordinate, b = graph.nodes[edge.to].coordinate;
      const coordinateAt = (fraction: number): Coordinate => [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
      for (const [start, end] of intervals) features.push({ type: 'Feature', properties: { closureId: closure.id, title: closure.title }, geometry: { type: 'LineString', coordinates: [coordinateAt(start), coordinateAt(end)] } });
    }
  }
  return { type: 'FeatureCollection', features };
}
