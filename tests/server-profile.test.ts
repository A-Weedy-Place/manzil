import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClosureDraft, Commute, Coordinate, PlanResponse, Trip } from '../shared/types';
import { Store } from '../server/store';
import { frequentRouteProposals, coveredBySavedCommute, observedJourneys, observedJourneyConflicts } from '../server/frequent-routes';
import { checkCommute, checkEnabledCommutes, nextOccurrence, type Planner } from '../server/commutes';
import { summarizeTrace } from '../server/geometry';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach(store => store.close()));
function database() { const store = new Store(':memory:'); stores.push(store); return store; }
function recordedTrip(daysAgo: number, minutes = 8 * 60 + 30, reverse = false): Trip {
  const start = Date.UTC(2026, 9, 15 - daysAgo, 0, minutes - 5 * 60);
  const from: Coordinate = reverse ? [73.07, 33.71] : [73.03, 33.69];
  const to: Coordinate = reverse ? [73.03, 33.69] : [73.07, 33.71];
  const points = Array.from({ length: 21 }, (_, index) => ({ coordinate: [from[0] + (to[0] - from[0]) * index / 20,
    from[1] + (to[1] - from[1]) * index / 20] as Coordinate, timestamp: new Date(start + index * 30_000).toISOString(), accuracy: 8 }));
  return { id: `recorded-${daysAgo}-${minutes}-${reverse}`, name: 'Unit-test recorded trace', startedAt: new Date(start).toISOString(),
    endedAt: points.at(-1)!.timestamp, points, contributeToRoadDiscovery: false, durationSeconds: 600, createdAt: new Date(start).toISOString(), ...summarizeTrace(points) };
}
function addRepeated(store: Store) { for (const day of [3, 2, 1]) store.put('trip', recordedTrip(day)); }
const closure: ClosureDraft = { title: 'Scheduled closure', description: 'Test evidence', reason: 'construction',
  startsAt: new Date(NOW - 3600_000).toISOString(), endsAt: null, status: 'published',
  geometry: { type: 'Polygon', coordinates: [[[73.04, 33.69], [73.05, 33.69], [73.05, 33.70], [73.04, 33.69]]] } };
const emptyPlan: PlanResponse = { options: [], baseline: null, conflicts: [], warnings: [], evaluatedAt: new Date(NOW).toISOString(), graphVersion: 'fixture', eventRevision: 0, source: 'local-osm' };

function savedJourney(store: Store, id = 'async-office'): Commute {
  const commute: Commute = { id, name: 'Office', origin: { name: 'Home', coordinate: [73.03, 33.69] },
    destination: { name: 'Office', coordinate: [73.07, 33.71] }, departureTime: '08:30', days: [1, 2, 3, 4, 5], enabled: true,
    createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString() };
  store.put('commute', commute);
  return commute;
}

describe('personal travel permission boundary', () => {
  it('never learns routes or emits observed conflicts from simulated sample traces even with consent', async () => {
    const store = database();
    for (const day of [3, 2, 1]) store.put('trip', { ...recordedTrip(day), demoData: true });
    store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    expect(await frequentRouteProposals(store, NOW)).toEqual([]);
    expect(await observedJourneys(store, NOW)).toEqual([]);
    addRepeated(store);
    expect(await frequentRouteProposals(store, NOW)).toHaveLength(1);
  });
  it('does not read retained traces when collection permission is missing, even for a legacy learning preference', async () => {
    const store = database(); addRepeated(store);
    vi.spyOn(store, 'profile').mockReturnValue({ ...store.profile(), inferFrequentRoutes: true, collectTravelData: false });
    const read = vi.spyOn(store, 'recentInferenceTrips');
    expect(await frequentRouteProposals(store, NOW)).toEqual([]); expect(read).not.toHaveBeenCalled();
  });
  it('rechecks collection permission after an asynchronous inference trace read', async () => {
    const store = database(); addRepeated(store); store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    const retained = store.recentInferenceTrips(NOW);
    vi.spyOn(store, 'recentInferenceTrips').mockImplementation(() => { store.updateProfile({ collectTravelData: false }); return retained; });
    expect(await frequentRouteProposals(store, NOW)).toEqual([]);
  });
  it('does not send learned endpoints to a planner without both consent flags', async () => {
    const store = database(); const commute = savedJourney(store); const planner = vi.fn<Planner>().mockReturnValue(emptyPlan);
    vi.spyOn(store, 'profile').mockReturnValue({ ...store.profile(), inferFrequentRoutes: true, collectTravelData: false });
    await expect(checkCommute(store, commute, planner, NOW, 'usual-privacy')).rejects.toMatchObject({ status: 409 });
    expect(planner).not.toHaveBeenCalled(); expect(store.list('alert')).toEqual([]);
  });
});

