// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { FeatureCollection } from 'geojson';
import type { MapViewProps } from '../src/components/MapView';
import type { Coordinate, RouteOption } from '../shared/types';

const maps = vi.hoisted(() => ({ instances: [] as MockMap[] }));

class MockMap {
  sources = new Map<string, { setData: ReturnType<typeof vi.fn>; data: FeatureCollection }>();
  layers = new Map<string, object>();
  listeners = new Map<string, Set<() => void>>();
  touchZoomRotate = { disableRotation: vi.fn() };
  keyboard = { disableRotation: vi.fn() };
  doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };
  canvas = document.createElement('canvas');
  remove = vi.fn(); resize = vi.fn(); jumpTo = vi.fn(); fitBounds = vi.fn(); easeTo = vi.fn();
  setStyle = vi.fn(() => this.emit('style.load'));
  constructor(readonly options: { container: HTMLElement; style: { layers: { paint?: object }[] } }) { maps.instances.push(this); }
  addControl() { return this; }
  on(name: string, listener: () => void) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name)!.add(listener); return this; }
  off(name: string, listener: () => void) { this.listeners.get(name)?.delete(listener); return this; }
  emit(name: string) { for (const listener of this.listeners.get(name) ?? []) listener(); }
  getSource(id: string) { return this.sources.get(id); }
  addSource(id: string, source: { data: FeatureCollection }) {
    const value = { data: source.data, setData: vi.fn((data: FeatureCollection) => { value.data = data; }) }; this.sources.set(id, value);
  }
  getLayer(id: string) { return this.layers.get(id); }
  addLayer(layer: { id: string }) { this.layers.set(layer.id, layer); }
  getContainer() { return this.options.container; }
  getCanvas() { return this.canvas; }
  project(point: Coordinate) { return { x: (point[0] - 73) * 10000, y: (point[1] - 33.6) * 10000 }; }
}

vi.mock('maplibre-gl', () => ({
  Map: class { constructor(options: ConstructorParameters<typeof MockMap>[0]) { return new MockMap(options); } },
  Marker: class {
    coordinate: Coordinate = [0, 0];
    constructor(readonly options: { element: HTMLElement }) {}
    setLngLat(coordinate: Coordinate) { this.coordinate = coordinate; return this; }
    addTo() { return this; } on() { return this; } remove() {}
    getElement() { return this.options.element; }
    getLngLat() { return { lng: this.coordinate[0], lat: this.coordinate[1] }; }
  },
  NavigationControl: class {}, ScaleControl: class {}, AttributionControl: class {},
  setWorkerUrl: vi.fn(), setWorkerCount: vi.fn(),
}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: 'mock-worker' }));
vi.mock('../src/lib/api', () => ({ api: vi.fn() }));
vi.mock('../src/lib/mapStyle', async importOriginal => ({
  ...await importOriginal<typeof import('../src/lib/mapStyle')>(),
  loadMapStyle: vi.fn(async () => ({ version: 8, sources: {}, layers: [] })),
}));

import MapView from '../src/components/MapView';
import { loadMapStyle } from '../src/lib/mapStyle';

