import { describe, expect, it } from 'vitest';
import buffer from '@turf/buffer';
import { point } from '@turf/helpers';
import booleanIntersects from '@turf/boolean-intersects';
import type { Closure, Coordinate } from '../shared/types';
import { graphStatus, planJourney } from '../server/routing/index';
import { distanceMeters } from '../server/routing/graph';

function sharedLength(a: number[][], b: number[][]) {
  const key = (x: number[], y: number[]) => [JSON.stringify(x), JSON.stringify(y)].sort().join('|');
  const segments = new Set(b.slice(1).map((coordinate, i) => key(b[i], coordinate)));
  return a.slice(1).reduce((sum, coordinate, i) => sum + (segments.has(key(a[i], coordinate)) ? distanceMeters(a[i] as Coordinate, coordinate as Coordinate) : 0), 0);
}

describe('bundled real Islamabad OSM graph', () => {
  it('loads real attributed data and finds a connected closure detour for the demo corridor', async () => {
    const status = graphStatus();
    expect(status.ready).toBe(true);
    expect(status.nodeCount).toBeGreaterThan(1000);
    expect(status.source).toContain('OpenStreetMap');
    const request = { origin: { name: 'Faisal Mosque approach', coordinate: [73.0365451, 33.7283199] as Coordinate }, destination: { name: 'Centaurus vicinity', coordinate: [73.0489072, 33.7078995] as Coordinate }, departureAt: '2027-01-15T11:00:00.000Z' };
    const direct = await planJourney(request, [], 0);
    expect(direct.baseline).not.toBeNull();
    const coordinates = direct.baseline!.geometry.coordinates;
    const midpoint = coordinates[Math.floor(coordinates.length / 2)];
    const geometry = buffer(point(midpoint), 25, { units: 'meters' })!.geometry;
    if (geometry.type !== 'Polygon') throw new Error('Expected one point buffer.');
    const closure: Closure = { id: 'test-only-road-event', title: 'Synthetic test closure on real roads', description: 'Unit test, never published to the app', reason: 'construction', geometry, startsAt: '2027-01-15T10:30:00Z', endsAt: '2027-01-15T11:30:00Z', status: 'published', revision: 1, createdAt: request.departureAt, updatedAt: request.departureAt };
    const rerouted = await planJourney(request, [closure], 1);
    expect(rerouted.conflicts).toHaveLength(1);
    expect(rerouted.options[0]?.kind).toBe('detour');
    expect(rerouted.options[0].distanceMeters).toBeGreaterThan(direct.baseline!.distanceMeters);
    expect(rerouted.options[0].geometry.coordinates[0]).toEqual(direct.baseline!.snappedOrigin);
    expect(rerouted.options[0].geometry.coordinates.at(-1)).toEqual(direct.baseline!.snappedDestination);
    const sameTime = rerouted.options.filter((option) => ['direct', 'detour', 'alternative'].includes(option.kind));
    expect(sameTime.length).toBeGreaterThanOrEqual(2);
    expect(sameTime.length).toBeLessThanOrEqual(3);
    for (const option of sameTime) {
      expect(option.departureAt).toBe(request.departureAt);
      expect(booleanIntersects(option.geometry, closure.geometry)).toBe(false);
      expect(option.steps.reduce((sum, step) => sum + step.durationSeconds, 0)).toBeCloseTo(option.durationSeconds, 5);
    }
    for (let i = 0; i < sameTime.length; i++) for (let j = i + 1; j < sameTime.length; j++) expect(sharedLength(sameTime[i].geometry.coordinates, sameTime[j].geometry.coordinates)).toBeLessThanOrEqual(Math.min(sameTime[i].distanceMeters, sameTime[j].distanceMeters) * .82 + 1);
  });
  it('returns three genuinely different choices at one departure on the main preset corridor', async () => {
    const request = { origin: { name: 'Faisal Mosque Road approach', coordinate: [73.0376503, 33.7314163] as Coordinate }, destination: { name: 'PIMS road approach', coordinate: [73.052076, 33.7060737] as Coordinate }, departureAt: '2027-01-15T11:00:00.000Z', compareDepartures: false };
    const result = await planJourney(request, [], 0);
    expect(result.options).toHaveLength(3);
    expect(result.options.map((option) => option.kind)).toEqual(['direct', 'alternative', 'alternative']);
    for (const option of result.options) expect(option.departureAt).toBe(request.departureAt);
    expect(new Set(result.options.map((option) => JSON.stringify(option.geometry))).size).toBe(3);
    for (let i = 0; i < result.options.length; i++) for (let j = i + 1; j < result.options.length; j++) expect(sharedLength(result.options[i].geometry.coordinates, result.options[j].geometry.coordinates)).toBeLessThanOrEqual(Math.min(result.options[i].distanceMeters, result.options[j].distanceMeters) * .82 + 1);
  });
});
