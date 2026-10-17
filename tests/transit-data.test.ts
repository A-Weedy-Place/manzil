import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { TransitDataset } from '../shared/transit';

const bytes = gunzipSync(readFileSync(new URL('../assets/transit/islamabad.json.gz', import.meta.url)));
const data = JSON.parse(bytes.toString('utf8')) as TransitDataset;
const provenance = JSON.parse(readFileSync(new URL('../assets/transit/provenance.json', import.meta.url), 'utf8'));
const stops = new Map(data.stops.map(stop => [stop.id, stop]));
const patterns = new Map(data.patterns.map(pattern => [pattern.id, pattern]));
describe('actual attributed twin-city transit snapshot', () => {
  it('retains the verified feed checksum, source date and usable public network, not fictional fixtures', () => {
    expect(provenance.gtfsSha256).toBe('a17c931a9d85d4e6919a6c1aa07d34b3653df4fe76e440341b6123fa716af514');
    expect(provenance.catalogueSha256).toBe('8fe797dd1bc770f0f7ca6284a94af5ab685d7c7f92b8cc529ab6f0516c9b90cd');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(provenance.normalizedSha256);
    expect(data.routes.length).toBeGreaterThanOrEqual(32); expect(data.patterns.length).toBeGreaterThanOrEqual(63);
    expect(data.stops.length).toBeGreaterThanOrEqual(1193); expect(data.trips).toHaveLength(2064);
    expect(data.sources.find(source => source.url === 'https://pakbus.app/data')?.license).toMatch(/Non-commercial/);
    for (const code of ['FR-11', 'FR-13', 'FRB-1', 'FRG-1', 'EV05101', 'EV05110']) expect(data.routes.some(route => route.shortName === code)).toBe(true);
  });
  it('keeps all coordinates in the twin-city region and all line colors distinct from closure red', () => {
    for (const stop of data.stops) {
      expect(stop.coordinate[0]).toBeGreaterThan(72.2); expect(stop.coordinate[0]).toBeLessThan(73.8);
      expect(stop.coordinate[1]).toBeGreaterThan(33.2); expect(stop.coordinate[1]).toBeLessThan(34.2);
    }
    for (const route of data.routes) {
      expect(route.color).toMatch(/^#[\da-f]{6}$/i);
      const [red, green, blue] = [1, 3, 5].map(offset => parseInt(route.color.slice(offset, offset + 2), 16));
      expect(red > blue && red > green * 1.25).toBe(false);
      expect(data.sources.some(source => source.id === route.sourceId)).toBe(true);
    }
  });
  it('preserves the known EV2 missing Rahimabad coordinate as a non-routable break', () => {
    const pattern = patterns.get('eqyn8')!;
    expect(pattern.unplacedStops).toContain('Rahimabad'); expect(pattern.stopIds).not.toContain('c4t4y');
    expect(stops.has('c4t4y')).toBe(false); expect(pattern.breakAfterStopIndexes).toEqual([8]);
    expect(pattern.geometrySegments).toHaveLength(2);
    const sections = pattern.geometrySegments!;
    expect(sections[0].coordinates.at(-1)).toEqual(stops.get(pattern.stopIds[8])?.coordinate);
    expect(sections[1].coordinates[0]).toEqual(stops.get(pattern.stopIds[9])?.coordinate);
  });
  it('retains restricted-access metadata and real GTFS timing/pickup/dropoff qualification', () => {
    expect(patterns.get('z3t6g')?.restrictedAccess).toBe(true);
    const calendars = new Set(data.calendars.map(calendar => calendar.id));
    let estimates = 0;
    for (const trip of data.trips) {
      const pattern = patterns.get(trip.patternId)!;
      expect(pattern).toBeTruthy(); expect(calendars.has(trip.serviceId)).toBe(true);
      expect(trip.times).toHaveLength(pattern.stopIds.length);
      expect(trip.pickupAllowed).toHaveLength(pattern.stopIds.length); expect(trip.dropOffAllowed).toHaveLength(pattern.stopIds.length);
      expect(trip.timepoint).toHaveLength(pattern.stopIds.length); expect(trip.timepoint?.[0]).toBe(true);
      expect(trip.dropOffAllowed?.[0]).toBe(false); expect(trip.pickupAllowed?.at(-1)).toBe(false);
      for (let i = 0; i < trip.times.length; i++) {
        expect(trip.times[i][1]).toBeGreaterThanOrEqual(trip.times[i][0]);
        if (i) expect(trip.times[i][0]).toBeGreaterThanOrEqual(trip.times[i - 1][1]);
        if (trip.timepoint?.[i] === false) estimates++;
      }
    }
    expect(estimates).toBe(43101);
  });
  it('distinguishes mapped Orange corridors from supplied timetables and unmapped FR-12 references', () => {
    const orange = data.patterns.filter(pattern => pattern.routeId.startsWith('osm-orange-'));
    expect(orange).toHaveLength(4);
    for (const pattern of orange) {
      expect(pattern.geometryQuality).toBe('mapped-corridor');
      expect(pattern.stopDistancesMeters).toHaveLength(pattern.stopIds.length);
      expect(pattern.stopDistancesMeters!.every((distance, index, all) => !index || distance > all[index - 1])).toBe(true);
      expect(data.trips.some(trip => trip.patternId === pattern.id)).toBe(false);
    }
    const reference = data.routes.find(route => route.shortName === 'FR-12')!;
    expect(reference.coverage).toBe('catalogue-only'); expect(reference.unplacedStopNames).toHaveLength(25);
    expect(data.patterns.some(pattern => pattern.routeId === reference.id)).toBe(false);
    expect(provenance.combinedRouteCount).toBe(data.routes.length);
    expect(provenance.combinedStopCount).toBe(data.stops.length);
  });
});