describe('asynchronous recurring-journey checks', () => {
  it('waits for an online planner before calculating alerts and keeps repeat checks deduplicated', async () => {
    const store = database(); const commute = savedJourney(store); const event = store.saveClosure(closure);
    let complete!: (plan: PlanResponse) => void;
    const pending = new Promise<PlanResponse>(resolve => { complete = resolve; });
    const planner = vi.fn<Planner>().mockReturnValue(pending);
    const checking = checkCommute(store, commute, planner, NOW);
    expect(store.list('alert')).toHaveLength(0);
    const plan = { ...emptyPlan, eventRevision: store.eventRevision, conflicts: [{ closureId: event.id, title: event.title,
      entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }] };
    complete(plan);
    expect((await checking).plan).toEqual(plan);
    expect(store.list('alert')).toHaveLength(1);
    await checkCommute(store, commute, planner, NOW);
    expect(store.list('alert')).toHaveLength(1);
  });

  it('shares overlapping background sweeps and permits a fresh sweep after completion', async () => {
    const store = database(); savedJourney(store);
    let complete!: (plan: PlanResponse) => void;
    const pending = new Promise<PlanResponse>(resolve => { complete = resolve; });
    const planner = vi.fn<Planner>().mockReturnValueOnce(pending).mockReturnValue(emptyPlan);
    const first = checkEnabledCommutes(store, planner, NOW);
    const overlapping = checkEnabledCommutes(store, planner, NOW);
    expect(overlapping).toBe(first);
    await vi.waitFor(() => expect(planner).toHaveBeenCalledTimes(1));
    complete(emptyPlan);
    await Promise.all([first, overlapping]);
    await checkEnabledCommutes(store, planner, NOW);
    expect(planner).toHaveBeenCalledTimes(2);
  });

  it('checks the newest saved journey in one trailing sweep before coalesced mutation callers finish', async () => {
    const store = database(); savedJourney(store, 'first'); const event = store.saveClosure(closure);
    let completeFirst!: (plan: PlanResponse) => void, completeLatest!: (plan: PlanResponse) => void;
    const firstPending = new Promise<PlanResponse>(resolve => { completeFirst = resolve; });
    const latestPending = new Promise<PlanResponse>(resolve => { completeLatest = resolve; });
    const planner = vi.fn<Planner>().mockImplementation((input, _closures, eventRevision) => {
      if (planner.mock.calls.length === 1) return firstPending;
      if (input.destination.name === 'Updated B') return latestPending;
      return { ...emptyPlan, eventRevision };
    });
    const first = checkEnabledCommutes(store, planner, NOW);
    await vi.waitFor(() => expect(planner).toHaveBeenCalledTimes(1));
    const added = { ...savedJourney(store, 'second'), destination: { name: 'Original B', coordinate: [73.075, 33.715] as Coordinate } };
    store.put('commute', added);
    const savedCheck = checkEnabledCommutes(store, planner, NOW, true);
    const latest = { ...added, destination: { ...added.destination, name: 'Updated B' }, waypoints: [{ name: 'New stop', coordinate: [73.06, 33.705] as Coordinate }] };
    store.put('commute', latest);
    const updatedCheck = checkEnabledCommutes(store, planner, NOW, true);
    expect(savedCheck).toBe(first); expect(updatedCheck).toBe(first);
    const completed = vi.fn();
    const completions = [first, savedCheck, updatedCheck].map(check => check.then(() => completed(store.list<{ commuteId: string }>('alert').filter(alert => alert.commuteId === latest.id).length)));
    completeFirst({ ...emptyPlan, eventRevision: store.eventRevision });
    await vi.waitFor(() => expect(planner.mock.calls.some(([input]) => input.destination.name === 'Updated B')).toBe(true));
    expect(completed).not.toHaveBeenCalled();
    const latestRequest = planner.mock.calls.find(([input]) => input.destination.name === 'Updated B')![0];
    expect(latestRequest.destination).toEqual(latest.destination); expect(latestRequest.waypoints).toEqual(latest.waypoints);
    expect(planner.mock.calls.some(([input]) => input.destination.name === 'Original B')).toBe(false);
    completeLatest({ ...emptyPlan, eventRevision: store.eventRevision, conflicts: [{ closureId: event.id, title: event.title,
      entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }] });
    await Promise.all(completions);
    expect(completed.mock.calls).toEqual([[1], [1], [1]]);
    expect(planner).toHaveBeenCalledTimes(3); // A once initially; A and the latest B in one trailing batch.
    expect(store.list('alert')).toEqual([expect.objectContaining({ commuteId: latest.id, closureId: event.id })]);
  });

  it('continues checking other journeys after one online planner rejects', async () => {
    const store = database(); savedJourney(store, 'first'); savedJourney(store, 'second');
    const event = store.saveClosure(closure);
    const planner = vi.fn<Planner>().mockRejectedValueOnce(new Error('Online routing unavailable.')).mockImplementation(async (_request, _closures, eventRevision) => ({
      ...emptyPlan, eventRevision, conflicts: [{ closureId: event.id, title: event.title, entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }],
    }));
    await expect(checkEnabledCommutes(store, planner, NOW)).resolves.toBeUndefined();
    expect(planner).toHaveBeenCalledTimes(2);
    expect(store.list('alert')).toHaveLength(1);
  });

  it('replans changed closure snapshots before writing an alert', async () => {
    const store = database(); const commute = savedJourney(store); const event = store.saveClosure(closure);
    let complete!: (plan: PlanResponse) => void;
    const pending = new Promise<PlanResponse>(resolve => { complete = resolve; });
    const planner = vi.fn<Planner>().mockReturnValueOnce(pending).mockImplementation((_request, _closures, eventRevision) => ({ ...emptyPlan, eventRevision }));
    const checking = checkCommute(store, commute, planner, NOW);
    await vi.waitFor(() => expect(planner).toHaveBeenCalledTimes(1));
    store.saveClosure({ ...closure, status: 'cancelled' }, event.id, event.revision);
    complete({ ...emptyPlan, eventRevision: 1, conflicts: [{ closureId: event.id, title: event.title, entryAt: event.startsAt,
      exitAt: new Date(NOW + 3600_000).toISOString() }] });
    expect((await checking).plan.eventRevision).toBe(2);
    expect(planner).toHaveBeenCalledTimes(2);
    expect(planner.mock.calls[1][1]).toEqual([]);
    expect(store.list('alert')).toHaveLength(0);
  });

  it('rejects repeatedly changing snapshots without writing stale alerts', async () => {
    const store = database(); const commute = savedJourney(store); const event = store.saveClosure(closure);
    const planner = vi.fn<Planner>().mockImplementation(async (_request, _closures, eventRevision) => {
      const current = store.get<{ revision: number }>('closure', event.id)!;
      store.saveClosure({ ...closure, title: `Revision ${eventRevision + 1}` }, event.id, current.revision);
      return { ...emptyPlan, eventRevision, conflicts: [{ closureId: event.id, title: event.title,
        entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }] };
    });
    await expect(checkCommute(store, commute, planner, NOW)).rejects.toMatchObject({ status: 409 });
    expect(planner).toHaveBeenCalledTimes(2);
    expect(store.list('alert')).toHaveLength(0);
  });

  it('does not suppress an updated learned-route conflict using an older saved-route check', async () => {
    const store = database(); addRepeated(store); store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    const proposal = (await frequentRouteProposals(store, NOW))[0];
    store.put('commute', { ...proposal, id: 'saved-office', name: 'Office', enabled: true, createdAt: '', updatedAt: '' });
    const event = store.saveClosure(closure);
    const conflict = { closureId: event.id, title: event.title, entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() };
    let complete!: (plan: PlanResponse) => void;
    let learnedStarted!: () => void;
    const learnedWaiting = new Promise<void>(resolve => { learnedStarted = resolve; });
    const pending = new Promise<PlanResponse>(resolve => { complete = resolve; });
    const planner = vi.fn<Planner>()
      .mockImplementationOnce((_request, _closures, eventRevision) => ({ ...emptyPlan, eventRevision, conflicts: [conflict] }))
      .mockImplementationOnce(() => { learnedStarted(); return pending; })
      .mockImplementation((_request, _closures, eventRevision) => ({ ...emptyPlan, eventRevision, conflicts: [conflict] }));
    const checking = checkEnabledCommutes(store, planner, NOW);
    await learnedWaiting;
    store.saveClosure({ ...closure, title: 'Updated restriction' }, event.id, event.revision);
    complete({ ...emptyPlan, eventRevision: 1, conflicts: [conflict] });
    await checking;
    expect(planner).toHaveBeenCalledTimes(3);
    expect(store.list('alert')).toHaveLength(2);
    expect(store.list('alert')).toEqual(expect.arrayContaining([expect.objectContaining({ frequentRouteId: proposal.id })]));
  });

  it('does not publish a learned-route alert or check metadata after consent is withdrawn during online planning', async () => {
    const store = database(); addRepeated(store);
    for (const day of [3, 2, 1]) store.put('trip', recordedTrip(day, 8 * 60 + 30, true));
    store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    const proposals = await frequentRouteProposals(store, NOW); expect(proposals).toHaveLength(2);
    const proposal = proposals[0];
    const event = store.saveClosure(closure);
    let complete!: (plan: PlanResponse) => void;
    const pending = new Promise<PlanResponse>(resolve => { complete = resolve; });
    const planner = vi.fn<Planner>().mockReturnValue(pending);
    const checking = checkEnabledCommutes(store, planner, NOW);
    await vi.waitFor(() => expect(planner).toHaveBeenCalledTimes(1));
    const input = planner.mock.calls[0][0];
    // The optional online adapter receives route endpoints/timing, never raw
    // private traces, contribution preferences, trip IDs or profile records.
    expect(Object.keys(input).every(key => ['origin', 'destination', 'waypoints', 'departureAt', 'compareDepartures'].includes(key))).toBe(true);
    expect(input.origin).toEqual(proposal.origin); expect(input.destination).toEqual(proposal.destination);
    expect(input).not.toHaveProperty('points'); expect(input).not.toHaveProperty('trips');
    expect(JSON.stringify(planner.mock.calls)).not.toContain('Unit-test recorded trace');
    store.updateProfile({ inferFrequentRoutes: false });
    complete({ ...emptyPlan, eventRevision: store.eventRevision, conflicts: [{ closureId: event.id, title: event.title,
      entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }] });
    await expect(checking).resolves.toBeUndefined();
    expect(planner).toHaveBeenCalledTimes(1);
    expect(store.list('alert')).toEqual([]);
    for (const learned of proposals) expect(store.meta(`frequent-route-check:${learned.id}:${input.departureAt}`)).toBeUndefined();
    expect(store.list('trip')).toHaveLength(6);
  });

  it('finishes a background sweep safely when shutdown closes its store during planning', async () => {
    const store = database(); savedJourney(store, 'first'); savedJourney(store, 'second');
    let complete!: (plan: PlanResponse) => void;
    const pending = new Promise<PlanResponse>(resolve => { complete = resolve; });
    const planner = vi.fn<Planner>().mockReturnValue(pending);
    const checking = checkEnabledCommutes(store, planner, NOW);
    await vi.waitFor(() => expect(planner).toHaveBeenCalledTimes(1));
    store.close(); stores.splice(stores.indexOf(store), 1);
    complete(emptyPlan);
    await expect(checking).resolves.toBeUndefined();
    expect(planner).toHaveBeenCalledTimes(1);
  });
});

