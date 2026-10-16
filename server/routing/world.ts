import type { Polygon } from 'geojson';
import type { Closure, Coordinate, PlanRequest, PlanResponse, RouteConflict, RouteOption, RoutePath, RouteStep } from '../../shared/types';
import { instantSchema, planSchema, polygonSchema } from '../validation';
import { closureEdgeFractions } from './closure-segments';
import { distanceMeters, type RoutingGraph } from './graph';
import { isInPakistan } from './pakistan';

const DEFAULT_BASE_URL = 'https://router.project-osrm.org';
const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
const MAX_ROUTE_POINTS = 40_000;
const MAX_STEPS = 4000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 32;
const MAX_CACHED_POINTS = 80_000;
const MAX_PENDING_REQUESTS = 8;
const TIME_MARGIN_MS = 30_000;
const SNAP_METERS = 220;

type ObjectValue = Record<string, unknown>;
interface TimedEdge { index: number; start: number; finish: number; turnUncertainty: number }
interface RouteGeometry {
  graph: RoutingGraph;
  edges: TimedEdge[];
  path: Omit<RoutePath, 'departureAt' | 'arrivalAt'>;
}
interface ProviderGeometry { routes: RouteGeometry[]; version: string; fetchedAt: number }
interface EventArea { closure: Closure; start: number; end: number; bounds: number[]; vertices: number }
export interface WorldRoutingOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Dependency-injection settings for deterministic offline tests. Production uses 1 s / 15 s. */
  minimumIntervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

function object(value: unknown, description: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`OSRM returned malformed ${description}.`);
  return value as ObjectValue;
}
function nonnegative(value: unknown, description: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`OSRM returned invalid ${description}.`);
  return value;
}
function coordinate(value: unknown): Coordinate {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'number' || typeof value[1] !== 'number' ||
    !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new Error('OSRM returned an invalid road coordinate.');
  return [value[0], value[1]];
}
function line(value: unknown): Coordinate[] {
  const geometry = object(value, 'route geometry');
  if (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || geometry.coordinates.length > MAX_ROUTE_POINTS) throw new Error('OSRM route geometry is missing or exceeds the validation limit.');
  return geometry.coordinates.map(coordinate);
}
function samePoint(a: Coordinate, b: Coordinate): boolean { return a[0] === b[0] && a[1] === b[1]; }
function sum(values: number[]): number { return values.reduce((a, b) => a + b, 0); }
function numbers(value: unknown, description: string): number[] {
  if (!Array.isArray(value) || !value.length || value.length >= MAX_ROUTE_POINTS) throw new Error(`OSRM returned missing or oversized ${description}.`);
  return value.map(item => nonnegative(item, description));
}
function checkDeadline(deadline: number): void {
  if (performance.now() > deadline) throw new Error('Closure validation exceeded the planning limit. Try fewer restrictions or a shorter journey.');
}
function bounds(coordinates: number[][]): [number, number, number, number] {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [x, y] of coordinates) { west = Math.min(west, x); south = Math.min(south, y); east = Math.max(east, x); north = Math.max(north, y); }
  return [west, south, east, north];
}
function overlap(a: number[], b: number[]): boolean { return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]; }

function instruction(maneuver: ObjectValue, name: string): string {
  const type = typeof maneuver.type === 'string' ? maneuver.type : '';
  const modifier = typeof maneuver.modifier === 'string' && /^[a-z ]{1,30}$/.test(maneuver.modifier) ? maneuver.modifier : '';
  if (!/^[a-z ]{1,50}$/.test(type)) throw new Error('OSRM returned a malformed road maneuver.');
  if (type === 'arrive') return 'Arrive at the next stop or destination';
  if (type === 'depart') return `Start on ${name}`;
  if (type === 'roundabout' || type === 'rotary') {
    const exit = typeof maneuver.exit === 'number' && Number.isInteger(maneuver.exit) && maneuver.exit > 0 ? ` and take exit ${maneuver.exit}` : '';
    return `Enter the roundabout${exit} onto ${name}`;
  }
  const action = type === 'turn' || type === 'end of road' ? 'Turn' : type === 'merge' ? 'Merge' : type === 'fork' ? 'Keep' : 'Continue';
  return `${action}${modifier ? ` ${modifier}` : ''} onto ${name}`;
}

/** Use only real provider segments. Annotation durations exclude turns, so the
 * unallocated leg turn time widens each crossing interval conservatively instead
 * of inventing a turn location or spreading durations by geographic distance. */
