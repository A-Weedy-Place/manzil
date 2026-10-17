import { expect, it } from 'vitest';
import type { TransitJourney, TransitNetwork, TransitRideLeg } from '../shared/transit';
import { transitColor, transitOverlayFeatures, transitRouteLabel, transitSuspensionScope, TRANSIT_FALLBACK_COLOR, TRANSIT_UNCERTAIN_COLOR } from '../src/lib/transitMap';

function network(): TransitNetwork {
  return { version: 'test', importedAt: null, evaluatedAt: '2026-10-18T09:00:00Z', eventRevision: 1, disruptionRevision: 0, sources: [], limitations: [], disruptions: [],
    routes: [{ id: 'bus', shortName: 'EV05101', name: 'Example', agency: 'PMA', color: '#24a67a', coverage: 'stops-and-shape', sourceId: 'test' }],
    stops: [{ id: 'a', name: 'First', coordinate: [73, 33.7] }, { id: 'b', name: 'Second', coordinate: [73.01, 33.71] }],
    patterns: [{ id: 'outbound', routeId: 'bus', directionId: '0', headsign: 'Second', stopIds: ['a', 'b'], geometryQuality: 'provided-shape', geometry: { type: 'LineString', coordinates: [[73, 33.7], [73.01, 33.71]] } }],
    statuses: [{ patternId: 'outbound', availability: 'available', closureIds: [], disruptionIds: [], closureAssessment: 'provided-shape' }] };
}
it('reserves red and orange-red shades even if a publisher sends a red route color', () => {
  for (const color of ['#ff0000', '#ed2332', '#ef7922', '#ff2280', 'red', '#fff']) expect(transitColor(color)).toBe(TRANSIT_FALLBACK_COLOR);
  for (const color of ['#276edb', '#18a278', '#a63bc7', '#e15bd4']) expect(transitColor(color)).toBe(color);
});
it('shortens only recognised PMA display codes and retains other publisher names', () => {
  expect(transitRouteLabel('EV05101')).toBe('EV-1'); expect(transitRouteLabel('EV05110')).toBe('EV-10');
  expect(transitRouteLabel('EV0511A')).toBe('EV-1A'); expect(transitRouteLabel('FR-12')).toBe('FR-12');
});
it('distinguishes section-only suspensions from full-direction notices while retaining conservative grey geometry', () => {
  const data = network();
  expect(transitSuspensionScope(data, ['outbound'])).toBeNull();
  const notice = { id: 'section', revision: 1, routeId: 'bus', title: 'Section stopped', description: '', startsAt: data.evaluatedAt, endsAt: '2026-10-18T12:00:00Z', status: 'published' as const, author: { uid: 'reviewer', displayName: 'Reviewer', role: 'verified' as const }, createdAt: data.evaluatedAt, updatedAt: data.evaluatedAt, fromStopId: 'a', toStopId: 'b' };
  data.disruptions = [notice]; data.statuses[0] = { ...data.statuses[0], availability: 'suspended', disruptionIds: ['section'] };
  expect(transitSuspensionScope(data, ['outbound'])).toBe('partial');
  expect(transitOverlayFeatures({ network: data, selectedPatternId: 'outbound', journey: null, stale: false }).lines.features[0].properties?.color).toBe(TRANSIT_UNCERTAIN_COLOR);
  data.disruptions.push({ ...notice, id: 'whole-direction', fromStopId: undefined, toStopId: undefined, directionId: '0' }); data.statuses[0].disruptionIds.push('whole-direction');
  expect(transitSuspensionScope(data, ['outbound'])).toBe('full');
});
it('preserves explicit geometry gaps instead of joining a disconnected source route', () => {
  const data = network(); data.patterns[0].geometrySegments = [{ type: 'LineString', coordinates: [[73, 33.7], [73.001, 33.7]] }, { type: 'LineString', coordinates: [[73.009, 33.71], [73.01, 33.71]] }];
  data.patterns[0].geometryQuality = 'stops-only';
  const overlay = transitOverlayFeatures({ network: data, selectedPatternId: 'outbound', journey: null, stale: false });
  expect(overlay.lines.features).toHaveLength(2);
  expect(overlay.lines.features.map(feature => feature.geometry)).toEqual(data.patterns[0].geometrySegments);
  expect(overlay.lines.features.every(feature => feature.properties?.schematic === true)).toBe(true);
  expect(overlay.stops.features.every(feature => feature.properties?.selected === true)).toBe(true);
});
it('keeps ridden intermediate stops visible without a selected pattern and preserves schematic journey provenance', () => {
  const data = network();
  data.stops.splice(1, 0, { id: 'middle', name: 'Intermediate stop', coordinate: [73.005, 33.705] });
  data.patterns[0].stopIds = data.stops.map(stop => stop.id); data.patterns[0].geometry = { type: 'LineString', coordinates: data.stops.map(stop => stop.coordinate) };
  const ride: TransitRideLeg = { kind: 'ride', routeId: 'bus', patternId: 'outbound', from: data.stops[0], to: data.stops[2], stops: data.stops, geometry: data.patterns[0].geometry, distanceMeters: 1800, durationSeconds: null, departureAt: null, arrivalAt: null, availability: 'available', geometryQuality: 'stops-only' };
  const journey: TransitJourney = { id: 'journey', legs: [ride], departureAt: data.evaluatedAt, arrivalAt: null, durationSeconds: null, walkingDistanceMeters: 0, distanceMeters: 1800, transfers: 0, timing: 'unknown', warnings: [] };
  const state = { network: data, selectedPatternId: null, journey, stale: false };
  const overlay = transitOverlayFeatures(state);
  expect(overlay.stops.features.map(feature => [feature.properties?.stopId, feature.properties?.selected])).toEqual([['a', true], ['middle', true], ['b', true]]);
  expect(overlay.journey.features[0].properties?.schematic).toBe(true);
  ride.geometryQuality = 'provided-shape'; expect(transitOverlayFeatures(state).journey.features[0].properties?.schematic).toBe(false);
  const stale = transitOverlayFeatures({ ...state, stale: true });
  expect(stale.stops.features.every(feature => feature.properties?.selected === false)).toBe(true); expect(stale.journey.features).toEqual([]);
});
it('greys suspended/uncertain and stale networks, and removes stale journey guidance', () => {
  const data = network(); data.statuses[0].availability = 'suspended';
  expect(transitOverlayFeatures({ network: data, selectedPatternId: null, journey: null, stale: false }).lines.features[0].properties?.color).toBe(TRANSIT_UNCERTAIN_COLOR);
  data.statuses[0].availability = 'available';
  const overlay = transitOverlayFeatures({ network: data, selectedPatternId: null, stale: true, journey: { id: 'old', legs: [{ kind: 'walk', from: { name: 'A', coordinate: [73, 33.7] }, to: { name: 'B', coordinate: [73.01, 33.71] }, geometry: data.patterns[0].geometry, distanceMeters: 100, durationSeconds: 60, departureAt: null, arrivalAt: null, estimated: true }], departureAt: data.evaluatedAt, arrivalAt: null, durationSeconds: null, walkingDistanceMeters: 100, distanceMeters: 100, transfers: 0, timing: 'unknown', warnings: [] } });
  expect(overlay.lines.features[0].properties?.color).toBe(TRANSIT_UNCERTAIN_COLOR); expect(overlay.journey.features).toEqual([]);
  expect(transitOverlayFeatures(null).lines.features).toEqual([]);
});