describe('consented local usual-journey learning', () => {
  it('warns for a historical street even when the fresh planned main road is clear, without sending GPS to the planner', async () => {
    const store = database(); addRepeated(store); store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    const proposal = (await frequentRouteProposals(store, NOW))[0];
    const occurrence = nextOccurrence({ ...proposal, name: 'Usual', enabled: true, createdAt: '', updatedAt: '' }, NOW);
    const at = Date.parse(occurrence);
    const event = store.saveClosure({ ...closure, title: 'Observed street restriction', startsAt: new Date(at + 240_000).toISOString(), endsAt: new Date(at + 360_000).toISOString(),
      geometry: { type: 'Polygon', coordinates: [[[73.0495,33.6995],[73.0505,33.6995],[73.0505,33.7005],[73.0495,33.7005],[73.0495,33.6995]]] } });
    const path = { geometry: { type: 'LineString' as const, coordinates: [[73.03,33.69],[73.03,33.72],[73.07,33.72],[73.07,33.71]] }, distanceMeters: 6000, durationSeconds: 600,
      departureAt: occurrence, arrivalAt: new Date(at+600_000).toISOString(), steps: [], snappedOrigin: proposal.origin.coordinate, snappedDestination: proposal.destination.coordinate };
    const planner = vi.fn<Planner>((_request, _closures, eventRevision) => ({ ...emptyPlan, eventRevision, baseline: path, options: [{ ...path, id: 'fresh-main-road', kind: 'direct', label: 'Main road', validation: 'clear', warnings: [] }] }));
    await checkEnabledCommutes(store, planner, NOW); await checkEnabledCommutes(store, planner, NOW);
    const alerts = store.list<{ title: string; message: string; closureId: string }>('alert');
    expect(alerts).toHaveLength(1); expect(alerts[0]).toMatchObject({ title: 'Your observed journey may be affected', closureId: event.id });
    expect(alerts[0].message).toContain('historical corridor warning'); expect(alerts[0].message).toContain('fresh validated routes');
    expect(planner.mock.calls.every(([input]) => !JSON.stringify(input).includes('timestamp') && !('points' in input))).toBe(true);
    expect(Object.keys(proposal)).not.toContain('points');
  });
  it('uses recorded passage offsets rather than departure-only overlap and ignores closures after passage', async () => {
    const store = database(); addRepeated(store); store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    const observed = (await observedJourneys(store, NOW))[0], departure = '2026-10-19T03:30:00.000Z', at = Date.parse(departure);
    const geometry: ClosureDraft['geometry'] = { type: 'Polygon', coordinates: [[[73.0495,33.6995],[73.0505,33.6995],[73.0505,33.7005],[73.0495,33.7005],[73.0495,33.6995]]] };
    const during = store.saveClosure({ ...closure, geometry, startsAt: new Date(at+240_000).toISOString(), endsAt: new Date(at+360_000).toISOString() });
    const after = store.saveClosure({ ...closure, geometry, title: 'After the observed passage', startsAt: new Date(at+480_000).toISOString(), endsAt: new Date(at+600_000).toISOString() });
    const ended = store.saveClosure({ ...closure, geometry, title: 'Ended before passage', startsAt: new Date(at).toISOString(), endsAt: new Date(at+180_000).toISOString() });
    const pending = store.saveClosure({ ...closure, geometry, title: 'Unreviewed', status: 'draft', moderation: 'pending', startsAt: new Date(at+240_000).toISOString(), endsAt: null });
    const found = observedJourneyConflicts(observed, [during,after,ended,pending], departure);
    expect(found.map(conflict => conflict.closureId)).toEqual([during.id]);
    expect(Date.parse(found[0].entryAt)).toBeGreaterThan(at+280_000); expect(Date.parse(found[0].exitAt)).toBeLessThan(at+320_000);
  });
  it('labels a surviving sparse observation as approximate and does not save an alert after awaited opt-out', async () => {
    const store = database(); addRepeated(store); store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    // One 75-second gap in an otherwise dense trace survives the quality budget;
    // its straight segment supports only an approximate corridor warning.
    const original = recordedTrip(1);
    const dense = original.points.flatMap((point,index) => {
      const next = original.points[index+1];
      return next ? [point, { coordinate: [(point.coordinate[0]+next.coordinate[0])/2,(point.coordinate[1]+next.coordinate[1])/2] as Coordinate,
        timestamp: new Date((Date.parse(point.timestamp)+Date.parse(next.timestamp))/2).toISOString(), accuracy: 8 }] : [point];
    }).filter((_point,index) => index < 18 || index > 21);
    store.put('trip', { ...original, points: dense });
    const sparse = (await observedJourneys(store, NOW))[0]; expect(sparse.points).toHaveLength(37);
    const departure = '2026-10-19T03:30:00.000Z', at = Date.parse(departure);
    const event = store.saveClosure({ ...closure, startsAt: new Date(at+240_000).toISOString(), endsAt: new Date(at+360_000).toISOString(),
      geometry: { type: 'Polygon', coordinates: [[[73.0495,33.6995],[73.0505,33.6995],[73.0505,33.7005],[73.0495,33.7005],[73.0495,33.6995]]] } });
    expect(observedJourneyConflicts(sparse,[event],departure)[0]).toMatchObject({ uncertain: true });
    let release!: (plan: PlanResponse) => void;
    const planner = vi.fn<Planner>().mockReturnValue(new Promise(resolve => { release = resolve; }));
    const checking = checkEnabledCommutes(store, planner, NOW);
    await vi.waitFor(() => expect(planner).toHaveBeenCalledTimes(1));
    store.updateProfile({ collectTravelData: false }); release(emptyPlan); await checking;
    expect(store.list('alert')).toEqual([]);
  });
  it('does nothing without explicit consent and returns proposals without raw traces after consent', async () => {
    const store = database(); addRepeated(store);
    expect((await frequentRouteProposals(store, NOW))).toEqual([]);
    store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    const proposals = (await frequentRouteProposals(store, NOW));
    expect(proposals).toHaveLength(1); expect(proposals[0]).toMatchObject({ departureTime: '08:30', days: [1, 2, 3], sampleCount: 3 });
    expect(Object.keys(proposals[0]).sort()).toEqual(['id', 'origin', 'destination', 'departureTime', 'days', 'sampleCount', 'lastObservedAt'].sort());
    expect(store.list('commute')).toHaveLength(0);
    const id = proposals[0].id; store.put('trip', recordedTrip(0, 8 * 60 + 35));
    expect((await frequentRouteProposals(store, NOW))[0]).toMatchObject({ id, sampleCount: 4 });
    store.updateProfile({ inferFrequentRoutes: false }); expect((await frequentRouteProposals(store, NOW))).toEqual([]);
    expect(store.list('trip')).toHaveLength(4);
  });
  it('requires three independent local dates rather than duplicate imports or two journeys', async () => {
    const store = database(); store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    for (let index = 0; index < 3; index++) store.put('trip', { ...recordedTrip(1), id: `duplicate-${index}` });
    expect((await frequentRouteProposals(store, NOW))).toEqual([]);
    store.put('trip', recordedTrip(2)); expect((await frequentRouteProposals(store, NOW))).toEqual([]);
    store.put('trip', recordedTrip(3)); expect((await frequentRouteProposals(store, NOW))[0].sampleCount).toBe(3);
  });
  it('excludes inaccurate, interrupted, and expired traces from learned patterns', async () => {
    const store = database(); store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    for (const day of [3, 2, 1]) {
      const trip = recordedTrip(day);
      store.put('trip', { ...trip, points: trip.points.map(point => ({ ...point, accuracy: 200 })) });
    }
    expect((await frequentRouteProposals(store, NOW))).toEqual([]);
    for (const day of [3, 2, 1]) {
      const trip = recordedTrip(day);
      const points = trip.points.map((point, index) => ({ ...point, timestamp: new Date(Date.parse(point.timestamp) + (index >= 10 ? 120_000 : 0)).toISOString() }));
      store.put('trip', { ...trip, points, endedAt: points.at(-1)!.timestamp });
    }
    expect((await frequentRouteProposals(store, NOW))).toEqual([]);
    for (const day of [3, 2, 1]) store.delete('trip', recordedTrip(day).id);
    for (const day of [33, 32, 31]) store.put('trip', recordedTrip(day));
    expect((await frequentRouteProposals(store, NOW))).toEqual([]);
  });
  it('separates opposite directions and handles departure times across midnight', async () => {
    const store = database(); store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true }); addRepeated(store);
    for (const day of [3, 2, 1]) store.put('trip', recordedTrip(day, 8 * 60 + 30, true));
    const proposals = (await frequentRouteProposals(store, NOW)); expect(proposals).toHaveLength(2); expect(new Set(proposals.map(route => route.id)).size).toBe(2);
    const midnight = database(); midnight.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    for (const [index, minutes] of [23 * 60 + 50, 0, 10].entries()) midnight.put('trip', recordedTrip(index + 1, minutes));
    expect((await frequentRouteProposals(midnight, NOW))[0].departureTime).toBe('00:00');
  });
  it('alerts on consented learned journeys without inventing a saved commute and stops after opt-out', async () => {
    const store = database(); addRepeated(store); const event = store.saveClosure(closure);
    const planner = vi.fn<Planner>((_request, _closures, eventRevision) => ({ ...emptyPlan, eventRevision, conflicts: [{ closureId: event.id, title: event.title, entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }] }));
    (await checkEnabledCommutes(store, planner, NOW)); expect(planner).not.toHaveBeenCalled();
    store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true }); (await checkEnabledCommutes(store, planner, NOW)); (await checkEnabledCommutes(store, planner, NOW));
    expect(store.list('alert')).toHaveLength(1);
    expect(store.list('alert')[0]).toMatchObject({ frequentRouteId: (await frequentRouteProposals(store, NOW))[0].id });
    expect(store.list<Record<string, unknown>>('alert')[0]).not.toHaveProperty('commuteId'); expect(store.list('commute')).toHaveLength(0);
    store.updateProfile({ inferFrequentRoutes: false }); const calls = planner.mock.calls.length;
    store.saveClosure({ ...closure, title: 'Changed' }, event.id, event.revision); (await checkEnabledCommutes(store, planner, NOW));
    expect(planner.mock.calls).toHaveLength(calls); expect(store.list('alert')).toHaveLength(1);
  });
  it('avoids duplicate alerts only when a saved commute covers direction, time, and weekdays', async () => {
    const store = database(); addRepeated(store); store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true });
    const proposal = (await frequentRouteProposals(store, NOW))[0];
    const commute: Commute = { ...proposal, id: 'explicit-commute', name: 'Office', enabled: true, createdAt: '', updatedAt: '' };
    expect(coveredBySavedCommute(proposal, commute)).toBe(true);
    expect(coveredBySavedCommute(proposal, { ...commute, departureTime: '18:00' })).toBe(false);
    expect(coveredBySavedCommute(proposal, { ...commute, days: [1] })).toBe(false);
    expect(coveredBySavedCommute(proposal, { ...commute, origin: commute.destination, destination: commute.origin })).toBe(false);
    store.put('commute', commute); const event = store.saveClosure(closure);
    const planner = vi.fn<Planner>((_request, _closures, eventRevision) => ({ ...emptyPlan, eventRevision, conflicts: [{ closureId: event.id, title: event.title, entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }] }));
    (await checkEnabledCommutes(store, planner, NOW)); expect(planner).toHaveBeenCalledTimes(2); expect(store.list('alert')).toHaveLength(1);
    expect(store.list('alert')[0]).toMatchObject({ commuteId: commute.id });
    store.put('commute', { ...commute, departureTime: '18:00' }); (await checkEnabledCommutes(store, planner, NOW));
    expect(store.list('alert')).toHaveLength(3); // Separate saved departure plus an uncovered learned journey.
  });
  it('does not suppress a learned-route warning merely because a nearby saved journey is clear', async () => {
    const store = database(); addRepeated(store); store.updateProfile({ collectTravelData: true, inferFrequentRoutes: true }); const proposal = (await frequentRouteProposals(store, NOW))[0];
    store.put('commute', { ...proposal, id: 'later-commute', name: 'Later departure', departureTime: '09:00', enabled: true, createdAt: '', updatedAt: '' });
    const event = store.saveClosure(closure);
    const planner = vi.fn<Planner>((request, _closures, eventRevision) => new Date(Date.parse(request.departureAt) + 5 * 3600_000).getUTCHours() === 9 ? { ...emptyPlan, eventRevision } : {
      ...emptyPlan, eventRevision, conflicts: [{ closureId: event.id, title: event.title, entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }] });
    (await checkEnabledCommutes(store, planner, NOW));
    expect(store.list('alert')).toHaveLength(1); expect(store.list('alert')[0]).toMatchObject({ frequentRouteId: proposal.id });
  });
});
