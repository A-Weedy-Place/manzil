import type { Coordinate } from '../shared/types.js';
import { ISLAMABAD_WEATHER_COORDINATE, WEATHER_SOURCE_URL, weatherCondition, type WeatherReading, type WeatherResponse } from '../shared/weather.js';
import type { Repository } from './repository.js';

const HOUR = 3600_000, DAY = 24 * HOUR, MAX_STALE = 6 * HOUR, MAX_BYTES = 100_000;
export const WEATHER_CACHE_KEY = 'weather:islamabad:v1';
export const WEATHER_API_URL = 'https://api.open-meteo.com/v1/forecast?latitude=33.6844&longitude=73.0479&hourly=temperature_2m,weather_code,is_day&temperature_unit=celsius&timeformat=unixtime&timezone=UTC&forecast_days=16&past_days=2';
export interface WeatherDataset { fetchedAt: string; readings: WeatherReading[] }
interface WeatherCache { version: 1; lastAttemptAt: string; nextRefreshAt: string; dataset: WeatherDataset | null; failed: boolean }
type Collector = (now: number) => Promise<WeatherDataset>;
const hourAt = (at: number) => Math.floor(at / HOUR) * HOUR;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid weather response');
  return value as Record<string, unknown>;
};
const validTemperature = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 65;
const validCode = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && weatherCondition(value, true).icon !== 'unknown';

/** Bounded, UTC-only hourly model data. Missing rows stay unavailable, never interpolated. */
export function parseWeatherResponse(value: unknown, now = Date.now()): WeatherDataset {
  const data = object(value), units = object(data.hourly_units), hourly = object(data.hourly);
  if (data.utc_offset_seconds !== 0 || typeof data.latitude !== 'number' || !Number.isFinite(data.latitude) || typeof data.longitude !== 'number' || !Number.isFinite(data.longitude)
    || Math.abs(data.latitude - ISLAMABAD_WEATHER_COORDINATE[1]) > 0.4 || Math.abs(data.longitude - ISLAMABAD_WEATHER_COORDINATE[0]) > 0.4
    || units.temperature_2m !== '°C' || units.time !== 'unixtime') throw new Error('Unexpected weather location, timezone or units');
  const { time, temperature_2m: temperature, weather_code: codes, is_day: daylight } = hourly;
  if (![time, temperature, codes, daylight].every(Array.isArray)) throw new Error('Missing hourly weather');
  const times = time as unknown[], temperatures = temperature as unknown[], weatherCodes = codes as unknown[], days = daylight as unknown[];
  if (!times.length || times.length > 456 || [temperatures, weatherCodes, days].some(series => series.length !== times.length)) throw new Error('Unbounded hourly weather');
  const fetchedAt = new Date(now).toISOString(), readings: WeatherReading[] = [];
  let previous = -Infinity;
  for (let i = 0; i < times.length; i++) {
    const second = times[i];
    if (typeof second !== 'number' || !Number.isSafeInteger(second) || second % 3600 !== 0) throw new Error('Invalid weather hour');
    const at = second * 1000;
    if (at < hourAt(now) - 3 * DAY || at > hourAt(now) + 16 * DAY || (i && at !== previous + HOUR)) throw new Error('Unexpected weather range');
    previous = at;
    if (temperatures[i] === null || weatherCodes[i] === null || days[i] === null) continue;
    if (!validTemperature(temperatures[i]) || !validCode(weatherCodes[i]) || (days[i] !== 0 && days[i] !== 1)) throw new Error('Invalid weather reading');
    readings.push({ location: 'Islamabad', coordinate: [...ISLAMABAD_WEATHER_COORDINATE], at: new Date(at).toISOString(),
      temperatureC: temperatures[i] as number, weatherCode: weatherCodes[i] as number, isDay: days[i] === 1,
      fetchedAt, source: 'Open-Meteo', sourceUrl: WEATHER_SOURCE_URL });
  }
  if (!readings.length || !readings.some(reading => Date.parse(reading.at) === hourAt(now))) throw new Error('Current weather hour missing');
  return { fetchedAt, readings };
}

