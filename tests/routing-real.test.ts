import { describe, expect, it } from 'vitest';
import buffer from '@turf/buffer';
import { point } from '@turf/helpers';
import type { Closure, Coordinate } from '../shared/types';
import { graphStatus, planJourney } from '../server/routing/index';

describe('bundled real Islamabad OSM graph', () => {
  it('loads real attributed data and finds a connected closure detour for the demo corridor', () => {
    const status = graphStatus();
    expect(status.ready).toBe(true);
    expect(status.nodeCount).toBeGreaterThan(1000);
    expect(status.source).toContain('OpenStreetMap');
    const request = { origin: { name: 'Faisal Mosque approach', coordinate: [73.0365451, 33.7283199] as Coordinate }, destination: { name: 'Centaurus vicinity', coordinate: [73.0489072, 33.7078995] as Coordinate }, departureAt: '2027-01-15T11:00:00.000Z' };
    const direct = planJourney(request, [], 0);
    expect(direct.baseline).not.toBeNull();
    const coordinates = direct.baseline!.geometry.coordinates;
    const midpoint = coordinates[Math.floor(coordinates.length / 2)];
    const geometry = buffer(point(midpoint), 25, { units: 'meters' })!.geometry;
    if (geometry.type !== 'Polygon') throw new Error('Expected one point buffer.');
    const closure: Closure = { id: 'test-only-road-event', title: 'Synthetic test closure on real roads', description: 'Unit test, never published to the app', reason: 'construction', geometry, startsAt: '2027-01-15T10:30:00Z', endsAt: '2027-01-15T11:30:00Z', status: 'published', revision: 1, createdAt: request.departureAt, updatedAt: request.departureAt };
    const rerouted = planJourney(request, [closure], 1);
    expect(rerouted.conflicts).toHaveLength(1);
    expect(rerouted.options[0]?.kind).toBe('detour');
    expect(rerouted.options[0].distanceMeters).toBeGreaterThan(direct.baseline!.distanceMeters);
    expect(rerouted.options[0].geometry.coordinates[0]).toEqual(direct.baseline!.snappedOrigin);
    expect(rerouted.options[0].geometry.coordinates.at(-1)).toEqual(direct.baseline!.snappedDestination);
  });
});
