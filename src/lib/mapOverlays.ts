import type { FeatureCollection, LineString, Polygon } from 'geojson';
import type { Closure } from '../../shared/types';
import { closureState } from './format';

export type ClosureRoads = FeatureCollection<LineString, { closureId: string; title: string }>;

/** Planner choices belong to one snapshot; an in-progress guide keeps its original path. */
export function routeMatchesMapSnapshot(routeDepartureAt: string, mapAt: string, inProgress = false): boolean {
  const departure = Date.parse(routeDepartureAt), snapshot = Date.parse(mapAt);
  return Number.isFinite(departure) && Number.isFinite(snapshot) && (inProgress || departure === snapshot);
}

/** Road geometry changes at active-set/revision boundaries, not on every clock tick. */
export function closureRoadKey(closures: Closure[], at: string): string {
  const revisions = closures.filter(closure => closureState(closure, at) === 'active').map(closure => [closure.id, closure.revision]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify(revisions);
}

export function activeClosurePolygons(closures: Closure[], at: string, selectedId: string | null): FeatureCollection<Polygon> {
  return { type: 'FeatureCollection', features: closures.filter(closure => closureState(closure, at) === 'active').map(closure => ({
    type: 'Feature', geometry: closure.geometry,
    properties: { closureId: closure.id, selected: closure.id === selectedId },
  })) };
}

/** Suppress old and inactive road responses even while a new snapshot is loading. */
export function visibleClosureRoads(response: { key: string; data: ClosureRoads } | null, key: string, closures: Closure[], at: string): ClosureRoads {
  const activeIds = new Set(closures.filter(closure => closureState(closure, at) === 'active').map(closure => closure.id));
  return { type: 'FeatureCollection', features: response?.key === key ? response.data.features.filter(feature => activeIds.has(feature.properties.closureId)) : [] };
}