function parseRoute(value: unknown, snapped: Coordinate[], version: string, fetchedAt: number): RouteGeometry {
  const route = object(value, 'route');
  const coordinates = line(route.geometry);
  const duration = nonnegative(route.duration, 'route duration'), distance = nonnegative(route.distance, 'route distance');
  if (!Array.isArray(route.legs) || route.legs.length !== snapped.length - 1) throw new Error('OSRM did not preserve every ordered stop.');
  const graph: RoutingGraph = {
    version, importedAt: new Date(fetchedAt).toISOString(), sourceTimestamp: null,
    bounds: bounds(coordinates), attribution: '© OpenStreetMap contributors, ODbL 1.0', source: 'OSRM driving service; OpenStreetMap',
    nodes: coordinates.map((point, index) => ({ id: String(index), coordinate: point })), edges: [], restrictions: [],
    importStats: { sourceWays: 0, acceptedWays: 0, excludedConditionalWays: 0, unsupportedRestrictions: 0, blockedViaWays: 0 },
  };
  const timings: TimedEdge[] = [], steps: RouteStep[] = [];
  let cursor = 0, elapsed = 0, totalDistance = 0;
  route.legs.forEach((rawLeg, legIndex) => {
    const leg = object(rawLeg, 'route leg'), annotation = object(leg.annotation, 'edge annotations');
    const durations = numbers(annotation.duration, 'edge durations'), distances = numbers(annotation.distance, 'edge distances');
    const legDuration = nonnegative(leg.duration, 'leg duration'), legDistance = nonnegative(leg.distance, 'leg distance');
    if (distances.length !== durations.length || cursor + durations.length >= coordinates.length) throw new Error('OSRM edge annotations do not align with the full route geometry.');
    if (distanceMeters(coordinates[cursor], snapped[legIndex]) > 2 || distanceMeters(coordinates[cursor + durations.length], snapped[legIndex + 1]) > 2) throw new Error('OSRM route geometry does not connect the requested stops in order.');
    const annotationDuration = sum(durations), annotationDistance = sum(distances);
    // Allow only ordinary decimal serialization drift, not unexplained negative turn time.
    if (annotationDuration > legDuration + .11 || Math.abs(annotationDistance - legDistance) > 1) throw new Error('OSRM returned inconsistent leg timing or distance; closure traversal cannot be verified.');
    const turnUncertainty = Math.max(0, legDuration - annotationDuration) + .11;
    let edgeElapsed = 0;
    for (let i = 0; i < durations.length; i++) {
      const from = cursor + i, geometricDistance = distanceMeters(coordinates[from], coordinates[from + 1]);
      if (Math.abs(geometricDistance - distances[i]) > Math.max(5, geometricDistance * .05) || (geometricDistance > 1 && durations[i] === 0)) throw new Error('OSRM returned disconnected road geometry or invalid edge timing.');
      graph.edges.push({ from, to: from + 1, wayId: `osrm-${legIndex}-${i}`, name: 'OSRM road segment', distance: distances[i], seconds: durations[i] });
      timings.push({ index: graph.edges.length - 1, start: elapsed + edgeElapsed, finish: elapsed + edgeElapsed + durations[i], turnUncertainty });
      edgeElapsed += durations[i];
    }
    if (!Array.isArray(leg.steps) || !leg.steps.length || steps.length + leg.steps.length > MAX_STEPS) throw new Error('OSRM did not return usable driving steps.');
    let stepDuration = 0, stepDistance = 0, stepCursor = cursor;
    for (const rawStep of leg.steps) {
      const step = object(rawStep, 'driving step'), maneuver = object(step.maneuver, 'road maneuver');
      const roadName = typeof step.name === 'string' && step.name.length <= 500 ? step.name || 'Unnamed road' : 'Unnamed road';
      const seconds = nonnegative(step.duration, 'step duration'), meters = nonnegative(step.distance, 'step distance');
      const geometry = object(step.geometry, 'step geometry');
      if (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length || geometry.coordinates.length > MAX_ROUTE_POINTS) throw new Error('OSRM returned malformed driving-step geometry.');
      const stepPoints = geometry.coordinates.map(coordinate);
      if (!samePoint(stepPoints[0], coordinates[stepCursor])) throw new Error('OSRM driving steps are disconnected from the route.');
      for (const point of stepPoints.slice(1)) {
        // Arrival steps can repeat their single location without adding a road edge.
        if (samePoint(point, coordinates[stepCursor]) && (stepCursor + 1 > cursor + durations.length || !samePoint(point, coordinates[stepCursor + 1]))) continue;
        stepCursor++;
        if (stepCursor > cursor + durations.length || !samePoint(point, coordinates[stepCursor])) throw new Error('OSRM driving steps do not match the full road geometry.');
      }
      steps.push({ roadName, instruction: instruction(maneuver, roadName), distanceMeters: meters, durationSeconds: seconds });
      stepDuration += seconds; stepDistance += meters;
    }
    if (stepCursor !== cursor + durations.length || Math.abs(stepDuration - legDuration) > Math.max(1, leg.steps.length * .11) || Math.abs(stepDistance - legDistance) > Math.max(1, leg.steps.length * .11)) throw new Error('OSRM driving steps do not preserve leg distance and timing.');
    cursor += durations.length; elapsed += legDuration; totalDistance += legDistance;
  });
  if (cursor !== coordinates.length - 1 || Math.abs(elapsed - duration) > 1 || Math.abs(totalDistance - distance) > 1) throw new Error('OSRM route totals or geometry are inconsistent.');
  return {
    graph, edges: timings,
    path: { geometry: { type: 'LineString', coordinates }, distanceMeters: distance, durationSeconds: duration, steps,
      snappedOrigin: snapped[0], snappedDestination: snapped[snapped.length - 1], ...(snapped.length > 2 ? { snappedWaypoints: snapped.slice(1, -1) } : {}) },
  };
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length && Number(length) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error('OSRM response exceeds the validation size limit.');
  }
  if (!response.body) throw new Error('OSRM returned an empty response.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let lengthRead = 0;
  const onAbort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      lengthRead += value.byteLength;
      if (lengthRead > MAX_RESPONSE_BYTES) throw new Error('OSRM response exceeds the validation size limit.');
      chunks.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => undefined); throw error; }
  finally { signal.removeEventListener('abort', onAbort); reader.releaseLock(); }
  const bytes = new Uint8Array(lengthRead);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('OSRM returned invalid JSON.'); }
}

