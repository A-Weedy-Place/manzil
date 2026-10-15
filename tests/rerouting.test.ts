import { describe, expect, it } from 'vitest';
import { RerouteTracker, StopTracker } from '../src/lib/rerouting';
import type { NavigationFix, RouteProjection } from '../src/lib/navigation';
const fix = (timestamp: number, accuracy = 8): NavigationFix => ({ coordinate: [73, 33.7], accuracy, timestamp });
const projection = (distance: number): RouteProjection => ({ valid: true, distance, progress: 10, coordinate: [73, 33.7] });
describe('automatic reroute decisions', () => {
  it('requires sustained deviation and rejects one noisy fix or an uncertainty-sized offset', () => {
    const tracker = new RerouteTracker();
    expect(tracker.observe(fix(1000), projection(80)).reroute).toBe(false);
    expect(tracker.observe(fix(2000), projection(5)).offRoute).toBe(false);
    expect(tracker.observe(fix(3000, 50), projection(70)).reroute).toBe(false);
    expect(tracker.observe(fix(4000), projection(80)).reroute).toBe(false);
    expect(tracker.observe(fix(6000), projection(85)).reroute).toBe(false);
    expect(tracker.observe(fix(8000), projection(90)).reroute).toBe(true);
  });
  it('caps retries with backoff and permits a fresh attempt after the cooldown', () => {
    const tracker = new RerouteTracker(); tracker.attempting(1000); expect(tracker.canRetry(12000)).toBe(false);
    tracker.failed(2000); expect(tracker.canRetry(13999)).toBe(false); expect(tracker.canRetry(14000)).toBe(true);
    tracker.failed(14000); expect(tracker.canRetry(37000)).toBe(false); expect(tracker.canRetry(38000)).toBe(true);
    tracker.succeeded(); tracker.failed(40000); expect(tracker.canRetry(52000)).toBe(true);
  });
  it('keeps remaining stops until repeated accurate matched fixes arrive there', () => {
    const tracker = new StopTracker(), stops: [number, number][] = [[73, 33.7], [73.01, 33.7]];
    tracker.observe({ ...fix(1000), coordinate: [73.001, 33.7] }, stops, true);
    expect(tracker.observe(fix(2000, 50), stops, true)).toBe(0);
    expect(tracker.observe(fix(3000), stops, false)).toBe(0);
    expect(tracker.observe(fix(4000), stops, true)).toBe(0);
    expect(tracker.observe(fix(5000), stops, true)).toBe(1);
    expect(tracker.observe(fix(6000), stops, true)).toBe(1);
    tracker.reset(); expect(tracker.visited).toBe(0);
  });
});
