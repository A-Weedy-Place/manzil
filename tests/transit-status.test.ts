import { afterEach, describe, expect, it } from 'vitest';
import type { TransitDataset, TransitDisruption } from '../shared/transit';
import type { Closure, Drawing } from '../shared/types';
import { drawingToPolygon } from '../server/geometry';
import { Store } from '../server/store';
import { TransitService } from '../server/transit/service';
import { TRANSIT_AT, transitClosure, transitFixture } from './transit-fixture';

const ACTIVE_AT = '2026-10-18T03:25:00Z';
const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

function setup(data = transitFixture()) {
  const store = new Store(':memory:');
  stores.push(store);
  return { store, data, service: new TransitService(store, () => data) };
}

function blockade(overrides: Partial<Closure> = {}): Closure {
  const drawing: Drawing = { kind: 'line', widthMeters: 4, coordinates: [[73.03, 33.6999], [73.03, 33.7001]] };
  return { ...transitClosure(), restrictionType: 'blockade', drawing, geometry: drawingToPolygon(drawing), ...overrides };
}

function notice(overrides: Partial<TransitDisruption> = {}): TransitDisruption {
  return { id: 'notice', revision: 1, routeId: 'r1', title: 'Reviewed bus suspension', description: '', startsAt: TRANSIT_AT, endsAt: '2026-10-18T04:00:00Z', status: 'published', author: { uid: 'reviewer', displayName: 'Reviewer', role: 'verified' }, createdAt: TRANSIT_AT, updatedAt: TRANSIT_AT, ...overrides };
}

function addReturnDirection(data: TransitDataset) {
  const outward = data.patterns[0];
  data.patterns.push({ ...outward, id: 'return', directionId: '1', headsign: 'Alpha', stopIds: [...outward.stopIds].reverse(), geometry: { type: 'LineString', coordinates: [...outward.geometry.coordinates].reverse() } });
}

