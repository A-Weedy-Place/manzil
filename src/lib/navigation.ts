import type { Coordinate, RouteOption, RoutePath } from '../../shared/types';
export interface GuidanceStep { coordinate: Coordinate; atMeters: number; instruction: string; roadName?: string; turn: 'start' | 'left' | 'right' | 'straight' | 'arrive' }
const R = 6371000;
export function validCoordinate(value: unknown): value is Coordinate { return Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'number' && Number.isFinite(item)) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90; }
export function meters(a: Coordinate, b: Coordinate) {
  if (!validCoordinate(a) || !validCoordinate(b)) return Infinity;
  const lat = (b[1] - a[1]) * Math.PI / 180, lng = (b[0] - a[0]) * Math.PI / 180;
  const value = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(lng / 2) ** 2;
  const bounded = Math.max(0, Math.min(1, value));
  return 2 * R * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}
export function routeMeasure(route: RoutePath) {
  const supplied = route.geometry?.coordinates;
  if (route.geometry?.type !== 'LineString' || !Array.isArray(supplied) || !supplied.every(validCoordinate)) return { coordinates: [] as Coordinate[], cumulative: [] as number[], total: 0, valid: false };
  const coordinates = (supplied as Coordinate[]).filter((point, index) => !index || point[0] !== supplied[index - 1][0] || point[1] !== supplied[index - 1][1]), cumulative = [0];
  for (let i = 1; i < coordinates.length; i++) cumulative.push(cumulative[i - 1] + meters(coordinates[i - 1], coordinates[i]));
  const total = cumulative.at(-1) ?? 0;
  return { coordinates, cumulative, total, valid: coordinates.length >= 2 && Number.isFinite(total) && total > 0 };
}
function bearing(a: Coordinate, b: Coordinate) {
  const radians = Math.PI / 180, delta = (b[0] - a[0]) * radians;
  return Math.atan2(Math.sin(delta) * Math.cos(b[1] * radians), Math.cos(a[1] * radians) * Math.sin(b[1] * radians) - Math.sin(a[1] * radians) * Math.cos(b[1] * radians) * Math.cos(delta)) * 180 / Math.PI;
}
export function buildGuidance(route: RoutePath): GuidanceStep[] {
  const { coordinates, cumulative, total, valid } = routeMeasure(route);
  if (!valid) return [];
  const roads: { end: number; name: string }[] = []; let end = 0;
  for (const step of route.steps) { end += step.distanceMeters; roads.push({ end, name: step.roadName || 'the mapped road' }); }
  const nameAt = (at: number) => roads.find(r => r.end > at)?.name ?? roads.at(-1)?.name ?? 'the mapped road';
  const steps: GuidanceStep[] = [{ coordinate: coordinates[0], atMeters: 0, instruction: `Head onto ${nameAt(0)}`, roadName: nameAt(0), turn: 'start' }];
  for (let i = 1; i < coordinates.length - 1; i++) {
    if (cumulative[i] - steps.at(-1)!.atMeters < 45 || total - cumulative[i] < 30) continue;
    // Look ~20 m ahead/behind to avoid noise from short OSM shape segments.
    let before = i - 1, after = i + 1;
    while (before > 0 && cumulative[i] - cumulative[before] < 20) before--;
    while (after < coordinates.length - 1 && cumulative[after] - cumulative[i] < 20) after++;
    const angle = ((bearing(coordinates[i], coordinates[after]) - bearing(coordinates[before], coordinates[i]) + 540) % 360) - 180;
    if (Math.abs(angle) < 40) continue;
    const turn = angle > 0 ? 'right' : 'left';
    steps.push({ coordinate: coordinates[i], atMeters: cumulative[i], instruction: `${Math.abs(angle) > 140 ? 'Follow the route around' : `Bear ${turn}`} toward ${nameAt(cumulative[i] + 25)}`, roadName: nameAt(cumulative[i] + 25), turn });
  }
  steps.push({ coordinate: coordinates.at(-1)!, atMeters: total, instruction: 'Reach the destination road point', turn: 'arrive' });
  return steps;
}
export function nextGuidanceStep(steps: GuidanceStep[], progress: number, lookAhead = 12): number {
  if (!steps.length || !Number.isFinite(progress)) return -1;
  const next = steps.findIndex(step => step.atMeters > Math.max(0, progress) + lookAhead);
  return next < 0 ? steps.length - 1 : next;
}

