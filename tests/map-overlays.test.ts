import { describe, expect, it } from 'vitest';
import type { Closure } from '../shared/types';
import { activeClosurePolygons, closureRoadKey, routeMatchesMapSnapshot, visibleClosureRoads, type ClosureRoads } from '../src/lib/mapOverlays';

const closure: Closure = {
  id: 'road', title: 'Road closed', description: '', reason: 'other', status: 'published', revision: 1,
  startsAt: '2026-10-15T10:00:00Z', endsAt: '2026-10-15T11:00:00Z', createdAt: '', updatedAt: '',
  geometry: { type: 'Polygon', coordinates: [[[73, 33.7], [73.001, 33.7], [73.001, 33.701], [73, 33.7]]] },
};
const roads: ClosureRoads = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[73, 33.7], [73.001, 33.7]] }, properties: { closureId: 'road', title: 'Road closed' } }] };

describe('map closure snapshots', () => {
  it('shows planner routes only at their exact map instant, while retaining an in-progress guide', () => {
    expect(routeMatchesMapSnapshot(closure.startsAt, closure.startsAt)).toBe(true);
    expect(routeMatchesMapSnapshot(closure.startsAt, '2026-10-15T10:00:01Z')).toBe(false);
    expect(routeMatchesMapSnapshot(closure.startsAt, '2026-10-15T10:10:00Z', true)).toBe(true);
    expect(routeMatchesMapSnapshot('invalid', closure.startsAt, true)).toBe(false);
    expect(routeMatchesMapSnapshot(closure.startsAt, 'invalid', true)).toBe(false);
  });
  it('paints only active published closures, including start but excluding end', () => {
    const closures = [closure, { ...closure, id: 'draft', status: 'draft' as const }, { ...closure, id: 'cancelled', status: 'cancelled' as const }];
    expect(activeClosurePolygons(closures, '2026-10-15T09:59:59Z', null).features).toHaveLength(0);
    expect(activeClosurePolygons(closures, closure.startsAt, 'road').features).toHaveLength(1);
    expect(activeClosurePolygons(closures, closure.startsAt, 'road').features[0].properties?.selected).toBe(true);
    expect(activeClosurePolygons(closures, closure.endsAt!, 'road').features).toHaveLength(0);
  });

  it('keeps unknown-end restrictions active until cancellation', () => {
    expect(activeClosurePolygons([{ ...closure, endsAt: null }], '2026-10-16T11:00:00Z', null).features).toHaveLength(1);
  });

  it('reuses unchanged active road geometry across time ticks, but never across active-set or revision changes', () => {
    const key = closureRoadKey([closure], closure.startsAt), response = { key, data: roads };
    expect(visibleClosureRoads(response, key, [closure], closure.startsAt).features).toHaveLength(1);
    const nextTime = '2026-10-15T10:01:00Z';
    expect(closureRoadKey([closure], nextTime)).toBe(key);
    expect(visibleClosureRoads(response, closureRoadKey([closure], nextTime), [closure], nextTime).features).toHaveLength(1);
    expect(visibleClosureRoads(response, closureRoadKey([closure], '2026-10-15T09:59:59Z'), [closure], '2026-10-15T09:59:59Z').features).toHaveLength(0);
    expect(visibleClosureRoads(response, closureRoadKey([{ ...closure, revision: 2 }], closure.startsAt), [closure], closure.startsAt).features).toHaveLength(0);
    expect(visibleClosureRoads(response, key, [closure], closure.endsAt!).features).toHaveLength(0);
  });

  it('does not refetch because a closure array was reordered or a draft changed', () => {
    const other = { ...closure, id: 'other' }, draft = { ...closure, id: 'draft', status: 'draft' as const };
    expect(closureRoadKey([closure, other], closure.startsAt)).toBe(closureRoadKey([other, closure, draft], closure.startsAt));
    const future = { ...closure, id: 'future', startsAt: '2026-10-16T10:00:00Z', endsAt: null };
    expect(closureRoadKey([closure], closure.startsAt)).toBe(closureRoadKey([closure, future], closure.startsAt));
    expect(closureRoadKey([closure, future], future.startsAt)).not.toBe(closureRoadKey([closure], closure.startsAt));
  });
});
