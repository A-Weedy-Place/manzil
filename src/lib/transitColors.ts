import type { TransitAvailability, TransitNetwork } from '../../shared/transit';

export const TRANSIT_FALLBACK_COLOR = '#376edb';
export const TRANSIT_UNCERTAIN_COLOR = '#697781';
/** White badge text meets 4.5:1 against each colour. Red hues and neutral grey
 * stay outside the identity palette; the map retains labels and selection too. */
export const TRANSIT_ROUTE_PALETTE = ['#2563eb', '#168647', '#8043d7', '#087f9c', '#947000', '#a52ab2', '#07847f', '#4d50c8', '#547c0d', '#2278b9'] as const;
export const TRANSIT_NEARBY_METERS = 250;
type ColorNetwork = Pick<TransitNetwork, 'version' | 'routes' | 'patterns' | 'stops'>;
type Point = { x: number; y: number };
export interface TransitColorScheme {
  colors: ReadonlyMap<string, string>;
  /** Contact weights prioritize long shared corridors over a single crossing.
   * These are display-neighbour relationships, never routing connectivity. */
  adjacency: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

/** Keep the legacy publisher-colour sanitizer available to other callers. */
export function transitColor(value?: string): string {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return TRANSIT_FALLBACK_COLOR;
  const [r, g, b] = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (delta < .12) return TRANSIT_FALLBACK_COLOR;
  const hue = ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
  return hue < 45 || hue > 315 ? TRANSIT_FALLBACK_COLOR : value;
}

const compare = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const valid = (point: number[]): boolean => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) < 85;
const distanceSquared = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function oklab(hex: string): number[] {
  const [r, g, b] = [1, 3, 5].map(index => {
    const v = parseInt(hex.slice(index, index + 2), 16) / 255;
    return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
const labs = TRANSIT_ROUTE_PALETTE.map(oklab);
const colorDistance = labs.map(a => labs.map(b => Math.hypot(...a.map((value, index) => value - b[index]))));

function graph(network: ColorNetwork): Map<string, Map<string, number>> {
  const routes = [...network.routes].sort(compare), patterns = [...network.patterns].sort(compare);
  const adjacency = new Map(routes.map(route => [route.id, new Map<string, number>()]));
  const stops = new Map(network.stops.map(stop => [stop.id, stop.coordinate]));
  const reference = [...network.stops].sort(compare).find(stop => valid(stop.coordinate))?.coordinate ?? [73, 33.7];
  const scaleX = 111195 * Math.cos(reference[1] * Math.PI / 180);
  const project = (coordinate: number[]): Point => ({ x: (coordinate[0] - reference[0]) * scaleX, y: (coordinate[1] - reference[1]) * 111195 });
  const points = new Map(routes.map(route => [route.id, new Map<string, Point>()]));
  function add(routeId: string, point: Point) {
    // Deduplicate return directions and dense vertices in 60 m cells. Choosing
    // the point nearest the cell centre keeps this independent of input order.
    const x = Math.floor(point.x / 60), y = Math.floor(point.y / 60), key = `${x}:${y}`;
    const bucket = points.get(routeId);
    if (!bucket) return;
    const previous = bucket.get(key), centre = { x: (x + .5) * 60, y: (y + .5) * 60 };
    if (!previous || distanceSquared(point, centre) < distanceSquared(previous, centre)) bucket.set(key, point);
  }
  for (const pattern of patterns) {
    // Never sample a synthetic connector across a documented gap. If a source
    // supplies break indexes without separate geometry, use its placed stops.
    const segments = pattern.geometrySegments ?? (pattern.breakAfterStopIndexes?.length ? [] : [pattern.geometry]);
    for (const segment of segments) {
      for (let index = 0; index < segment.coordinates.length; index++) {
        const coordinate = segment.coordinates[index];
        if (!valid(coordinate)) continue;
        const end = project(coordinate), previous = segment.coordinates[index - 1];
        add(pattern.routeId, end);
        if (!previous || !valid(previous)) continue;
        const start = project(previous), steps = Math.min(256, Math.ceil(Math.sqrt(distanceSquared(start, end)) / 120));
        for (let step = 1; step < steps; step++) add(pattern.routeId, { x: start.x + (end.x - start.x) * step / steps, y: start.y + (end.y - start.y) * step / steps });
      }
    }
    for (const stopId of pattern.stopIds) {
      const coordinate = stops.get(stopId);
      if (coordinate && valid(coordinate)) add(pattern.routeId, project(coordinate));
    }
  }
  const grid = new Map<string, Map<string, Point[]>>();
  for (const route of routes) {
    const routePoints = [...points.get(route.id)!.values()].sort((a, b) => a.x - b.x || a.y - b.y);
    for (const point of routePoints) {
      const x = Math.floor(point.x / TRANSIT_NEARBY_METERS), y = Math.floor(point.y / TRANSIT_NEARBY_METERS);
      const contacts = new Map<string, number>();
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const [otherId, positions] of grid.get(`${x + dx}:${y + dy}`) ?? []) {
          if (otherId === route.id) continue;
          for (const other of positions) {
            const squared = distanceSquared(point, other);
            if (squared <= TRANSIT_NEARBY_METERS ** 2) contacts.set(otherId, Math.max(contacts.get(otherId) ?? 0, 1 + 3 * (1 - squared / TRANSIT_NEARBY_METERS ** 2)));
          }
        }
      }
      for (const [otherId, weight] of contacts) {
        const total = (adjacency.get(route.id)!.get(otherId) ?? 0) + weight;
        adjacency.get(route.id)!.set(otherId, total); adjacency.get(otherId)!.set(route.id, total);
      }
      const key = `${x}:${y}`;
      if (!grid.has(key)) grid.set(key, new Map());
      const bucket = grid.get(key)!;
      if (!bucket.has(route.id)) bucket.set(route.id, []);
      bucket.get(route.id)!.push(point);
    }
  }
  return adjacency;
}

function assign(adjacency: ReadonlyMap<string, ReadonlyMap<string, number>>): Map<string, string> {
  const ids = [...adjacency.keys()].sort(), selected = new Map<string, number>();
  const degrees = new Map(ids.map(id => [id, [...adjacency.get(id)!.values()].reduce((sum, value) => sum + value, 0)]));
  while (selected.size < ids.length) {
    let next = '', saturation = -1, degree = -1;
    for (const id of ids) {
      if (selected.has(id)) continue;
      const count = new Set([...adjacency.get(id)!.keys()].flatMap(neighbor => selected.has(neighbor) ? [selected.get(neighbor)!] : [])).size;
      if (count > saturation || count === saturation && degrees.get(id)! > degree) { next = id; saturation = count; degree = degrees.get(id)!; }
    }
    // Give isolated components a stable seed rather than cycling catalogue order.
    const seed = [...next].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % TRANSIT_ROUTE_PALETTE.length;
    let best = seed, conflict = Infinity, cost = Infinity;
    for (let offset = 0; offset < TRANSIT_ROUTE_PALETTE.length; offset++) {
      const candidate = (seed + offset) % TRANSIT_ROUTE_PALETTE.length;
      let sameColorWeight = 0, separationCost = 0;
      for (const [neighbor, weight] of adjacency.get(next)!) {
        const color = selected.get(neighbor);
        if (color === undefined) continue;
        if (color === candidate) sameColorWeight += weight;
        separationCost += weight / (colorDistance[candidate][color] + .04) ** 2;
      }
      if (sameColorWeight < conflict || sameColorWeight === conflict && separationCost < cost) { best = candidate; conflict = sameColorWeight; cost = separationCost; }
    }
    selected.set(next, best);
  }
  return new Map(ids.map(id => [id, TRANSIT_ROUTE_PALETTE[selected.get(id)!]]));
}

type Cached = { version: string; routes: ColorNetwork['routes']; patterns: ColorNetwork['patterns']; stops: ColorNetwork['stops']; scheme: TransitColorScheme };
const byNetwork = new WeakMap<ColorNetwork, Cached>();
const byPatterns = new WeakMap<ColorNetwork['patterns'], Cached>();
const byGeometry = new Map<string, TransitColorScheme>();
/** Inputs follow the app's immutable network contract. Clock, selection,
 * availability and language changes never rebuild spatial relationships. New
 * response objects reuse a bounded cache only when their full geometry agrees. */
export function transitColorScheme(network: ColorNetwork): TransitColorScheme {
  const cached = byNetwork.get(network) ?? byPatterns.get(network.patterns);
  if (cached?.version === network.version && cached.routes === network.routes && cached.patterns === network.patterns && cached.stops === network.stops) {
    byNetwork.set(network, cached);
    return cached.scheme;
  }
  const key = JSON.stringify([network.version, [...network.routes].sort(compare).map(route => route.id), [...network.patterns].sort(compare).map(pattern => [pattern.id, pattern.routeId, pattern.stopIds, pattern.geometrySegments ?? pattern.geometry, pattern.breakAfterStopIndexes]), [...network.stops].sort(compare).map(stop => [stop.id, stop.coordinate])]);
  let scheme = byGeometry.get(key);
  if (!scheme) {
    const adjacency = graph(network);
    scheme = { colors: assign(adjacency), adjacency };
    byGeometry.set(key, scheme);
    if (byGeometry.size > 4) byGeometry.delete(byGeometry.keys().next().value!);
  }
  const entry = { version: network.version, routes: network.routes, patterns: network.patterns, stops: network.stops, scheme };
  byNetwork.set(network, entry); byPatterns.set(network.patterns, entry);
  return scheme;
}

export function transitRouteColor(network: ColorNetwork, routeId: string, availability: TransitAvailability = 'available'): string {
  return availability !== 'available' ? TRANSIT_UNCERTAIN_COLOR : transitColorScheme(network).colors.get(routeId) ?? TRANSIT_FALLBACK_COLOR;
}
