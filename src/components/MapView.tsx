import { t, getLanguage } from '../lib/language';
import { useEffect, useRef, useState } from 'react';
import { AttributionControl, Map as LibreMap, Marker, NavigationControl, ScaleControl, setWorkerCount, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';
import type { Closure, Coordinate, Drawing, MapFocus, MapMode, MapStyleId, Place, RecordedPoint, RouteOption, RoutePath } from '../../shared/types';
import { closureState, dateTime } from '../lib/format';
import { api } from '../lib/api';
import { emptyMapStyle, loadMapStyle, MAP_ATTRIBUTION, normalizeMapStyleId, type MapDetail, type MapTheme } from '../lib/mapStyle';
import { closureMarkerCoordinate, closureRoadKey, exclusiveBaselineSegments, previewClosureRoads, routeMatchesMapSnapshot, visibleClosureRoads, type ClosureRoads } from '../lib/mapOverlays';
import { preserveMapOverlays, updateSourceIfChanged } from '../lib/mapSourceUpdates';
import { tripTraceSections, usableTracePoints } from '../lib/tripTrace';
import { transitOverlayFeatures, type TransitMapState } from '../lib/transitMap';
import './trip-history.css';

setWorkerUrl(workerUrl);
setWorkerCount(2);

export interface MapViewProps {
  transit?: TransitMapState | null;
  onTransitPatternSelect?: (id: string) => void;
  updating?: boolean;
  refreshing?: boolean;
  mode: MapMode; origin: Place | null; destination: Place | null;
  waypoints?: (Place | null)[];
  closures: Closure[]; selectedClosureId: string | null;
  selectedRoute: RouteOption | null; baseline: RoutePath | null;
  routeOptions?: RouteOption[]; onRouteSelect?: (id: string) => void;
  baselineSelected?: boolean; onBaselineSelect?: () => void; baselineConflictIds?: string[];
  onRoadSelection?: (selection: { roadNames: string[]; distanceMeters: number }) => void;
  drawing: Drawing | null; departureAt: string; focus: MapFocus | null;
  showClosures: boolean; showBaseline: boolean; recordedPoints: RecordedPoint[];
  theme?: MapTheme; mapDetail?: MapDetail; mapStyle?: MapStyleId;
  navigationPosition?: Coordinate | null; followPosition?: boolean;
  onPick: (coordinate: Coordinate) => void; onDraw: (drawing: Drawing) => void;
  onEndpointMove: (letter: 'A' | 'B', coordinate: Coordinate) => void;
  onWaypointMove?: (index: number, coordinate: Coordinate) => void;
  onClosureSelect: (id: string) => void; onReady?: () => void;
}

const SOURCE_IDS = ['transit', 'transit-stops', 'transit-journey', 'baseline', 'routes', 'connectors', 'closure-roads', 'upcoming-roads', 'drawing', 'trace', 'trace-end'] as const;
const sid = (id: typeof SOURCE_IDS[number]) => `manzil-${id}`;
const emptyFeatures = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });
const feature = (geometry: Geometry, properties: Record<string, unknown> = {}): Feature => ({ type: 'Feature', geometry, properties });
const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });
const validCoordinate = (p: number[]): p is Coordinate => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function updateSource(map: LibreMap, name: typeof SOURCE_IDS[number], data: FeatureCollection) {
  const source = map.getSource(sid(name)) as GeoJSONSource | undefined;
  if (source) updateSourceIfChanged(source, data, () => { console.warn(`Manzil map: ${name} overlay could not update.`); });
}