beforeEach(() => {
  maps.instances.length = 0; vi.mocked(loadMapStyle).mockClear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const departureAt = '2026-10-17T12:00:00Z';
const route = (id: string, delta: number): RouteOption => ({
  id, kind: 'alternative', label: 'Alternative', validation: 'clear', warnings: [],
  geometry: { type: 'LineString', coordinates: [[73.03, 33.64], [73.04 + delta, 33.65], [73.05, 33.66]] },
  distanceMeters: 1000, durationSeconds: 180, departureAt, arrivalAt: '2026-10-17T12:03:00Z', steps: [],
  snappedOrigin: [73.03, 33.64], snappedDestination: [73.05, 33.66],
});
const props = (): MapViewProps => ({
  mode: 'browse', origin: null, destination: null, closures: [], selectedClosureId: null,
  selectedRoute: null, baseline: null, drawing: null, departureAt, focus: null,
  showClosures: true, showBaseline: true, recordedPoints: [],
  onPick: vi.fn(), onDraw: vi.fn(), onEndpointMove: vi.fn(), onClosureSelect: vi.fn(),
});

it('retains the map, style and overlay sources across route switches, polling and app theme changes', async () => {
  const first = route('first', 0), second = route('second', .002);
  const base = { ...props(), mapStyle: 'minimal' as const, routeOptions: [first, second], selectedRoute: first, theme: 'light' as const };
  const result = render(<MapView {...base} />);
  await act(async () => {});
  expect(maps.instances).toHaveLength(1);
  const map = maps.instances[0], source = map.getSource('manzil-routes')!;
  expect(map.setStyle).toHaveBeenCalledOnce();
  expect(source.data.features.map(feature => feature.properties?.selected)).toEqual([true, false]);
  const calls = source.setData.mock.calls.length;

  result.rerender(<MapView {...base} theme="dark" closures={[]} routeOptions={structuredClone(base.routeOptions)} />);
  await act(async () => {});
  expect(source.setData).toHaveBeenCalledTimes(calls);
  result.rerender(<MapView {...base} theme="dark" selectedRoute={second} />);
  await act(async () => {});
  expect(source.data.features.map(feature => feature.properties?.selected)).toEqual([false, true]);
  expect(map.getSource('manzil-routes')).toBe(source);
  expect(map.setStyle).toHaveBeenCalledOnce(); expect(loadMapStyle).toHaveBeenCalledOnce();
  expect(map.remove).not.toHaveBeenCalled(); expect(maps.instances).toHaveLength(1);

  result.rerender(<MapView {...base} mapDetail="standard" />);
  await act(async () => {});
  expect(map.setStyle).toHaveBeenCalledTimes(2);
  expect(map.getSource('manzil-routes')).toBe(source);
});

it('starts missing preferences with a Classic backdrop and avoids equivalent Classic alias reloads', async () => {
  const base = props(); const result = render(<MapView {...base} />);
  await act(async () => {});
  const map = maps.instances[0];
  expect(map.options.style.layers[0].paint).toEqual({ 'background-color': '#eef0ed' });
  result.rerender(<MapView {...base} mapStyle="streets" />); await act(async () => {});
  expect(map.setStyle).toHaveBeenCalledOnce();
  result.rerender(<MapView {...base} mapStyle="contrast" />); await act(async () => {});
  result.rerender(<MapView {...base} mapStyle="outdoors" />); await act(async () => {});
  expect(map.setStyle).toHaveBeenCalledOnce();
  result.rerender(<MapView {...base} mapStyle="night" />); await act(async () => {});
  expect(map.setStyle).toHaveBeenCalledTimes(2);
  expect(maps.instances).toHaveLength(1);
});

it('keeps a clear blue route during passive refresh without pending labels or rebuilding the map', async () => {
  const selected = route('current', 0), base = { ...props(), routeOptions: [selected], selectedRoute: selected };
  const result = render(<MapView {...base} />); await act(async () => {});
  const map = maps.instances[0], source = map.getSource('manzil-routes')!;
  result.rerender(<MapView {...base} departureAt="2026-10-17T12:01:00Z" refreshing />); await act(async () => {});
  expect(source.data.features).toHaveLength(1); expect(source.data.features[0].properties).toMatchObject({ selected: true, pending: false });
  expect(map.setStyle).toHaveBeenCalledOnce(); expect(maps.instances).toHaveLength(1);
  result.rerender(<MapView {...base} departureAt="2026-10-17T12:01:00Z" updating />); await act(async () => {});
  expect(source.data.features[0].properties?.pending).toBe(true);
});

it('draws recorded history green with a white halo and separate start/end markers, fitting all supplied coordinates', async () => {
  const recordedPoints = [
    { coordinate: [73.03, 33.64] as Coordinate, timestamp: departureAt, accuracy: 8 },
    { coordinate: [73.031, 33.641] as Coordinate, timestamp: '2026-10-17T12:00:30Z', accuracy: 8 },
    { coordinate: [73.032, 33.64] as Coordinate, timestamp: '2026-10-17T12:01:00Z', accuracy: 8 },
  ];
  const focus = { token: 1, coordinates: recordedPoints.map(point => point.coordinate) };
  const result = render(<MapView {...props()} recordedPoints={recordedPoints} focus={focus} />); await act(async () => {});
  const map = maps.instances[0];
  expect(map.getSource('manzil-trace')?.data.features[0].geometry).toEqual({ type: 'MultiLineString', coordinates: [recordedPoints.map(point => point.coordinate)] });
  expect(map.getSource('manzil-trace-end')?.data.features.map(feature => feature.properties?.endpoint)).toEqual(['start', 'end']);
  expect(map.layers.get('manzil-trace-line')).toMatchObject({ paint: { 'line-color': '#12bd78', 'line-width': 9 } });
  expect(map.layers.get('manzil-trace-casing')).toMatchObject({ paint: { 'line-color': '#ffffff', 'line-width': 14 } });
  expect(map.fitBounds).toHaveBeenCalledWith([[73.03, 33.64], [73.032, 33.641]], expect.objectContaining({ duration: 0, padding: { top: 88, bottom: 140, left: 48, right: 104 } }));
  expect(map.layers.get('manzil-route-line')).toMatchObject({ paint: { 'line-color': '#2563eb' } });
  Object.defineProperty(map.options.container, 'clientHeight', { configurable: true, value: 300 });
  result.rerender(<MapView {...props()} recordedPoints={recordedPoints} focus={{ ...focus, token: 2 }} />); await act(async () => {});
  expect(map.fitBounds).toHaveBeenLastCalledWith([[73.03, 33.64], [73.032, 33.641]], expect.objectContaining({ padding: { top: 60, bottom: 90, left: 48, right: 104 } }));
  result.rerender(<MapView {...props()} focus={{ ...focus, token: 3 }} />); await act(async () => {});
  expect(map.fitBounds).toHaveBeenLastCalledWith([[73.03, 33.64], [73.032, 33.641]], expect.objectContaining({ padding: { top: 88, bottom: 80, left: 48, right: 104 } }));
});
