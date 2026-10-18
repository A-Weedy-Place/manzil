import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseLocationFix, requestLocation } from '../src/lib/location';

const date = new Date('2026-10-18T10:00:00Z');
const position = (accuracy = 12, longitude = 73.05, latitude = 33.7, timestamp = Date.now()) => ({ timestamp, coords: { longitude, latitude, accuracy } }) as GeolocationPosition;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(date); });
afterEach(() => { vi.useRealTimers(); });
function provider() {
  let receive!: PositionCallback, reject!: PositionErrorCallback, update!: PositionCallback, rejectWatch!: PositionErrorCallback;
  const geo = {
    getCurrentPosition: vi.fn((success: PositionCallback, failure: PositionErrorCallback) => { receive = success; reject = failure; }),
    watchPosition: vi.fn((success: PositionCallback, failure: PositionErrorCallback) => { update = success; rejectWatch = failure; return 0; }),
    clearWatch: vi.fn(),
  };
  return { geo, receive: (fix: GeolocationPosition) => receive(fix), reject: (code: number) => reject({ code } as GeolocationPositionError), update: (fix: GeolocationPosition) => update(fix), rejectWatch: (code: number) => rejectWatch({ code } as GeolocationPositionError) };
}

it('preserves raw coordinates and uncertainty while rejecting stale, invalid and impossible fixes', () => {
  expect(parseLocationFix(position(500))).toEqual({ coordinate: [73.05, 33.7], accuracy: 500, timestamp: date.getTime() });
  for (const invalid of [position(-1), position(NaN), position(12, 181), position(12, 73, 91), position(12, NaN), position(12, 73, 33, Date.now() - 15001), position(12, 73, 33, Date.now() + 5001)]) expect(parseLocationFix(invalid)).toBeNull();
});
it('requests a new high-accuracy fix only after invocation and finishes immediately with a useful fix', () => {
  const source = provider(), onSuccess = vi.fn(), onError = vi.fn();
  requestLocation({ onSuccess, onError }, source.geo as Geolocation);
  expect(source.geo.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  source.receive(position());
  expect(onSuccess).toHaveBeenCalledWith({ coordinate: [73.05, 33.7], accuracy: 12, timestamp: date.getTime() });
  expect(source.geo.watchPosition).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('gives a coarse Wi-Fi fix a bounded chance to improve, and clears watch id zero when GPS improves', () => {
  const source = provider(), onSuccess = vi.fn(), onError = vi.fn();
  requestLocation({ onSuccess, onError }, source.geo as Geolocation); source.receive(position(500));
  expect(onSuccess).not.toHaveBeenCalled(); expect(source.geo.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 });
  vi.advanceTimersByTime(2000); source.update(position(16, 73.052, 33.701));
  expect(onSuccess).toHaveBeenCalledWith({ coordinate: [73.052, 33.701], accuracy: 16, timestamp: Date.now() });
  expect(source.geo.clearWatch).toHaveBeenCalledWith(0); expect(onError).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('returns the best available estimate without inventing precision when refinement expires', () => {
  const source = provider(), onSuccess = vi.fn(), onError = vi.fn();
  requestLocation({ onSuccess, onError }, source.geo as Geolocation); source.receive(position(500));
  vi.advanceTimersByTime(1000); source.update(position(200, 73.051, 33.701));
  vi.advanceTimersByTime(1000); source.update(position(800, 73.06, 33.71));
  vi.advanceTimersByTime(4000);
  expect(onSuccess).toHaveBeenCalledWith({ coordinate: [73.051, 33.701], accuracy: 200, timestamp: date.getTime() + 1000 });
  expect(source.geo.clearWatch).toHaveBeenCalledWith(0); expect(onError).not.toHaveBeenCalled();
});
it('does not fabricate accuracy when an older browser has no watch support', () => {
  const onSuccess = vi.fn(), onError = vi.fn();
  const geo = { getCurrentPosition: (success: PositionCallback) => success(position(500)) } as Geolocation;
  requestLocation({ onSuccess, onError }, geo);
  expect(onSuccess).toHaveBeenCalledWith({ coordinate: [73.05, 33.7], accuracy: 500, timestamp: date.getTime() }); expect(onError).not.toHaveBeenCalled();
});
it('cannot be left indefinitely busy by an adapter that never calls back', () => {
  const source = provider(), onSuccess = vi.fn(), onError = vi.fn();
  requestLocation({ onSuccess, onError }, source.geo as Geolocation); vi.advanceTimersByTime(15000);
  expect(onError).toHaveBeenCalledWith('timeout'); source.receive(position()); expect(onSuccess).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('ignores malformed coordinates and missing accuracy instead of silently accepting an unreliable point', () => {
  const source = provider(), onSuccess = vi.fn(), onError = vi.fn();
  requestLocation({ onSuccess, onError }, source.geo as Geolocation); source.receive(position(NaN)); source.receive(position(10, 200));
  vi.advanceTimersByTime(15000); expect(onSuccess).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledWith('timeout');
});
it('cancels the sensor refinement and ignores late callbacks on context cancellation', () => {
  const source = provider(), onSuccess = vi.fn(), onError = vi.fn();
  const cancel = requestLocation({ onSuccess, onError }, source.geo as Geolocation); source.receive(position(500)); cancel();
  source.update(position()); vi.advanceTimersByTime(20000);
  expect(source.geo.clearWatch).toHaveBeenCalledWith(0); expect(onSuccess).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
});
it('cancels through an AbortSignal before and during acquisition without firing an error', () => {
  const source = provider(), onSuccess = vi.fn(), onError = vi.fn(), controller = new AbortController(); controller.abort();
  requestLocation({ onSuccess, onError, signal: controller.signal }, source.geo as Geolocation); expect(source.geo.getCurrentPosition).not.toHaveBeenCalled();
  const active = new AbortController(); requestLocation({ onSuccess, onError, signal: active.signal }, source.geo as Geolocation); source.receive(position(500)); active.abort();
  source.update(position()); expect(source.geo.clearWatch).toHaveBeenCalledWith(0); expect(onSuccess).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it.each([[1, 'denied'], [2, 'unavailable'], [3, 'timeout']] as const)('reports provider error %s accurately', (code, reason) => {
  const source = provider(), onSuccess = vi.fn(), onError = vi.fn(); requestLocation({ onSuccess, onError }, source.geo as Geolocation); source.reject(code);
  expect(onError).toHaveBeenCalledWith(reason); expect(onSuccess).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('honours permission revocation during refinement instead of publishing an earlier coarse estimate', () => {
  const source = provider(), onSuccess = vi.fn(), onError = vi.fn(); requestLocation({ onSuccess, onError }, source.geo as Geolocation);
  source.receive(position(500)); source.rejectWatch(1); expect(onSuccess).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledWith('denied'); expect(source.geo.clearWatch).toHaveBeenCalledWith(0);
});
it('cleans a synchronous watch result and never publishes a fix that became stale during refinement', () => {
  const onSuccess = vi.fn(), onError = vi.fn(), clearWatch = vi.fn();
  requestLocation({ onSuccess, onError }, { getCurrentPosition: (ok: PositionCallback) => ok(position(500)), watchPosition: (ok: PositionCallback) => { ok(position(10)); return 3; }, clearWatch } as unknown as Geolocation);
  expect(onSuccess).toHaveBeenCalledOnce(); expect(clearWatch).toHaveBeenCalledWith(3); expect(vi.getTimerCount()).toBe(0);
  onSuccess.mockClear(); const source = provider(); requestLocation({ onSuccess, onError }, source.geo as Geolocation); source.receive(position(500, 73, 33, Date.now() - 14000)); vi.advanceTimersByTime(6000);
  expect(onSuccess).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledWith('timeout');
});
