import type { Coordinate, Closure, PlanRequest, PlanResponse, RoutePath, RouteConflict, RouteOption } from '../../shared/types';
import type { RoutingGraph, GraphEdge, TurnRule } from './graph';
import { distanceMeters } from './graph';
import { alternativeConstraints, alternativeLabel, isDistinctUsefulCandidate, segmentIndex, type Candidate } from './alternatives';
import { closureEdgeFractions } from './closure-segments';

const SNAP_METERS = 220;
const TIME_MARGIN_SECONDS = 30;
interface EventArea { closure: Closure; start: number; end: number; fractions: Map<number, [number, number][]> }

class Heap {
  private values: [number, number][] = [];
  push(value: [number, number]) { const a = this.values; a.push(value); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][1] <= value[1]) break; a[i] = a[p]; i = p; } a[i] = value; }
  pop(): [number, number] | undefined { const a = this.values; if (!a.length) return; const first = a[0], last = a.pop()!; if (a.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= a.length) break; if (c + 1 < a.length && a[c + 1][1] < a[c][1]) c++; if (a[c][1] >= last[1]) break; a[i] = a[c]; i = c; } a[i] = last; } return first; }
}
export class LocalRouter {
  readonly graph: RoutingGraph;
  private outgoing: number[][];
  private rules = new Map<string, TurnRule[]>();
  private maximumSpeed = 1;
  private routableNodes = new Set<number>();
  private segments: Map<string, number[]>;
  constructor(graph: RoutingGraph) {
    this.graph = graph;
    this.segments = segmentIndex(graph);
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
  private shortest(origin: number, targets: number[], departure: number, excluded: Set<number>, penalties = new Map<number, number>(), deadline = Infinity): Candidate | null {
    const graph = this.graph, heap = new Heap(), stride = graph.edges.length + 1;
    // One search state carries both the incoming edge and the next ordered stop. Splitting
    // the journey into independent legs would forget prohibited turns at stop nodes.
    const advance = (progress: number, node: number) => { while (progress < targets.length && targets[progress] === node) progress++; return progress; };
    const initialProgress = advance(0, origin), initialState = initialProgress * stride;
    const cost = new Map<number, number>([[initialState, 0]]), previous = new Map<number, number>();
    const remaining = targets.map(() => 0);
    for (let i = targets.length - 2; i >= 0; i--) remaining[i] = remaining[i + 1] + distanceMeters(graph.nodes[targets[i]].coordinate, graph.nodes[targets[i + 1]].coordinate);
    const heuristic = (node: number, progress: number) => progress === targets.length ? 0 : (distanceMeters(graph.nodes[node].coordinate, graph.nodes[targets[progress]].coordinate) + remaining[progress]) / this.maximumSpeed;
    heap.push([initialState, heuristic(origin, initialProgress)]);
    let finalState: number | undefined;
    let iterations = 0;
    while (true) {
      const item = heap.pop(); if (!item) break;
      const [state, f] = item, progress = Math.floor(state / stride), incomingIndex = state % stride - 1;
      const incoming = incomingIndex < 0 ? null : graph.edges[incomingIndex], node = incoming?.to ?? origin;
      const g = cost.get(state)!;
      if (f > g + heuristic(node, progress) + .0001) continue;
      if (progress === targets.length) { finalState = state; break; }
      if (++iterations > Math.max(10000, graph.edges.length * (targets.length + 1) * 3) || (iterations % 256 === 0 && performance.now() > deadline)) return null;
      for (const index of this.outgoing[node]) {
        if (excluded.has(index)) continue;
        const edge = graph.edges[index];
        if (!this.turnAllowed(incoming, edge)) continue;
        const penalty = incoming ? edge.to === incoming.from ? 20 : incoming.wayId !== edge.wayId ? 3 : 0 : 0;
        const nextCost = g + edge.seconds * (1 + (penalties.get(index) ?? 0)) + penalty;
        const nextProgress = advance(progress, edge.to), nextState = nextProgress * stride + index + 1;
        if (nextCost >= (cost.get(nextState) ?? Infinity)) continue;
        cost.set(nextState, nextCost); previous.set(nextState, state); heap.push([nextState, nextCost + heuristic(edge.to, nextProgress)]);
      }
    }
    if (finalState === undefined) return null;
    const indices: number[] = []; let state = finalState;
    while (state !== initialState) { indices.push(state % stride - 1); state = previous.get(state)!; }
    indices.reverse();
    const coordinates: Coordinate[] = [graph.nodes[origin].coordinate];
    const steps: RoutePath['steps'] = [], timings: Candidate['edges'] = [];
    let elapsed = 0, distance = 0;
    let incoming: GraphEdge | null = null;
    for (const index of indices) {
      const edge = graph.edges[index];
      const turnDelay = incoming ? edge.to === incoming.from ? 20 : incoming.wayId !== edge.wayId ? 3 : 0 : 0;
      const start = elapsed + turnDelay, finish = start + edge.seconds;
      timings.push({ index, start, finish });
      coordinates.push(graph.nodes[edge.to].coordinate); distance += edge.distance;
      const duration = finish - elapsed, previousStep = steps[steps.length - 1];
      if (previousStep?.roadName === edge.name) { previousStep.distanceMeters += edge.distance; previousStep.durationSeconds += duration; }
      else steps.push({ roadName: edge.name, instruction: `${steps.length ? 'Continue on' : 'Start on'} ${edge.name}`, distanceMeters: edge.distance, durationSeconds: duration });
      elapsed = finish;
      incoming = edge;
    }
    if (coordinates.length === 1) coordinates.push([...coordinates[0]]);
    return { path: { geometry: { type: 'LineString', coordinates }, distanceMeters: distance, durationSeconds: elapsed, departureAt: new Date(departure).toISOString(), arrivalAt: new Date(departure + elapsed * 1000).toISOString(), steps, snappedOrigin: graph.nodes[origin].coordinate, snappedDestination: graph.nodes[targets[targets.length - 1]].coordinate, ...(targets.length > 1 ? { snappedWaypoints: targets.slice(0, -1).map(index => graph.nodes[index].coordinate) } : {}) }, edges: timings };
  }
  private areas(closures: Closure[], deadline = Infinity): EventArea[] {
    return closures.filter((c) => c.status === 'published').map((closure) => {
      const start = Date.parse(closure.startsAt), end = closure.endsAt === null ? Infinity : Date.parse(closure.endsAt);
      if (!Number.isFinite(start) || Number.isNaN(end) || end <= start) throw new Error(`Published closure “${closure.title}” has an invalid time window; review it before routing.`);
      return { closure, start, end, fractions: closureEdgeFractions(this.graph, closure.geometry, deadline) };
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
    const deadline = performance.now() + 3000;
    let searchesLeft = 32, searchLimited = false;
    const evaluatedAt = new Date().toISOString();
    const response: PlanResponse = { options: [], baseline: null, conflicts: [], warnings: ['Travel times use ordinary road-speed estimates, not live traffic.', 'Closure timing includes a 30-second margin at entry and exit. Recheck before departure.'], evaluatedAt, graphVersion: this.graph.version, eventRevision, source: 'local-osm' };
    const departure = Date.parse(request.departureAt);
    if (!Number.isFinite(departure)) throw new Error('Choose a valid departure date and time.');
    if ((request.waypoints?.length ?? 0) > 5) throw new Error('Add at most five intermediate stops.');
    const places = [request.origin, ...(request.waypoints ?? []), request.destination];
    for (const place of places) {
      const [lon, lat] = place.coordinate;
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < this.graph.bounds[0] || lon > this.graph.bounds[2] || lat < this.graph.bounds[1] || lat > this.graph.bounds[3]) {
        response.unavailableReason = 'The start, destination and every stop must be inside the loaded offline road area.'; return response;
      }
    }
    const snapped = places.map(place => this.snap(place.coordinate));
    if (snapped.some(point => !point)) { response.unavailableReason = `Select the start, destination and stops within ${SNAP_METERS} metres of a supported public car-road node.`; return response; }
    const origin = snapped[0]!, targets = snapped.slice(1).map(point => point!.index);
    if (snapped.some(point => point!.distance > 30)) response.warnings.push(`Pins snapped to road nodes (${snapped.map((point, index) => `${Math.round(point!.distance)} m at ${index === 0 ? 'start' : index === snapped.length - 1 ? 'destination' : `stop ${index}`}`).join('; ')}). Access between each pin and its snapped point is not routed.`);
    let areas: EventArea[];
    try { areas = this.areas(closures, deadline); } catch (error) { response.unavailableReason = error instanceof Error ? error.message : 'A published closure needs review.'; return response; }
    const search = (time: number, excluded: Set<number>, penalties = new Map<number, number>()) => {
      if (searchesLeft-- <= 0 || performance.now() > deadline) { searchLimited = true; return null; }
      const result = this.shortest(origin.index, targets, time, excluded, penalties, deadline);
      if (performance.now() > deadline) searchLimited = true;
      return result;
    };
    const baseline = search(departure, new Set());
    if (!baseline) { response.unavailableReason = searchLimited ? 'The planning limit was reached before a connected route could be validated. Try a shorter journey.' : 'No connected public car route was found between these snapped endpoints in the imported road graph.'; return response; }
    response.baseline = baseline.path;
    response.conflicts = this.conflicts(baseline, areas, departure).conflicts;
    response.upcoming = areas.filter(area => area.start > departure && area.start <= departure + 24 * 3600_000 && baseline.edges.some(edge => area.fractions.has(edge.index)))
      .sort((a, b) => a.start - b.start)
      .map(({ closure }) => ({ closureId: closure.id, title: closure.title, startsAt: closure.startsAt, endsAt: closure.endsAt }));
    const findPassing = (time: number, forced = new Set<number>(), penalties = new Map<number, number>(), attempts = 8): Candidate | null => {
      // Static ordinary-speed routing does not change shape with departure. Reuse its baseline, but recheck every closure at the new time.
      let candidate: Candidate | null = !forced.size && !penalties.size ? { edges: baseline.edges, path: { ...baseline.path, departureAt: new Date(time).toISOString(), arrivalAt: new Date(time + baseline.path.durationSeconds * 1000).toISOString() } } : search(time, forced, penalties);
      const excluded = new Set<number>(forced);
      for (let attempt = 0; candidate && attempt < attempts; attempt++) {
        const check = this.conflicts(candidate, areas, time);
        if (!check.conflicts.length) return candidate;
        const before = excluded.size; for (const index of check.blocked) excluded.add(index);
        if (excluded.size === before) return null;
        candidate = attempt + 1 < attempts ? search(time, excluded, penalties) : null;
      }
      return null;
    };
    const current = findPassing(departure);
    const addOption = (candidate: Candidate, kind: RouteOption['kind'], offset: number, routeNumber = 0, primary = candidate) => {
      const warnings = ['Validated against the current published closure set; future changes can alter this result.'];
      if (departure < Date.now() - 60000) warnings.unshift('Historical schedule replay: these departure choices are hypothetical and are not current travel advice.');
      if (areas.some((area) => area.closure.endsAt !== null && Date.parse(candidate.path.departureAt) >= area.end)) warnings.push('Any announced reopening is an assumption unless separately confirmed.');
      const label = kind === 'alternative' ? alternativeLabel(this.graph, candidate, primary, routeNumber + 1) : kind === 'direct' ? 'Your planned route' : kind === 'detour' ? 'Avoid the closure' : kind === 'leave_earlier' ? `Leave ${Math.abs(offset)} minutes earlier` : `Leave ${offset} minutes later`;
      response.options.push({ ...candidate.path, id: kind === 'alternative' ? `alternative-${routeNumber}` : `${kind}-${offset}`, kind, label, validation: 'clear', warnings });
    };
    if (current) {
      const sameTime = [current];
      for (let attempt = 0; sameTime.length < 3 && attempt < 8 && !searchLimited; attempt++) {
        const constraints = alternativeConstraints(this.graph, this.segments, sameTime, attempt);
        if (!constraints.excluded.size && !constraints.penalties.size) continue;
        const candidate = findPassing(departure, constraints.excluded, constraints.penalties, 3);
        if (candidate && isDistinctUsefulCandidate(this.graph, candidate, sameTime, deadline)) sameTime.push(candidate);
      }
      sameTime.sort((a, b) => a.path.durationSeconds - b.path.durationSeconds || a.path.distanceMeters - b.path.distanceMeters);
      sameTime.forEach((candidate, i) => addOption(candidate, i ? 'alternative' : response.conflicts.length ? 'detour' : 'direct', 0, i, sameTime[0]));
    }
    if (request.compareDepartures && response.conflicts.length) {
      const earlier: { candidate: Candidate; offset: number }[] = [], later: typeof earlier = [];
      const now = Date.now();
      for (const offset of [-10, -20, -30, -45, -60, 10, 20, 30, 45, 60]) {
        const time = departure + offset * 60000;
        if (departure >= now - 60000 && time < now) continue;
        if (searchLimited) break;
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
    if (searchLimited || performance.now() > deadline) response.warnings.push('The planning limit was reached; only the route and departure choices fully validated so far are shown.');
    if (departure < Date.now() - 60000) response.warnings.push('This departure is in the past; results are a schedule replay, not current traffic advice.');
    return response;
  }
}