function publishedAreas(closures: Closure[], deadline: number): EventArea[] {
  const published = closures.filter(closure => closure.status === 'published');
  if (published.length > 256) throw new Error('Too many published restrictions to validate this journey safely.');
  let vertices = 0;
  return published.map(closure => {
    checkDeadline(deadline);
    const start = Date.parse(closure.startsAt), end = closure.endsAt === null ? Infinity : Date.parse(closure.endsAt);
    if (!instantSchema.safeParse(closure.startsAt).success || (closure.endsAt !== null && !instantSchema.safeParse(closure.endsAt).success) || !Number.isFinite(start) || Number.isNaN(end) || end <= start) throw new Error(`Published closure “${closure.title}” has an invalid time window; review it before routing.`);
    if (!polygonSchema.safeParse(closure.geometry).success) throw new Error(`Published closure “${closure.title}” has invalid geometry; review it before routing.`);
    const points = closure.geometry.coordinates.flat(); vertices += points.length;
    if (vertices > 20_000) throw new Error('Published restriction geometry exceeds the safe planning limit.');
    return { closure, start, end, bounds: bounds(points), vertices: points.length };
  });
}

function routePath(route: RouteGeometry, departure: number): RoutePath {
  return { ...structuredClone(route.path), departureAt: new Date(departure).toISOString(), arrivalAt: new Date(departure + route.path.durationSeconds * 1000).toISOString() };
}

/** Online national driving adapter; the historical name is internal only. It
 * stores road geometries, never a closure-validated plan or a national road graph. */
