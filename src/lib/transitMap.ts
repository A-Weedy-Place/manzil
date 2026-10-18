import type { FeatureCollection, Feature, Geometry } from 'geojson';
import type { TransitJourney, TransitNetwork, TransitPattern } from '../../shared/transit';
import type { Coordinate } from '../../shared/types';
import { transitColorScheme, TRANSIT_FALLBACK_COLOR, TRANSIT_UNCERTAIN_COLOR } from './transitColors';
export { transitColor, TRANSIT_FALLBACK_COLOR, TRANSIT_UNCERTAIN_COLOR } from './transitColors';
/** Muted context is a display choice, independent of service availability. */
export const TRANSIT_CONTEXT_COLOR = '#8c979d';

export interface TransitMapState {
  network: TransitNetwork;
  selectedPatternId: string | null;
  journey: TransitJourney | null;
  stale: boolean;
}
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

function collection(features: Feature<Geometry>[]): FeatureCollection { return { type: 'FeatureCollection', features }; }
export function transitPatternCoordinates(pattern: TransitPattern): Coordinate[] {
  return (pattern.geometrySegments ?? [pattern.geometry]).flatMap(segment => segment.coordinates).filter(point => point.length >= 2 && point.every(Number.isFinite)).map(point => [point[0], point[1]]);
}
export function transitOverlayFeatures(state?: TransitMapState | null): { lines: FeatureCollection; stops: FeatureCollection; journey: FeatureCollection } {
  if (!state) return { lines: collection([]), stops: collection([]), journey: collection([]) };
  const { network, selectedPatternId, stale } = state;
  const colors = transitColorScheme(network).colors;
  const statuses = new Map(network.statuses.map(status => [status.patternId, status]));
  const patterns = new Map(network.patterns.map(pattern => [pattern.id, pattern]));
  const visibleStops = new Set(network.patterns.flatMap(pattern => pattern.stopIds));
  const activeJourney = stale ? null : state.journey;
  const journeyPatterns = new Set((activeJourney?.legs ?? []).flatMap(leg => leg.kind === 'ride' ? [leg.patternId] : []));
  const journeyStops = (activeJourney?.legs ?? []).flatMap(leg => leg.kind === 'ride' ? [leg.from.id, ...leg.stops.map(stop => stop.id), leg.to.id] : []);
  // A previously browsed line must not leave all its stops highlighted after
  // choosing a journey. Emphasize only stops on the actual ridden intervals.
  const selectedStops = new Set(activeJourney ? journeyStops : patterns.get(selectedPatternId ?? '')?.stopIds ?? []);
  const lines = network.patterns.flatMap(pattern => {
    // Stop locations alone do not establish a road alignment. Keep their dots,
    // but never turn the old schematic chords into purported solid bus routes.
    if (pattern.geometryQuality === 'stops-only') return [];
    const status = statuses.get(pattern.id), selected = !activeJourney && pattern.id === selectedPatternId;
    const focused = !!activeJourney && journeyPatterns.has(pattern.id), muted = !!activeJourney && !focused;
    const availability = stale ? 'uncertain' : status?.availability ?? 'uncertain';
    return (pattern.geometrySegments ?? [pattern.geometry]).filter(segment => segment.coordinates.length > 1).map(geometry => ({ type: 'Feature' as const, geometry, properties: { patternId: pattern.id, routeId: pattern.routeId, selected, focused, muted, order: selected ? 2 : focused ? 1 : 0, schematic: pattern.geometryQuality === 'stops-only', color: muted ? TRANSIT_CONTEXT_COLOR : availability === 'available' ? colors.get(pattern.routeId) ?? TRANSIT_FALLBACK_COLOR : TRANSIT_UNCERTAIN_COLOR, availability } }));
  });
  const stops = network.stops.filter(stop => visibleStops.has(stop.id)).map(stop => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: stop.coordinate }, properties: { stopId: stop.id, name: stop.name, selected: selectedStops.has(stop.id), muted: !!activeJourney && !selectedStops.has(stop.id) } }));
  const journey = stale ? [] : (state.journey?.legs ?? []).filter(leg => leg.geometry.coordinates.length > 1 && (leg.kind !== 'ride' || leg.geometryQuality !== 'stops-only')).map((leg, index) => ({ type: 'Feature' as const, geometry: leg.geometry, properties: { index, kind: leg.kind, schematic: false, color: leg.kind === 'ride' ? leg.availability === 'available' ? colors.get(leg.routeId) ?? TRANSIT_FALLBACK_COLOR : TRANSIT_UNCERTAIN_COLOR : '#526a7f' } }));
  return { lines: collection(lines), stops: collection(stops), journey: collection(journey) };
}
