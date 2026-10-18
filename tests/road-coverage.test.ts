import { describe, expect, it, vi } from 'vitest';
import type { Coordinate } from '../shared/types';
import { buildGraph, type OsmDocument } from '../server/routing/graph';
import { RoadCoverageProvider } from '../server/routing/road-coverage';
import { RoadSelectionError, selectRoadPoint } from '../server/routing/road-selection';

const POINT: Coordinate = [73.055, 33.61]; // Rawalpindi, outside the imported editor graph.
function document(point: Coordinate = POINT): OsmDocument {
  return { osm3s: { timestamp_osm_base: '2026-10-18T00:00:00Z' }, elements: [
    { type: 'node', id: 1, lon: point[0] - .001, lat: point[1] },
    { type: 'node', id: 2, lon: point[0], lat: point[1] },
    { type: 'node', id: 3, lon: point[0] + .001, lat: point[1] },
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential', name: 'Public road' } },
  ] };
}
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function options(fetcher: ReturnType<typeof vi.fn>, extra: ConstructorParameters<typeof RoadCoverageProvider>[1] = {}) {
  return { fetch: fetcher as typeof globalThis.fetch, endpoints: ['https://roads.example/api/interpreter'], ...extra };
}

describe('on-demand public road coverage', () => {
  it('keeps the imported graph as the no-network fast path when every point is covered', async () => {
    const local = buildGraph(document([73.08, 33.7]), [73.07, 33.69, 73.09, 33.71]);
    const fetcher = vi.fn();
    const provider = new RoadCoverageProvider(() => local, options(fetcher));
    expect(await provider.graphFor([[73.08, 33.7], [73.081, 33.7]])).toBe(local);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each<Coordinate>([POINT, [74.35, 31.55], [-.12, 51.5], [151.2, -33.86]])('loads actual public topology outside Islamabad at %j', async (longitude, latitude) => {
    const point: Coordinate = [longitude, latitude], fetcher = vi.fn(async () => json(document(point)));
    const graph = await new RoadCoverageProvider(() => null, options(fetcher)).graphFor([point]);
    expect(selectRoadPoint(graph, point).roadNames).toEqual(['Public road']);
    expect(graph.version).toMatch(/^osm-area-/); expect(graph.version).not.toContain('islamabad');
    expect(graph.source).toContain('on-demand'); expect(graph.sourceTimestamp).toBe('2026-10-18T00:00:00Z');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://roads.example/api/interpreter'); expect(init.redirect).toBe('error');
    const query = (init.body as URLSearchParams).get('data')!;
    expect(query).toContain('relation(bw.roads)[type=restriction]'); expect(query).toContain('(._;>>;);out body;');
    expect(graph.bounds[2] - graph.bounds[0]).toBeLessThan(.04);
    expect(graph.bounds[3] - graph.bounds[1]).toBeLessThan(.025);
  });

  it('reuses a cached neighbourhood for a nearby pick and expires it after twenty minutes', async () => {
    let time = 1000;
    const fetcher = vi.fn(async () => json(document()));
    const provider = new RoadCoverageProvider(() => null, options(fetcher, { now: () => time }));
    const graph = await provider.graphFor([POINT]);
    expect(await provider.graphFor([[POINT[0] + .0005, POINT[1]]])).toBe(graph);
    expect(fetcher).toHaveBeenCalledTimes(1);
    time += 20 * 60_000;
    expect(await provider.graphFor([POINT])).not.toBe(graph); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('uses a stable fixed grid for neighbouring latitudes while retaining metric road padding', async () => {
    const releases: (() => void)[] = [];
    const fetcher = vi.fn(async () => { await new Promise<void>(resolve => releases.push(resolve)); return json(document([72.9350241, 33.6330248])); });
    const provider = new RoadCoverageProvider(() => null, options(fetcher));
    const first = provider.graphFor([[72.9350241, 33.6330248]]);
    const neighbour = provider.graphFor([[72.9350241, 33.6331248]]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.body as URLSearchParams).get('data')).toContain('(33.625,72.925,33.64,72.945)');
    releases[0](); expect(await neighbour).toBe(await first);
  });

  it('keeps direction/access/conditional/barrier/turn restrictions when building remote roads', async () => {
    const value = document();
    value.elements.push(
      { type: 'node', id: 4, lon: POINT[0], lat: POINT[1] + .001 },
      { type: 'node', id: 5, lon: POINT[0] + .002, lat: POINT[1], tags: { barrier: 'gate' } },
      { type: 'way', id: 11, nodes: [2, 4], tags: { highway: 'residential', oneway: 'yes' } },
      { type: 'way', id: 12, nodes: [1, 4], tags: { highway: 'service', access: 'private' } },
      { type: 'way', id: 13, nodes: [3, 4], tags: { highway: 'service', 'motorcar:conditional': 'yes @ (Mo-Fr)' } },
      { type: 'way', id: 14, nodes: [3, 5], tags: { highway: 'service' } },
      { type: 'relation', id: 20, tags: { type: 'restriction', restriction: 'no_left_turn' }, members: [
        { type: 'way', ref: 10, role: 'from' }, { type: 'node', ref: 2, role: 'via' }, { type: 'way', ref: 11, role: 'to' },
      ] },
    );
    const graph = await new RoadCoverageProvider(() => null, options(vi.fn(async () => json(value)))).graphFor([POINT]);
    expect(graph.edges.filter(edge => edge.wayId === '11')).toHaveLength(1);
    expect(graph.edges.some(edge => ['12', '13', '14'].includes(edge.wayId))).toBe(false);
    expect(graph.restrictions).toHaveLength(1); expect(graph.restrictions[0]).toMatchObject({ fromWay: '10', toWay: '11', only: false });
  });

  it('retains separate node references at geometric grade-separated crossings', async () => {
    const value = document();
    value.elements.push(
      { type: 'node', id: 4, lon: POINT[0], lat: POINT[1] - .001 },
      { type: 'node', id: 5, lon: POINT[0], lat: POINT[1] + .001 },
      { type: 'way', id: 11, nodes: [4, 5], tags: { highway: 'primary', bridge: 'yes' } },
    );
    const graph = await new RoadCoverageProvider(() => null, options(vi.fn(async () => json(value)))).graphFor([POINT]);
    const bridge = graph.edges.filter(edge => edge.wayId === '11');
    expect(bridge).toHaveLength(2);
    expect(bridge.every(edge => graph.nodes[edge.from].id !== '2' && graph.nodes[edge.to].id !== '2')).toBe(true);
  });

  it('deduplicates matching in-flight neighbourhoods and bounds unrelated concurrent requests', async () => {
    const finishes: (() => void)[] = [];
    const fetcher = vi.fn(async () => { await new Promise<void>(resolve => finishes.push(resolve)); return json(document()); });
    const provider = new RoadCoverageProvider(() => null, options(fetcher));
    const a = provider.graphFor([POINT]), duplicate = provider.graphFor([POINT]);
    const b = provider.graphFor([[74.35, 31.55]]);
    await expect(provider.graphFor([[-.12, 51.5]])).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/busy/) });
    expect(fetcher).toHaveBeenCalledTimes(2); finishes.forEach(finish => finish());
    expect(await duplicate).toBe(await a); await b;
    // The in-flight slots are released after successful requests.
    const next = provider.graphFor([[-.12, 51.5]]); finishes.at(-1)!(); await next;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('evicts the oldest cached area after twelve entries', async () => {
    const fetcher = vi.fn(async () => json(document()));
    const provider = new RoadCoverageProvider(() => null, options(fetcher));
    const original = await provider.graphFor([POINT]);
    for (let index = 1; index <= 12; index++) await provider.graphFor([[POINT[0] + index, POINT[1]]]);
    expect(await provider.graphFor([POINT])).not.toBe(original); expect(fetcher).toHaveBeenCalledTimes(14);
  });

  it('does not cache malformed, truncated, private-only or incomplete data as road coverage', async () => {
    const broken = document(); (broken.elements[0] as { lat?: number }).lat = 100;
    const missingNode = document(); missingNode.elements = missingNode.elements.filter(element => element.id !== 2);
    const privateOnly = document(); privateOnly.elements.at(-1)!.tags!.access = 'private';
    for (const value of [{ elements: [] }, privateOnly]) {
      const provider = new RoadCoverageProvider(() => null, options(vi.fn(async () => json(value))));
      await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/No supported public car roads/) });
    }
    for (const value of [broken, missingNode, { elements: document().elements, remark: 'runtime error: Query timed out' }, { elements: [null] },
      { ...document(), osm3s: { timestamp_osm_base: 123 } }, { elements: [...document().elements, document().elements[0]] }]) {
      const provider = new RoadCoverageProvider(() => null, options(vi.fn(async () => json(value))));
      await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503 });
    }
  });

  it('enforces declared and streamed response byte limits before graph construction', async () => {
    for (const response of [new Response('{}', { headers: { 'content-length': String(4 * 1024 * 1024 + 1) } }),
      new Response(new Uint8Array(4 * 1024 * 1024 + 1))]) {
      const provider = new RoadCoverageProvider(() => null, options(vi.fn(async () => response)));
      await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503 });
    }
  });

  it('bounds source elements and references even inside the response byte budget', async () => {
    for (const value of [{ elements: Array.from({ length: 60_001 }, () => null) }, { elements: [
      { type: 'way', id: 1, nodes: Array.from({ length: 150_001 }, () => 1), tags: { highway: 'residential' } },
    ] }]) {
      await expect(new RoadCoverageProvider(() => null, options(vi.fn(async () => json(value)))).graphFor([POINT])).rejects.toMatchObject({ status: 503 });
    }
  });

  it('tries a second fixed source after failure and backs off a rate-limited source', async () => {
    let time = 0;
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes('first') ? new Response('', { status: 429 }) : json(document()));
    const provider = new RoadCoverageProvider(() => null, options(fetcher, {
      endpoints: ['https://first.example/api/interpreter', 'https://second.example/api/interpreter'], now: () => time,
    }));
    await provider.graphFor([POINT]); expect(fetcher).toHaveBeenCalledTimes(2);
    await provider.graphFor([[74.35, 31.55]]); expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.at(-1)![0]).toBe('https://second.example/api/interpreter');
    time += 30_000;
    await provider.graphFor([[-.12, 51.5]]); expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it('releases failed request slots and does not retry an unavailable source before its cooldown', async () => {
    let time = 0;
    const fetcher = vi.fn(async () => new Response('', { status: 503 }));
    const provider = new RoadCoverageProvider(() => null, options(fetcher, { now: () => time }));
    await expect(provider.graphFor([POINT])).rejects.toBeInstanceOf(RoadSelectionError);
    await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503 }); expect(fetcher).toHaveBeenCalledTimes(1);
    time = 5000;
    await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503 }); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('bounds stalled network and body reads with an abort deadline', async () => {
    for (const fetcher of [vi.fn(async (_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    })), vi.fn(async () => new Response(new ReadableStream({ start() { /* Deliberately never completes. */ } })))]) {
      const provider = new RoadCoverageProvider(() => null, options(fetcher, { timeoutMs: 15, attemptTimeoutMs: 15 }));
      await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503 });
    }
  });

  it('releases slots and rejects late responses even when a fetch adapter ignores abort', async () => {
    let release: (response: Response) => void = () => undefined, time = 0;
    const never = vi.fn(async () => new Promise<Response>(resolve => { release = resolve; }));
    const provider = new RoadCoverageProvider(() => null, options(never, { now: () => time, timeoutMs: 10 }));
    await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503 });
    release(json(document())); await Promise.resolve(); await Promise.resolve();
    time += 5000;
    await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503 });
    expect(never).toHaveBeenCalledTimes(2);
  });

  it('bounds a reader that ignores both stream cancellation and abort', async () => {
    const reader = { read: vi.fn(async () => new Promise<ReadableStreamReadResult<Uint8Array>>(() => undefined)),
      cancel: vi.fn(async () => new Promise<void>(() => undefined)), releaseLock: vi.fn() };
    const response = { ok: true, status: 200, headers: new Headers(), body: { getReader: () => reader } } as unknown as Response;
    const provider = new RoadCoverageProvider(() => null, options(vi.fn(async () => response), { timeoutMs: 10 }));
    await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503 });
    expect(reader.cancel).toHaveBeenCalled();
  });

  it('rejects invalid/oversized client coordinates without sending them to a data source', async () => {
    const fetcher = vi.fn(); const provider = new RoadCoverageProvider(() => null, options(fetcher));
    for (const points of [[], [[NaN, 33]], [[Infinity, 33]], [[181, 33]], [[73, -91]], [[73, 33], [74, 34]], Array.from({ length: 401 }, () => POINT)]) {
      await expect(provider.graphFor(points as Coordinate[])).rejects.toMatchObject({ status: 422 });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('splits a dateline neighbourhood into small source queries and never reuses it as worldwide coverage', async () => {
    const fetcher = vi.fn(async () => json(document([179.999, 10])));
    const provider = new RoadCoverageProvider(() => null, options(fetcher));
    await provider.graphFor([[179.999, 10], [-179.999, 10]]);
    const query = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(query.get('data')!.match(/way\[/g)).toHaveLength(2);
    await provider.graphFor([[0, 10]]); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('accepts only server-configured HTTPS source URLs without credentials or query injection', () => {
    for (const endpoints of [[], ['http://roads.example/api'], ['https://user:secret@roads.example/api'],
      ['https://roads.example/api?data=way'], ['https://roads.example/api#fragment'], ['not a url']]) {
      expect(() => new RoadCoverageProvider(() => null, { endpoints })).toThrow(/server-owned HTTPS/);
    }
  });

  it('uses the bounded read-only official map fallback after the default Overpass source fails', async () => {
    const value = document();
    const sourceNode = value.elements[0] as typeof value.elements[number] & { user: string; uid: number };
    sourceNode.user = 'PUBLIC-OSM-CONTRIBUTOR'; sourceNode.uid = 777;
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes('map.json') ? json(value) : new Response('source failure', { status: 500 }));
    const provider = new RoadCoverageProvider(() => null, { fetch: fetcher as typeof globalThis.fetch });
    const graph = await provider.graphFor([POINT]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(new URL(url).origin).toBe('https://api.openstreetmap.org');
    expect(new URL(url).pathname).toBe('/api/0.6/map.json');
    expect(new URL(url).searchParams.get('bbox')!.split(',')).toHaveLength(4);
    expect(init.method).toBe('GET'); expect(init.body).toBeUndefined(); expect(init.redirect).toBe('error');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(graph.source).toContain('OpenStreetMap map API'); expect(graph.sourceTimestamp).toBeNull();
    expect(JSON.stringify(graph)).not.toContain('PUBLIC-OSM-CONTRIBUTOR');
    expect(await provider.graphFor([POINT])).toBe(graph); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps custom Overpass tests and configurations offline unless map fallback is explicitly enabled', async () => {
    const fetcher = vi.fn(async () => new Response('not available', { status: 500 }));
    await expect(new RoadCoverageProvider(() => null, options(fetcher)).graphFor([POINT])).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const enabled = vi.fn(async (url: string | URL | Request) => String(url).includes('map.json') ? json(document()) : new Response('', { status: 500 }));
    const graph = await new RoadCoverageProvider(() => null, options(enabled, { mapApiBaseUrl: 'https://map.example/api/0.6/' })).graphFor([POINT]);
    expect(graph.source).toContain('map API'); expect(enabled).toHaveBeenCalledTimes(2);
    const disabled = vi.fn(async () => new Response('', { status: 500 }));
    await expect(new RoadCoverageProvider(() => null, { fetch: disabled as typeof globalThis.fetch, mapApiBaseUrl: null }).graphFor([POINT])).rejects.toMatchObject({ status: 503 });
    expect(disabled).toHaveBeenCalledTimes(1);
  });

  it('never uses the map API for larger boxes or split dateline envelopes', async () => {
    for (const points of [[POINT, [POINT[0] + .04, POINT[1] + .04]], [[179.999, 10], [-179.999, 10]]] as Coordinate[][]) {
      const fetcher = vi.fn(async () => new Response('', { status: 500 }));
      await expect(new RoadCoverageProvider(() => null, { fetch: fetcher as typeof globalThis.fetch }).graphFor(points)).rejects.toMatchObject({ status: 503 });
      expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0]).not.toContain('map.json');
    }
  });

  it('retains source unavailable and response size checks on map fallback without returning source error bodies', async () => {
    for (const response of [new Response('DO-NOT-EXPOSE-SOURCE-BODY', { status: 500 }),
      new Response(new Uint8Array(4 * 1024 * 1024 + 1)), json({ elements: [null] })]) {
      const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes('map.json') ? response : new Response('', { status: 500 }));
      const provider = new RoadCoverageProvider(() => null, { fetch: fetcher as typeof globalThis.fetch });
      await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503, message: 'Road data is temporarily unavailable for this area. Try again.' });
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });

  it('enforces a one-second minimum interval between map fallback requests', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    try {
      const starts: number[] = [];
      const fetcher = vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes('map.json')) { starts.push(Date.now()); return json(document()); }
        return new Response('', { status: 500 });
      });
      const provider = new RoadCoverageProvider(() => null, { fetch: fetcher as typeof globalThis.fetch });
      await provider.graphFor([POINT]);
      await vi.advanceTimersByTimeAsync(300);
      const second = provider.graphFor([[POINT[0] + 1, POINT[1]]]);
      await vi.advanceTimersByTimeAsync(699); expect(starts).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1); await second;
      expect(starts).toEqual([100_000, 101_000]);
    } finally { vi.useRealTimers(); }
  });

  it('allows only one map fallback call in flight and releases it after completion', async () => {
    let start: () => void = () => undefined, release: () => void = () => undefined;
    const started = new Promise<void>(resolve => { start = resolve; });
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (!String(url).includes('map.json')) return new Response('', { status: 500 });
      start(); await new Promise<void>(resolve => { release = resolve; }); return json(document());
    });
    const provider = new RoadCoverageProvider(() => null, { fetch: fetcher as typeof globalThis.fetch });
    const first = provider.graphFor([POINT]); await started;
    await expect(provider.graphFor([[POINT[0] + 1, POINT[1]]])).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(2); release(); await first;
  });

  it('backs off map fallback rate limits for thirty seconds independently of Overpass failures', async () => {
    let time = 0, mapCalls = 0;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (!String(url).includes('map.json')) return new Response('', { status: 500 });
      return ++mapCalls === 1 ? new Response('', { status: 429 }) : json(document());
    });
    const provider = new RoadCoverageProvider(() => null, { fetch: fetcher as typeof globalThis.fetch, now: () => time });
    await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503 }); expect(mapCalls).toBe(1);
    time = 5000;
    await expect(provider.graphFor([POINT])).rejects.toMatchObject({ status: 503 }); expect(mapCalls).toBe(1);
    time = 30_000;
    expect((await provider.graphFor([POINT])).edges.length).toBeGreaterThan(0); expect(mapCalls).toBe(2);
  });

  it('rejects untrusted-shaped map fallback base URLs before any request', () => {
    for (const mapApiBaseUrl of ['http://map.example', 'https://user:secret@map.example', 'https://map.example?bbox=all', 'https://map.example#fragment']) {
      expect(() => new RoadCoverageProvider(() => null, { mapApiBaseUrl })).toThrow(/server-owned HTTPS/);
    }
  });
});
