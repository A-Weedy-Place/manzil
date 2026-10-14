import { describe, expect, it } from 'vitest';
import { buildGuidance, GuidanceSession, navigationFix, nextGuidanceStep, projectOnRoute, routeMeasure } from '../src/lib/navigation';
import type { Coordinate, RouteOption, RoutePath } from '../shared/types';
const route: RoutePath = { geometry: { type: 'LineString', coordinates: [[73, 33.7], [73, 33.701], [73.001, 33.701], [73.001, 33.702]] }, distanceMeters: 315, durationSeconds: 60, departureAt: '2026-10-15T10:00:00Z', arrivalAt: '2026-10-15T10:01:00Z', steps: [{ roadName: 'Test road', instruction: 'Continue', distanceMeters: 315, durationSeconds: 60 }], snappedOrigin: [73, 33.7], snappedDestination: [73.001, 33.702] };
describe('local route guidance', () => {
  it('derives ordered left/right guidance with actual start and arrival coordinates', () => { const steps = buildGuidance(route); expect(steps.map(s => s.turn)).toEqual(['start', 'right', 'left', 'arrive']); expect(steps.at(-1)!.coordinate).toEqual(route.snappedDestination); expect(steps.every((s, i) => i === 0 || s.atMeters >= steps[i - 1].atMeters)).toBe(true); });
  it('projects a GPS point onto the route and measures lateral deviation', () => { const result = projectOnRoute(route, [73.0005, 33.70105]); expect(result.distance).toBeGreaterThan(4); expect(result.distance).toBeLessThan(7); expect(result.progress).toBeGreaterThan(140); expect(result.progress).toBeLessThan(175); });
  it('distinguishes off-route positions and preserves progression past earlier segments', () => { const total = routeMeasure(route).total; expect(projectOnRoute(route, [73.01, 33.71]).distance).toBeGreaterThan(500); expect(projectOnRoute(route, [73.001, 33.7019], total - 50).progress).toBeGreaterThan(total - 30); });
  it('retains the arrival step after the last look-ahead threshold instead of wrapping to the start', () => {
    const steps = buildGuidance(route), total = routeMeasure(route).total;
    expect(nextGuidanceStep(steps, total - 5)).toBe(steps.length - 1);
    expect(nextGuidanceStep(steps, total + 20)).toBe(steps.length - 1);
    expect(nextGuidanceStep([], 0)).toBe(-1);
    expect(nextGuidanceStep(steps, NaN)).toBe(-1);
  });
  it('rejects an unusable path or non-finite GPS without manufacturing a route match', () => {
    const empty = { ...route, geometry: { type: 'LineString' as const, coordinates: [] } };
    expect(buildGuidance(empty)).toEqual([]);
    expect(projectOnRoute(empty, [73, 33.7])).toEqual({ valid: false, distance: Infinity, progress: 0, coordinate: null });
    expect(projectOnRoute(route, [NaN, 33.7]).valid).toBe(false);
    expect(projectOnRoute(route, [73, 33.7], Infinity).valid).toBe(false);
    expect(projectOnRoute(route, [73, 33.7], routeMeasure(route).total + 1).valid).toBe(false);
    const broken = { ...route, geometry: { type: 'LineString' as const, coordinates: [[73, 33.7], [NaN, 33.7], [73.01, 33.7]] } };
    expect(routeMeasure(broken).valid).toBe(false);
  });
  it('removes adjacent duplicate vertices without inventing turns or a nonzero stationary path', () => {
    const repeated = { ...route, geometry: { type: 'LineString' as const, coordinates: [[73, 33.7], [73, 33.7], [73, 33.701], [73, 33.701]] } };
    expect(routeMeasure(repeated).coordinates).toHaveLength(2);
    expect(buildGuidance(repeated).map(step => step.turn)).toEqual(['start', 'arrive']);
    expect(routeMeasure({ ...repeated, geometry: { type: 'LineString', coordinates: [[73, 33.7], [73, 33.7]] } }).valid).toBe(false);
  });
  it('clips projection inside a long segment to the allowed backward and forward progress window', () => {
    const long = { ...route, geometry: { type: 'LineString' as const, coordinates: [[73, 33.7], [73.02, 33.7]] } };
    expect(projectOnRoute(long, [73, 33.7], 1000, 200).progress).toBeCloseTo(940, 5);
    expect(projectOnRoute(long, [73.02, 33.7], 1000, 200).progress).toBeCloseTo(1200, 5);
  });
  it('does not jump to a distant future leg when a loop returns close to the current position', () => {
    const loop = { ...route, geometry: { type: 'LineString' as const, coordinates: [[73, 33.7], [73.01, 33.7], [73.01, 33.71], [73.00001, 33.70001]] } };
    const result = projectOnRoute(loop, [73.00001, 33.70001], 0, 150);
    expect(result.valid).toBe(true);
    expect(result.progress).toBeLessThan(10);
  });
  it('prefers progress continuity at a nearly coincident return leg', () => {
    const parallel = { ...route, geometry: { type: 'LineString' as const, coordinates: [[73, 33.7], [73.001, 33.7], [73.001, 33.70002], [73, 33.70002]] } };
    expect(projectOnRoute(parallel, [73.0001, 33.700011], 0).progress).toBeLessThan(20);
  });
});

