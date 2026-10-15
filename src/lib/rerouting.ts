import { meters, type NavigationFix, type RouteProjection } from './navigation';
import type { Coordinate } from '../../shared/types';

/** Sustained accuracy-aware deviation, hysteresis and bounded retries. */
export class RerouteTracker {
  private outsideSince: number | null = null;
  private outsideCount = 0;
  private nextAttemptAt = 0;
  private failures = 0;
  reset() { this.outsideSince = null; this.outsideCount = 0; this.nextAttemptAt = 0; this.failures = 0; }
  observe(fix: NavigationFix, projection: RouteProjection) {
    const distance = projection.valid ? projection.distance : Infinity;
    const threshold = Math.max(35, fix.accuracy * 1.7);
    if (distance <= Math.min(25, threshold * 0.6)) { this.outsideSince = null; this.outsideCount = 0; }
    else if (distance > threshold) { this.outsideSince ??= fix.timestamp; this.outsideCount++; }
    const offRoute = this.outsideCount >= 3 && this.outsideSince !== null && fix.timestamp - this.outsideSince >= 4000;
    return { matched: distance <= threshold, offRoute, reroute: offRoute && fix.timestamp >= this.nextAttemptAt };
  }
  canRetry(now: number) { return now >= this.nextAttemptAt; }
  attempting(now: number) { this.nextAttemptAt = now + 12000; this.outsideSince = null; this.outsideCount = 0; }
  succeeded() { this.failures = 0; }
  failed(now: number) { this.nextAttemptAt = now + Math.min(60000, 12000 * 2 ** this.failures++); }
}

/** A stop needs two accurate fixes and forward route progress; nearby parallel roads alone do not count. */
export class StopTracker {
  private index = 0;
  private confirmations = 0;
  private lastTimestamp = 0;
  private armed = false;
  reset() { this.index = 0; this.confirmations = 0; this.lastTimestamp = 0; this.armed = false; }
  get visited() { return this.index; }
  observe(fix: NavigationFix, stops: Coordinate[], matched: boolean) {
    if (fix.timestamp <= this.lastTimestamp) return this.index;
    this.lastTimestamp = fix.timestamp;
    const stop = stops[this.index]; if (!stop) return this.index;
    const distance = meters(fix.coordinate, stop);
    if (distance > 55) this.armed = true;
    if (matched && fix.accuracy <= 25 && distance <= 25 && (this.armed || fix.accuracy <= 12)) this.confirmations++;
    else this.confirmations = 0;
    if (this.confirmations >= 2) { this.index++; this.confirmations = 0; this.armed = false; }
    return this.index;
  }
}
