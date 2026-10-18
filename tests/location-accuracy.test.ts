import { describe, expect, it } from 'vitest';
import { locationAccuracyArea } from '../src/lib/locationAccuracy';
import { meters } from '../src/lib/navigation';
import type { Coordinate } from '../shared/types';

describe('reported location uncertainty', () => {
  it('draws the reported 500 metre radius geodesically around the raw longitude/latitude coordinate', () => {
    const center: Coordinate = [73.0553, 33.6277];
    const feature = locationAccuracyArea(center, 500).features[0];
    expect(feature.geometry.type).toBe('Polygon');
    expect(feature.properties).toEqual({ accuracyMeters: 500 });
    const ring = feature.geometry.coordinates[0];
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring.at(-1));
    for (const vertex of ring) expect(meters(center, vertex as Coordinate)).toBeCloseTo(500, 5);
    expect(ring[0][0]).toBeCloseTo(center[0], 8);
    expect(ring[0][1]).toBeGreaterThan(center[1]);
  });

  it('does not mutate the reported location or any planner endpoint', () => {
    const start: Coordinate = [73.03, 33.64], destination: Coordinate = [73.05, 33.66];
    const rawLocation = Object.freeze([73.0421, 33.6517]) as unknown as Coordinate;
    const before = structuredClone({ start, destination, rawLocation });
    const coarse = locationAccuracyArea(rawLocation, 500), precise = locationAccuracyArea(rawLocation, 8);
    expect({ start, destination, rawLocation }).toEqual(before);
    expect(meters(rawLocation, precise.features[0].geometry.coordinates[0][0] as Coordinate)).toBeCloseTo(8, 5);
    expect(coarse.features[0].geometry.coordinates).not.toEqual(precise.features[0].geometry.coordinates);
  });

  it.each([undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 100001])('keeps an unavailable radius explicit instead of inventing a precise circle: %s', accuracy => {
    expect(locationAccuracyArea([73.0553, 33.6277], accuracy)).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it.each([undefined, null, [], [73], [73, 33, 1], [181, 33], [73, 91], [Number.NaN, 33], [73, Number.NEGATIVE_INFINITY]])('returns no uncertainty geometry for malformed/missing coordinates: %s', center => {
    expect(locationAccuracyArea(center as Coordinate | null | undefined, 500)).toEqual({ type: 'FeatureCollection', features: [] });
  });
});