describe('fresh navigation fixes', () => {
  const now = 100000;
  const sample = (timestamp = now, accuracy = 12, coordinate: Coordinate = [73, 33.7]) => ({ timestamp, coords: { longitude: coordinate[0], latitude: coordinate[1], accuracy } });
  it('accepts a recent finite browser fix and keeps its reported accuracy', () => {
    expect(navigationFix(sample(now - 2000, 25), now)).toEqual({ coordinate: [73, 33.7], timestamp: now - 2000, accuracy: 25 });
  });
  it('rejects stale, far-future, invalid-coordinate and unknown-accuracy fixes', () => {
    for (const invalid of [sample(now - 15001), sample(now + 5001), sample(NaN), sample(now, NaN), sample(now, -1), sample(now, 61), sample(now, 10, [181, 33.7])]) expect(navigationFix(invalid, now)).toBeNull();
  });
});

describe('guidance request lifecycle', () => {
  const option = (suffix: string, path = route): RouteOption => ({ ...path, id: `route-${suffix}`, kind: 'direct', label: 'Current route', validation: 'clear', warnings: [] });
  it('cannot use an earlier plan before the first fresh replan or after a failed replan', () => {
    const gate = new GuidanceSession(), old = option('old'); gate.start();
    expect(gate.canGuide(old)).toBe(false);
    const first = gate.beginReplan()!; expect(gate.accept(first, old)).toBe(true); expect(gate.canGuide(old)).toBe(true);
    const refresh = gate.beginReplan()!; expect(gate.canGuide(old)).toBe(false);
    expect(gate.reject(refresh)).toBe(true);
    expect(gate.canGuide(old)).toBe(false); expect(gate.acceptedRoute).toBeNull();
    expect(gate.busy).toBe(false);
  });
  it('ignores a late request after Stop or after a new GPS session starts', () => {
    const gate = new GuidanceSession(), old = option('old'); const session = gate.start(), request = gate.beginReplan()!;
    gate.stop(); expect(gate.accept(request, old)).toBe(false); expect(gate.isSession(session)).toBe(false);
    gate.start(); const next = gate.beginReplan()!, fresh = option('new'); expect(gate.accept(next, fresh)).toBe(true);
    expect(gate.reject(request)).toBe(false); expect(gate.canGuide(fresh)).toBe(true);
  });
  it('prevents concurrent replans and requires the exact accepted route object', () => {
    const gate = new GuidanceSession(), fresh = option('same-id'); gate.start(); const request = gate.beginReplan()!;
    expect(gate.beginReplan()).toBeNull(); expect(gate.accept(request, fresh)).toBe(true);
    expect(gate.canGuide({ ...fresh })).toBe(false);
    gate.invalidateRoute(); expect(gate.canGuide(fresh)).toBe(false);
  });
  it('rejects a fresh response with unusable geometry rather than reactivating guidance', () => {
    const gate = new GuidanceSession(); gate.start(); const request = gate.beginReplan()!;
    const invalid = option('invalid', { ...route, geometry: { type: 'LineString', coordinates: [] } });
    expect(gate.accept(request, invalid)).toBe(false); expect(gate.busy).toBe(false); expect(gate.acceptedRoute).toBeNull();
  });
});