export interface RouteProjection { valid: boolean; distance: number; progress: number; coordinate: Coordinate | null }
export function projectOnRoute(route: RoutePath, position: Coordinate, previousMeters = 0, maxAdvanceMeters = 300): RouteProjection {
  const { coordinates, cumulative, total, valid } = routeMeasure(route);
  const unavailable: RouteProjection = { valid: false, distance: Infinity, progress: 0, coordinate: null };
  if (!valid || !validCoordinate(position) || !Number.isFinite(previousMeters) || previousMeters < 0 || previousMeters > total || !Number.isFinite(maxAdvanceMeters) || maxAdvanceMeters < 0) return unavailable;
  let bestDistance = Infinity, bestScore = Infinity, progress = 0, coordinate: Coordinate | null = null;
  const minimum = Math.max(0, previousMeters - 60), maximum = Math.min(total, previousMeters + maxAdvanceMeters);
  const scaleX = Math.cos(position[1] * Math.PI / 180) * Math.PI / 180 * R, scaleY = Math.PI / 180 * R;
  for (let i = 1; i < coordinates.length; i++) {
    if (cumulative[i] < minimum || cumulative[i - 1] > maximum) continue;
    const a = coordinates[i - 1], b = coordinates[i];
    const ax = (a[0] - position[0]) * scaleX, ay = (a[1] - position[1]) * scaleY;
    const dx = (b[0] - a[0]) * scaleX, dy = (b[1] - a[1]) * scaleY;
    const length = cumulative[i] - cumulative[i - 1];
    const lower = Math.max(0, (minimum - cumulative[i - 1]) / length), upper = Math.min(1, (maximum - cumulative[i - 1]) / length);
    const fraction = Math.max(lower, Math.min(upper, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const distance = Math.hypot(ax + dx * fraction, ay + dy * fraction);
    const candidateProgress = cumulative[i - 1] + fraction * length;
    // At crossings/parallel roads, prefer continuity over a marginally closer
    // future leg. This remains an estimate, not road/lane map matching.
    const score = distance + Math.max(0, candidateProgress - previousMeters) / Math.max(100, maxAdvanceMeters) * 4;
    if (score < bestScore) { bestScore = score; bestDistance = distance; progress = candidateProgress; coordinate = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]; }
  }
  return coordinate ? { valid: true, distance: bestDistance, progress: Math.min(total, Math.max(0, progress)), coordinate } : unavailable;
}

export interface NavigationFix { coordinate: Coordinate; timestamp: number; accuracy: number }
export function navigationFix(position: { timestamp: number; coords: { longitude: number; latitude: number; accuracy: number } }, now = Date.now()): NavigationFix | null {
  const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude], age = now - position.timestamp, accuracy = position.coords.accuracy;
  if (!validCoordinate(coordinate) || !Number.isFinite(position.timestamp) || age > 15000 || age < -5000 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 60) return null;
  return { coordinate, timestamp: position.timestamp, accuracy };
}

export interface GuidanceRequest { session: number; request: number }
/** Old callbacks cannot reactivate guidance after a stop, failure or newer run. */
export class GuidanceSession {
  private session = 0;
  private request = 0;
  private active = false;
  private pending = false;
  private route: RouteOption | null = null;
  get running() { return this.active; }
  get busy() { return this.pending; }
  get acceptedRoute() { return this.route; }
  start() { this.session++; this.active = true; this.pending = false; this.route = null; return this.session; }
  stop() { this.session++; this.request++; this.active = false; this.pending = false; this.route = null; }
  isSession(session: number) { return this.active && this.session === session; }
  isCurrent(token: GuidanceRequest) { return this.isSession(token.session) && this.request === token.request; }
  beginReplan(): GuidanceRequest | null {
    if (!this.active || this.pending) return null;
    this.pending = true; this.route = null;
    return { session: this.session, request: ++this.request };
  }
  accept(token: GuidanceRequest, route: RouteOption): boolean {
    if (!this.isCurrent(token)) return false;
    this.pending = false;
    if (route.validation !== 'clear' || !routeMeasure(route).valid || !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0) { this.route = null; return false; }
    this.route = route; return true;
  }
  reject(token: GuidanceRequest): boolean {
    if (!this.isCurrent(token)) return false;
    this.pending = false; this.route = null; return true;
  }
  invalidateRoute() { this.route = null; }
  canGuide(route: RouteOption) { return this.active && !this.pending && this.route === route; }
}
