import type { Place } from '../../shared/types';
import { HttpError } from '../errors';
import { isInPakistan } from './pakistan';

export interface PlaceSearchOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}
const CACHE_TTL = 10 * 60_000;
const MAX_CACHE = 100;
const MAX_PENDING = 12;
const MIN_INTERVAL = 1000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const copyPlaces = (places: Place[]): Place[] => places.map(place => ({ ...place, coordinate: [...place.coordinate] }));
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

/** Islamabad sector punctuation is optional; never guess a different place name. */
export function normalizePlaceQuery(query: string): string {
  const clean = query.trim().replace(/\s+/g, ' ');
  const sector = /^([d-i])\s*[-–—]?\s*(\d{1,2})(?:\s*\/\s*([1-4]))?(\s+(?:islamabad|اسلام آباد))?$/i.exec(clean);
  return sector ? `${sector[1].toUpperCase()}-${sector[2]}${sector[3] ? `/${sector[3]}` : ''}${sector[4] ?? ''}` : clean;
}

function unique(places: Place[]): Place[] {
  const ids = new Set<string>(), locations = new Set<string>();
  return places.filter(place => {
    const key = `${place.name.toLowerCase()}|${place.coordinate.map(value => value.toFixed(4)).join(',')}`;
    if ((place.id && ids.has(place.id)) || locations.has(key)) return false;
    if (place.id) ids.add(place.id);
    locations.add(key); return true;
  });
}

function photonPlaces(data: unknown): Place[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { features?: unknown }).features)) throw new Error('Unreadable place response.');
  return unique(((data as { features: unknown[] }).features).slice(0, 50).flatMap(feature => {
    if (!feature || typeof feature !== 'object') return [];
    const { geometry, properties } = feature as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> };
    if (geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 2 || !properties) return [];
    // The provider query is restricted too, but never trust it to enforce country scope.
    if (text(properties.countrycode).toLowerCase() !== 'pk') return [];
    const [lon, lat] = geometry.coordinates;
    if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return [];
    if (!isInPakistan([lon, lat])) return [];
    const primary = text(properties.name) || [text(properties.housenumber), text(properties.street)].filter(Boolean).join(' ') || text(properties.city);
    if (!primary) return [];
    const parts = [primary, text(properties.city), text(properties.state), text(properties.country) || 'Pakistan'];
    const name = [...new Set(parts.filter(Boolean))].join(', ').slice(0, 160);
    const osmType = text(properties.osm_type).toLowerCase();
    const osmId = typeof properties.osm_id === 'number' || typeof properties.osm_id === 'string' ? String(properties.osm_id) : '';
    const id = osmType && osmId ? `osm-${osmType}-${osmId}`.slice(0, 200) : `photon-${lon}-${lat}-${primary}`.slice(0, 200);
    return [{ id, name, coordinate: [lon, lat] as [number, number] }];
  })).slice(0, 7);
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > MAX_RESPONSE_BYTES) { void response.body?.cancel().catch(() => undefined); throw new Error('Place response exceeds the size limit.'); }
  if (!response.body) throw new Error('Place provider returned an empty response.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  const onAbort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read(); signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new Error('Place response exceeds the size limit.');
      chunks.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => undefined); throw error; }
  finally { signal.removeEventListener('abort', onAbort); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/** Lightweight online Pakistan geocoding; the bundled Islamabad search remains useful offline. */
export function createPlaceSearch(localSearch: (query: string) => Place[], options: PlaceSearchOptions = {}): (query: string) => Promise<Place[]> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const baseUrl = options.baseUrl ?? process.env.PHOTON_BASE_URL ?? 'https://photon.komoot.io';
  const timeoutMs = options.timeoutMs ?? 8000;
  const cache = new Map<string, { expires: number; places: Place[] }>();
  const inFlight = new Map<string, Promise<Place[]>>();
  let tail: Promise<unknown> = Promise.resolve(), pending = 0, lastStart = -Infinity;

  function external(query: string, key: string): Promise<Place[]> {
    const hit = cache.get(key);
    if (hit && hit.expires > now()) { cache.delete(key); cache.set(key, hit); return Promise.resolve(copyPlaces(hit.places)); }
    if (hit) cache.delete(key);
    const existing = inFlight.get(key); if (existing) return existing.then(copyPlaces);
    if (pending >= MAX_PENDING) return Promise.reject(new HttpError(503, 'Place search is busy. Please try again shortly or pick a point on the map.'));
    pending++;
    const controller = new AbortController(), deadline = now() + timeoutMs;
    const timedOut = () => new HttpError(503, 'Place search timed out. Pick a point on the map or enter lat, lng.');
    const checkDeadline = () => { if (controller.signal.aborted || now() >= deadline) throw timedOut(); };
    let timeoutTimer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutTimer = setTimeout(() => { controller.abort(); reject(timedOut()); }, timeoutMs);
    });
    const task = tail.then(async () => {
      checkDeadline();
      const delay = MIN_INTERVAL - (now() - lastStart);
      if (delay > 0) await wait(delay);
      checkDeadline();
      lastStart = now();
      const url = new URL('/api/', baseUrl);
      url.searchParams.set('q', query); url.searchParams.set('countrycode', 'PK');
      url.searchParams.set('limit', '7'); url.searchParams.set('lang', 'en');
      const response = await fetcher(url, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'Manzil localhost place search' } });
      checkDeadline();
      if (!response.ok) throw new Error(`Place provider returned HTTP ${response.status}.`);
      const places = photonPlaces(await boundedJson(response, controller.signal)); checkDeadline();
      cache.set(key, { expires: now() + CACHE_TTL, places: copyPlaces(places) });
      while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
      return places;
    });
    const result = Promise.race([task, timeout]).finally(() => {
      clearTimeout(timeoutTimer); pending--;
      if (inFlight.get(key) === result) inFlight.delete(key);
    });
    // Expired tasks do not keep later queries waiting, even if a transport ignores cancellation.
    tail = result.catch(() => undefined); inFlight.set(key, result);
    return result.then(copyPlaces);
  }

  return async query => {
    const clean = normalizePlaceQuery(query);
    if (clean.length > 160) throw new HttpError(400, 'Enter a place name of at most 160 characters.');
    const local = unique(localSearch(clean)).slice(0, 12);
    if (clean.length < 2) return copyPlaces(local);
    try {
      // Provider relevance comes first so local road-name matches cannot fill every visible slot.
      return copyPlaces(unique([...await external(clean, clean.toLowerCase()), ...local]).slice(0, 12));
    } catch (error) {
      if (local.length) return copyPlaces(local);
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, 'Place search is temporarily unavailable. Pick a point on the map or enter lat, lng.');
    }
  };
}
