import { useEffect, useRef, useState } from 'react';
import { AttributionControl, Map as LibreMap, Marker, NavigationControl, ScaleControl, setWorkerCount, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';
import type { Closure, Coordinate, Drawing, MapFocus, MapMode, Place, RecordedPoint, RouteOption, RoutePath } from '../../shared/types';
import { closureState } from '../lib/format';
import { api } from '../lib/api';
import { emptyMapStyle, loadMapStyle, MAP_ATTRIBUTION, type MapDetail, type MapTheme } from '../lib/mapStyle';

setWorkerUrl(workerUrl);
setWorkerCount(2);

export interface MapViewProps {
  mode: MapMode; origin: Place | null; destination: Place | null;
  closures: Closure[]; selectedClosureId: string | null;
  selectedRoute: RouteOption | null; baseline: RoutePath | null;
  routeOptions?: RouteOption[]; onRouteSelect?: (id: string) => void;
  drawing: Drawing | null; departureAt: string; focus: MapFocus | null;
  showClosures: boolean; showBaseline: boolean; recordedPoints: RecordedPoint[];
  theme?: MapTheme; mapDetail?: MapDetail;
  navigationPosition?: Coordinate | null; followPosition?: boolean;
  onPick: (coordinate: Coordinate) => void; onDraw: (drawing: Drawing) => void;
  onEndpointMove: (letter: 'A' | 'B', coordinate: Coordinate) => void;
  onClosureSelect: (id: string) => void; onReady?: () => void;
}

const SOURCE_IDS = ['baseline', 'routes', 'connectors', 'closures', 'drawing', 'trace', 'trace-end'] as const;
const sid = (id: typeof SOURCE_IDS[number]) => `manzil-${id}`;
const emptyFeatures = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });
const feature = (geometry: Geometry, properties: Record<string, unknown> = {}): Feature => ({ type: 'Feature', geometry, properties });
const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });
const validCoordinate = (p: number[]): p is Coordinate => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function updateSource(map: LibreMap, name: typeof SOURCE_IDS[number], data: FeatureCollection) {
  const source = map.getSource(sid(name)) as GeoJSONSource | undefined;
  if (source) void source.setData(data).catch(() => { console.warn(`Manzil map: ${name} overlay could not update.`); });
}

