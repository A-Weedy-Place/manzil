import type { FeatureCollection, Feature, Geometry } from 'geojson';
import type { TransitJourney, TransitNetwork, TransitPattern } from '../../shared/transit';
import type { Coordinate } from '../../shared/types';

export interface TransitMapState {
  network: TransitNetwork;
  selectedPatternId: string | null;
  journey: TransitJourney | null;
  stale: boolean;
}
export const TRANSIT_FALLBACK_COLOR = '#376edb';
export const TRANSIT_UNCERTAIN_COLOR = '#8a949e';
/** Keep publisher identifiers intact in data; shorten only their UI badges. */
export function transitRouteLabel(shortName: string): string {
  const match = shortName.match(/^EV051(\d+[A-Z]?)$/i);
  return match ? `EV-${match[1].replace(/^0+(?=\d)/, '')}` : shortName;
}

/** Network colouring is conservative for an affected pattern; its label must
 * still distinguish a stopped section from an entirely suspended direction. */
export function transitSuspensionScope(network: TransitNetwork, patternIds: string[]): 'partial' | 'full' | null {
  const selected = new Set(patternIds);
  const ids = new Set(network.statuses.filter(status => selected.has(status.patternId)).flatMap(status => status.disruptionIds));
  if (!ids.size) return null;
  const notices = new Map(network.disruptions.map(notice => [notice.id, notice]));
  return [...ids].every(id => { const notice = notices.get(id); return !!notice?.fromStopId && !!notice.toStopId; }) ? 'partial' : 'full';
}

/** Reserve red, orange-red and pink-red hues for road restrictions. */
export function transitColor(value?: string): string {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return TRANSIT_FALLBACK_COLOR;
  const [r, g, b] = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (delta < .12) return TRANSIT_FALLBACK_COLOR;
  const hue = ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
  return hue < 45 || hue > 315 ? TRANSIT_FALLBACK_COLOR : value;
}
function collection(features: Feature<Geometry>[]): FeatureCollection { return { type: 'FeatureCollection', features }; }
export function transitPatternCoordinates(pattern: TransitPattern): Coordinate[] {
  return (pattern.geometrySegments ?? [pattern.geometry]).flatMap(segment => segment.coordinates).filter(point => point.length >= 2 && point.every(Number.isFinite)).map(point => [point[0], point[1]]);
}
export function transitOverlayFeatures(state?: TransitMapState | null): { lines: FeatureCollection; stops: FeatureCollection; journey: FeatureCollection } {
  if (!state) return { lines: collection([]), stops: collection([]), journey: collection([]) };
  const { network, selectedPatternId, stale } = state;
  const routes = new Map(network.routes.map(route => [route.id, route]));
  const statuses = new Map(network.statuses.map(status => [status.patternId, status]));
  const patterns = new Map(network.patterns.map(pattern => [pattern.id, pattern]));
  const visibleStops = new Set(network.patterns.flatMap(pattern => pattern.stopIds));
  const journeyStops = stale ? [] : (state.journey?.legs ?? []).flatMap(leg => leg.kind === 'ride' ? [leg.from.id, ...leg.stops.map(stop => stop.id), leg.to.id] : []);
  const selectedStops = new Set([...(patterns.get(selectedPatternId ?? '')?.stopIds ?? []), ...journeyStops]);
  const lines = network.patterns.flatMap(pattern => {
    const status = statuses.get(pattern.id), selected = pattern.id === selectedPatternId;
    const availability = stale ? 'uncertain' : status?.availability ?? 'uncertain';
    return (pattern.geometrySegments ?? [pattern.geometry]).filter(segment => segment.coordinates.length > 1).map(geometry => ({ type: 'Feature' as const, geometry, properties: { patternId: pattern.id, routeId: pattern.routeId, selected, order: selected ? 1 : 0, schematic: pattern.geometryQuality === 'stops-only', color: availability === 'available' ? transitColor(routes.get(pattern.routeId)?.color) : TRANSIT_UNCERTAIN_COLOR, availability } }));
  });
  const stops = network.stops.filter(stop => visibleStops.has(stop.id)).map(stop => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: stop.coordinate }, properties: { stopId: stop.id, name: stop.name, selected: selectedStops.has(stop.id) } }));
  const journey = stale ? [] : (state.journey?.legs ?? []).filter(leg => leg.geometry.coordinates.length > 1).map((leg, index) => ({ type: 'Feature' as const, geometry: leg.geometry, properties: { index, kind: leg.kind, schematic: leg.kind === 'ride' && leg.geometryQuality === 'stops-only', color: leg.kind === 'ride' ? leg.availability === 'available' ? transitColor(routes.get(leg.routeId)?.color) : TRANSIT_UNCERTAIN_COLOR : '#526a7f' } }));
  return { lines: collection(lines), stops: collection(stops), journey: collection(journey) };
}