export function createWorldJourneyPlanner(options: WorldRoutingOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const interval = options.minimumIntervalMs ?? 1000, timeoutMs = options.timeoutMs ?? 15_000;
  const base = (options.baseUrl ?? process.env.OSRM_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const cache = new Map<string, ProviderGeometry>(), pending = new Map<string, Promise<ProviderGeometry>>();
  let nextStart = 0, startTail = Promise.resolve(), cachedPoints = 0;
  const removeCached = (key: string) => {
    const value = cache.get(key);
    if (value) cachedPoints -= value.routes.reduce((n, route) => n + route.graph.nodes.length, 0);
    cache.delete(key);
  };

  const loadGeometry = async (places: PlanRequest['origin'][]): Promise<ProviderGeometry> => {
    const baseUrl = new URL(base);
    if (!['https:', 'http:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new Error('Configure OSRM_BASE_URL as an HTTP(S) routing service URL.');
    const encoded = places.map(place => place.coordinate.join(',')).join(';');
    const url = `${base}/route/v1/driving/${encoded}?alternatives=3&steps=true&geometries=geojson&overview=full&annotations=duration,distance&generate_hints=false&radiuses=${places.map(() => SNAP_METERS).join(';')}`;
    const cached = cache.get(url);
    if (cached && now() - cached.fetchedAt < CACHE_TTL_MS) { cache.delete(url); cache.set(url, cached); return cached; }
    if (cached) removeCached(url);
    const inflight = pending.get(url); if (inflight) return inflight;
    if (pending.size >= MAX_PENDING_REQUESTS) throw new Error('The routing request queue is full. Try again shortly.');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('OSRM routing timed out. Try again shortly.')); }, timeoutMs); });
    const previous = startTail;
    let release!: () => void;
    startTail = new Promise<void>(resolve => { release = resolve; });
    const operation = (async (): Promise<ProviderGeometry> => {
      try {
        const payload = await Promise.race([(async () => {
          await previous;
          try {
            const delay = Math.max(0, nextStart - now());
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            if (controller.signal.aborted) throw new Error('OSRM routing timed out.');
            nextStart = now() + interval;
          } finally { release(); }
          const response = await fetcher(url, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'Manzil-local-routing/0.1' } });
          if (!response.ok && response.status !== 400) throw new Error(`OSRM routing service is unavailable (HTTP ${response.status}).`);
          return boundedJson(response, controller.signal);
        })(), timeout]);
        const data = object(payload, 'routing response');
        if (data.code === 'NoRoute' || data.code === 'NoSegment') throw new Error('No connected supported driving route was found for these locations.');
        if (data.code !== 'Ok') throw new Error('OSRM could not calculate a supported driving route.');
        if (!Array.isArray(data.waypoints) || data.waypoints.length !== places.length) throw new Error('OSRM did not return every snapped stop.');
        const snapped = data.waypoints.map((rawPoint, i) => {
          const point = object(rawPoint, 'snapped point'), location = coordinate(point.location);
          if (nonnegative(point.distance, 'snap distance') > SNAP_METERS || distanceMeters(places[i].coordinate, location) > SNAP_METERS) throw new Error(`Select the start, destination and stops within ${SNAP_METERS} metres of a supported car road.`);
          if (!isInPakistan(location)) throw new Error('A location snapped outside Pakistan. Move the pin to a supported road inside Pakistan.');
          return location;
        });
        if (!Array.isArray(data.routes) || !data.routes.length) throw new Error('OSRM returned no connected road routes.');
        const fetchedAt = now();
        const dataVersion = typeof data.data_version === 'string' && data.data_version.length <= 100 ? data.data_version : 'date-not-supplied';
        const version = `osrm-driving-${dataVersion}`;
        const routes = data.routes.slice(0, 3).map(route => parseRoute(route, snapped, version, fetchedAt));
        const value = { routes, version, fetchedAt };
        const pointCount = routes.reduce((n, route) => n + route.graph.nodes.length, 0);
        if (pointCount <= MAX_CACHED_POINTS) {
          while (cache.size >= MAX_CACHE_ENTRIES || cachedPoints + pointCount > MAX_CACHED_POINTS) removeCached(cache.keys().next().value!);
          cache.set(url, value); cachedPoints += pointCount;
        }
        return value;
      } finally { if (timer) clearTimeout(timer); pending.delete(url); }
    })();
    pending.set(url, operation);
    return operation;
  };

  return async (request: PlanRequest, closures: Closure[], eventRevision: number): Promise<PlanResponse> => {
    const response: PlanResponse = { options: [], baseline: null, conflicts: [], warnings: [
      'Online OSRM driving estimates use road data and ordinary speeds, without live traffic.',
      'Closure checks include a 30-second margin plus conservative uncertainty for unallocated turn time.',
      'Only published restrictions known to this app are checked; coverage and road conditions may be incomplete.',
      'OSRM offers a limited set of routes and cannot guarantee a detour around every restriction.',
    ], evaluatedAt: new Date(now()).toISOString(), graphVersion: 'osrm-driving', eventRevision, source: 'osrm' };
    try {
      if (!planSchema.safeParse(request).success) throw new Error('Choose valid start, destination, ordered stops and departure time, with at most five stops.');
      const places = [request.origin, ...(request.waypoints ?? []), request.destination];
      if (places.some(place => !isInPakistan(place.coordinate))) throw new Error('Select the start, destination and every stop inside Pakistan.');
      // Validate every published schedule before network/cache access, even for a distant closure.
      const areas = publishedAreas(closures, performance.now() + 3000);
      const geometry = await loadGeometry(places), departure = Date.parse(request.departureAt);
      response.graphVersion = geometry.version;
      const deadline = performance.now() + 3000;
      const prepared = geometry.routes.map(route => {
        const relevant = areas.filter(area => overlap(area.bounds, route.graph.bounds));
        if (relevant.reduce((n, area) => n + area.vertices * route.edges.length, 0) > 12_000_000) throw new Error('Route and restriction geometry exceeds the safe validation limit. Try a shorter journey.');
        return { route, areas: relevant.map(area => ({ ...area, fractions: closureEdgeFractions(route.graph, area.closure.geometry as Polygon, deadline) })) };
      });
      const conflicts = (candidate: typeof prepared[number], time: number): RouteConflict[] => {
        checkDeadline(deadline);
        const found: RouteConflict[] = [];
        for (const area of candidate.areas) {
          let first = Infinity, last = -Infinity;
          for (const edge of candidate.route.edges) for (const [a, b] of area.fractions.get(edge.index) ?? []) {
            const seconds = edge.finish - edge.start;
            const entry = time + (edge.start + seconds * a) * 1000;
            const exit = time + (edge.start + seconds * b + edge.turnUncertainty) * 1000;
            if (entry - TIME_MARGIN_MS < area.end && exit + TIME_MARGIN_MS > area.start) { first = Math.min(first, entry); last = Math.max(last, exit); }
          }
          if (Number.isFinite(first)) found.push({ closureId: area.closure.id, title: area.closure.title, entryAt: new Date(first).toISOString(), exitAt: new Date(last).toISOString() });
        }
        checkDeadline(deadline);
        return found;
      };
      response.baseline = routePath(geometry.routes[0], departure);
      response.conflicts = conflicts(prepared[0], departure);
      response.upcoming = prepared[0].areas.filter(area => area.fractions.size && area.start > departure && area.start <= departure + 24 * 3600_000)
        .sort((a, b) => a.start - b.start).map(({ closure }) => ({ closureId: closure.id, title: closure.title, startsAt: closure.startsAt, endsAt: closure.endsAt }));
      const add = (candidate: typeof prepared[number], kind: RouteOption['kind'], offset: number, index: number) => {
        const warnings = ['Validated against the current published restrictions known to this app. Recheck before departure.'];
        if (departure < now() - 60_000) warnings.push('Past departure: this is a hypothetical schedule replay.');
        if (areas.some(area => area.end !== Infinity && departure + offset * 60_000 >= area.end)) warnings.push('Announced reopening times remain an assumption unless separately confirmed.');
        const label = kind === 'direct' ? 'Your planned route' : kind === 'detour' ? 'Avoid the closure' : kind === 'alternative' ? `Alternative route ${index + 1}` : offset < 0 ? `Leave ${-offset} minutes earlier` : `Leave ${offset} minutes later`;
        response.options.push({ ...routePath(candidate.route, departure + offset * 60_000), id: `${kind}-${index}-${offset}`, kind, label, validation: 'clear', warnings });
      };
      const seen = new Set<string>();
      for (const [index, candidate] of prepared.entries()) {
        if (conflicts(candidate, departure).length) continue;
        const key = JSON.stringify(candidate.route.path.geometry.coordinates);
        if (seen.has(key)) continue;
        seen.add(key);
        add(candidate, response.options.length ? 'alternative' : response.conflicts.length ? 'detour' : 'direct', 0, index);
      }
      if (request.compareDepartures && response.conflicts.length) {
        for (const offsets of [[-15, -30], [15, 30, 60]]) {
          for (const offset of offsets) {
            const time = departure + offset * 60_000;
            if (departure >= now() - 60_000 && time < now()) continue;
            const clear = prepared.find(candidate => !conflicts(candidate, time).length);
            if (clear) { add(clear, offset < 0 ? 'leave_earlier' : 'leave_later', offset, 0); break; }
          }
        }
      }
      if (!response.options.length) response.unavailableReason = 'No closure-clear driving option was returned for this time. Try another departure or endpoint; the online provider cannot search arbitrary custom exclusions.';
      if (places.some((place, i) => distanceMeters(place.coordinate, i === 0 ? geometry.routes[0].path.snappedOrigin : i === places.length - 1 ? geometry.routes[0].path.snappedDestination : geometry.routes[0].path.snappedWaypoints![i - 1]) > 30)) response.warnings.push('Pins snap to nearby car roads within 220 m. Access between pins and road points is not routed.');
    } catch (error) {
      // Never retain partially validated choices if any validation or timing check fails.
      response.options = [];
      response.unavailableReason = error instanceof Error ? error.message : 'Online routing is unavailable. Try again shortly.';
    }
    return response;
  };
}

export const planWorldJourney = createWorldJourneyPlanner();