function installOverlays(map: LibreMap) {
  for (const id of SOURCE_IDS) if (!map.getSource(sid(id))) map.addSource(sid(id), { type: 'geojson', data: emptyFeatures() });
  const addLayer = (layer: Parameters<LibreMap['addLayer']>[0]) => { if (!map.getLayer(layer.id)) map.addLayer(layer); };
  addLayer({ id: 'manzil-transit-casing', type: 'line', source: sid('transit'), layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'order'] }, paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'selected'], 9, 3.5], 'line-opacity': ['case', ['get', 'selected'], .95, .3] } });
  addLayer({ id: 'manzil-transit-line', type: 'line', source: sid('transit'), filter: ['==', ['get', 'schematic'], false], layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'order'] }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 6, 2.2], 'line-opacity': ['case', ['get', 'selected'], 1, .65] } });
  addLayer({ id: 'manzil-transit-schematic', type: 'line', source: sid('transit'), filter: ['==', ['get', 'schematic'], true], layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'order'] }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 5, 2.2], 'line-dasharray': [2, 1.8], 'line-opacity': ['case', ['get', 'selected'], 1, .65] } });
  addLayer({ id: 'manzil-transit-hit', type: 'line', source: sid('transit'), paint: { 'line-color': '#376edb', 'line-width': 17, 'line-opacity': .01 } });
  addLayer({ id: 'manzil-transit-journey-casing', type: 'line', source: sid('transit-journey'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 12, 'line-opacity': .98 } });
  addLayer({ id: 'manzil-transit-journey-line', type: 'line', source: sid('transit-journey'), filter: ['all', ['==', ['get', 'kind'], 'ride'], ['==', ['get', 'schematic'], false]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 8 } });
  addLayer({ id: 'manzil-transit-journey-schematic', type: 'line', source: sid('transit-journey'), filter: ['all', ['==', ['get', 'kind'], 'ride'], ['==', ['get', 'schematic'], true]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 7, 'line-dasharray': [2, 1.8] } });
  addLayer({ id: 'manzil-transit-walk-line', type: 'line', source: sid('transit-journey'), filter: ['==', ['get', 'kind'], 'walk'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#526a7f', 'line-width': 4, 'line-dasharray': [1, 1.4] } });
  addLayer({ id: 'manzil-transit-stops', type: 'circle', source: sid('transit-stops'), paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['get', 'selected'], 5, 1.6], 16, ['case', ['get', 'selected'], 5, 4]], 'circle-color': '#ffffff', 'circle-stroke-color': ['case', ['get', 'selected'], '#145cc3', '#536a7b'], 'circle-stroke-width': ['case', ['get', 'selected'], 2.5, 1.5], 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, ['case', ['get', 'selected'], 1, 0], 13, ['case', ['get', 'selected'], 1, .9]], 'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, ['case', ['get', 'selected'], 1, 0], 13, ['case', ['get', 'selected'], 1, .9]] } });
  addLayer({ id: 'manzil-transit-stop-labels', type: 'symbol', source: sid('transit-stops'), minzoom: 13.5, filter: ['==', ['get', 'selected'], true], layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-anchor': 'left', 'text-offset': [.8, 0], 'text-max-width': 14 }, paint: { 'text-color': '#263c48', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } });
  addLayer({ id: 'manzil-baseline-casing', type: 'line', source: sid('baseline'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff7f8', 'line-width': 12, 'line-opacity': .95 } });
  addLayer({ id: 'manzil-baseline-line', type: 'line', source: sid('baseline'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f3a0ad', 'line-width': ['case', ['boolean', ['get', 'inspected'], false], 11, 8], 'line-opacity': .9 } });
  addLayer({ id: 'manzil-baseline-hit', type: 'line', source: sid('baseline'), paint: { 'line-color': '#f3a0ad', 'line-width': 23, 'line-opacity': .01 } });
  addLayer({ id: 'manzil-alternative-casing', type: 'line', source: sid('routes'), filter: ['==', ['get', 'selected'], false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f7f9ff', 'line-width': 12, 'line-opacity': .92 } });
  addLayer({ id: 'manzil-alternative-line', type: 'line', source: sid('routes'), filter: ['==', ['get', 'selected'], false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['boolean', ['get', 'pending'], false], '#8796a5', '#8eaadd'], 'line-width': 8, 'line-opacity': .98 } });
  addLayer({ id: 'manzil-route-casing', type: 'line', source: sid('routes'), filter: ['==', ['get', 'selected'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 15, 'line-opacity': .98 } });
  addLayer({ id: 'manzil-route-line', type: 'line', source: sid('routes'), filter: ['==', ['get', 'selected'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 10 } });
  addLayer({ id: 'manzil-route-hit', type: 'line', source: sid('routes'), paint: { 'line-color': '#2563eb', 'line-width': 23, 'line-opacity': .01 } });
  addLayer({ id: 'manzil-connectors-line', type: 'line', source: sid('connectors'), paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [1, 2], 'line-opacity': .75 } });
  addLayer({ id: 'manzil-upcoming-roads-casing', type: 'line', source: sid('upcoming-roads'), layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#fff9dd', 'line-width': 16, 'line-opacity': .98 } });
  addLayer({ id: 'manzil-upcoming-roads-line', type: 'line', source: sid('upcoming-roads'), layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#ffbf18', 'line-width': 11, 'line-opacity': 1 } });
  // Active red restrictions take precedence if an upcoming preview shares a road.
  addLayer({ id: 'manzil-closure-roads-casing', type: 'line', source: sid('closure-roads'), layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#fff6f8', 'line-width': 16, 'line-opacity': .98 } });
  addLayer({ id: 'manzil-closure-roads-line', type: 'line', source: sid('closure-roads'), layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': '#ff163a', 'line-width': 11, 'line-opacity': 1 } });
  addLayer({ id: 'manzil-drawing-fill', type: 'fill', source: sid('drawing'), filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#ed353b', 'fill-opacity': .16 } });
  addLayer({ id: 'manzil-drawing-line', type: 'line', source: sid('drawing'), filter: ['!=', ['geometry-type'], 'Point'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#e32632', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
  addLayer({ id: 'manzil-drawing-point', type: 'circle', source: sid('drawing'), filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#e32632', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  addLayer({ id: 'manzil-trace-casing', type: 'line', source: sid('trace'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 14, 'line-opacity': .98 } });
  addLayer({ id: 'manzil-trace-line', type: 'line', source: sid('trace'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#12bd78', 'line-width': 9, 'line-opacity': 1 } });
  addLayer({ id: 'manzil-trace-start-point', type: 'circle', source: sid('trace-end'), filter: ['==', ['get', 'endpoint'], 'start'], paint: { 'circle-radius': 9, 'circle-color': '#ffffff', 'circle-stroke-color': '#07834f', 'circle-stroke-width': 4 } });
  addLayer({ id: 'manzil-trace-end-point', type: 'circle', source: sid('trace-end'), filter: ['==', ['get', 'endpoint'], 'end'], paint: { 'circle-radius': 9, 'circle-color': '#07834f', 'circle-stroke-color': '#fff', 'circle-stroke-width': 4 } });
}

function sameDepartureOptions(props: MapViewProps): RouteOption[] {
  const options = props.routeOptions ?? (props.selectedRoute ? [props.selectedRoute] : []);
  const result = options.filter(option => option.validation === 'clear' && routeMatchesMapSnapshot(option.departureAt, props.departureAt, props.followPosition || props.updating || props.refreshing) && !['leave_earlier', 'leave_later'].includes(option.kind));
  if (props.selectedRoute?.validation === 'clear' && routeMatchesMapSnapshot(props.selectedRoute.departureAt, props.departureAt, props.followPosition || props.updating || props.refreshing) && !result.some(option => option.id === props.selectedRoute!.id)) result.push(props.selectedRoute);
  return [...new Map(result.map(option => [option.id, option])).values()];
}

function button(className: string, label: string, text: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button'; element.className = className; element.title = label;
  element.setAttribute('aria-label', label); element.textContent = text;
  element.addEventListener('click', event => event.stopPropagation());
  element.addEventListener('dblclick', event => event.stopPropagation());
  return element;
}

function nudgeOnKeys(element: HTMLElement, map: LibreMap, coordinate: () => Coordinate, move: (next: Coordinate) => void) {
  element.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const point = map.project(coordinate()); const delta = event.shiftKey ? 20 : 5;
    point.x += event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0;
    point.y += event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0;
    const next = map.unproject(point); move([next.lng, next.lat]);
  });
}

function polygonCentre(polygon: Polygon): Coordinate {
  const ring = polygon.coordinates[0];
  return [(Math.min(...ring.map(p => p[0])) + Math.max(...ring.map(p => p[0]))) / 2, (Math.min(...ring.map(p => p[1])) + Math.max(...ring.map(p => p[1]))) / 2];
}

function pointAlong(coordinates: Coordinate[], fraction: number): Coordinate {
  if (coordinates.length === 1) return coordinates[0];
  const lengths = coordinates.slice(1).map((point, index) => Math.hypot((point[0] - coordinates[index][0]) * Math.cos(point[1] * Math.PI / 180), point[1] - coordinates[index][1]));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * fraction;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? remaining / lengths[i] : 0, a = coordinates[i], b = coordinates[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    remaining -= lengths[i];
  }
  return coordinates[0];
}

function segmentTouchesBadge(a: { x: number; y: number }, b: { x: number; y: number }, x: number, y: number): boolean {
  let low = 0, high = 1;
  for (const [origin, delta, minimum, maximum] of [[a.x, b.x - a.x, x - 74, x + 74], [a.y, b.y - a.y, y - 27, y + 27]]) {
    if (Math.abs(delta) < .00001) { if (origin < minimum || origin > maximum) return false; continue; }
    const first = (minimum - origin) / delta, last = (maximum - origin) / delta;
    low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last));
    if (low > high) return false;
  }
  return true;
}

/** Keep recording gaps visible instead of inventing links across them. */
function traceFeatures(points: RecordedPoint[]): FeatureCollection {
  const sections = tripTraceSections(points);
  return sections.length ? collection([feature({ type: 'MultiLineString', coordinates: sections })]) : emptyFeatures();
}

export default function MapView(props: MapViewProps) {
  const language = getLanguage();
  const navigationMarker = useRef<Marker | null>(null);
  const closureMarkers = useRef(new Map<string, Marker>());
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const current = useRef(props); current.current = props;
  const [styleVersion, setStyleVersion] = useState(0);
  const [retry, setRetry] = useState(0);
  const [mapError, setMapError] = useState('');
  const [tileError, setTileError] = useState('');
  const [styleLoading, setStyleLoading] = useState(true);
  const [preview, setPreview] = useState<{ drawing: Drawing; geometry: Polygon } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const roadStart = useRef<Coordinate | null>(null);
  const roadRequest = useRef<{ controller: AbortController; drawing: Drawing | null } | null>(null);
  const [roadStatus, setRoadStatus] = useState('');
  const [closureRoads, setClosureRoads] = useState<{ key: string; data: ClosureRoads } | null>(null);
  const roadCache = useRef(new Map<string, ClosureRoads>());
  const [closureRoadError, setClosureRoadError] = useState('');
  const [upcomingInspection, setUpcomingInspection] = useState<{ hovered: string | null; focused: string | null; pinned: string | null; dismissed: boolean }>({ hovered: null, focused: null, pinned: null, dismissed: false });
  const roadKey = closureRoadKey(props.closures, props.departureAt, true);
  const cachedRoads = roadCache.current.get(roadKey);
  const snapshotRoads = cachedRoads ? { key: roadKey, data: cachedRoads } : closureRoads;
  const hasVisibleClosures = props.closures.some(closure => ['active', 'scheduled'].includes(closureState(closure, props.departureAt)));
  const inspectionCandidate = upcomingInspection.hovered ?? upcomingInspection.focused ?? upcomingInspection.pinned;
  const upcomingPreviewId = upcomingInspection.dismissed ? null : inspectionCandidate;
  // Keep the basemap identity independent of app theme, route selection and
  // polling; retired palette aliases must not trigger an equivalent style swap.
  const mapStyle = normalizeMapStyleId(props.mapStyle), theme = mapStyle === 'night' ? 'dark' : 'light', detail = props.mapDetail ?? 'clean';

  function pickRoad(coordinate: Coordinate) {
    const p = current.current;
    roadRequest.current?.controller.abort(); roadRequest.current = null;
    if (!roadStart.current) {
      roadStart.current = coordinate;
      p.onDraw({ kind: 'line', coordinates: [coordinate], widthMeters: 14 });
      setRoadStatus('Choose the other end on the same road.'); return;
    }
    const controller = new AbortController(), request = { controller, drawing: p.drawing };
    roadRequest.current = request; setRoadStatus('Selecting road section…');
    const timeout = setTimeout(() => {
      if (roadRequest.current !== request) return;
      controller.abort(); roadRequest.current = null; setRoadStatus('Road selection timed out. Try again.');
    }, 10000);
    api<{ drawing: Drawing; roadNames: string[]; distanceMeters: number }>('/roads/section', { method: 'POST', body: JSON.stringify({ from: roadStart.current, to: coordinate }), signal: controller.signal })
      .then(section => {
        if (controller.signal.aborted || roadRequest.current !== request || current.current.mode !== 'road' || current.current.drawing !== request.drawing) return;
        roadRequest.current = null; roadStart.current = null; setRoadStatus('');
        current.current.onDraw(section.drawing); current.current.onRoadSelection?.(section);
      }).catch(error => { if (!controller.signal.aborted && roadRequest.current === request) { roadRequest.current = null; setRoadStatus(error instanceof Error ? error.message : 'Road selection unavailable.'); } })
      .finally(() => clearTimeout(timeout));
  }

  useEffect(() => {
    if (props.mode !== 'road' || (roadRequest.current && roadRequest.current.drawing !== props.drawing)) {
      roadRequest.current?.controller.abort(); roadRequest.current = null; roadStart.current = null; setRoadStatus('');
    }
  }, [props.mode, props.drawing]);
  useEffect(() => () => { roadRequest.current?.controller.abort(); }, []);

  useEffect(() => {
    if (!container.current) return;
    let map: LibreMap;
    try {
      map = new LibreMap({ container: container.current, style: emptyMapStyle(normalizeMapStyleId(current.current.mapStyle) === 'night' ? 'dark' : 'light'), center: [73.052, 33.715], zoom: 11.9, minZoom: 0, maxZoom: 19,
        pitch: 0, minPitch: 0, maxPitch: 0, bearing: 0, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        renderWorldCopies: false, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.75), reduceMotion: reducedMotion(), fadeDuration: 0, maxTileCacheZoomLevels: 2, attributionControl: false });
    } catch {
      container.current.replaceChildren();
      setMapError('The map could not start. This browser may not support WebGL. Journey fields and coordinate editing remain available.'); setStyleLoading(false); return;
    }
    mapRef.current = map; setMapError('');
    map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
    map.on('style.load', () => { installOverlays(map); setStyleVersion(version => version + 1); });
    map.on('error', event => { console.warn('Manzil map rendering:', event.error.message.slice(0, 400)); setTileError('Some map tiles or labels could not load. Check your connection; local routing and saved data remain available.'); });
    map.on('sourcedata', event => { if (event.sourceId && !event.sourceId.startsWith('manzil-') && event.sourceDataType === 'content' && event.isSourceLoaded) setTileError(''); });
    map.on('webglcontextlost', () => setMapError('Map graphics were interrupted. Try restarting the map; your saved local data is retained.'));
    map.on('webglcontextrestored', () => setMapError(''));
    map.on('click', event => {
      setUpcomingInspection({ hovered: null, focused: null, pinned: null, dismissed: false });
      const p = current.current, coordinate: Coordinate = [event.lngLat.lng, event.lngLat.lat];
      if (p.mode === 'origin' || p.mode === 'destination' || p.mode === 'waypoint') { p.onPick(coordinate); return; }
      if (p.mode === 'road') { pickRoad(coordinate); return; }
      if (p.mode === 'point' || p.mode === 'line' || p.mode === 'polygon') {
        const coordinates = p.mode === 'point' ? [coordinate] : [...(p.drawing?.kind === p.mode ? p.drawing.coordinates : []), coordinate];
        p.onDraw({ kind: p.mode, coordinates, widthMeters: p.drawing?.widthMeters ?? 35 }); return;
      }
      const layers = ['manzil-closure-roads-line', 'manzil-route-hit', 'manzil-baseline-hit', 'manzil-transit-hit'].filter(id => map.getLayer(id));
      const found = map.queryRenderedFeatures(event.point, { layers });
      const closure = found.find(item => item.properties?.closureId);
      if (closure) { p.onClosureSelect(String(closure.properties!.closureId)); return; }
      const transitPattern = found.find(item => item.properties?.patternId);
      if (p.transit && transitPattern) { p.onTransitPatternSelect?.(String(transitPattern.properties!.patternId)); return; }
      const route = found.find(item => item.properties?.routeId);
      if (route) { p.onRouteSelect?.(String(route.properties!.routeId)); return; }
      if (found.some(item => item.layer.id === 'manzil-baseline-hit')) p.onBaselineSelect?.();
    });
    map.on('mousemove', event => {
      if (current.current.mode !== 'browse') { map.getCanvas().style.cursor = 'crosshair'; return; }
      const layers = ['manzil-closure-roads-line', 'manzil-route-hit', 'manzil-baseline-hit', 'manzil-transit-hit'].filter(id => map.getLayer(id));
      map.getCanvas().style.cursor = layers.length && map.queryRenderedFeatures(event.point, { layers }).length ? 'pointer' : '';
    });
    const observer = new ResizeObserver(() => map.resize()); observer.observe(container.current);
    current.current.onReady?.();
    return () => { observer.disconnect(); map.remove(); if (mapRef.current === map) mapRef.current = null; };
  }, [retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const controller = new AbortController(); let cancelled = false;
    setStyleLoading(true); setTileError('');
    const timer = setTimeout(() => controller.abort(), 15000);
    loadMapStyle(mapStyle, detail, controller.signal).then(style => {
      if (!cancelled && mapRef.current === map) { map.setStyle(style, { transformStyle: preserveMapOverlays }); setStyleLoading(false); }
    }).catch(() => {
      if (!cancelled && mapRef.current === map) { setTileError('The basemap could not update. Local routes and editing remain available over the existing map or a plain background. Check your connection.'); setStyleLoading(false); }
    });
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [mapStyle, detail, retry]);

  useEffect(() => {
    setPreview(null); setPreviewError(false);
    const drawing = props.drawing;
    if (!drawing || drawing.coordinates.length < (drawing.kind === 'point' ? 1 : drawing.kind === 'line' ? 2 : 3)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<Polygon>('/geometry', { method: 'POST', body: JSON.stringify(drawing), signal: controller.signal })
        .then(geometry => { if (!controller.signal.aborted) setPreview({ drawing, geometry }); })
        .catch(() => { if (!controller.signal.aborted) setPreviewError(true); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [props.drawing]);

  useEffect(() => {
    setClosureRoadError('');
    if (!props.showClosures || !hasVisibleClosures) return;
    const cached = roadCache.current.get(roadKey);
    if (cached) { setClosureRoads({ key: roadKey, data: cached }); return; }
    const controller = new AbortController();
    api<ClosureRoads>(`/closures/roads?at=${encodeURIComponent(props.departureAt)}&includeUpcoming=true`, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        roadCache.current.set(roadKey, data);
        if (roadCache.current.size > 8) roadCache.current.delete(roadCache.current.keys().next().value!);
        setClosureRoads({ key: roadKey, data });
      })
      .catch(() => { if (!controller.signal.aborted) setClosureRoadError('Closed-road highlighting unavailable.'); });
    return () => controller.abort();
  }, [roadKey, props.showClosures, hasVisibleClosures, retry]);

  useEffect(() => {
    const clear = () => setUpcomingInspection({ hovered: null, focused: null, pinned: null, dismissed: false });
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Element) || !event.target.closest('.map-closure-marker')) clear(); };
    const escape = (event: KeyboardEvent) => {
      // Keep the real hover/focus channels: Escape does not move the pointer or
      // blur the button. Duplicate native entry/focus events must not reopen it.
      if (event.key === 'Escape') setUpcomingInspection(state => ({ ...state, pinned: null, dismissed: true }));
    };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);

  useEffect(() => {
    const scheduled = new Set(props.showClosures ? props.closures.filter(closure => closureState(closure, props.departureAt) === 'scheduled').map(closure => closure.id) : []);
    setUpcomingInspection(state => {
      const keep = (id: string | null) => id && scheduled.has(id) ? id : null;
      const next = { ...state, hovered: keep(state.hovered), focused: keep(state.focused), pinned: keep(state.pinned) };
      return Object.keys(state).every(key => state[key as keyof typeof state] === next[key as keyof typeof state]) ? state : next;
    });
  }, [props.closures, props.departureAt, props.showClosures]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    map.getCanvas().style.cursor = props.mode === 'browse' ? '' : 'crosshair';
    map.doubleClickZoom[props.mode === 'browse' ? 'enable' : 'disable']();
  }, [props.mode, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const markers: Marker[] = [];
    for (const [place, letter] of [[props.origin, 'A'], [props.destination, 'B']] as const) {
      if (!place || !validCoordinate(place.coordinate)) continue;
      const element = button(`map-endpoint map-endpoint-${letter.toLowerCase()}`, `${letter === 'A' ? 'Start' : 'Destination'}: ${place.name}. Drag or use arrow keys to adjust.`, letter);
      const marker = new Marker({ element, draggable: true, anchor: 'center' }).setLngLat(place.coordinate).addTo(map);
      marker.on('dragend', () => { const p = marker.getLngLat(); current.current.onEndpointMove(letter, [p.lng, p.lat]); });
      nudgeOnKeys(element, map, () => [marker.getLngLat().lng, marker.getLngLat().lat], next => current.current.onEndpointMove(letter, next));
      markers.push(marker);
    }
    return () => markers.forEach(marker => marker.remove());
  }, [props.origin, props.destination, language, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const markers: Marker[] = [];
    props.waypoints?.forEach((place, index) => {
      if (!place || !validCoordinate(place.coordinate)) return;
      const element = button('map-endpoint map-endpoint-waypoint', `Stop ${index + 1}: ${place.name}. Drag or use arrow keys to adjust.`, String(index + 1));
      const marker = new Marker({ element, draggable: !!props.onWaypointMove, anchor: 'center' }).setLngLat(place.coordinate).addTo(map);
      marker.on('dragend', () => { const point = marker.getLngLat(); current.current.onWaypointMove?.(index, [point.lng, point.lat]); });
      nudgeOnKeys(element, map, () => [marker.getLngLat().lng, marker.getLngLat().lat], coordinate => current.current.onWaypointMove?.(index, coordinate));
      markers.push(marker);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [props.waypoints, language, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const transit = transitOverlayFeatures(props.transit);
    updateSource(map, 'transit', transit.lines); updateSource(map, 'transit-stops', transit.stops); updateSource(map, 'transit-journey', transit.journey);
  }, [props.transit, styleVersion, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const options = sameDepartureOptions(props);
    const baseline = !props.followPosition && props.baseline && props.showBaseline && routeMatchesMapSnapshot(props.baseline.departureAt, props.departureAt, props.refreshing) ? props.baseline : null;
    const baselineSections = baseline ? exclusiveBaselineSegments(baseline, options) : [];
    updateSource(map, 'baseline', collection(baselineSections.map(coordinates => feature({ type: 'LineString', coordinates }, { inspected: !!props.baselineSelected }))));
    updateSource(map, 'routes', collection(options.map(option => feature(option.geometry, { routeId: option.id, selected: option.id === props.selectedRoute?.id, pending: !!props.updating }))));
    const connectors: Feature[] = [];
    if (props.selectedRoute && options.some(option => option.id === props.selectedRoute!.id)) for (const [place, snapped] of [[props.origin, props.selectedRoute.snappedOrigin], [props.destination, props.selectedRoute.snappedDestination]] as const) {
      if (place && snapped) connectors.push(feature({ type: 'LineString', coordinates: [place.coordinate, snapped] }));
    }
    updateSource(map, 'connectors', collection(connectors));
    const markers: Marker[] = [];
    const placeLabels = () => {
      markers.forEach(marker => marker.remove()); markers.length = 0;
      if (props.mode !== 'browse') return;
      const occupied: { x: number; y: number }[] = [];
      for (const place of [props.origin, ...(props.waypoints ?? []), props.destination]) if (place) occupied.push(map.project(place.coordinate));
      const bounds = map.getContainer().getBoundingClientRect();
      const conflictCentres = props.closures.filter(closure => props.baselineConflictIds?.includes(closure.id)).map(closure => map.project(polygonCentre(closure.geometry)));
      const labelPaths: { path: RoutePath; option: RouteOption | null; sections: Coordinate[][] }[] = [...options].sort((a,b) => Number(b.id === props.selectedRoute?.id) - Number(a.id === props.selectedRoute?.id)).map(option => ({ path: option, option, sections: [option.geometry.coordinates as Coordinate[]] }));
      if (baseline && baselineSections.length) labelPaths.push({ path: baseline, option: null, sections: baselineSections });
      for (const [index, { path, option, sections }] of labelPaths.entries()) {
        const coordinates = sections[0]; if (!coordinates.length) continue;
        const fractions = index % 2 ? [.7, .35, .83, .5, .2] : [.45, .75, .25, .6, .85];
        let position = pointAlong(coordinates, fractions[0]), offset: [number, number] = [0, 0], best = -Infinity;
        for (const section of sections) for (const fraction of fractions) for (const shift of (option ? [[0,0],[45,0],[-45,0],[0,40],[0,-40]] : [[0,0]]) as [number,number][]) {
          const candidate = pointAlong(section, fraction), projected = map.project(candidate);
          const x = projected.x + shift[0], y = projected.y + shift[1];
          if (x < 48 || x > bounds.width - 75 || y < 76 || y > bounds.height - 65) continue;
          // Never anchor the blocked badge on a shared blue corridor. At a low
          // zoom where the exclusive stretch is too close, its card remains.
          let nearBlue = false;
          if (!option) for (const clear of options) {
            const line = clear.geometry.coordinates as Coordinate[];
            for (let j = 1; j < line.length; j++) {
              const a = map.project(line[j - 1]), b = map.project(line[j]);
              if (segmentTouchesBadge(a, b, x, y)) { nearBlue = true; break; }
            }
            if (nearBlue) break;
          }
          if (nearBlue) continue;
          const separation = occupied.length ? Math.min(...occupied.map(point => Math.hypot((point.x-x), (point.y-y)*1.7))) : 120;
          const conflictDistance = !option && conflictCentres.length ? Math.min(...conflictCentres.map(point => Math.hypot(point.x - x, point.y - y))) : 0;
          const score = Math.min(160, separation) - Math.hypot(...shift) * .25 - Math.min(150, conflictDistance * .4);
          if (score > best) { best = score; position = candidate; offset = shift; }
        }
        if (!option && best === -Infinity) continue;
        const projected = map.project(position); occupied.push({x:projected.x + offset[0], y:projected.y + offset[1]});
        const selected = !!option && option.id === props.selectedRoute?.id, minutes = Math.max(1, Math.round(path.durationSeconds / 60));
        const element = option ? button(`map-route-label${selected ? ' is-selected' : ''}${props.updating ? ' is-pending' : ''}`, props.updating ? t('Checking route…') : `${t(option.label)}, ${minutes} ${t('min')}`, props.updating ? t('Updating…') : `${minutes} ${t('min')}`) : button(`map-route-label is-blocked${props.baselineSelected ? ' is-selected' : ''}`, `Inspect blocked original route, ${minutes} ${t('min')} without closure`, `${t('Blocked')} · ${minutes} ${t('min')}`);
        if (option) {
          (element as HTMLButtonElement).disabled = !!props.updating;
          element.setAttribute('aria-pressed', String(selected));
          element.addEventListener('click', () => current.current.onRouteSelect?.(option.id));
        } else {
          element.setAttribute('aria-pressed', String(!!props.baselineSelected));
          element.addEventListener('click', () => current.current.onBaselineSelect?.());
        }
        markers.push(new Marker({ element, anchor: 'center', offset }).setLngLat(position).addTo(map));
      }
    };
    placeLabels(); map.on('moveend', placeLabels);
    return () => { map.off('moveend', placeLabels); markers.forEach(marker => marker.remove()); };
  }, [props.routeOptions, props.selectedRoute, props.baseline, props.baselineSelected, props.baselineConflictIds, props.showBaseline, props.origin, props.destination, props.waypoints, props.departureAt, props.followPosition, props.mode, props.updating, props.refreshing, language, styleVersion, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const retained = new Set<string>();
    if (props.showClosures) for (const closure of props.closures) {
      if (closure.status !== 'published') continue;
      const state = closureState(closure, props.departureAt), selected = closure.id === props.selectedClosureId;
      if (state !== 'active' && state !== 'scheduled') continue;
      retained.add(closure.id);
      const label = `${closure.title} — ${t(state)}. ${dateTime(closure.startsAt)}`;
      let marker = closureMarkers.current.get(closure.id);
      if (!marker) {
        const element = button('map-closure-marker', label, '−');
        const isUpcoming = () => { const latest = current.current.closures.find(item => item.id === closure.id); return latest && closureState(latest, current.current.departureAt) === 'scheduled'; };
        element.addEventListener('mouseenter', () => { if (isUpcoming()) setUpcomingInspection(state => state.hovered === closure.id ? state : { ...state, hovered: closure.id, dismissed: false }); });
        element.addEventListener('mouseleave', () => setUpcomingInspection(state => state.hovered === closure.id ? { ...state, hovered: null } : state));
        element.addEventListener('focus', () => { if (isUpcoming()) setUpcomingInspection(state => state.focused === closure.id ? state : { ...state, focused: closure.id, dismissed: false }); });
        element.addEventListener('blur', () => setUpcomingInspection(state => state.focused === closure.id ? { ...state, focused: null } : state));
        element.addEventListener('click', () => {
          if (isUpcoming()) setUpcomingInspection(state => state.pinned === closure.id ? { ...state, pinned: null, dismissed: true } : { ...state, pinned: closure.id, dismissed: false });
          else setUpcomingInspection({ hovered: null, focused: null, pinned: null, dismissed: false });
          current.current.onClosureSelect(closure.id);
        });
        marker = new Marker({ element, anchor: 'center' }).setLngLat(closureMarkerCoordinate(closure, snapshotRoads, roadKey)).addTo(map);
        closureMarkers.current.set(closure.id, marker);
      }
      const element = marker.getElement();
      // Marker owns positioning classes and inline transforms. Replacing className
      // removes its absolute positioning and makes coordinates drift with zoom.
      element.classList.toggle('is-scheduled', state === 'scheduled'); element.classList.toggle('is-selected', selected);
      element.classList.toggle('is-previewing', state === 'scheduled' && closure.id === upcomingPreviewId);
      const symbol = state === 'scheduled' ? '!' : '−';
      if (element.textContent !== symbol) element.textContent = symbol;
      element.setAttribute('aria-label', label); element.title = label;
      if (state === 'scheduled') element.setAttribute('aria-pressed', String(upcomingInspection.pinned === closure.id));
      else element.removeAttribute('aria-pressed');
      const coordinate = closureMarkerCoordinate(closure, snapshotRoads, roadKey), previous = marker.getLngLat();
      if (previous.lng !== coordinate[0] || previous.lat !== coordinate[1]) marker.setLngLat(coordinate);
    }
    for (const [id, marker] of closureMarkers.current) if (!retained.has(id)) { marker.remove(); closureMarkers.current.delete(id); }
    updateSource(map, 'closure-roads', props.showClosures ? visibleClosureRoads(snapshotRoads, roadKey, props.closures, props.departureAt) : emptyFeatures());
    updateSource(map, 'upcoming-roads', props.showClosures ? previewClosureRoads(snapshotRoads, roadKey, props.closures, props.departureAt, upcomingPreviewId) : emptyFeatures());
  }, [props.closures, props.selectedClosureId, props.showClosures, props.departureAt, closureRoads, roadKey, upcomingPreviewId, upcomingInspection.pinned, language, styleVersion, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const drawing = props.drawing, features: Feature[] = [], markers: Marker[] = [];
    if (drawing?.coordinates.length) {
      if (preview?.drawing === drawing) features.push(feature(preview.geometry));
      else if (drawing.kind === 'polygon' && drawing.coordinates.length > 2) features.push(feature({ type: 'Polygon', coordinates: [[...drawing.coordinates, drawing.coordinates[0]]] }));
      else if (drawing.coordinates.length > 1) features.push(feature({ type: 'LineString', coordinates: drawing.coordinates }));
      else features.push(feature({ type: 'Point', coordinates: drawing.coordinates[0] }));
      drawing.coordinates.forEach((point, index) => {
        if (props.mode === 'road' && index !== 0 && index !== drawing.coordinates.length - 1) return;
        const element = button('map-vertex', props.mode === 'road' ? `${index === 0 ? 'Start' : 'End'} of selected road section` : `Restriction point ${index + 1}. Drag, use arrow keys, or edit coordinates in the panel.`, String(props.mode === 'road' ? index === 0 ? 1 : 2 : index + 1));
        const marker = new Marker({ element, draggable: props.mode !== 'road', anchor: 'center' }).setLngLat(point).addTo(map);
        const move = (next: Coordinate) => { const latest = current.current.drawing; if (latest) current.current.onDraw({ ...latest, coordinates: latest.coordinates.map((p, i) => i === index ? next : p) }); };
        marker.on('dragend', () => { const p = marker.getLngLat(); move([p.lng, p.lat]); });
        if (props.mode !== 'road') nudgeOnKeys(element, map, () => [marker.getLngLat().lng, marker.getLngLat().lat], move);
        markers.push(marker);
      });
    }
    updateSource(map, 'drawing', collection(features));
    return () => markers.forEach(marker => marker.remove());
  }, [props.drawing, props.mode, preview, styleVersion, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    updateSource(map, 'trace', traceFeatures(props.recordedPoints));
    const points = usableTracePoints(props.recordedPoints), first = points[0], last = points.at(-1);
    const endpoints: Feature[] = [], markers: Marker[] = [];
    if (first && last) for (const [point, endpoint, letter] of [[first, 'start', 'S'], [last, 'end', 'E']] as const) {
      endpoints.push(feature({ type: 'Point', coordinates: point.coordinate }, { endpoint }));
      const element = document.createElement('span'); element.className = `map-trip-endpoint is-${endpoint}`; element.textContent = letter;
      element.setAttribute('role', 'img'); element.setAttribute('aria-label', t(endpoint === 'start' ? 'Trip start' : 'Trip end'));
      markers.push(new Marker({ element, anchor: 'center' }).setLngLat(point.coordinate).addTo(map));
    }
    updateSource(map, 'trace-end', collection(endpoints));
    return () => markers.forEach(marker => marker.remove());
  }, [props.recordedPoints, styleVersion, retry]);

  useEffect(() => {
    const map = mapRef.current, coordinates = props.focus?.coordinates.filter(validCoordinate);
    if (!map || !coordinates?.length) return;
    if (coordinates.length === 1) map.jumpTo({ center: coordinates[0], zoom: 15, pitch: 0, bearing: 0 });
    else {
      const west = Math.min(...coordinates.map(p => p[0])), east = Math.max(...coordinates.map(p => p[0]));
      const south = Math.min(...coordinates.map(p => p[1])), north = Math.max(...coordinates.map(p => p[1]));
      // The retained-trip caption occupies the lower map. Reserve room for both
      // its badge and the S/E marker, with proportional padding on short phones.
      const height = map.getContainer().clientHeight || 600;
      const padding = props.recordedPoints.length ? { top: Math.min(88, height * .2), bottom: Math.min(140, height * .3), left: 48, right: 104 }
        : { top: 88, bottom: 80, left: 48, right: 104 };
      map.fitBounds([[west, south], [east, north]], { padding, maxZoom: 16, duration: 0, pitch: 0, bearing: 0 });
    }
  }, [props.focus?.token, retry]);

  useEffect(() => {
    const map = mapRef.current, position = props.navigationPosition;
    if (!map || !position || !validCoordinate(position)) { navigationMarker.current?.remove(); navigationMarker.current = null; return; }
    if (!navigationMarker.current) {
      const element = document.createElement('div'); element.className = 'map-navigation-marker'; element.setAttribute('role', 'img'); element.setAttribute('aria-label', t('Navigation'));
      navigationMarker.current = new Marker({ element, anchor: 'center' }).setLngLat(position).addTo(map);
    } else navigationMarker.current.setLngLat(position);
    if (props.followPosition) map.easeTo({ center: position, zoom: Math.max(map.getZoom(), 15), pitch: 0, bearing: 0, duration: reducedMotion() ? 0 : 180 });
  }, [props.navigationPosition, props.followPosition, retry]);
  useEffect(() => () => { navigationMarker.current?.remove(); navigationMarker.current = null; for (const marker of closureMarkers.current.values()) marker.remove(); closureMarkers.current.clear(); }, [retry]);

  return <>
    <div ref={container} className={`maplibre-map map-theme-${theme}`} role="region" aria-label={t("Interactive map")} />
    {mapError ? <div className="map-status map-status-error" role="alert"><span>{t(mapError)}</span><button type="button" onClick={() => setRetry(value => value + 1)}>{t("Restart map")}</button><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{t("© OpenStreetMap contributors")}</a></div>
      : tileError ? <div className="map-status map-status-error" role="status">{t(tileError)}</div>
      : styleLoading ? <div className="map-status" role="status">{t("Loading the map…")}</div>
      : roadStatus ? <div className="map-status" role="status">{t(roadStatus)}</div>
      : previewError ? <div className="map-status map-status-error" role="status">{t("Restriction preview unavailable.")}</div>
      : closureRoadError ? <div className="map-status map-status-error" role="status">{t(closureRoadError)}</div> : null}
  </>;
}
