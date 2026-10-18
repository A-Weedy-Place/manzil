import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../server/store';
import { FirestoreStore } from '../server/firestore-store';
import type { Firestore } from 'firebase-admin/firestore';
import { collectWeather, isNearIslamabad, parseWeatherResponse, WeatherService, WEATHER_API_URL, WEATHER_CACHE_KEY, type WeatherDataset } from '../server/weather';
import { ISLAMABAD_WEATHER_COORDINATE, weatherCondition } from '../shared/weather';

const HOUR = 3600_000, NOW = Date.parse('2026-10-18T07:35:00Z');
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(close => close()); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function database() { const store = new Store(':memory:'); cleanup.push(() => store.close()); return store; }
function payload(now = NOW) {
  const first = Math.floor(now / HOUR) * HOUR - 2 * HOUR;
  return { latitude: 33.7, longitude: 73.0625, utc_offset_seconds: 0,
    hourly_units: { time: 'unixtime', temperature_2m: '°C', weather_code: 'wmo code', is_day: '' },
    hourly: { time: Array.from({ length: 30 }, (_, i) => (first + i * HOUR) / 1000), temperature_2m: Array(30).fill(24.1), weather_code: Array(30).fill(2), is_day: Array(30).fill(1) } };
}
const dataset = (now = NOW) => parseWeatherResponse(payload(now), now);

