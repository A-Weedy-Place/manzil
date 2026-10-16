import { describe, expect, it, vi } from 'vitest';
import type { Closure, Coordinate, PlanRequest } from '../shared/types';
import { createWorldJourneyPlanner } from '../server/routing/world';
import { distanceMeters } from '../server/routing/graph';

const departureAt = '2027-01-15T11:00:00.000Z';
const A: Coordinate = [74.35, 31.52], STOP: Coordinate = [74.36, 31.52], B: Coordinate = [74.37, 31.52];
const NORTH: Coordinate = [74.36, 31.53];
const place = (coordinate: Coordinate) => ({ name: coordinate.join(', '), coordinate });
const request = (overrides: Partial<PlanRequest> = {}): PlanRequest => ({ origin: place(A), destination: place(B), departureAt, ...overrides });
function route(points: Coordinate[], legCounts = [points.length - 1], seconds?: number[][], turnSeconds: number[] = []) {
  let cursor = 0;
  const legs = legCounts.map((count, legIndex) => {
    const coordinates = points.slice(cursor, cursor + count + 1);
    const durations = seconds?.[legIndex] ?? Array.from({ length: count }, () => 60);
    const distances = coordinates.slice(1).map((point, i) => distanceMeters(coordinates[i], point));
    const duration = durations.reduce((a, b) => a + b, 0) + (turnSeconds[legIndex] ?? 0);
    const distance = distances.reduce((a, b) => a + b, 0), end = coordinates[coordinates.length - 1];
    cursor += count;
    return { distance, duration, annotation: { duration: durations, distance: distances }, steps: [
      { name: `Lahore road ${legIndex}`, distance, duration, geometry: { type: 'LineString', coordinates }, maneuver: { type: 'depart', location: coordinates[0] } },
      { name: '', distance: 0, duration: 0, geometry: { type: 'LineString', coordinates: [end, end] }, maneuver: { type: 'arrive', location: end } },
    ] };
  });
  return { distance: legs.reduce((n, leg) => n + leg.distance, 0), duration: legs.reduce((n, leg) => n + leg.duration, 0), geometry: { type: 'LineString', coordinates: points }, legs };
}
function payload(routes = [route([A, STOP, B])], waypoints: Coordinate[] = [A, B]) {
  return { code: 'Ok', data_version: '2027-01-01T00:00:00Z', routes, waypoints: waypoints.map(location => ({ location, distance: 0, name: 'Road' })) };
}
function fixture(value: unknown = payload(), options: Parameters<typeof createWorldJourneyPlanner>[0] = {}) {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
  return { plan: createWorldJourneyPlanner({ fetch: fetcher, minimumIntervalMs: 0, ...options }), fetcher };
}
const closure = (overrides: Partial<Closure> = {}): Closure => ({ id: 'test-road', title: 'Unit-test Lahore road restriction', description: 'Synthetic test fixture only', reason: 'construction',
  startsAt: '2027-01-15T10:00:00Z', endsAt: '2027-01-15T12:00:00Z', status: 'published', revision: 1, createdAt: departureAt, updatedAt: departureAt,
  geometry: { type: 'Polygon', coordinates: [[[74.354, 31.5198], [74.356, 31.5198], [74.356, 31.5202], [74.354, 31.5202], [74.354, 31.5198]]] }, ...overrides });
const laterLeg = (): Closure => closure({ geometry: { type: 'Polygon', coordinates: [[[74.364, 31.5198], [74.366, 31.5198], [74.366, 31.5202], [74.364, 31.5202], [74.364, 31.5198]]] } });