describe('Local route status from reviewed road and bus restrictions', () => {
  it('marks the complete affected direction uncertain for a canonical drawn blockade while an unaffected corridor stays available', async () => {
    const { store, data, service } = setup();
    data.routes.push({ ...data.routes[0], id: 'unaffected-route' });
    const remoteStops = data.stops.map(stop => ({ ...stop, id: `${stop.id}-remote`, coordinate: [stop.coordinate[0], 33.72] as [number, number] }));
    data.stops.push(...remoteStops);
    data.patterns.push({ ...data.patterns[0], id: 'unaffected-direction', routeId: 'unaffected-route', stopIds: remoteStops.map(stop => stop.id), geometry: { type: 'LineString', coordinates: remoteStops.map(stop => stop.coordinate) } });
    const saved = store.saveClosure(blockade());
    const network = await service.network(ACTIVE_AT);
    expect(network.statuses).toEqual([
      { patternId: 'p1', availability: 'uncertain', closureIds: [saved.id], disruptionIds: [], closureAssessment: 'provided-shape' },
      { patternId: 'unaffected-direction', availability: 'available', closureIds: [], disruptionIds: [], closureAssessment: 'provided-shape' },
    ]);
    expect(network.patterns[0].geometry).toEqual(data.patterns[0].geometry);
    expect((await service.plan({ origin: data.stops[0], destination: data.stops[2], departureAt: TRANSIT_AT })).options).toHaveLength(0);
    // A whole-line grey status is conservative presentation, not an invented
    // suspension of a portion that can be reached without crossing the barrier.
    expect((await service.plan({ origin: data.stops[0], destination: data.stops[1], departureAt: TRANSIT_AT })).options).toHaveLength(1);
  });

  it.each([
    ['pending', { moderation: 'pending' }],
    ['rejected', { moderation: 'rejected' }],
    ['draft', { status: 'draft' }],
    ['cancelled', { status: 'cancelled' }],
  ] as const)('keeps %s road reports out of public bus status and planning', async (_label, patch) => {
    const { store, data, service } = setup();
    const saved = store.saveClosure(blockade(patch));
    expect((await service.network(ACTIVE_AT)).statuses[0]).toMatchObject({ availability: 'available', closureIds: [], disruptionIds: [] });
    const plan = await service.plan({ origin: data.stops[0], destination: data.stops[2], departureAt: TRANSIT_AT });
    expect(plan.options).toHaveLength(1);
    expect(JSON.stringify(plan)).not.toContain(saved.id);
  });

  it('changes grey road status only inside the closure window, including an unknown end time', async () => {
    const { store, service } = setup();
    const saved = store.saveClosure(blockade());
    for (const [at, availability] of [
      ['2026-10-18T03:19:59.999Z', 'available'],
      ['2026-10-18T03:20:00Z', 'uncertain'],
      ['2026-10-18T03:28:59.999Z', 'uncertain'],
      ['2026-10-18T03:29:00Z', 'available'],
    ]) expect((await service.network(at)).statuses[0]).toMatchObject({ availability });
    store.saveClosure({ ...saved, endsAt: null }, saved.id, saved.revision);
    expect((await service.network('2026-11-18T03:00:00Z')).statuses[0]).toMatchObject({ availability: 'uncertain', closureIds: [saved.id] });
  });

  it('does not invent a road intersection across a disconnected source-geometry gap', async () => {
    const { store, data, service } = setup();
    data.patterns[0].geometrySegments = [
      { type: 'LineString', coordinates: [[73, 33.7], [73.02, 33.7]] },
      { type: 'LineString', coordinates: [[73.035, 33.7], [73.04, 33.7]] },
    ];
    data.patterns[0].breakAfterStopIndexes = [1];
    store.saveClosure(blockade());
    expect((await service.network(ACTIVE_AT)).statuses[0]).toMatchObject({ availability: 'available', closureIds: [] });
    expect((await service.plan({ origin: data.stops[0], destination: data.stops[2], departureAt: TRANSIT_AT })).options).toHaveLength(0);
  });

  it('greys an ordered partial suspension only in matching directions while keeping unaffected stops usable', async () => {
    const { store, data, service } = setup();
    addReturnDirection(data);
    store.setMeta('transit:disruptions', { revision: 1, records: [notice({ fromStopId: 'b', toStopId: 'c' })] });
    expect((await service.network(ACTIVE_AT)).statuses).toMatchObject([
      { patternId: 'p1', availability: 'suspended', disruptionIds: ['notice'] },
      { patternId: 'return', availability: 'available', disruptionIds: [] },
    ]);
    expect((await service.plan({ origin: data.stops[0], destination: data.stops[2], departureAt: TRANSIT_AT })).options).toHaveLength(0);
    expect((await service.plan({ origin: data.stops[0], destination: data.stops[1], departureAt: TRANSIT_AT })).options).toHaveLength(1);
  });

  it('respects explicit direction and notice time/cancellation while a whole-route notice covers both directions', async () => {
    const { store, data, service } = setup();
    addReturnDirection(data);
    const active = notice({ directionId: '0' });
    const future = notice({ id: 'future', directionId: '1', startsAt: '2026-10-18T04:00:00Z', endsAt: '2026-10-18T05:00:00Z' });
    const expired = notice({ id: 'expired', directionId: '1', startsAt: '2026-10-18T02:00:00Z', endsAt: '2026-10-18T03:00:00Z' });
    const cancelled = notice({ id: 'cancelled', directionId: '1', status: 'cancelled' });
    store.setMeta('transit:disruptions', { revision: 1, records: [active, future, expired, cancelled] });
    expect((await service.network(ACTIVE_AT)).statuses).toMatchObject([
      { availability: 'suspended', disruptionIds: ['notice'] },
      { availability: 'available', disruptionIds: [] },
    ]);
    expect((await service.network('2026-10-18T04:00:00Z')).statuses).toMatchObject([
      { availability: 'available', disruptionIds: [] },
      { availability: 'suspended', disruptionIds: ['future'] },
    ]);
    store.setMeta('transit:disruptions', { revision: 2, records: [notice()] });
    expect((await service.network(ACTIVE_AT)).statuses.every(status => status.availability === 'suspended' && status.disruptionIds[0] === 'notice')).toBe(true);
  });

  it('retains road evidence but distinguishes an explicit suspension from an uncertain road overlap', async () => {
    const { store, service } = setup();
    const saved = store.saveClosure(blockade());
    store.setMeta('transit:disruptions', { revision: 1, records: [notice()] });
    expect((await service.network(ACTIVE_AT)).statuses[0]).toMatchObject({ availability: 'suspended', closureIds: [saved.id], disruptionIds: ['notice'] });
  });
});