describe('fixed-city hourly weather', () => {
  it('finishes a due cloud refresh before returning, preserving hourly coalescing and persistence',async()=>{
    const store=database(); let time=NOW; await new WeatherService(store,async()=>dataset(time),()=>time).check();
    time+=HOUR; let finish!: (value:WeatherDataset)=>void;
    const collector=vi.fn(()=>new Promise<WeatherDataset>(resolve=>{finish=resolve;}));
    const service=new WeatherService(store,collector,()=>time,true,true); let returned=false;
    const first=service.get(new Date(time).toISOString()).then(value=>{returned=true;return value;});
    await vi.waitFor(()=>expect(collector).toHaveBeenCalledOnce()); expect(returned).toBe(false);
    const second=service.get(new Date(time).toISOString()); finish(dataset(time));
    expect((await first).state).toBe('fresh'); expect((await second).state).toBe('fresh'); expect(collector).toHaveBeenCalledOnce();
    expect(store.meta<{dataset:WeatherDataset}>(WEATHER_CACHE_KEY)?.dataset.fetchedAt).toBe(new Date(time).toISOString());
  });
  it('maps WMO weather including daylight, freezing weather and thunderstorms without guessing unknown codes', () => {
    expect(weatherCondition(0, true)).toMatchObject({ icon: 'sun' }); expect(weatherCondition(0, false)).toMatchObject({ icon: 'moon' });
    expect(weatherCondition(2, false)).toMatchObject({ icon: 'cloud-moon' });
    for (const [code, icon] of [[3, 'cloud'], [48, 'fog'], [56, 'drizzle'], [67, 'rain'], [82, 'rain'], [86, 'snow'], [97, 'thunderstorm']]) expect(weatherCondition(Number(code), true).icon).toBe(icon);
    expect(weatherCondition(123, true).icon).toBe('unknown');
  });
  it('normalizes epoch seconds into exact UTC hours and uses only the fixed Islamabad coordinate', () => {
    const result = dataset();
    expect(result.fetchedAt).toBe('2026-10-18T07:35:00.000Z');
    expect(result.readings[2]).toMatchObject({ at: '2026-10-18T07:00:00.000Z', temperatureC: 24.1, isDay: true, coordinate: [73.0479,33.6844], location:'Islamabad', source:'Open-Meteo' });
    expect(isNearIslamabad(ISLAMABAD_WEATHER_COORDINATE)).toBe(true);
    expect(isNearIslamabad([74.3,31.5])).toBe(false); expect(isNearIslamabad([NaN,33.7])).toBe(false);
  });
  it('rejects wrong units/location/timezone, unbounded/misaligned series and implausible weather', () => {
    const mutations = [
      (data: ReturnType<typeof payload>) => { data.latitude = NaN; },
      (data: ReturnType<typeof payload>) => { data.longitude = 74; },
      (data: ReturnType<typeof payload>) => { data.utc_offset_seconds = 18000; },
      (data: ReturnType<typeof payload>) => { data.hourly_units.temperature_2m = '°F'; },
      (data: ReturnType<typeof payload>) => { data.hourly_units.time = 'iso8601'; },
      (data: ReturnType<typeof payload>) => { data.hourly.time[2] = data.hourly.time[1]; },
      (data: ReturnType<typeof payload>) => { data.hourly.time[0] += 30; },
      (data: ReturnType<typeof payload>) => { data.hourly.time = Array(457).fill(0); },
      (data: ReturnType<typeof payload>) => { data.hourly.temperature_2m.pop(); },
      (data: ReturnType<typeof payload>) => { data.hourly.temperature_2m[0] = 66; },
      (data: ReturnType<typeof payload>) => { data.hourly.weather_code[0] = 4; },
      (data: ReturnType<typeof payload>) => { data.hourly.is_day[0] = 2; },
    ];
    for (const mutate of mutations) { const data = payload(); mutate(data); expect(() => parseWeatherResponse(data, NOW)).toThrow(); }
    expect(() => parseWeatherResponse(payload(NOW + 20 * 24 * HOUR), NOW)).toThrow();
    expect(() => parseWeatherResponse(payload(NOW - 20 * 24 * HOUR), NOW)).toThrow();
  });
  it('omits provider null rows rather than interpolating them and requires a genuine current-hour row', () => {
    const data = payload() as unknown as { hourly: Record<string, (number | null)[]> };
    data.hourly.temperature_2m[3] = null;
    const parsed = parseWeatherResponse(data, NOW); expect(parsed.readings).toHaveLength(29);
    expect(parsed.readings.some(reading => reading.at === '2026-10-18T08:00:00.000Z')).toBe(false);
    data.hourly.weather_code[2] = null; expect(() => parseWeatherResponse(data, NOW)).toThrow('Current');
  });
  it('uses one small fixed public request with a timeout and validates its streamed response', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    expect((await collectWeather(NOW)).readings).toHaveLength(30);
    expect(fetcher.mock.calls[0][0]).toBe(WEATHER_API_URL);
    const url = new URL(WEATHER_API_URL); expect(url.searchParams.get('latitude')).toBe('33.6844'); expect(url.searchParams.get('longitude')).toBe('73.0479');
    expect(url.searchParams.get('forecast_days')).toBe('16'); expect(url.searchParams.get('past_days')).toBe('2');
    expect(url.searchParams.has('apikey')).toBe(false);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
  });
  it('rejects excessive headers or actual streamed bytes, HTTP failures and unexpected content types', async () => {
    for (const response of [new Response('{}', { status: 429 }), new Response('{}', { headers: { 'content-type': 'text/html' } }),
      new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '100001' } }),
      new Response(' '.repeat(100001), { headers: { 'content-type': 'application/json' } })]) {
      vi.stubGlobal('fetch', vi.fn(async () => response)); await expect(collectWeather(NOW)).rejects.toThrow();
    }
  });
  it('coalesces concurrent callers into one upstream fetch and copies response data defensively', async () => {
    const store = database(); let release!: (value: WeatherDataset) => void;
    const collector = vi.fn(() => new Promise<WeatherDataset>(resolve => { release = resolve; }));
    const service = new WeatherService(store, collector, () => NOW);
    const requests = Array.from({ length: 12 }, () => service.get('2026-10-18T12:45:00+05:00'));
    await vi.waitFor(() => expect(collector).toHaveBeenCalledTimes(1)); release(dataset());
    const results = await Promise.all(requests);
    expect(results[0]).toMatchObject({ state:'fresh', reading: { at:'2026-10-18T07:00:00.000Z' } });
    results[0].reading!.temperatureC = 999;
    expect((await service.cached('2026-10-18T07:01:00Z')).reading?.temperatureC).toBe(24.1);
    await service.check(); expect(collector).toHaveBeenCalledTimes(1);
  });
  it('persists one shared dataset and hourly attempt across service restarts', async () => {
    const store = database(), collector = vi.fn(async () => dataset());
    await new WeatherService(store, collector, () => NOW).check();
    const restarted = new WeatherService(store, collector, () => NOW + HOUR - 1);
    expect((await restarted.get('2026-10-18T07:50:00Z')).state).toBe('fresh');
    await restarted.check(); expect(collector).toHaveBeenCalledTimes(1);
    expect(store.meta<{nextRefreshAt:string}>(WEATHER_CACHE_KEY)?.nextRefreshAt).toBe('2026-10-18T08:35:00.000Z');
  });
  it('stores weather in Firestore shared metadata even for guests and reads the same record across user scopes', async () => {
    const records = new Map<string, unknown>(), paths: string[] = [];
    const ref = (path:string): unknown => ({
      collection: (name:string) => ref(`${path}/${name}`), doc:(name:string) => ref(`${path}/${name}`),
      get: async () => { paths.push(path); return {data:()=>records.get(path)}; },
      set: async (value:unknown) => {paths.push(path);records.set(path,value);},
    });
    const db = {collection:(name:string)=>ref(name)} as unknown as Firestore;
    const store = new FirestoreStore(db), service = new WeatherService(store,async()=>dataset(),()=>NOW);await service.check();
    expect((await store.forUser('alice').meta(WEATHER_CACHE_KEY))).toEqual(await store.forUser('bob').meta(WEATHER_CACHE_KEY));
    expect((await new WeatherService(store,async()=>{throw new Error('Unexpected fetch');},()=>NOW).get(new Date(NOW).toISOString())).state).toBe('fresh');
    expect(paths.length).toBeGreaterThan(3); expect(paths.every(path=>path.startsWith('manzil/v1/meta/'))).toBe(true);
  });
  it('returns the exact requested hour and explicitly refuses missing, old or distant future weather', async () => {
    const store = database(), service = new WeatherService(store, async () => dataset(), () => NOW); await service.check();
    expect((await service.get('2026-10-18T12:59:59+05:00')).reading?.at).toBe('2026-10-18T07:00:00.000Z');
    expect((await service.get('2026-10-18T13:00:00+05:00')).reading?.at).toBe('2026-10-18T08:00:00.000Z');
    for (const at of ['2025-01-01T00:00:00Z','2027-01-01T00:00:00Z','invalid']) expect(await service.get(at)).toMatchObject({ state:'unavailable', reading:null });
  });
  it('refreshes warm data without waiting and marks failure/staleness with an hourly durable backoff', async () => {
    const store = database(); let now = NOW;
    const collector = vi.fn(async () => dataset(now)), service = new WeatherService(store, collector, () => now); await service.check();
    now += HOUR;
    let fail!: () => void; collector.mockImplementation(() => new Promise((_resolve, reject) => { fail = () => reject(new Error('Offline fixture')); }));
    const response = await service.get('2026-10-18T08:00:00Z'); expect(response.state).toBe('stale');
    await vi.waitFor(() => expect(collector).toHaveBeenCalledTimes(2)); fail(); await service.check();
    const restarted = new WeatherService(store, collector, () => now + HOUR - 1); await restarted.check();
    expect(collector).toHaveBeenCalledTimes(2);
    expect((await restarted.cached('2026-10-18T08:00:00Z')).state).toBe('stale');
    now = NOW + 6 * HOUR;
    expect(await service.cached('2026-10-18T08:00:00Z')).toMatchObject({ state:'unavailable', reading:null });
  });
  it('takes a fresh cache-only nearby trip snapshot and never fetches, fabricates weather or uses out-of-city GPS', async () => {
    const store = database(); let now = NOW; const collector = vi.fn(async () => dataset());
    const service = new WeatherService(store, collector, () => now);
    expect(await service.snapshot('2026-10-18T07:00:00Z',[73.04,33.7])).toBeUndefined(); expect(collector).not.toHaveBeenCalled();
    await service.check();
    expect(await service.snapshot('2026-10-18T07:00:00Z',[73.04,33.7])).toMatchObject({ coordinate:[73.0479,33.6844], at:'2026-10-18T07:00:00.000Z' });
    expect(await service.snapshot('2026-10-18T08:00:00Z',[73.04,33.7])).toBeUndefined();
    expect(await service.snapshot('2026-10-18T07:00:00Z',[74.3,31.5])).toBeUndefined();
    expect(await service.snapshot('2025-01-01T07:00:00Z',[73.04,33.7])).toBeUndefined();
    now += HOUR; expect(await service.snapshot('2026-10-18T07:00:00Z',[73.04,33.7])).toBeUndefined(); expect(collector).toHaveBeenCalledTimes(1);
  });
  it('ignores corrupt cached data and keeps weather disabled during isolated app tests', async () => {
    const store = database(); store.setMeta(WEATHER_CACHE_KEY, { version:1, lastAttemptAt:new Date(NOW).toISOString(), nextRefreshAt:new Date(NOW+HOUR).toISOString(), failed:false, dataset:{fetchedAt:new Date(NOW).toISOString(),readings:[null]} });
    const collector = vi.fn(async () => dataset()), service = new WeatherService(store, collector, () => NOW, false);
    expect(await service.get(new Date(NOW).toISOString())).toMatchObject({ state:'unavailable', reading:null }); expect(collector).not.toHaveBeenCalled();
  });
  it('preserves map availability when shared metadata is unavailable and skips the provider when persistence fails', async () => {
    const store = database(); vi.spyOn(store,'meta').mockImplementation(() => { throw new Error('Offline metadata fixture'); });
    vi.spyOn(store,'setMeta').mockImplementation(() => { throw new Error('Offline metadata fixture'); });
    const collector = vi.fn(async () => dataset()), service = new WeatherService(store, collector, () => NOW);
    expect(await service.get(new Date(NOW).toISOString())).toMatchObject({ state:'unavailable', reading:null }); expect(collector).not.toHaveBeenCalled();
  });
  it('checks immediately and hourly while its lightweight due timer runs, then stops cleanly', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const store = database(), collector = vi.fn(async () => dataset(Date.now())), service = new WeatherService(store,collector);
    service.start(); cleanup.unshift(() => service.stop());
    await vi.advanceTimersByTimeAsync(0); expect(collector).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HOUR - 1); expect(collector).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(collector).toHaveBeenCalledTimes(2);
    service.stop(); await vi.advanceTimersByTimeAsync(HOUR); expect(collector).toHaveBeenCalledTimes(2);
  });
});
