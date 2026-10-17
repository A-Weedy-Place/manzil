import type { FeatureCollection, LineString, Polygon } from 'geojson';
import type { Closure, Coordinate, RoutePath } from '../../shared/types';
import { closureState } from './format';

export type ClosureRoads = FeatureCollection<LineString, { closureId: string; title: string }>;

/** Planner choices belong to one snapshot; an in-progress guide keeps its original path. */
export function routeMatchesMapSnapshot(routeDepartureAt: string, mapAt: string, inProgress = false): boolean {
  const departure = Date.parse(routeDepartureAt), snapshot = Date.parse(mapAt);
  return Number.isFinite(departure) && Number.isFinite(snapshot) && (inProgress || departure === snapshot);
}

/** Road geometry changes at active-set/revision boundaries, not on every clock tick. */
export function closureRoadKey(closures: Closure[], at: string): string {
  const revisions = closures.filter(closure => closureState(closure, at) === 'active').map(closure => [closure.id, closure.revision]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return `clipped-v2:${JSON.stringify(revisions)}`;
}

export function activeClosurePolygons(closures: Closure[], at: string, selectedId: string | null): FeatureCollection<Polygon> {
  return { type: 'FeatureCollection', features: closures.filter(closure => closureState(closure, at) === 'active').map(closure => ({
    type: 'Feature', geometry: closure.geometry,
    properties: { closureId: closure.id, selected: closure.id === selectedId },
  })) };
}

/** Suppress old and inactive road responses even while a new snapshot is loading. */
export function visibleClosureRoads(response: { key: string; data: ClosureRoads } | null, key: string, closures: Closure[], at: string): ClosureRoads {
  const activeIds = new Set(closures.filter(closure => closureState(closure, at) === 'active').map(closure => closure.id));
  return { type: 'FeatureCollection', features: response?.key === key ? response.data.features.filter(feature => activeIds.has(feature.properties.closureId)) : [] };
}

interface IndexedSegment { a: Coordinate; b: Coordinate }
const CELL = .002;
function cells(a: Coordinate, b: Coordinate): string[] | null {
  const left = Math.floor((Math.min(a[0], b[0]) - .000025) / CELL), right = Math.floor((Math.max(a[0], b[0]) + .000025) / CELL);
  const bottom = Math.floor((Math.min(a[1], b[1]) - .000025) / CELL), top = Math.floor((Math.max(a[1], b[1]) + .000025) / CELL);
  if ((right - left + 1) * (top - bottom + 1) > 256) return null;
  const keys: string[] = [];
  for (let x = left; x <= right; x++) for (let y = bottom; y <= top; y++) keys.push(`${x}:${y}`);
  return keys;
}

/** Only the unavailable route's exclusive geometry is tinted. Shared open roads
 * belong to the blue choices, even when the original route used them too.
 * Collinear overlap clipping also handles provider routes split at other nodes. */
export function exclusiveBaselineSegments(baseline: RoutePath, clear: RoutePath[]): Coordinate[][] {
  const index = new Map<string, IndexedSegment[]>(), long: IndexedSegment[] = [], all: IndexedSegment[] = [];
  for (const route of clear) for (let i = 1; i < route.geometry.coordinates.length; i++) {
    const segment = { a: route.geometry.coordinates[i - 1] as Coordinate, b: route.geometry.coordinates[i] as Coordinate };
    all.push(segment);
    const keys = cells(segment.a, segment.b);
    if (!keys) long.push(segment);
    else for (const key of keys) { const values = index.get(key) ?? []; values.push(segment); index.set(key, values); }
  }
  const result: Coordinate[][] = [];
  let part: Coordinate[] = [];
  const flush = () => { if (part.length > 1) result.push(part); part = []; };
  const coordinates = baseline.geometry.coordinates as Coordinate[];
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1], b = coordinates[i], xScale = 111320 * Math.cos(a[1] * Math.PI / 180), yScale = 111320;
    const dx = (b[0] - a[0]) * xScale, dy = (b[1] - a[1]) * yScale, length2 = dx * dx + dy * dy;
    if (!length2) continue;
    const keys = cells(a, b), near = keys ? new Set([...long, ...keys.flatMap(key => index.get(key) ?? [])]) : all;
    const shared: [number, number][] = [];
    for (const segment of near) {
      const ax = (segment.a[0] - a[0]) * xScale, ay = (segment.a[1] - a[1]) * yScale;
      const bx = (segment.b[0] - a[0]) * xScale, by = (segment.b[1] - a[1]) * yScale;
      // A crossing is not a shared segment. Require both endpoints on its line.
      if (Math.abs(ax * dy - ay * dx) / Math.sqrt(length2) > 1.5 || Math.abs(bx * dy - by * dx) / Math.sqrt(length2) > 1.5) continue;
      const ta = (ax * dx + ay * dy) / length2, tb = (bx * dx + by * dy) / length2;
      const start = Math.max(0, Math.min(ta, tb)), end = Math.min(1, Math.max(ta, tb));
      if (end - start > .000001) shared.push([start, end]);
    }
    shared.sort((x, y) => x[0] - y[0]);
    const ranges: [number, number][] = []; let cursor = 0;
    for (const [start, end] of shared) { if (start > cursor + .000001) ranges.push([cursor, start]); cursor = Math.max(cursor, end); }
    if (cursor < 1 - .000001) ranges.push([cursor, 1]);
    const interpolate = (fraction: number): Coordinate => [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    if (!ranges.length) { flush(); continue; }
    for (const [start, end] of ranges) {
      if (start > .000001) flush();
      if (!part.length) part.push(interpolate(start));
      part.push(interpolate(end));
      if (end < 1 - .000001) flush();
    }
  }
  flush(); return result;
}
