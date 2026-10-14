import booleanIntersects from '@turf/boolean-intersects';
import { lineString, polygon } from '@turf/helpers';
import type { Coordinate, Closure, PlanRequest, PlanResponse, RoutePath, RouteConflict, RouteOption } from '../../shared/types';
import type { RoutingGraph, GraphEdge, TurnRule } from './graph';
import { distanceMeters } from './graph';

const SNAP_METERS = 220;
const TIME_MARGIN_SECONDS = 30;
interface Candidate { path: RoutePath; edges: { index: number; start: number; finish: number }[] }
interface EventArea { closure: Closure; start: number; end: number; bounds: number[]; fractions: Map<number, [number, number][]> }

class Heap {
  private values: [number, number][] = [];
  push(value: [number, number]) { const a = this.values; a.push(value); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][1] <= value[1]) break; a[i] = a[p]; i = p; } a[i] = value; }
  pop(): [number, number] | undefined { const a = this.values; if (!a.length) return; const first = a[0], last = a.pop()!; if (a.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= a.length) break; if (c + 1 < a.length && a[c + 1][1] < a[c][1]) c++; if (a[c][1] >= last[1]) break; a[i] = a[c]; i = c; } a[i] = last; } return first; }
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
  // Turf already established intersection: touching an uncertain closure boundary is conservative.
  return intervals.length ? intervals : [[0, 1]];
}