describe('online Pakistan road routing', () => {
  it('routes outside Islamabad using actual provider geometry, ordinary timings and driving steps', async () => {
    const { plan, fetcher } = fixture();
    const result = await plan(request(), [], 7);
    expect(result.unavailableReason).toBeUndefined();
    expect(result.source).toBe('osrm'); expect(result.eventRevision).toBe(7);
    expect(result.options[0]).toMatchObject({ geometry: { type: 'LineString', coordinates: [A, STOP, B] }, durationSeconds: 120, departureAt, arrivalAt: '2027-01-15T11:02:00.000Z', validation: 'clear', kind: 'direct' });
    expect(result.options[0].steps[0].roadName).toBe('Lahore road 0');
    expect(result.graphVersion).toContain('2027-01-01');
    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toContain('https://router.project-osrm.org/route/v1/driving/74.35,31.52;74.37,31.52');
    expect(url).toContain('annotations=duration,distance'); expect(url).toContain('overview=full');
    expect(url).toContain('steps=true'); expect(url).toContain('radiuses=220;220');
    expect(result.warnings.join(' ')).toMatch(/without live traffic/);
  });

  it('preserves ordered stops and cumulative actual leg timing for a mid-trip closure', async () => {
    const value = payload([route([A, STOP, B], [1, 1], [[90], [60]], [7, 11])], [A, STOP, B]);
    const { plan, fetcher } = fixture(value);
    const result = await plan(request({ waypoints: [place(STOP)] }), [laterLeg()], 1);
    expect(result.baseline?.snappedWaypoints).toEqual([STOP]);
    expect(result.baseline?.durationSeconds).toBe(168);
    expect(result.conflicts).toHaveLength(1);
    expect(Date.parse(result.conflicts[0].entryAt) - Date.parse(departureAt)).toBeCloseTo(121_000, 0);
    expect(Date.parse(result.conflicts[0].exitAt) - Date.parse(departureAt)).toBeCloseTo(144_110, 0);
    expect(result.options).toHaveLength(0);
    expect(String(fetcher.mock.calls[0][0])).toContain('74.35,31.52;74.36,31.52;74.37,31.52');
  });

  it('keeps a later leg clear when the closure ends before its traversal margin', async () => {
    const { plan } = fixture(payload([route([A, STOP, B], [1, 1], [[90], [60]], [7, 11])], [A, STOP, B]));
    const result = await plan(request({ waypoints: [place(STOP)] }), [laterLegWithEnd()], 2);
    expect(result.options[0]?.kind).toBe('direct'); expect(result.conflicts).toHaveLength(0);
  });

  it('widens closure timing for unallocated turn duration without inventing road edges', async () => {
    const { plan } = fixture(payload([route([A, STOP, B], [2], [[60, 60]], [120])]));
    const result = await plan(request(), [closure({ startsAt: '2027-01-15T11:02:00Z' })], 3);
    expect(result.conflicts).toHaveLength(1);
    expect(result.baseline?.durationSeconds).toBe(240);
    expect(result.baseline?.geometry.coordinates).toEqual([A, STOP, B]);
    expect(result.options).toHaveLength(0);
  });

  it('filters a blocked baseline and blocked alternative, keeping only a checked clear detour', async () => {
    const { plan } = fixture(payload([route([A, STOP, B]), route([A, [74.36, 31.5201], B]), route([A, NORTH, B])]));
    const result = await plan(request(), [closure()], 4);
    expect(result.conflicts).toHaveLength(1); expect(result.options).toHaveLength(1);
    expect(result.options[0].kind).toBe('detour'); expect(result.options[0].geometry.coordinates).toEqual([A, NORTH, B]);
    expect(result.options[0].validation).toBe('clear');
  });

  it('never recommends a blocked route when all returned paths are restricted', async () => {
    const { plan } = fixture(payload([route([A, STOP, B]), route([A, [74.36, 31.5201], B])]));
    const result = await plan(request(), [closure()], 5);
    expect(result.options).toHaveLength(0); expect(result.baseline).not.toBeNull();
    expect(result.unavailableReason).toMatch(/No closure-clear/);
  });

  it('validates distant published time windows before consulting the provider', async () => {
    const { plan, fetcher } = fixture();
    const distant = closure({ startsAt: 'bad-date', geometry: { type: 'Polygon', coordinates: [[[67, 24.8], [67.001, 24.8], [67.001, 24.801], [67, 24.801], [67, 24.8]]] } });
    const result = await plan(request(), [distant], 1);
    expect(result.options).toHaveLength(0); expect(result.unavailableReason).toMatch(/invalid time window/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects reversed/invalid ends and malformed published geometry, while ignoring draft schedules', async () => {
    const { plan } = fixture();
    for (const event of [closure({ endsAt: 'not-a-date' }), closure({ endsAt: '2027-01-01T00:00:00Z' }), closure({ geometry: { type: 'Polygon', coordinates: [] } })]) {
      const result = await plan(request(), [event], 2);
      expect(result.options).toHaveLength(0); expect(result.unavailableReason).toMatch(/invalid/);
    }
    expect((await plan(request(), [closure({ startsAt: 'bad', status: 'draft' })], 2)).options[0].kind).toBe('direct');
  });

  it('does not claim a route for NoRoute, NoSegment or empty provider results', async () => {
    for (const value of [{ code: 'NoRoute' }, { code: 'NoSegment' }, payload([])]) {
      const result = await fixture(value).plan(request(), [], 0);
      expect(result.baseline).toBeNull(); expect(result.options).toHaveLength(0);
      expect(result.unavailableReason).toMatch(/route|road/);
    }
  });

  it('rejects distant, malformed and unreported snapped points', async () => {
    for (const mutate of [
      (value: ReturnType<typeof payload>) => { value.waypoints[0].distance = 221; },
      (value: ReturnType<typeof payload>) => { value.waypoints[0].location = [74.4, 31.52]; },
      (value: ReturnType<typeof payload>) => { value.waypoints.pop(); },
      (value: ReturnType<typeof payload>) => { value.waypoints[0].location = [NaN, 31.52]; },
    ]) {
      const value = payload(); mutate(value);
      const result = await fixture(value).plan(request(), [], 0);
      expect(result.options).toHaveLength(0); expect(result.unavailableReason).toBeTruthy();
    }
  });

  it('rejects an invalid or disconnected annotation/geometry instead of drawing fake roads', async () => {
    const changes = [
      (value: ReturnType<typeof payload>) => { value.routes[0].legs[0].annotation.duration.pop(); },
      (value: ReturnType<typeof payload>) => { value.routes[0].legs[0].annotation.distance[0] = 1; },
      (value: ReturnType<typeof payload>) => { value.routes[0].geometry.coordinates[0] = [74.355, 31.52]; },
      (value: ReturnType<typeof payload>) => { value.routes[0].legs[0].duration = 1; },
      (value: ReturnType<typeof payload>) => { value.routes[0].legs[0].steps[0].geometry.coordinates = [A, B]; },
    ];
    for (const mutate of changes) {
      const value = payload(); mutate(value);
      const result = await fixture(value).plan(request(), [], 0);
      expect(result.baseline).toBeNull(); expect(result.options).toHaveLength(0); expect(result.unavailableReason).toBeTruthy();
    }
  });

  it('fails explicitly on provider outage and bounded timeout', async () => {
    const unavailable = createWorldJourneyPlanner({ fetch: vi.fn(async () => new Response('Unavailable', { status: 503 })), minimumIntervalMs: 0 });
    expect((await unavailable(request(), [], 0)).unavailableReason).toMatch(/HTTP 503/);
    const rejected = createWorldJourneyPlanner({ fetch: vi.fn(async () => { throw new Error('Network offline'); }), minimumIntervalMs: 0 });
    expect((await rejected(request(), [], 0)).unavailableReason).toMatch(/Network offline/);
    const timedOut = createWorldJourneyPlanner({ fetch: vi.fn(() => new Promise<Response>(() => undefined)), minimumIntervalMs: 0, timeoutMs: 5 });
    const result = await timedOut(request(), [], 0);
    expect(result.options).toHaveLength(0); expect(result.unavailableReason).toMatch(/timed out/);
  });

  it('cancels a stalled response stream on timeout and can retry without caching partial geometry', async () => {
    const cancel = vi.fn();
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"code":"Ok",')); },
      cancel,
    });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(stalled))
      .mockImplementation(async () => new Response(JSON.stringify(payload())));
    const plan = createWorldJourneyPlanner({ fetch: fetcher, minimumIntervalMs: 0, timeoutMs: 20 });
    const expired = await plan(request(), [], 0);
    expect(expired.options).toEqual([]); expect(expired.unavailableReason).toMatch(/timed out/);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect((await plan(request(), [], 1)).options).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects oversized bodies and route geometry before closure processing', async () => {
    const oversized = createWorldJourneyPlanner({ fetch: vi.fn(async () => new Response('{}', { headers: { 'Content-Length': String(7 * 1024 * 1024) } })), minimumIntervalMs: 0 });
    expect((await oversized(request(), [], 0)).unavailableReason).toMatch(/size limit/);
    const value = payload(); value.routes[0].geometry.coordinates = Array.from({ length: 40_001 }, () => A);
    expect((await fixture(value).plan(request(), [], 0)).unavailableReason).toMatch(/validation limit/);
  });

  it('caches road geometry while revalidating closure content, revisions and departure time', async () => {
    const { plan, fetcher } = fixture();
    const original = await plan(request(), [], 1); expect(original.options).toHaveLength(1);
    const blocked = await plan(request(), [closure()], 2); expect(blocked.options).toHaveLength(0); expect(blocked.eventRevision).toBe(2);
    const later = await plan(request({ departureAt: '2027-01-15T13:00:00Z' }), [closure()], 3); expect(later.options).toHaveLength(1);
    const changed = await plan(request(), [closure({ geometry: { type: 'Polygon', coordinates: [[[74.35, 31.54], [74.36, 31.54], [74.36, 31.55], [74.35, 31.55], [74.35, 31.54]]] } })], 4); expect(changed.options).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    original.options[0].geometry.coordinates[0][0] = 0;
    expect((await plan(request(), [], 5)).options[0].geometry.coordinates[0]).toEqual(A);
  });

  it('deduplicates concurrent endpoint requests and expires the ten-minute geometry cache', async () => {
    let clock = Date.parse(departureAt);
    const { plan, fetcher } = fixture(payload(), { now: () => clock });
    const results = await Promise.all([plan(request(), [], 1), plan(request(), [closure()], 2)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results[0].options).toHaveLength(1); expect(results[1].options).toHaveLength(0);
    clock += 10 * 60_000 + 1;
    await plan(request(), [], 3); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rechecks earlier/later departures using the same provider geometry when the baseline is blocked', async () => {
    const { plan, fetcher } = fixture();
    const result = await plan(request({ compareDepartures: true }), [closure({ startsAt: '2027-01-15T10:59:00Z', endsAt: '2027-01-15T11:05:00Z' })], 2);
    expect(result.options.map(option => option.kind)).toEqual(['leave_earlier', 'leave_later']);
    expect(result.options.map(option => option.departureAt)).toEqual(['2027-01-15T10:45:00.000Z', '2027-01-15T11:15:00.000Z']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const clear = await plan(request({ compareDepartures: true }), [], 3);
    expect(clear.options.map(option => option.kind)).toEqual(['direct']);
  });

  it('accepts five ordered stops and rejects six or foreign endpoints without a provider call', async () => {
    const points: Coordinate[] = Array.from({ length: 7 }, (_, i) => [74.35 + i * .001, 31.52]);
    const { plan, fetcher } = fixture(payload([route(points, [1, 1, 1, 1, 1, 1])], points));
    const valid = request({ origin: place(points[0]), destination: place(points[6]), waypoints: points.slice(1, 6).map(place) });
    const result = await plan(valid, [], 0);
    expect(result.options[0]?.snappedWaypoints).toEqual(points.slice(1, 6));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await plan({ ...valid, waypoints: [...valid.waypoints!, place(STOP)] }, [], 0)).options).toHaveLength(0);
    expect((await plan(request({ destination: place([77.2, 28.6]) }), [], 0)).unavailableReason).toMatch(/inside Pakistan/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('supports an injected compatible OSRM base URL', async () => {
    const { plan, fetcher } = fixture(payload(), { baseUrl: 'https://routing.example.test/custom/' });
    await plan(request(), [], 0);
    expect(String(fetcher.mock.calls[0][0])).toContain('https://routing.example.test/custom/route/v1/driving/');
  });

  it('spaces provider starts by at least one second while allowing concurrent responses', async () => {
    vi.useFakeTimers();
    try {
      const starts: number[] = [];
      const fetcher = vi.fn<typeof fetch>(async () => { starts.push(Date.now()); return new Response(JSON.stringify(payload())); });
      const plan = createWorldJourneyPlanner({ fetch: fetcher });
      const promises = [0, 1, 2].map(i => plan(request({ origin: place([A[0] + i * .0001, A[1]]) }), [], i));
      await vi.advanceTimersByTimeAsync(0); expect(starts).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(999); expect(starts).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1); expect(starts).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect((await Promise.all(promises)).every(result => result.options.length === 1)).toBe(true);
      expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
      expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1000);
    } finally { vi.useRealTimers(); }
  });

  it('bounds pending unique requests without breaking concurrent deduplication', async () => {
    const plan = createWorldJourneyPlanner({ fetch: vi.fn(() => new Promise<Response>(() => undefined)), minimumIntervalMs: 0, timeoutMs: 10 });
    const results = await Promise.all(Array.from({ length: 9 }, (_, i) => plan(request({ origin: place([A[0] + i * .00001, A[1]]) }), [], i)));
    expect(results.filter(result => /queue is full/.test(result.unavailableReason ?? ''))).toHaveLength(1);
    expect(results.every(result => result.options.length === 0)).toBe(true);
  });

  it('evicts the oldest geometry at the 32-entry cache bound', async () => {
    const { plan, fetcher } = fixture();
    for (let i = 0; i < 33; i++) await plan(request({ origin: place([A[0] + i * .00001, A[1]]) }), [], i);
    expect(fetcher).toHaveBeenCalledTimes(33);
    await plan(request(), [], 34); expect(fetcher).toHaveBeenCalledTimes(34);
  });

  it('also bounds retained server geometry by total point count', async () => {
    const points: Coordinate[] = Array.from({ length: 9000 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 8999, A[1]]);
    const { plan, fetcher } = fixture(payload([route(points)]));
    for (let i = 0; i < 9; i++) {
      const result = await plan(request({ origin: place([A[0] + i * .00001, A[1]]) }), [], i);
      expect(result.unavailableReason).toBeUndefined();
    }
    expect(fetcher).toHaveBeenCalledTimes(9);
    await plan(request(), [], 10); expect(fetcher).toHaveBeenCalledTimes(10);
  });
});

function laterLegWithEnd(): Closure { return { ...laterLeg(), startsAt: '2027-01-15T10:00:00Z', endsAt: '2027-01-15T11:01:20Z' }; }