function installOverlays(map: LibreMap) {
  for (const id of SOURCE_IDS) if (!map.getSource(sid(id))) map.addSource(sid(id), { type: 'geojson', data: emptyFeatures() });
  map.addLayer({ id: 'manzil-baseline-line', type: 'line', source: sid('baseline'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#8993a5', 'line-width': 4, 'line-opacity': .7, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'manzil-alternative-casing', type: 'line', source: sid('routes'), filter: ['==', ['get', 'selected'], false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f7f9ff', 'line-width': 12, 'line-opacity': .92 } });
  map.addLayer({ id: 'manzil-alternative-line', type: 'line', source: sid('routes'), filter: ['==', ['get', 'selected'], false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#8eaadd', 'line-width': 8, 'line-opacity': .98 } });
  map.addLayer({ id: 'manzil-route-casing', type: 'line', source: sid('routes'), filter: ['==', ['get', 'selected'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 15, 'line-opacity': .98 } });
  map.addLayer({ id: 'manzil-route-line', type: 'line', source: sid('routes'), filter: ['==', ['get', 'selected'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 10 } });
  map.addLayer({ id: 'manzil-route-hit', type: 'line', source: sid('routes'), paint: { 'line-color': '#2563eb', 'line-width': 23, 'line-opacity': .01 } });
  map.addLayer({ id: 'manzil-connectors-line', type: 'line', source: sid('connectors'), paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [1, 2], 'line-opacity': .75 } });
  map.addLayer({ id: 'manzil-closure-fill', type: 'fill', source: sid('closures'), paint: { 'fill-color': '#ed353b', 'fill-opacity': ['case', ['==', ['get', 'state'], 'ended'], .035, ['==', ['get', 'selected'], true], .26, .17] } });
  map.addLayer({ id: 'manzil-closure-line', type: 'line', source: sid('closures'), filter: ['!=', ['get', 'state'], 'scheduled'], paint: { 'line-color': '#e32632', 'line-width': ['case', ['==', ['get', 'selected'], true], 4, 3], 'line-opacity': ['case', ['==', ['get', 'state'], 'ended'], .35, 1] } });
  map.addLayer({ id: 'manzil-closure-scheduled', type: 'line', source: sid('closures'), filter: ['==', ['get', 'state'], 'scheduled'], paint: { 'line-color': '#e32632', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
  map.addLayer({ id: 'manzil-drawing-fill', type: 'fill', source: sid('drawing'), filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#ed353b', 'fill-opacity': .16 } });
  map.addLayer({ id: 'manzil-drawing-line', type: 'line', source: sid('drawing'), filter: ['!=', ['geometry-type'], 'Point'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#e32632', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
  map.addLayer({ id: 'manzil-drawing-point', type: 'circle', source: sid('drawing'), filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#e32632', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'manzil-trace-line', type: 'line', source: sid('trace'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0e9cae', 'line-width': 5, 'line-opacity': .85 } });
  map.addLayer({ id: 'manzil-trace-end-point', type: 'circle', source: sid('trace-end'), paint: { 'circle-radius': 7, 'circle-color': '#0e9cae', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
}

function sameDepartureOptions(props: MapViewProps): RouteOption[] {
  const departure = Date.parse(props.selectedRoute?.departureAt ?? props.departureAt);
  const options = props.routeOptions ?? (props.selectedRoute ? [props.selectedRoute] : []);
  const result = options.filter(option => option.validation === 'clear' && Date.parse(option.departureAt) === departure && !['leave_earlier', 'leave_later'].includes(option.kind));
  if (props.selectedRoute?.validation === 'clear' && !result.some(option => option.id === props.selectedRoute!.id)) result.push(props.selectedRoute);
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

/** Keep recording gaps visible instead of inventing links across them. */
function traceFeatures(points: RecordedPoint[]): FeatureCollection {
  const sections: Coordinate[][] = []; let section: Coordinate[] = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i], previous = points[i - 1];
    let gap = !validCoordinate(point.coordinate) || point.accuracy > 100;
    if (previous) {
      const seconds = (Date.parse(point.timestamp) - Date.parse(previous.timestamp)) / 1000;
      const metres = Math.hypot((point.coordinate[0] - previous.coordinate[0]) * Math.cos(point.coordinate[1] * Math.PI / 180), point.coordinate[1] - previous.coordinate[1]) * Math.PI / 180 * 6371000;
      gap ||= seconds <= 0 || seconds > 60 || metres / seconds > 65 || previous.accuracy > 100;
    }
    if (gap && section.length) { if (section.length > 1) sections.push(section); section = []; }
    if (validCoordinate(point.coordinate) && point.accuracy <= 100) section.push(point.coordinate);
  }
  if (section.length > 1) sections.push(section);
  return sections.length ? collection([feature({ type: 'MultiLineString', coordinates: sections })]) : emptyFeatures();
}

export default function MapView(props: MapViewProps) {
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
  const theme = props.theme ?? 'light', detail = props.mapDetail ?? 'clean';

  useEffect(() => {
    if (!container.current) return;
    let map: LibreMap;
    try {
      map = new LibreMap({ container: container.current, style: emptyMapStyle(current.current.theme ?? 'light'), center: [73.052, 33.715], zoom: 11.9, minZoom: 6, maxZoom: 19,
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
      const p = current.current, coordinate: Coordinate = [event.lngLat.lng, event.lngLat.lat];
      if (p.mode === 'origin' || p.mode === 'destination') { p.onPick(coordinate); return; }
      if (p.mode === 'point' || p.mode === 'line' || p.mode === 'polygon') {
        const coordinates = p.mode === 'point' ? [coordinate] : [...(p.drawing?.kind === p.mode ? p.drawing.coordinates : []), coordinate];
        p.onDraw({ kind: p.mode, coordinates, widthMeters: p.drawing?.widthMeters ?? 35 }); return;
      }
      const layers = ['manzil-closure-fill', 'manzil-closure-line', 'manzil-closure-scheduled', 'manzil-route-hit'].filter(id => map.getLayer(id));
      const found = map.queryRenderedFeatures(event.point, { layers });
      const closure = found.find(item => item.properties?.closureId);
      if (closure) { p.onClosureSelect(String(closure.properties!.closureId)); return; }
      const route = found.find(item => item.properties?.routeId);
      if (route) p.onRouteSelect?.(String(route.properties!.routeId));
    });
    map.on('mousemove', event => {
      if (current.current.mode !== 'browse') { map.getCanvas().style.cursor = 'crosshair'; return; }
      const layers = ['manzil-closure-fill', 'manzil-route-hit'].filter(id => map.getLayer(id));
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
    loadMapStyle(theme, detail, controller.signal).then(style => {
      if (!cancelled && mapRef.current === map) { map.setStyle(style, { diff: false }); setStyleLoading(false); }
    }).catch(() => {
      if (!cancelled && mapRef.current === map) { setTileError('The basemap could not update. Local routes and editing remain available over the existing map or a plain background. Check your connection.'); setStyleLoading(false); }
    });
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [theme, detail, retry]);

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
  }, [props.origin, props.destination, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const options = sameDepartureOptions(props);
    updateSource(map, 'baseline', props.baseline && props.showBaseline ? collection([feature(props.baseline.geometry)]) : emptyFeatures());
    updateSource(map, 'routes', collection(options.map(option => feature(option.geometry, { routeId: option.id, selected: option.id === props.selectedRoute?.id }))));
    const connectors: Feature[] = [];
    if (props.selectedRoute) for (const [place, snapped] of [[props.origin, props.selectedRoute.snappedOrigin], [props.destination, props.selectedRoute.snappedDestination]] as const) {
      if (place && snapped) connectors.push(feature({ type: 'LineString', coordinates: [place.coordinate, snapped] }));
    }
    updateSource(map, 'connectors', collection(connectors));
    const markers: Marker[] = [];
    const placeLabels = () => {
      markers.forEach(marker => marker.remove()); markers.length = 0;
      if (props.mode !== 'browse') return;
      const occupied: { x: number; y: number }[] = [];
      for (const place of [props.origin, props.destination]) if (place) occupied.push(map.project(place.coordinate));
      const bounds = map.getContainer().getBoundingClientRect();
      for (const [index, option] of [...options].sort((a,b) => Number(b.id === props.selectedRoute?.id) - Number(a.id === props.selectedRoute?.id)).entries()) {
        const coordinates = option.geometry.coordinates as Coordinate[]; if (!coordinates.length) continue;
        const fractions = index % 2 ? [.7, .35, .83, .5, .2] : [.45, .75, .25, .6, .85];
        let position = pointAlong(coordinates, fractions[0]), offset: [number, number] = [0, 0], best = -Infinity;
        for (const fraction of fractions) for (const shift of [[0,0],[45,0],[-45,0],[0,40],[0,-40]] as [number,number][]) {
          const candidate = pointAlong(coordinates, fraction), projected = map.project(candidate);
          const x = projected.x + shift[0], y = projected.y + shift[1];
          if (x < 48 || x > bounds.width - 75 || y < 76 || y > bounds.height - 65) continue;
          const separation = occupied.length ? Math.min(...occupied.map(point => Math.hypot((point.x-x), (point.y-y)*1.7))) : 120;
          const score = Math.min(160, separation) - Math.hypot(...shift) * .25;
          if (score > best) { best = score; position = candidate; offset = shift; }
        }
        const projected = map.project(position); occupied.push({x:projected.x + offset[0], y:projected.y + offset[1]});
        const selected = option.id === props.selectedRoute?.id, minutes = Math.max(1, Math.round(option.durationSeconds / 60));
        const element = button(`map-route-label${selected ? ' is-selected' : ''}`, `${option.label}, ${minutes} minutes. Select route.`, `${minutes} min`);
        element.setAttribute('aria-pressed', String(selected));
        element.addEventListener('click', () => current.current.onRouteSelect?.(option.id));
        markers.push(new Marker({ element, anchor: 'center', offset }).setLngLat(position).addTo(map));
      }
    };
    placeLabels(); map.on('moveend', placeLabels);
    return () => { map.off('moveend', placeLabels); markers.forEach(marker => marker.remove()); };
  }, [props.routeOptions, props.selectedRoute, props.baseline, props.showBaseline, props.origin, props.destination, props.departureAt, props.mode, styleVersion, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const features: Feature[] = [], markers: Marker[] = [];
    if (props.showClosures) for (const closure of props.closures) {
      if (closure.status !== 'published') continue;
      const state = closureState(closure, props.departureAt), selected = closure.id === props.selectedClosureId;
      features.push(feature(closure.geometry, { closureId: closure.id, state, selected }));
      if (state === 'ended' && !selected) continue;
      const element = button(`map-closure-marker${state === 'scheduled' ? ' is-scheduled' : ''}${selected ? ' is-selected' : ''}`, `${closure.title} — ${state}. Open restriction.`, '−');
      element.addEventListener('click', () => current.current.onClosureSelect(closure.id));
      markers.push(new Marker({ element, anchor: 'center' }).setLngLat(polygonCentre(closure.geometry)).addTo(map));
    }
    updateSource(map, 'closures', collection(features));
    return () => markers.forEach(marker => marker.remove());
  }, [props.closures, props.selectedClosureId, props.showClosures, props.departureAt, styleVersion, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const drawing = props.drawing, features: Feature[] = [], markers: Marker[] = [];
    if (drawing?.coordinates.length) {
      if (preview?.drawing === drawing) features.push(feature(preview.geometry));
      else if (drawing.kind === 'polygon' && drawing.coordinates.length > 2) features.push(feature({ type: 'Polygon', coordinates: [[...drawing.coordinates, drawing.coordinates[0]]] }));
      else if (drawing.coordinates.length > 1) features.push(feature({ type: 'LineString', coordinates: drawing.coordinates }));
      else features.push(feature({ type: 'Point', coordinates: drawing.coordinates[0] }));
      drawing.coordinates.forEach((point, index) => {
        const element = button('map-vertex', `Restriction point ${index + 1}. Drag, use arrow keys, or edit coordinates in the panel.`, String(index + 1));
        const marker = new Marker({ element, draggable: true, anchor: 'center' }).setLngLat(point).addTo(map);
        const move = (next: Coordinate) => { const latest = current.current.drawing; if (latest) current.current.onDraw({ ...latest, coordinates: latest.coordinates.map((p, i) => i === index ? next : p) }); };
        marker.on('dragend', () => { const p = marker.getLngLat(); move([p.lng, p.lat]); });
        nudgeOnKeys(element, map, () => [marker.getLngLat().lng, marker.getLngLat().lat], move);
        markers.push(marker);
      });
    }
    updateSource(map, 'drawing', collection(features));
    return () => markers.forEach(marker => marker.remove());
  }, [props.drawing, preview, styleVersion, retry]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    updateSource(map, 'trace', traceFeatures(props.recordedPoints));
    const last = props.recordedPoints.at(-1);
    updateSource(map, 'trace-end', last && validCoordinate(last.coordinate) ? collection([feature({ type: 'Point', coordinates: last.coordinate })]) : emptyFeatures());
  }, [props.recordedPoints, styleVersion, retry]);

  useEffect(() => {
    const map = mapRef.current, coordinates = props.focus?.coordinates.filter(validCoordinate);
    if (!map || !coordinates?.length) return;
    if (coordinates.length === 1) map.jumpTo({ center: coordinates[0], zoom: 15, pitch: 0, bearing: 0 });
    else {
      const west = Math.min(...coordinates.map(p => p[0])), east = Math.max(...coordinates.map(p => p[0]));
      const south = Math.min(...coordinates.map(p => p[1])), north = Math.max(...coordinates.map(p => p[1]));
      map.fitBounds([[west, south], [east, north]], { padding: { top: 88, bottom: 80, left: 48, right: 64 }, maxZoom: 16, duration: 0, pitch: 0, bearing: 0 });
    }
  }, [props.focus?.token, retry]);

  useEffect(() => {
    const map = mapRef.current, position = props.navigationPosition;
    if (!map || !position || !validCoordinate(position)) return;
    const element = document.createElement('div'); element.className = 'map-navigation-marker'; element.setAttribute('role', 'img'); element.setAttribute('aria-label', 'Route guidance point');
    const marker = new Marker({ element, anchor: 'center' }).setLngLat(position).addTo(map);
    if (props.followPosition) map.easeTo({ center: position, zoom: Math.max(map.getZoom(), 15), pitch: 0, bearing: 0, duration: reducedMotion() ? 0 : 180 });
    return () => { marker.remove(); };
  }, [props.navigationPosition, props.followPosition, retry]);

  return <>
    <div ref={container} className={`maplibre-map map-theme-${theme}`} role="region" aria-label="Islamabad interactive map. Journey fields and the coordinate editor provide keyboard alternatives." />
    {mapError ? <div className="map-status map-status-error" role="alert"><span>{mapError}</span><button type="button" onClick={() => setRetry(value => value + 1)}>Restart map</button><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></div>
      : tileError ? <div className="map-status map-status-error" role="status">{tileError}</div>
      : styleLoading ? <div className="map-status" role="status">Loading the map…</div>
      : previewError ? <div className="map-status map-status-error" role="status">Restriction preview unavailable. Check the local connection or adjust the drawing before saving.</div> : null}
  </>;
}
