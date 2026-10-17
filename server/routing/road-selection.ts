import type { Coordinate, Drawing } from '../../shared/types';
import { distanceMeters, type RoutingGraph } from './graph';

export interface RoadSection { drawing: Drawing; roadNames: string[]; distanceMeters: number }
export class RoadSelectionError extends Error {
  constructor(message: string, readonly status: 422 | 503 = 422) { super(message); }
}
interface Segment { a: number; b: number; name: string; identity: string; distance: number }
interface Snap { segment: Segment; coordinate: Coordinate; fraction: number; distance: number }
const MAX_SNAP = 45, MAX_SECTION = 6000;
const cached = new WeakMap<RoutingGraph, Segment[]>();
const generic = /^(residential|service|unclassified|living street|motorway|trunk|primary|secondary|tertiary)( link)? road$/i;
function segments(graph: RoutingGraph): Segment[] {
  const existing = cached.get(graph); if (existing) return existing;
  const seen = new Set<string>(), result: Segment[] = [];
  for (const edge of graph.edges) {
    const key = `${Math.min(edge.from, edge.to)}:${Math.max(edge.from, edge.to)}:${edge.wayId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = edge.name.trim(), identity = !name || generic.test(name) ? `way:${edge.wayId}` : `name:${name.toLocaleLowerCase()}`;
    result.push({ a: edge.from, b: edge.to, name, identity, distance: edge.distance });
  }
  cached.set(graph, result); return result;
}
function project(point: Coordinate, a: Coordinate, b: Coordinate): { coordinate: Coordinate; fraction: number; distance: number } {
  const scale = Math.cos(point[1] * Math.PI / 180), dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
  const fraction = Math.max(0, Math.min(1, (((point[0] - a[0]) * scale) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  const coordinate: Coordinate = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  return { coordinate, fraction, distance: distanceMeters(point, coordinate) };
}
function snaps(graph: RoutingGraph, values: Segment[], point: Coordinate): Snap[] {
  const candidates: Snap[] = [];
  for (const segment of values) {
    const a = graph.nodes[segment.a].coordinate, b = graph.nodes[segment.b].coordinate;
    if (point[0] < Math.min(a[0], b[0]) - .0006 || point[0] > Math.max(a[0], b[0]) + .0006 || point[1] < Math.min(a[1], b[1]) - .0005 || point[1] > Math.max(a[1], b[1]) + .0005) continue;
    const value = project(point, a, b);
    if (value.distance <= MAX_SNAP) candidates.push({ segment, ...value });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  // At a junction/carriageway edge the first closest segment may have another
  // name or be the disconnected opposite carriageway. Keep nearby candidates
  // and use the second click to resolve the connected road, without a large snap.
  return candidates.filter(candidate => candidate.distance <= (candidates[0]?.distance ?? 0) + 20).slice(0, 12);
}

/** Select geometry, not a driving itinerary: a closure can cover either direction.
 * Only public car-road segments from the access-filtered graph are considered.
 * Never join roads at a visual crossing or invent a straight-line connection. */
export function selectRoadSection(graph: RoutingGraph | null, from: Coordinate, to: Coordinate): RoadSection {
  if (!graph || [from, to].some(point => point[0] < graph.bounds[0] || point[0] > graph.bounds[2] || point[1] < graph.bounds[1] || point[1] > graph.bounds[3])) {
    throw new RoadSelectionError('Road-section selection is available inside the imported Islamabad road area. Use a point restriction elsewhere.', 503);
  }
  const values = segments(graph), starts = snaps(graph, values, from), ends = snaps(graph, values, to);
  if (!starts.length || !ends.length) throw new RoadSelectionError(`Click within ${MAX_SNAP} metres of a supported public car road.`);
  const pairs = starts.flatMap(first => ends.filter(last => first.segment.identity === last.segment.identity).map(last => ({ first, last })))
    .sort((a, b) => a.first.distance + a.last.distance - b.first.distance - b.last.distance).slice(0, 16);
  if (!pairs.length) throw new RoadSelectionError('Choose both ends on the same road. Add a separate restriction for another road.');
  let unavailable: RoadSelectionError | null = null;
  const globalDeadline = performance.now() + 200;
  for (const { first, last } of pairs) try {
    const coordinateFor = (node: number) => graph.nodes[node].coordinate;
    let coordinates: Coordinate[], length: number;
    if (first.segment === last.segment) {
      coordinates = [first.coordinate, last.coordinate]; length = Math.abs(first.fraction - last.fraction) * first.segment.distance;
    } else {
      const adjacency = new Map<number, { to: number; distance: number }[]>();
      const add = (a: number, b: number, distance: number) => { const list = adjacency.get(a) ?? []; list.push({ to: b, distance }); adjacency.set(a, list); };
      for (const segment of values) if (segment.identity === first.segment.identity) { add(segment.a, segment.b, segment.distance); add(segment.b, segment.a, segment.distance); }
      const costs = new Map<number, number>(), previous = new Map<number, number | null>(), open = new Set<number>();
      const seed = (node: number, cost: number) => { if (cost < (costs.get(node) ?? Infinity)) { costs.set(node, cost); previous.set(node, null); open.add(node); } };
      seed(first.segment.a, first.fraction * first.segment.distance); seed(first.segment.b, (1 - first.fraction) * first.segment.distance);
      const finishCosts = new Map([[last.segment.a, last.fraction * last.segment.distance], [last.segment.b, (1 - last.fraction) * last.segment.distance]]);
      let best = Infinity, end = -1, iterations = 0;
      const deadline = globalDeadline;
      while (open.size) {
        if (++iterations > 20000 || (iterations % 128 === 0 && performance.now() > deadline)) throw new RoadSelectionError('This road section is too complex. Select a shorter section.');
        let node = -1, cost = Infinity;
        for (const candidate of open) if (costs.get(candidate)! < cost) { cost = costs.get(candidate)!; node = candidate; }
        open.delete(node);
        if (cost >= best || cost > MAX_SECTION) break;
        if (finishCosts.has(node) && cost + finishCosts.get(node)! < best) { best = cost + finishCosts.get(node)!; end = node; }
        for (const edge of adjacency.get(node) ?? []) {
          const next = cost + edge.distance;
          if (next <= MAX_SECTION && next < (costs.get(edge.to) ?? Infinity)) { costs.set(edge.to, next); previous.set(edge.to, node); open.add(edge.to); }
        }
      }
      if (end < 0 || best > MAX_SECTION) throw new RoadSelectionError('No connected section of this road was found within 6 km. Select closer ends on the same carriageway.');
      const nodes: number[] = []; for (let node: number | null = end; node !== null; node = previous.get(node) ?? null) nodes.push(node);
      coordinates = [first.coordinate, ...nodes.reverse().map(coordinateFor), last.coordinate]; length = best;
    }
    coordinates = coordinates.filter((point, index) => !index || distanceMeters(point, coordinates[index - 1]) > .05);
    if (length < 3 || coordinates.length < 2) throw new RoadSelectionError('Select a road section at least 3 metres long.');
    if (length > MAX_SECTION) throw new RoadSelectionError('Select a road section shorter than 6 km.');
    if (coordinates.length > 400) throw new RoadSelectionError('This road section has too many bends. Select a shorter section.');
    return { drawing: { kind: 'line', coordinates, widthMeters: 14 }, roadNames: [first.segment.name || 'Public road'], distanceMeters: length };
  } catch (error) {
    if (!(error instanceof RoadSelectionError)) throw error;
    unavailable = error;
    if (performance.now() > globalDeadline) break;
  }
  throw unavailable ?? new RoadSelectionError('No connected section was found. Select closer ends on the same road.');
}