export async function collectWeather(now = Date.now()): Promise<WeatherDataset> {
  const response = await fetch(WEATHER_API_URL, { signal: AbortSignal.timeout(5000), redirect: 'error',
    headers: { Accept: 'application/json', 'User-Agent': 'Manzil/0.1 (hourly Islamabad weather prototype)' } });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || !response.body) {
    await response.body?.cancel(); throw new Error('Weather provider unavailable');
  }
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body.cancel(); throw new Error('Weather response too large'); }
  const reader = response.body.getReader(), decoder = new TextDecoder(); let json = '', bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > MAX_BYTES) throw new Error('Weather response too large');
      json += decoder.decode(part.value, { stream: true });
    }
    json += decoder.decode(); return parseWeatherResponse(JSON.parse(json), now);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Defensive validation for persisted data; metadata is shared, never personal. */
function validDataset(value: unknown, now: number): value is WeatherDataset {
  if (!value || typeof value !== 'object') return false;
  const data = value as WeatherDataset, fetched = Date.parse(data.fetchedAt);
  if (!Number.isFinite(fetched) || fetched > now + 60_000 || !Array.isArray(data.readings) || !data.readings.length || data.readings.length > 456) return false;
  let previous = -Infinity;
  for (const reading of data.readings) {
    if (!reading || typeof reading !== 'object') return false;
    const at = Date.parse(reading.at);
    if (!Number.isFinite(at) || at % HOUR || at <= previous || at < hourAt(fetched) - 3 * DAY || at > hourAt(fetched) + 16 * DAY
      || reading.location !== 'Islamabad' || reading.source !== 'Open-Meteo' || reading.sourceUrl !== WEATHER_SOURCE_URL || reading.fetchedAt !== data.fetchedAt
      || !Array.isArray(reading.coordinate) || reading.coordinate.length !== 2 || reading.coordinate[0] !== ISLAMABAD_WEATHER_COORDINATE[0] || reading.coordinate[1] !== ISLAMABAD_WEATHER_COORDINATE[1]
      || !validTemperature(reading.temperatureC) || !validCode(reading.weatherCode) || typeof reading.isDay !== 'boolean') return false;
    previous = at;
  }
  return true;
}

