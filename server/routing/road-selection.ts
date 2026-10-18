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

/** A single pick closes a short piece of the actual road, not a circular area.
 * Follow degree-two bends, but stop at a connected junction rather than
 * accidentally covering an intersecting road. OSM crossings without a shared
 * node are not junctions. No private-road or off-road fallback is used. */
export function selectRoadPoint(graph: RoutingGraph | null, point: Coordinate): RoadSection {
  if (!graph || point[0] < graph.bounds[0] || point[0] > graph.bounds[2] || point[1] < graph.bounds[1] || point[1] > graph.bounds[3]) {
    throw new RoadSelectionError('Road selection is available inside the imported Islamabad road area.', 503);
  }
  const values = segments(graph), nearest = snaps(graph, values, point)[0];
  if (!nearest) throw new RoadSelectionError(`Click within ${MAX_SNAP} metres of a supported public car road.`);
  const atNode = new Map<number, Segment[]>();
  for (const segment of values) for (const node of [segment.a, segment.b]) {
    const adjacent = atNode.get(node) ?? []; adjacent.push(segment); atNode.set(node, adjacent);
  }
  const interpolate = (a: Coordinate, b: Coordinate, fraction: number): Coordinate => [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
  const extend = (towards: number, available: number): { coordinates: Coordinate[]; length: number } => {
    const coordinates: Coordinate[] = [nearest.coordinate];
    let segment = nearest.segment, target = towards, remaining = 10, length = 0, start = nearest.coordinate, distance = available;
    const seen = new Set<Segment>([segment]);
    for (let count = 0; count < 100; count++) {
      const end = graph.nodes[target].coordinate;
      if (distance >= remaining) {
        coordinates.push(interpolate(start, end, distance ? remaining / distance : 0)); length += remaining; break;
      }
      if (distance > .05) coordinates.push(end);
      length += distance; remaining -= distance;
      const adjacent = atNode.get(target) ?? [];
      // Distinct neighbouring nodes distinguish a real connected intersection
      // from redundant OSM ways describing the same physical segment.
      const neighbours = new Set(adjacent.map(edge => edge.a === target ? edge.b : edge.a));
      if (neighbours.size !== 2) break;
      const next = adjacent.filter(edge => edge !== segment && edge.identity === nearest.segment.identity && !seen.has(edge));
      if (next.length !== 1) break;
      segment = next[0]; seen.add(segment); target = segment.a === target ? segment.b : segment.a;
      start = end; distance = segment.distance;
    }
    return { coordinates, length };
  };
  const before = extend(nearest.segment.a, nearest.fraction * nearest.segment.distance);
  const after = extend(nearest.segment.b, (1 - nearest.fraction) * nearest.segment.distance);
  const coordinates = [...before.coordinates.reverse(), ...after.coordinates.slice(1)]
    .filter((coordinate, index, all) => !index || distanceMeters(coordinate, all[index - 1]) > .05);
  const length = before.length + after.length;
  if (length < 3 || coordinates.length < 2) throw new RoadSelectionError('Choose a point farther from the road junction.');
  return { drawing: { kind: 'line', coordinates, widthMeters: 14 }, roadNames: [nearest.segment.name || 'Public road'], distanceMeters: length };
}

/** A physical blockade is the short line across the affected carriageway.
 * Preserve its endpoints instead of snapping it longitudinally along the road.
 * Requiring a real transverse graph intersection prevents an arbitrary nearby
 * off-road line from becoming a published road barrier. */
export function selectRoadBlockade(graph: RoutingGraph | null, from: Coordinate, to: Coordinate): RoadSection {
  if (!graph || [from, to].some(point => point[0] < graph.bounds[0] || point[0] > graph.bounds[2] || point[1] < graph.bounds[1] || point[1] > graph.bounds[3])) {
    throw new RoadSelectionError('Road selection is available inside the imported Islamabad road area.', 503);
  }
  const length = distanceMeters(from, to);
  if (length < 2) throw new RoadSelectionError('Draw a blockade at least 2 metres long.');
  if (length > 80) throw new RoadSelectionError('Draw a blockade no longer than 80 metres.');
  const scale = Math.cos((from[1] + to[1]) / 2 * Math.PI / 180);
  const lineX = (to[0] - from[0]) * scale, lineY = to[1] - from[1], crossed: Segment[] = [];
  for (const segment of segments(graph)) {
    const a = graph.nodes[segment.a].coordinate, b = graph.nodes[segment.b].coordinate;
    if (Math.max(from[0], to[0]) < Math.min(a[0], b[0]) || Math.min(from[0], to[0]) > Math.max(a[0], b[0]) || Math.max(from[1], to[1]) < Math.min(a[1], b[1]) || Math.min(from[1], to[1]) > Math.max(a[1], b[1])) continue;
    const roadX = (b[0] - a[0]) * scale, roadY = b[1] - a[1];
    const denominator = lineX * roadY - lineY * roadX;
    // Parallel/collinear strokes describe road sections rather than a barrier
    // across a road. Touching a road at a stroke endpoint remains valid.
    if (Math.abs(denominator) <= Math.hypot(lineX, lineY) * Math.hypot(roadX, roadY) * 1e-8) continue;
    const deltaX = (a[0] - from[0]) * scale, deltaY = a[1] - from[1];
    const alongLine = (deltaX * roadY - deltaY * roadX) / denominator;
    const alongRoad = (deltaX * lineY - deltaY * lineX) / denominator;
    if (alongLine < -1e-8 || alongLine > 1 + 1e-8 || alongRoad < -1e-8 || alongRoad > 1 + 1e-8) continue;
    if (project(from, a, b).distance > MAX_SNAP || project(to, a, b).distance > MAX_SNAP) continue;
    crossed.push(segment);
  }
  if (!crossed.length) throw new RoadSelectionError('Draw a short line across a supported public road.');
  return { drawing: { kind: 'line', coordinates: [[...from], [...to]], widthMeters: 4 }, roadNames: [...new Set(crossed.map(segment => segment.name || 'Public road'))], distanceMeters: length };
}

/** Select geometry, not a driving itinerary: a closure can cover either direction.
 * Only public car-road segments from the access-filtered graph are considered.
 * Never join roads at a visual crossing or invent a straight-line connection. */
export function selectRoadSection(graph: RoutingGraph | null, from: Coordinate, to: Coordinate): RoadSection {
  if (!graph || [from, to].some(point => point[0] < graph.bounds[0] || point[0] > graph.bounds[2] || point[1] < graph.bounds[1] || point[1] > graph.bounds[3])) {
    throw new RoadSelectionError('Road selection is available inside the imported Islamabad road area.', 503);
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
