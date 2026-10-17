import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TransitDataset, TransitNetwork, TransitRideLeg } from '../shared/transit';
import type { Coordinate } from '../shared/types';
import type { TransitController } from '../src/lib/useTransit';
import { transitColor, transitColorScheme, transitRouteColor, TRANSIT_ROUTE_PALETTE, TRANSIT_UNCERTAIN_COLOR } from '../src/lib/transitColors';
import { transitOverlayFeatures } from '../src/lib/transitMap';
import TransitPanel from '../src/components/TransitPanel';

const at = '2026-10-18T08:00:00.000Z';
function network(lines: { id: string; points: Coordinate[] }[]): TransitNetwork {
  return { version: 'color-test', importedAt: at, evaluatedAt: at, eventRevision: 0, disruptionRevision: 0, sources: [], limitations: [], disruptions: [],
    routes: lines.map(line => ({ id: line.id, shortName: line.id, name: line.id, agency: 'Test', color: '#ff0000', sourceId: 'test', coverage: 'stops-and-shape' })),
    stops: lines.flatMap(line => line.points.map((coordinate, index) => ({ id: `${line.id}-${index}`, name: `${line.id} ${index}`, coordinate }))),
    patterns: lines.map(line => ({ id: `${line.id}-out`, routeId: line.id, directionId: '0', headsign: line.id, geometryQuality: 'provided-shape', geometry: { type: 'LineString', coordinates: line.points }, stopIds: line.points.map((_, index) => `${line.id}-${index}`) })),
    statuses: lines.map(line => ({ patternId: `${line.id}-out`, availability: 'available', closureIds: [], disruptionIds: [], closureAssessment: 'provided-shape' })) };
}
const toEntries = (data: TransitNetwork) => [...transitColorScheme(data).colors];
function hue(color: string) {
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255);
  const delta = Math.max(r, g, b) - Math.min(r, g, b);
  return ((Math.max(r, g, b) === r ? (g - b) / delta : Math.max(r, g, b) === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
}

describe('spatial transit route colours', () => {
  it('gives co-located routes distinct colours, including separately named physical platforms', () => {
    const data = network([{ id: 'a', points: [[73, 33.7], [73.02, 33.7]] }, { id: 'b', points: [[73, 33.7003], [73.02, 33.7003]] }, { id: 'c', points: [[73, 33.6997], [73.02, 33.6997]] }]);
    const scheme = transitColorScheme(data);
    expect(new Set(scheme.colors.values()).size).toBe(3);
    expect(scheme.adjacency.get('a')?.has('b')).toBe(true);
    const first = hue(scheme.colors.get('a')!), second = hue(scheme.colors.get('b')!);
    expect(Math.min(Math.abs(first - second), 360 - Math.abs(first - second))).toBeGreaterThan(70);
    // Shared stops alone establish proximity even when no supplied shape exists.
    const stopsOnly = structuredClone(data); stopsOnly.version = 'stops-only';
    stopsOnly.patterns.forEach(pattern => { pattern.geometry.coordinates = []; });
    expect(transitColorScheme(stopsOnly).adjacency.get('a')?.has('b')).toBe(true);
  });

  it('finds a crossing between sparse shape vertices without depending on shared stop IDs', () => {
    const data = network([{ id: 'east-west', points: [[72.98, 33.7], [73.02, 33.7]] }, { id: 'north-south', points: [[73, 33.68], [73, 33.72]] }]);
    expect(transitColorScheme(data).adjacency.get('east-west')?.has('north-south')).toBe(true);
    expect(transitRouteColor(data, 'east-west')).not.toBe(transitRouteColor(data, 'north-south'));
  });

  it('reuses a finite palette honestly at an overcrowded interchange', () => {
    const data = network(Array.from({ length: TRANSIT_ROUTE_PALETTE.length + 2 }, (_, index) => ({ id: `line-${index}`, points: [[73, 33.7], [73.01, 33.7]] })));
    const scheme = transitColorScheme(data);
    expect(scheme.colors.size).toBe(TRANSIT_ROUTE_PALETTE.length + 2);
    expect(new Set(scheme.colors.values()).size).toBe(TRANSIT_ROUTE_PALETTE.length);
    expect([...scheme.colors.values()].every(color => color !== TRANSIT_UNCERTAIN_COLOR)).toBe(true);
  });

  it('never invents adjacency across source gaps or malformed coordinates', () => {
    const data = network([{ id: 'split', points: [[73, 33.7], [73.1, 33.7]] }, { id: 'middle', points: [[73.045, 33.7], [73.055, 33.7]] }]);
    data.patterns[0].geometrySegments = [{ type: 'LineString', coordinates: [[73, 33.7], [73.005, 33.7]] }, { type: 'LineString', coordinates: [[73.095, 33.7], [73.1, 33.7]] }];
    data.patterns[0].breakAfterStopIndexes = [0];
    expect(transitColorScheme(data).adjacency.get('split')?.has('middle')).toBe(false);
    const withoutSegments = structuredClone(data); withoutSegments.version = 'break-index-only'; delete withoutSegments.patterns[0].geometrySegments;
    expect(transitColorScheme(withoutSegments).adjacency.get('split')?.has('middle')).toBe(false);
    withoutSegments.patterns = [...withoutSegments.patterns, { ...withoutSegments.patterns[1], id: 'bad-coordinates', geometry: { type: 'LineString', coordinates: [[NaN, 33.7], [Infinity, 33.7], [73.05, 100]] }, stopIds: [] }];
    expect(() => transitColorScheme(withoutSegments)).not.toThrow();
  });

  it('is deterministic across catalogue ordering, direction selection, status and refresh objects', () => {
    const data = network([{ id: 'a', points: [[73, 33.7], [73.02, 33.7]] }, { id: 'b', points: [[73, 33.7003], [73.02, 33.7003]] }]);
    data.patterns.push({ ...data.patterns[0], id: 'a-return', directionId: '1', stopIds: [...data.patterns[0].stopIds].reverse(), geometry: { type: 'LineString', coordinates: [...data.patterns[0].geometry.coordinates].reverse() } });
    data.statuses.push({ ...data.statuses[0], patternId: 'a-return' });
    const original = transitColorScheme(data), copy = structuredClone(data);
    copy.routes.reverse(); copy.patterns.reverse(); copy.stops.reverse(); copy.evaluatedAt = '2026-10-18T09:00:00Z'; copy.statuses[0].availability = 'uncertain';
    expect(transitColorScheme(copy)).toBe(original);
    expect(toEntries(copy)).toEqual(toEntries(data));
    const otherVersion = { ...copy, version: 'next-version' };
    expect(toEntries(otherVersion)).toEqual(toEntries(data));
    expect(transitRouteColor(copy, 'a', 'uncertain')).toBe(TRANSIT_UNCERTAIN_COLOR);
    expect(transitRouteColor(copy, 'a', 'suspended')).toBe(TRANSIT_UNCERTAIN_COLOR);
    const overlay = transitOverlayFeatures({ network: data, selectedPatternId: 'a-return', journey: null, stale: false });
    expect(new Set(overlay.lines.features.filter(feature => feature.properties?.routeId === 'a').map(feature => feature.properties?.color)).size).toBe(1);
    const moved = structuredClone(data); moved.stops = moved.stops.filter(stop => !stop.id.startsWith('b-')); moved.patterns.find(pattern => pattern.routeId === 'b')!.geometry.coordinates = [[74, 34], [74.02, 34]]; moved.patterns.find(pattern => pattern.routeId === 'b')!.stopIds = [];
    expect(transitColorScheme(moved).adjacency.get('a')?.has('b')).toBe(false);
  });

  it('reserves red families and grey, with readable normal white badge labels', () => {
    for (const color of [...TRANSIT_ROUTE_PALETTE, TRANSIT_UNCERTAIN_COLOR]) {
      if (color !== TRANSIT_UNCERTAIN_COLOR) {
        expect(transitColor(color)).toBe(color);
        expect(hue(color)).toBeGreaterThanOrEqual(45); expect(hue(color)).toBeLessThanOrEqual(315);
      }
      const linear = [1, 3, 5].map(offset => { const value = parseInt(color.slice(offset, offset + 2), 16) / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
      const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
      expect(1.05 / (luminance + .05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses the exact same identity colour in route badges, map lines and ride geometry', () => {
    const data = network([{ id: 'a', points: [[73, 33.7], [73.02, 33.7]] }, { id: 'b', points: [[73, 33.7003], [73.02, 33.7003]] }]);
    const ride: TransitRideLeg = { kind: 'ride', routeId: 'a', patternId: 'a-out', from: data.stops[0], to: data.stops[1], stops: data.stops.slice(0, 2), geometry: data.patterns[0].geometry, geometryQuality: 'provided-shape', distanceMeters: 2000, durationSeconds: null, departureAt: null, arrivalAt: null, availability: 'available' };
    const journey = { id: 'journey', legs: [ride], departureAt: at, arrivalAt: null, durationSeconds: null, distanceMeters: 2000, walkingDistanceMeters: 0, transfers: 0, timing: 'unknown' as const, warnings: [] };
    const transit = { network: data, stale: false, selectedPatternId: null, result: null, journey, networkLoading: false, networkError: '', planError: '', planning: false, origin: null, destination: null, retry: vi.fn(), selectPattern: vi.fn(), selectJourney: vi.fn(), changeEndpoint: vi.fn(), calculate: vi.fn(), reset: vi.fn() } as TransitController;
    const html = renderToStaticMarkup(createElement(TransitPanel, { transit, mode: 'browse', setMode: vi.fn(), onFocus: vi.fn(), canReview: false, at }));
    const color = transitRouteColor(data, 'a');
    expect(html).toContain(`--transit-color:${color}`);
    const overlay = transitOverlayFeatures({ network: data, selectedPatternId: null, journey, stale: false });
    expect(overlay.lines.features.find(feature => feature.properties?.routeId === 'a')?.properties?.color).toBe(color);
    expect(overlay.journey.features[0].properties?.color).toBe(color);
  });

  it('colors all real patterns quickly and reuses the spatial graph during clock/status updates', () => {
    const dataset = JSON.parse(gunzipSync(readFileSync('assets/transit/islamabad.json.gz')).toString()) as TransitDataset;
    const data: TransitNetwork = { ...dataset, evaluatedAt: at, eventRevision: 0, disruptionRevision: 0, disruptions: [], statuses: [] };
    expect(data.patterns.length).toBeGreaterThanOrEqual(67);
    const started = performance.now(), scheme = transitColorScheme(data), cold = performance.now() - started;
    expect(scheme.colors.size).toBe(data.routes.length); expect(cold).toBeLessThan(1500);
    const strongest = [...scheme.adjacency].flatMap(([id, neighbors]) => [...neighbors].filter(([other]) => id < other).map(([other, weight]) => ({ id, other, weight }))).sort((a, b) => b.weight - a.weight).slice(0, 10);
    expect(strongest).toHaveLength(10);
    for (const { id, other } of strongest) expect(scheme.colors.get(id)).not.toBe(scheme.colors.get(other));
    const startedWarm = performance.now();
    for (let tick = 0; tick < 1000; tick++) { const snapshot = { ...data, evaluatedAt: `${tick}`, statuses: [] }; expect(transitColorScheme(snapshot)).toBe(scheme); }
    expect(performance.now() - startedWarm).toBeLessThan(250);
    const next = { ...data, evaluatedAt: 'next' }; expect(transitColorScheme(next)).toBe(scheme);
  });
});
