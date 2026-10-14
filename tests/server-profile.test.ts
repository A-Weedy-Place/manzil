import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClosureDraft, Commute, Coordinate, PlanResponse, Trip } from '../shared/types';
import { Store } from '../server/store';
import { frequentRouteProposals, coveredBySavedCommute } from '../server/frequent-routes';
import { checkEnabledCommutes } from '../server/commutes';
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

describe('consented local usual-journey learning', () => {
  it('does nothing without explicit consent and returns proposals without raw traces after consent', () => {
    const store = database(); addRepeated(store);
    expect(frequentRouteProposals(store, NOW)).toEqual([]);
    store.updateProfile({ inferFrequentRoutes: true });
    const proposals = frequentRouteProposals(store, NOW);
    expect(proposals).toHaveLength(1); expect(proposals[0]).toMatchObject({ departureTime: '08:30', days: [1, 2, 3], sampleCount: 3 });
    expect(Object.keys(proposals[0]).sort()).toEqual(['id', 'origin', 'destination', 'departureTime', 'days', 'sampleCount', 'lastObservedAt'].sort());
    expect(store.list('commute')).toHaveLength(0);
    const id = proposals[0].id; store.put('trip', recordedTrip(0, 8 * 60 + 35));
    expect(frequentRouteProposals(store, NOW)[0]).toMatchObject({ id, sampleCount: 4 });
    store.updateProfile({ inferFrequentRoutes: false }); expect(frequentRouteProposals(store, NOW)).toEqual([]);
    expect(store.list('trip')).toHaveLength(4);
  });
  it('requires three independent local dates rather than duplicate imports or two journeys', () => {
    const store = database(); store.updateProfile({ inferFrequentRoutes: true });
    for (let index = 0; index < 3; index++) store.put('trip', { ...recordedTrip(1), id: `duplicate-${index}` });
    expect(frequentRouteProposals(store, NOW)).toEqual([]);
    store.put('trip', recordedTrip(2)); expect(frequentRouteProposals(store, NOW)).toEqual([]);
    store.put('trip', recordedTrip(3)); expect(frequentRouteProposals(store, NOW)[0].sampleCount).toBe(3);
  });
  it('excludes inaccurate, interrupted, and expired traces from learned patterns', () => {
    const store = database(); store.updateProfile({ inferFrequentRoutes: true });
    for (const day of [3, 2, 1]) {
      const trip = recordedTrip(day);
      store.put('trip', { ...trip, points: trip.points.map(point => ({ ...point, accuracy: 200 })) });
    }
    expect(frequentRouteProposals(store, NOW)).toEqual([]);
    for (const day of [3, 2, 1]) {
      const trip = recordedTrip(day);
      const points = trip.points.map((point, index) => ({ ...point, timestamp: new Date(Date.parse(point.timestamp) + (index >= 10 ? 120_000 : 0)).toISOString() }));
      store.put('trip', { ...trip, points, endedAt: points.at(-1)!.timestamp });
    }
    expect(frequentRouteProposals(store, NOW)).toEqual([]);
    for (const day of [3, 2, 1]) store.delete('trip', recordedTrip(day).id);
    for (const day of [33, 32, 31]) store.put('trip', recordedTrip(day));
    expect(frequentRouteProposals(store, NOW)).toEqual([]);
  });
  it('separates opposite directions and handles departure times across midnight', () => {
    const store = database(); store.updateProfile({ inferFrequentRoutes: true }); addRepeated(store);
    for (const day of [3, 2, 1]) store.put('trip', recordedTrip(day, 8 * 60 + 30, true));
    const proposals = frequentRouteProposals(store, NOW); expect(proposals).toHaveLength(2); expect(new Set(proposals.map(route => route.id)).size).toBe(2);
    const midnight = database(); midnight.updateProfile({ inferFrequentRoutes: true });
    for (const [index, minutes] of [23 * 60 + 50, 0, 10].entries()) midnight.put('trip', recordedTrip(index + 1, minutes));
    expect(frequentRouteProposals(midnight, NOW)[0].departureTime).toBe('00:00');
  });
  it('alerts on consented learned journeys without inventing a saved commute and stops after opt-out', () => {
    const store = database(); addRepeated(store); const event = store.saveClosure(closure);
    const planner = vi.fn(() => ({ ...emptyPlan, conflicts: [{ closureId: event.id, title: event.title, entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }] }));
    checkEnabledCommutes(store, planner, NOW); expect(planner).not.toHaveBeenCalled();
    store.updateProfile({ inferFrequentRoutes: true }); checkEnabledCommutes(store, planner, NOW); checkEnabledCommutes(store, planner, NOW);
    expect(store.list('alert')).toHaveLength(1);
    expect(store.list('alert')[0]).toMatchObject({ frequentRouteId: frequentRouteProposals(store, NOW)[0].id });
    expect(store.list<Record<string, unknown>>('alert')[0]).not.toHaveProperty('commuteId'); expect(store.list('commute')).toHaveLength(0);
    store.updateProfile({ inferFrequentRoutes: false }); const calls = planner.mock.calls.length;
    store.saveClosure({ ...closure, title: 'Changed' }, event.id, event.revision); checkEnabledCommutes(store, planner, NOW);
    expect(planner.mock.calls).toHaveLength(calls); expect(store.list('alert')).toHaveLength(1);
  });
  it('avoids duplicate alerts only when a saved commute covers direction, time, and weekdays', () => {
    const store = database(); addRepeated(store); store.updateProfile({ inferFrequentRoutes: true });
    const proposal = frequentRouteProposals(store, NOW)[0];
    const commute: Commute = { ...proposal, id: 'explicit-commute', name: 'Office', enabled: true, createdAt: '', updatedAt: '' };
    expect(coveredBySavedCommute(proposal, commute)).toBe(true);
    expect(coveredBySavedCommute(proposal, { ...commute, departureTime: '18:00' })).toBe(false);
    expect(coveredBySavedCommute(proposal, { ...commute, days: [1] })).toBe(false);
    expect(coveredBySavedCommute(proposal, { ...commute, origin: commute.destination, destination: commute.origin })).toBe(false);
    store.put('commute', commute); const event = store.saveClosure(closure);
    const planner = vi.fn(() => ({ ...emptyPlan, conflicts: [{ closureId: event.id, title: event.title, entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }] }));
    checkEnabledCommutes(store, planner, NOW); expect(planner).toHaveBeenCalledTimes(2); expect(store.list('alert')).toHaveLength(1);
    expect(store.list('alert')[0]).toMatchObject({ commuteId: commute.id });
    store.put('commute', { ...commute, departureTime: '18:00' }); checkEnabledCommutes(store, planner, NOW);
    expect(store.list('alert')).toHaveLength(3); // Separate saved departure plus an uncovered learned journey.
  });
  it('does not suppress a learned-route warning merely because a nearby saved journey is clear', () => {
    const store = database(); addRepeated(store); store.updateProfile({ inferFrequentRoutes: true }); const proposal = frequentRouteProposals(store, NOW)[0];
    store.put('commute', { ...proposal, id: 'later-commute', name: 'Later departure', departureTime: '09:00', enabled: true, createdAt: '', updatedAt: '' });
    const event = store.saveClosure(closure);
    const planner = vi.fn((request) => new Date(Date.parse(request.departureAt) + 5 * 3600_000).getUTCHours() === 9 ? emptyPlan : {
      ...emptyPlan, conflicts: [{ closureId: event.id, title: event.title, entryAt: event.startsAt, exitAt: new Date(NOW + 3600_000).toISOString() }] });
    checkEnabledCommutes(store, planner, NOW);
    expect(store.list('alert')).toHaveLength(1); expect(store.list('alert')[0]).toMatchObject({ frequentRouteId: proposal.id });
  });
});
