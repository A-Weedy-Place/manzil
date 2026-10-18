import type { Coordinate } from '../../shared/types';

export interface LocationFix { coordinate: Coordinate; accuracy: number; timestamp: number }
export type LocationFailure = 'denied' | 'unavailable' | 'timeout';
type PositionLike = { timestamp: number; coords: { longitude: number; latitude: number; accuracy: number } };
interface LocationCallbacks { onSuccess: (fix: LocationFix) => void; onError: (reason: LocationFailure) => void; signal?: AbortSignal }

/** Browser coordinates remain estimates; never snap an uncertain fix onto a road. */
export function parseLocationFix(position: PositionLike, now = Date.now()): LocationFix | null {
  const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude];
  const age = now - position.timestamp, accuracy = position.coords.accuracy;
  if (!coordinate.every(Number.isFinite) || Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90
    || !Number.isFinite(position.timestamp) || age > 15_000 || age < -5_000 || !Number.isFinite(accuracy) || accuracy < 0) return null;
  return { coordinate, accuracy, timestamp: position.timestamp };
}

/** An explicit, cancellable acquisition. Coarse first fixes get a short chance to improve. */
export function requestLocation({ onSuccess, onError, signal }: LocationCallbacks, geolocation: Geolocation | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): () => void {
  let finished = false, best: LocationFix | null = null, watch: number | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const options: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 };
  const cancel = () => {
    finished = true; clearTimeout(deadline); signal?.removeEventListener('abort', cancel);
    if (watch !== undefined) { geolocation?.clearWatch(watch); watch = undefined; }
  };
  const succeed = (fix: LocationFix) => {
    if (finished) return; cancel();
    if (Date.now() - fix.timestamp > 15_000) onError('timeout'); else onSuccess(fix);
  };
  const fail = (reason: LocationFailure) => { if (finished) return; if (best && reason !== 'denied') succeed(best); else { cancel(); onError(reason); } };
  const error = (failure: GeolocationPositionError) => fail(failure.code === 1 ? 'denied' : failure.code === 3 ? 'timeout' : 'unavailable');
  const receive = (position: GeolocationPosition) => {
    if (finished) return;
    const fix = parseLocationFix(position); if (!fix) return;
    if (!best || fix.accuracy < best.accuracy || fix.accuracy === best.accuracy && fix.timestamp > best.timestamp) best = fix;
    if (best.accuracy <= 60) succeed(best);
  };
  if (signal?.aborted) return cancel;
  signal?.addEventListener('abort', cancel, { once: true });
  if (!geolocation) { fail('unavailable'); return cancel; }
  deadline = setTimeout(() => fail('timeout'), 15_000);
  try {
    geolocation.getCurrentPosition(position => {
      receive(position); if (finished || !best) return;
      // A phone may replace its initial Wi-Fi fix with GPS. Do not keep tracking
      // after this six-second refinement or after the caller changes context.
      if (typeof geolocation.watchPosition !== 'function' || typeof geolocation.clearWatch !== 'function') { succeed(best); return; }
      clearTimeout(deadline); deadline = setTimeout(() => { if (best) succeed(best); else fail('timeout'); }, 6_000);
      try {
        const id = geolocation.watchPosition(receive, error, { ...options, timeout: 6_000 });
        // Some adapters deliver their first callback synchronously.
        if (finished) geolocation.clearWatch(id); else watch = id;
      } catch { succeed(best); }
    }, error, options);
  } catch { fail('unavailable'); }
  return cancel;
}
