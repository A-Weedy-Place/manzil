import { describe, expect, it, vi } from 'vitest';
import type { Place } from '../shared/types';
import { createPlaceSearch, normalizePlaceQuery } from '../server/routing/places';

const local: Place = { id: 'local', name: 'Lahore Road, Islamabad', coordinate: [73.05, 33.7] };
const feature = (name = 'Lahore', changes: Record<string, unknown> = {}, coordinate: unknown = [74.3141829, 31.5656822]) => ({
  type: 'Feature', properties: { name, countrycode: 'PK', country: 'Pakistan', state: 'Punjab', osm_type: 'N', osm_id: name, ...changes }, geometry: { type: 'Point', coordinates: coordinate },
});
const response = (features: unknown[]) => new Response(JSON.stringify({ type: 'FeatureCollection', features }));
function setup(features: unknown[] = [feature()], localSearch = (_query: string): Place[] => []) {
  let clock = 0;
  const starts: number[] = [];
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => { starts.push(clock); return response(features); });
  const search = createPlaceSearch(localSearch, { fetch: fetcher as typeof fetch, now: () => clock, wait: async ms => { clock += ms; }, baseUrl: 'https://photon.example' });
  return { search, fetcher, starts, advance: (ms: number) => { clock += ms; } };
}

describe('lightweight Pakistan place search', () => {
  it('normalizes explicit sector punctuation while retaining real names and uncertain typos', () => {
    for (const query of ['I8', 'i 8', 'I-8', ' I – 8 ']) expect(normalizePlaceQuery(query)).toBe('I-8');
    expect(normalizePlaceQuery('f 8 / 2 Islamabad')).toBe('F-8/2 Islamabad');
    expect(normalizePlaceQuery('g11/4')).toBe('G-11/4');
    for (const query of ['IA8', 'F8 camera', 'Lahore', 'I-8/9']) expect(normalizePlaceQuery(query)).toBe(query);
  });
  it('uses one provider/cache lookup and canonical local road search for equivalent sector queries', async () => {
    const localSearch = vi.fn((_query: string) => [local]);
    const { search, fetcher } = setup([feature('I-8', { state: 'Islamabad Capital Territory' }, [73.075, 33.667])], localSearch);
    const first = await search('I8');
    expect(await search('I 8')).toEqual(first); expect(await search('I-8')).toEqual(first);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('q')).toBe('I-8');
    expect(localSearch.mock.calls.map(call => call[0])).toEqual(['I-8', 'I-8', 'I-8']);
  });
  it('requests country-wide results without Islamabad bounds and puts provider relevance before local road matches', async () => {
    const { search, fetcher } = setup([feature()], () => Array.from({ length: 12 }, (_, index) => ({ ...local, id: `local-${index}`, name: `Lahore Road ${index}` })));
    const places = await search('Lahore');
    expect(places[0]).toMatchObject({ name: 'Lahore, Punjab, Pakistan', coordinate: [74.3141829, 31.5656822] });
    expect(places).toHaveLength(12);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.origin).toBe('https://photon.example'); expect(url.pathname).toBe('/api/');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'Lahore', countrycode: 'PK', limit: '7', lang: 'en' });
  });
  it('retains local presets without network calls for empty or one-character searches', async () => {
    const { search, fetcher } = setup([], () => [local]);
    expect(await search('')).toEqual([local]); expect(await search('L')).toEqual([local]); expect(fetcher).not.toHaveBeenCalled();
    await expect(search('x'.repeat(161))).rejects.toMatchObject({ status: 400 });
  });
  it('rejects other countries, missing country tags, malformed geometry and names, while deduplicating real places', async () => {
    const { search } = setup([
      feature(), feature(), feature('Delhi', { countrycode: 'IN' }), feature('Unknown', { countrycode: undefined }),
      feature('Invalid', {}, [181, 31]), feature('Mislabeled Delhi', {}, [77.209, 28.6139]), feature('String coordinates', {}, ['74', 31]), feature('Extra coordinate', {}, [74, 31, 4]),
      feature('', { city: undefined, street: undefined }), null, feature('Karachi', { countrycode: 'pk', state: 'Sindh' }, [67.02, 24.86]),
    ]);
    expect((await search('Cities')).map(place => place.name)).toEqual(['Lahore, Punjab, Pakistan', 'Karachi, Sindh, Pakistan']);
  });
  it('coalesces pending requests, caches for ten minutes and returns independent objects', async () => {
    const { search, fetcher, advance } = setup();
    const [a, b] = await Promise.all([search(' Lahore '), search('lahore')]);
    expect(fetcher).toHaveBeenCalledTimes(1); a[0].coordinate[0] = 0; a[0].name = 'Changed';
    expect(b[0].coordinate[0]).toBe(74.3141829); expect((await search('LAHORE'))[0].name).toBe('Lahore, Punjab, Pakistan');
    expect(fetcher).toHaveBeenCalledTimes(1); advance(600001); await search('Lahore'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('caps the cache at 100 queries and spaces provider starts at least one second apart', async () => {
    const { search, fetcher, starts } = setup();
    for (let index = 0; index < 101; index++) await search(`City ${index}`);
    await search('City 0'); expect(fetcher).toHaveBeenCalledTimes(102);
    expect(starts.slice(1).every((start, index) => start - starts[index] >= 1000)).toBe(true);
  });
  it('returns local matches on a provider failure but surfaces an unavailable state when none exist', async () => {
    const fetcher = vi.fn(async () => { throw new Error('Offline'); });
    const fallback = createPlaceSearch(() => [local], { fetch: fetcher as typeof fetch });
    expect(await fallback('Lahore')).toEqual([local]);
    const unavailable = createPlaceSearch(() => [], { fetch: fetcher as typeof fetch });
    await expect(unavailable('Karachi')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('temporarily unavailable') });
    const malformed = createPlaceSearch(() => [], { fetch: (async () => new Response('{}')) as typeof fetch });
    await expect(malformed('Quetta')).rejects.toMatchObject({ status: 503 });
  });
  it('bounds queued work and recovers after pending requests complete', async () => {
    let release!: () => void, clock = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fetcher = vi.fn(async () => { await gate; return response([feature()]); });
    const search = createPlaceSearch(() => [], { fetch: fetcher as typeof fetch, now: () => clock, wait: async ms => { clock += ms; }, timeoutMs: 60000 });
    const pending = Array.from({ length: 12 }, (_, index) => search(`Query ${index}`));
    await expect(search('Queue overflow')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('busy') });
    release(); await Promise.all(pending); expect(fetcher).toHaveBeenCalledTimes(12);
    await expect(search('Recovered')).resolves.toHaveLength(1);
  });
  it('times out queued searches before eight seconds of extra waiting and skips their network calls', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => new Promise(() => undefined));
      const search = createPlaceSearch(() => [], { fetch: fetcher as typeof fetch, timeoutMs: 8000 });
      const first = search('Lahore'), queued = search('Karachi');
      const settled = Promise.allSettled([first, queued]);
      await vi.advanceTimersByTimeAsync(8000);
      expect((await settled).every(result => result.status === 'rejected' && result.reason.status === 503)).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
      fetcher.mockImplementation(async () => response([feature()]));
      await expect(search('Quetta')).resolves.toHaveLength(1); expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it('rejects oversized provider JSON using both declared and streamed byte counts', async () => {
    for (const headers of [new Headers({ 'content-length': String(1024 * 1024 + 1) }), new Headers()]) {
      const fetcher = vi.fn(async () => new Response(' '.repeat(1024 * 1024 + 1), { headers }));
      const search = createPlaceSearch(() => [], { fetch: fetcher as typeof fetch });
      await expect(search('Karachi')).rejects.toMatchObject({ status: 503 });
    }
  });
});
