import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Closure, Coordinate, Drawing, MapFocus, MapMode, Place, RecordedPoint, RouteOption, RoutePath } from '../../shared/types';
import { closureState } from '../lib/format';
import { api } from '../lib/api';
import type { Polygon } from 'geojson';

export interface MapViewProps {
  mode: MapMode; origin: Place | null; destination: Place | null;
  closures: Closure[]; selectedClosureId: string | null;
  selectedRoute: RouteOption | null; baseline: RoutePath | null;
  drawing: Drawing | null; departureAt: string; focus: MapFocus | null;
  showClosures: boolean; showBaseline: boolean; recordedPoints: RecordedPoint[];
  onPick: (coordinate: Coordinate) => void; onDraw: (drawing: Drawing) => void;
  onEndpointMove: (letter: 'A' | 'B', coordinate: Coordinate) => void;
  onClosureSelect: (id: string) => void; onReady?: () => void;
}
const latLng = (point: Coordinate): L.LatLngTuple => [point[1], point[0]];
const endpointIcon = (letter: string) => L.divIcon({ className: `endpoint-marker marker-${letter}`, html: `<span><b>${letter}</b></span>`, iconSize: [34, 40], iconAnchor: [17, 39] });

export default function MapView(props: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const current = useRef(props); current.current = props;
  const layers = useRef<{ endpoints: L.LayerGroup; events: L.LayerGroup; routes: L.LayerGroup; draw: L.LayerGroup; recording: L.LayerGroup } | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [preview, setPreview] = useState<Polygon | null>(null);
  useEffect(() => {
    setPreview(null);
    const drawing = props.drawing;
    if (!drawing || drawing.coordinates.length < (drawing.kind === 'point' ? 1 : drawing.kind === 'line' ? 2 : 3)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<Polygon>('/geometry', { method: 'POST', body: JSON.stringify(drawing), signal: controller.signal }).then(setPreview).catch(() => {});
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [props.drawing]);
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { center: [33.699, 73.052], zoom: 13, minZoom: 6, maxZoom: 19, zoomControl: false, preferCanvas: true, attributionControl: true });
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 100 }).addTo(map);
    const key = import.meta.env.VITE_MAPTILER_KEY;
    const tiles = L.tileLayer(key ? `https://api.maptiler.com/maps/dataviz-v4-light/256/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}` : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      tileSize: 256, maxZoom: 19, updateWhenIdle: true, keepBuffer: 2,
      attribution: key ? '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' : '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    }).addTo(map);
    let tileErrors = 0;
    tiles.on('tileerror', () => { tileErrors++; if (tileErrors > 3) setTilesFailed(true); });
    tiles.on('tileload', () => { tileErrors = 0; setTilesFailed(false); });
    layers.current = { endpoints: L.layerGroup().addTo(map), events: L.layerGroup().addTo(map), routes: L.layerGroup().addTo(map), draw: L.layerGroup().addTo(map), recording: L.layerGroup().addTo(map) };
    map.on('click', (e: L.LeafletMouseEvent) => {
      const p = current.current; const coordinate: Coordinate = [e.latlng.lng, e.latlng.lat];
      if (p.mode === 'origin' || p.mode === 'destination') p.onPick(coordinate);
      if (p.mode === 'point' || p.mode === 'line' || p.mode === 'polygon') {
        const points = p.mode === 'point' ? [coordinate] : [...(p.drawing?.kind === p.mode ? p.drawing.coordinates : []), coordinate];
        p.onDraw({ kind: p.mode, coordinates: points, widthMeters: p.drawing?.widthMeters ?? 45 });
      }
    });
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false })); observer.observe(container.current);
    current.current.onReady?.();
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; layers.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const element = mapRef.current.getContainer();
    element.classList.toggle('map-drawing', ['point', 'line', 'polygon'].includes(props.mode));
    element.classList.toggle('map-picking', ['origin', 'destination'].includes(props.mode));
  }, [props.mode]);
  useEffect(() => {
    const group = layers.current?.endpoints; if (!group) return; group.clearLayers();
    for (const [place, letter] of [[props.origin, 'A'], [props.destination, 'B']] as const) {
      if (!place) continue;
      const marker = L.marker(latLng(place.coordinate), { icon: endpointIcon(letter), keyboard: true, title: `${letter}: ${place.name}`, draggable: true }).addTo(group);
      const label = document.createElement('span'); label.textContent = place.name;
      marker.bindTooltip(label, { direction: 'top', offset: [0, -34] });
      marker.on('dragend', () => {
        const position = marker.getLatLng();
        current.current.onEndpointMove(letter, [position.lng, position.lat]);
      });
    }
  }, [props.origin, props.destination]);
  useEffect(() => {
    const group = layers.current?.events; if (!group) return; group.clearLayers();
    if (!props.showClosures) return;
    for (const closure of props.closures) {
      if (closure.status === 'cancelled' || closure.status === 'draft') continue;
      const state = closureState(closure, props.departureAt);
      const color = state === 'active' ? '#bc4a36' : state === 'scheduled' ? '#bd7526' : '#87948b';
      const selected = props.selectedClosureId === closure.id;
      const polygon = L.geoJSON(closure.geometry, { style: { color, weight: selected ? 3 : 2, opacity: state === 'ended' ? .45 : .9, fillColor: color, fillOpacity: selected ? .24 : .14, dashArray: state === 'scheduled' ? '6 5' : undefined } }).addTo(group);
      const label = document.createElement('span'); label.textContent = `${closure.title} · ${state}`;
      polygon.bindTooltip(label, { sticky: true });
      polygon.on('click', (event: L.LeafletMouseEvent) => { if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent); current.current.onClosureSelect(closure.id); });
      if (selected || state === 'active') {
        const center = polygon.getBounds().getCenter();
        const marker = L.marker(center, { icon: L.divIcon({ className: 'closure-marker', html: '<span aria-hidden="true">—</span>', iconSize: [25, 25], iconAnchor: [12, 12] }), title: closure.title }).addTo(group);
        marker.on('click', () => current.current.onClosureSelect(closure.id));
      }
    }
  }, [props.closures, props.selectedClosureId, props.showClosures, props.departureAt]);
  useEffect(() => {
    const group = layers.current?.routes; if (!group) return; group.clearLayers();
    if (props.baseline && props.showBaseline) L.geoJSON(props.baseline.geometry, { style: { color: '#7b8987', opacity: .75, weight: 4, dashArray: '6 8' }, interactive: false }).addTo(group);
    if (props.selectedRoute) {
      L.geoJSON(props.selectedRoute.geometry, { style: { color: '#ffffff', weight: 9, opacity: .9 }, interactive: false }).addTo(group);
      L.geoJSON(props.selectedRoute.geometry, { style: { color: '#276852', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }, interactive: false }).addTo(group);
      for (const [place, snap] of [[props.origin, props.selectedRoute.snappedOrigin], [props.destination, props.selectedRoute.snappedDestination]] as const) {
        if (place && snap) L.polyline([latLng(place.coordinate), latLng(snap)], { color: '#4b7565', weight: 2, dashArray: '2 5', opacity: .7, interactive: false }).addTo(group);
      }
    }
  }, [props.selectedRoute, props.baseline, props.showBaseline, props.origin, props.destination]);
  useEffect(() => {
    const group = layers.current?.draw; if (!group) return; group.clearLayers();
    const drawing = props.drawing; if (!drawing?.coordinates.length) return;
    const points = drawing.coordinates.map(latLng);
    if (preview) L.geoJSON(preview, { style: { color: '#b36728', weight: 2, fillOpacity: .16, dashArray: '6 5' }, interactive: false }).addTo(group);
    else if (drawing.kind === 'point') L.circle(points[0], { radius: drawing.widthMeters / 2, color: '#b36728', fillOpacity: .16, weight: 2, dashArray: '6 5', interactive: false }).addTo(group);
    else if (drawing.kind === 'polygon' && points.length > 2) L.polygon(points, { color: '#b36728', weight: 2, fillOpacity: .15, dashArray: '6 5', interactive: false }).addTo(group);
    else L.polyline(points, { color: '#b36728', weight: 5, opacity: .8, dashArray: '6 5', interactive: false }).addTo(group);
    drawing.coordinates.forEach((point, index) => {
      const marker = L.marker(latLng(point), { icon: L.divIcon({ className: 'vertex-marker', html: `<span>${index + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }), draggable: true, title: `Closure point ${index + 1}` }).addTo(group);
      marker.on('dragend', () => {
        const position = marker.getLatLng(); const next = current.current.drawing; if (!next) return;
        current.current.onDraw({ ...next, coordinates: next.coordinates.map((coord, i) => i === index ? [position.lng, position.lat] : coord) });
      });
    });
  }, [props.drawing, preview]);
  useEffect(() => {
    const group = layers.current?.recording; if (!group) return; group.clearLayers();
    if (props.recordedPoints.length > 1) L.polyline(props.recordedPoints.map(p => latLng(p.coordinate)), { color: '#527bb0', weight: 4, opacity: .8 }).addTo(group);
    const last = props.recordedPoints.at(-1);
    if (last) L.circleMarker(latLng(last.coordinate), { color: '#fff', fillColor: '#527bb0', fillOpacity: 1, weight: 3, radius: 7 }).addTo(group);
  }, [props.recordedPoints]);
  useEffect(() => {
    const focus = props.focus; if (!focus?.coordinates.length || !mapRef.current) return;
    const points = focus.coordinates.map(latLng);
    if (points.length === 1) mapRef.current.setView(points[0], 15, { animate: false });
    else mapRef.current.fitBounds(L.latLngBounds(points), { padding: [48, 70], maxZoom: 16, animate: false });
  }, [props.focus?.token]);
  return <><div ref={container} className="leaflet-map" role="region" aria-label="Islamabad interactive map. Use the journey fields or coordinate editor as keyboard alternatives." tabIndex={0} />
    {tilesFailed && <div className="tile-warning" role="status">Map tiles are unavailable. Check your internet connection; local routing and saved data still work.</div>}
    {import.meta.env.VITE_MAPTILER_KEY && <a className="maptiler-logo" href="https://www.maptiler.com/" target="_blank" rel="noreferrer">MapTiler</a>}
  </>;
}