export class WeatherService {
  private cache: WeatherCache | null = null;
  private loaded?: Promise<void>;
  private running?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  constructor(private store: Repository, private collector: Collector = collectWeather, private clock: () => number = Date.now, private enabled = true,
    private finishRefreshBeforeResponse = false) {}
  private available() { return !this.stopped && this.store.isOpen !== false; }
  private load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const cache = await this.store.meta<WeatherCache>(WEATHER_CACHE_KEY), now = this.clock();
        if (cache?.version === 1 && typeof cache.failed === 'boolean' && Number.isFinite(Date.parse(cache.lastAttemptAt))
          && Date.parse(cache.lastAttemptAt) <= now + 60_000 && Date.parse(cache.nextRefreshAt) === Date.parse(cache.lastAttemptAt) + HOUR
          && (cache.dataset === null || validDataset(cache.dataset, now))) this.cache = cache;
      } catch { /* Weather metadata failure must not break routing or trip saves. */ }
    })();
    return this.loaded;
  }
  async cached(at: string): Promise<WeatherResponse> {
    await this.load();
    const now = this.clock(), target = Date.parse(at), data = this.cache?.dataset;
    const age = data ? now - Date.parse(data.fetchedAt) : Infinity;
    const reading = Number.isFinite(target) && age >= 0 && age < MAX_STALE
      ? data?.readings.find(item => Date.parse(item.at) === hourAt(target)) ?? null : null;
    const state = !reading ? 'unavailable' : age < HOUR && !this.cache?.failed ? 'fresh' : 'stale';
    const message = reading ? state === 'fresh' ? 'Open-Meteo hourly forecast for Islamabad.' : 'Cached Islamabad forecast; the hourly refresh is pending or unavailable.'
      : data && age < MAX_STALE ? 'Weather is unavailable for this hour. Forecasts cover up to 16 days; past coverage is limited.'
        : 'Islamabad weather is unavailable. The map and routing remain available.';
    return { location: 'Islamabad', at, state, reading: reading ? structuredClone(reading) : null,
      fetchedAt: data?.fetchedAt ?? null, nextRefreshAt: this.cache?.nextRefreshAt ?? null,
      availableFrom: data?.readings[0]?.at ?? null,
      availableUntil: data?.readings.length ? new Date(Date.parse(data.readings.at(-1)!.at) + HOUR).toISOString() : null, message };
  }
  async get(at: string): Promise<WeatherResponse> {
    const cached = await this.cached(at);
    if (!this.enabled || this.stopped) return cached;
    // Only the first weather response waits for upstream. Warm-cache reads never
    // interrupt map interaction while the one shared hourly refresh runs.
    // Request-based cloud instances must complete refresh/persistence before responding.
    if (this.finishRefreshBeforeResponse || !this.cache?.dataset) { await this.check(); return this.cached(at); }
    void this.check().catch(() => {}); return cached;
  }
  check(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.refresh().finally(() => { this.running = undefined; }); return this.running;
  }
  private async refresh(): Promise<void> {
    await this.load(); const now = this.clock();
    if (!this.enabled || !this.available() || (this.cache && Date.parse(this.cache.nextRefreshAt) > now)) return;
    const attempted = new Date(now).toISOString();
    // Persist the attempt before the fetch, preserving the hourly backoff on restart.
    this.cache = { version: 1, lastAttemptAt: attempted, nextRefreshAt: new Date(now + HOUR).toISOString(), dataset: this.cache?.dataset ?? null, failed: true };
    try { await this.store.setMeta(WEATHER_CACHE_KEY, this.cache); } catch { return; }
    try {
      const dataset = await this.collector(now);
      if (!validDataset(dataset, this.clock()) || !dataset.readings.some(reading => Date.parse(reading.at) === hourAt(now))) throw new Error('Invalid weather dataset');
      this.cache = { ...this.cache, dataset, failed: false };
    } catch { /* Keep last successful data, explicitly stale and bounded to six hours. */ }
    if (this.available()) {
      try { await this.store.setMeta(WEATHER_CACHE_KEY, this.cache); } catch { /* Keep bounded in-memory data if persistence is unavailable. */ }
    }
  }
  start() {
    if (this.timer || !this.enabled) return; this.stopped = false;
    this.timer = setInterval(() => { void this.check().catch(() => {}); }, 60_000); this.timer.unref();
    void this.check().catch(() => {});
  }
  stop() { this.stopped = true; if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  /** City-level model snapshot, no upstream call and no disclosure of private GPS. */
  async snapshot(at: string, origin: Coordinate): Promise<WeatherReading | undefined> {
    const now = this.clock(), timestamp = Date.parse(at);
    if (!Number.isFinite(timestamp) || timestamp > now || !isNearIslamabad(origin)) return;
    const status = await this.cached(at);
    if (status.state === 'fresh' && status.reading) return status.reading;
  }
}

/** Approximate 30 km origin bound; the fixed city forecast is never a Pakistan-wide reading. */
export function isNearIslamabad(coordinate: Coordinate): boolean {
  if (!Array.isArray(coordinate) || coordinate.length !== 2 || !coordinate.every(Number.isFinite)) return false;
  const [lon, lat] = coordinate, [cityLon, cityLat] = ISLAMABAD_WEATHER_COORDINATE;
  const y = (lat - cityLat) * Math.PI / 180, x = (lon - cityLon) * Math.PI / 180;
  const a = Math.sin(y / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(cityLat * Math.PI / 180) * Math.sin(x / 2) ** 2;
  return 6371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 30_000;
}