export class LocalRouter {
  readonly graph: RoutingGraph;
  private outgoing: number[][];
  private rules = new Map<string, TurnRule[]>();
  private maximumSpeed = 1;
  private routableNodes = new Set<number>();
  constructor(graph: RoutingGraph) {
    this.graph = graph;
    this.outgoing = graph.nodes.map(() => []);
    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i]; this.outgoing[edge.from].push(i);
      this.routableNodes.add(edge.from); this.routableNodes.add(edge.to);
      this.maximumSpeed = Math.max(this.maximumSpeed, edge.distance / edge.seconds);
    }
    for (const rule of graph.restrictions) { const key = `${rule.via}:${rule.fromWay}`; const values = this.rules.get(key) ?? []; values.push(rule); this.rules.set(key, values); }
  }
  private snap(coordinate: Coordinate): { index: number; distance: number } | null {
    let best = SNAP_METERS, index = -1;
    for (const i of this.routableNodes) {
      const p = this.graph.nodes[i].coordinate;
      const bounds = this.graph.bounds;
      if (p[0] < bounds[0] || p[0] > bounds[2] || p[1] < bounds[1] || p[1] > bounds[3]) continue;
      if (Math.abs(p[0] - coordinate[0]) > .003 || Math.abs(p[1] - coordinate[1]) > .0021) continue;
      const distance = distanceMeters(coordinate, p);
      if (distance < best) { best = distance; index = i; }
    }
    return index < 0 ? null : { index, distance: best };
  }
  private turnAllowed(incoming: GraphEdge | null, next: GraphEdge): boolean {
    if (!incoming) return true;
    const rules = this.rules.get(`${next.from}:${incoming.wayId}`) ?? [];
    const matches = (r: TurnRule) => r.toWay === next.wayId && (!r.uTurn || next.to === incoming.from);
    if (rules.some((r) => !r.only && matches(r))) return false;
    const only = rules.filter((r) => r.only);
    return !only.length || only.some(matches);
  }
  private shortest(origin: number, destination: number, departure: number, excluded: Set<number>): Candidate | null {
    const graph = this.graph, heap = new Heap();
    const cost = new Map<number, number>([[-1, 0]]), previous = new Map<number, number>();
    const heuristic = (node: number) => distanceMeters(graph.nodes[node].coordinate, graph.nodes[destination].coordinate) / this.maximumSpeed;
    heap.push([-1, heuristic(origin)]);
    let finalState: number | undefined;
    let iterations = 0;
    while (true) {
      const item = heap.pop(); if (!item) break;
      const [state, f] = item, incoming = state < 0 ? null : graph.edges[state], node = incoming?.to ?? origin;
      const g = cost.get(state)!;
      if (f > g + heuristic(node) + .0001) continue;
      if (node === destination) { finalState = state; break; }
      if (++iterations > Math.max(10000, graph.edges.length * 3)) return null;
      for (const index of this.outgoing[node]) {
        if (excluded.has(index)) continue;
        const edge = graph.edges[index];
        if (!this.turnAllowed(incoming, edge)) continue;
        const penalty = incoming ? edge.to === incoming.from ? 20 : incoming.wayId !== edge.wayId ? 3 : 0 : 0;
        const nextCost = g + edge.seconds + penalty;
        if (nextCost >= (cost.get(index) ?? Infinity)) continue;
        cost.set(index, nextCost); previous.set(index, state); heap.push([index, nextCost + heuristic(edge.to)]);
      }
    }
    if (finalState === undefined) return null;
    const indices: number[] = []; let state = finalState;
    while (state !== -1) { indices.push(state); state = previous.get(state)!; }
    indices.reverse();
    const coordinates: Coordinate[] = [graph.nodes[origin].coordinate];
    const steps: RoutePath['steps'] = [], timings: Candidate['edges'] = [];
    let elapsed = 0, distance = 0;
    for (const index of indices) {
      const edge = graph.edges[index], finish = cost.get(index)!;
      timings.push({ index, start: finish - edge.seconds, finish });
      coordinates.push(graph.nodes[edge.to].coordinate); distance += edge.distance;
      const duration = finish - elapsed, previousStep = steps[steps.length - 1];
      if (previousStep?.roadName === edge.name) { previousStep.distanceMeters += edge.distance; previousStep.durationSeconds += duration; }
      else steps.push({ roadName: edge.name, instruction: `${steps.length ? 'Continue on' : 'Start on'} ${edge.name}`, distanceMeters: edge.distance, durationSeconds: duration });
      elapsed = finish;
    }
    if (coordinates.length === 1) coordinates.push([...coordinates[0]]);
    return { path: { geometry: { type: 'LineString', coordinates }, distanceMeters: distance, durationSeconds: elapsed, departureAt: new Date(departure).toISOString(), arrivalAt: new Date(departure + elapsed * 1000).toISOString(), steps, snappedOrigin: graph.nodes[origin].coordinate, snappedDestination: graph.nodes[destination].coordinate }, edges: timings };
  }
  private areas(closures: Closure[]): EventArea[] {
    return closures.filter((c) => c.status === 'published').map((closure) => {
      const start = Date.parse(closure.startsAt), end = closure.endsAt === null ? Infinity : Date.parse(closure.endsAt);
      if (!Number.isFinite(start) || Number.isNaN(end) || end <= start) throw new Error(`Published closure “${closure.title}” has an invalid time window; review it before routing.`);
      const points = closure.geometry.coordinates.flat();
      const bounds = [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
      const fractions = new Map<number, [number, number][]>();
      const shape = polygon(closure.geometry.coordinates);
      this.graph.edges.forEach((edge, index) => {
        const a = this.graph.nodes[edge.from].coordinate, b = this.graph.nodes[edge.to].coordinate;
        if (Math.max(a[0], b[0]) < bounds[0] || Math.min(a[0], b[0]) > bounds[2] || Math.max(a[1], b[1]) < bounds[1] || Math.min(a[1], b[1]) > bounds[3]) return;
        if (booleanIntersects(lineString([a, b]), shape)) fractions.set(index, intervalsInside(a, b, closure.geometry.coordinates));
      });
      return { closure, start, end, bounds, fractions };
    });
  }
  private conflicts(candidate: Candidate, areas: EventArea[], departure: number): { conflicts: RouteConflict[]; blocked: Set<number> } {
    const conflicts: RouteConflict[] = [], blocked = new Set<number>();
    for (const area of areas) {
      let first = Infinity, last = -Infinity;
      for (const edge of candidate.edges) for (const [a, b] of area.fractions.get(edge.index) ?? []) {
        const entry = departure + (edge.start + (edge.finish - edge.start) * a) * 1000;
        const exit = departure + (edge.start + (edge.finish - edge.start) * b) * 1000;
        if (entry - TIME_MARGIN_SECONDS * 1000 < area.end && exit + TIME_MARGIN_SECONDS * 1000 > area.start) {
          first = Math.min(first, entry); last = Math.max(last, exit); blocked.add(edge.index);
        }
      }
      if (Number.isFinite(first)) conflicts.push({ closureId: area.closure.id, title: area.closure.title, entryAt: new Date(first).toISOString(), exitAt: new Date(last).toISOString() });
    }
    return { conflicts, blocked };
  }
  plan(request: PlanRequest, closures: Closure[], eventRevision: number): PlanResponse {
    const evaluatedAt = new Date().toISOString();
    const response: PlanResponse = { options: [], baseline: null, conflicts: [], warnings: ['Travel times use ordinary road-speed estimates, not live traffic.', 'Closure timing includes a 30-second margin at entry and exit. Recheck before departure.'], evaluatedAt, graphVersion: this.graph.version, eventRevision, source: 'local-osm' };
    const departure = Date.parse(request.departureAt);
    if (!Number.isFinite(departure)) throw new Error('Choose a valid departure date and time.');
    for (const place of [request.origin, request.destination]) {
      const [lon, lat] = place.coordinate;
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < this.graph.bounds[0] || lon > this.graph.bounds[2] || lat < this.graph.bounds[1] || lat > this.graph.bounds[3]) {
        response.unavailableReason = 'Both endpoints must be inside the imported Islamabad area.'; return response;
      }
    }
    const origin = this.snap(request.origin.coordinate), destination = this.snap(request.destination.coordinate);
    if (!origin || !destination) { response.unavailableReason = `Select endpoints within ${SNAP_METERS} metres of a supported public car-road node.`; return response; }
    if (origin.distance > 30 || destination.distance > 30) response.warnings.push(`Pins snapped to road nodes (${Math.round(origin.distance)} m at start; ${Math.round(destination.distance)} m at destination). Access between each pin and its snapped point is not routed.`);
    let areas: EventArea[];
    try { areas = this.areas(closures); } catch (error) { response.unavailableReason = error instanceof Error ? error.message : 'A published closure needs review.'; return response; }
    const baseline = this.shortest(origin.index, destination.index, departure, new Set());
    if (!baseline) { response.unavailableReason = 'No connected public car route was found between these snapped endpoints in the imported road graph.'; return response; }
    response.baseline = baseline.path;
    response.conflicts = this.conflicts(baseline, areas, departure).conflicts;
    const findPassing = (time: number): Candidate | null => {
      let candidate = time === departure ? baseline : this.shortest(origin.index, destination.index, time, new Set());
      const excluded = new Set<number>();
      for (let attempt = 0; candidate && attempt < 8; attempt++) {
        const check = this.conflicts(candidate, areas, time);
        if (!check.conflicts.length) return candidate;
        const before = excluded.size; for (const index of check.blocked) excluded.add(index);
        if (excluded.size === before) return null;
        candidate = this.shortest(origin.index, destination.index, time, excluded);
      }
      return null;
    };
    const current = findPassing(departure);
    const addOption = (candidate: Candidate, kind: RouteOption['kind'], offset: number) => {
      const warnings = ['Validated against the current published closure set; future changes can alter this result.'];
      if (departure < Date.now() - 60000) warnings.unshift('Historical schedule replay: these departure choices are hypothetical and are not current travel advice.');
      if (areas.some((area) => area.closure.endsAt !== null && Date.parse(candidate.path.departureAt) >= area.end)) warnings.push('Any announced reopening is an assumption unless separately confirmed.');
      response.options.push({ ...candidate.path, id: `${kind}-${offset}`, kind, label: kind === 'direct' ? 'Your planned route' : kind === 'detour' ? 'Avoid the closure' : kind === 'leave_earlier' ? `Leave ${Math.abs(offset)} minutes earlier` : `Leave ${offset} minutes later`, validation: 'clear', warnings });
    };
    if (current) addOption(current, response.conflicts.length ? 'detour' : 'direct', 0);
    if (request.compareDepartures && response.conflicts.length) {
      const earlier: { candidate: Candidate; offset: number }[] = [], later: typeof earlier = [];
      const now = Date.now();
      for (const offset of [-10, -20, -30, -45, -60, 10, 20, 30, 45, 60]) {
        const time = departure + offset * 60000;
        if (departure >= now - 60000 && time < now) continue;
        const candidate = findPassing(time); if (candidate) (offset < 0 ? earlier : later).push({ candidate, offset });
      }
      // Prefer the smallest schedule change that restores the original ordinary duration.
      const choose = (values: typeof earlier) => values.sort((a, b) => (Math.max(0, a.candidate.path.durationSeconds - baseline.path.durationSeconds - 5) - Math.max(0, b.candidate.path.durationSeconds - baseline.path.durationSeconds - 5)) || Math.abs(a.offset) - Math.abs(b.offset))[0];
      const early = choose(earlier), late = choose(later);
      if (early) addOption(early.candidate, 'leave_earlier', early.offset);
      if (late) addOption(late.candidate, 'leave_later', late.offset);
    }
    if (!response.options.length) response.unavailableReason = 'No verified alternative was found for this time within the bounded search. Try another departure or endpoint.';
    if (response.conflicts.length) response.warnings.push('Detours use a bounded search with fixed edge exclusions per candidate; this does not prove the globally best time-dependent route.');
    if (departure < Date.now() - 60000) response.warnings.push('This departure is in the past; results are a schedule replay, not current traffic advice.');
    return response;
  }
}
