// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { FeatureCollection } from 'geojson';
import type { MapViewProps } from '../src/components/MapView';
import type { Closure, Coordinate, RouteOption } from '../shared/types';
import type { TransitNetwork } from '../shared/transit';
import { createExpression, validateStyleMin, type LayerSpecification } from '@maplibre/maplibre-gl-style-spec';

const maps = vi.hoisted(() => ({ instances: [] as MockMap[], markers: [] as { coordinate: Coordinate; options: { element: HTMLElement }; remove: () => void }[] }));

class MockMap {
  sources = new Map<string, { setData: ReturnType<typeof vi.fn>; data: FeatureCollection }>();
  layers = new Map<string, object>();
  listeners = new Map<string, Set<(event?: unknown) => void>>();
  touchZoomRotate = { disableRotation: vi.fn() };
  keyboard = { disableRotation: vi.fn() };
  doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };
  canvas = document.createElement('canvas');
  remove = vi.fn(); resize = vi.fn(); jumpTo = vi.fn(); fitBounds = vi.fn(); easeTo = vi.fn();
  setStyle = vi.fn(() => this.emit('style.load'));
  constructor(readonly options: { container: HTMLElement; style: { layers: { paint?: object }[] } }) { maps.instances.push(this); }
  addControl() { return this; }
  on(name: string, listener: (event?: unknown) => void) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name)!.add(listener); return this; }
  off(name: string, listener: (event?: unknown) => void) { this.listeners.get(name)?.delete(listener); return this; }
  emit(name: string, event?: unknown) { for (const listener of this.listeners.get(name) ?? []) listener(event); }
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
    constructor(readonly options: { element: HTMLElement }) { options.element.classList.add('maplibregl-marker', 'maplibregl-marker-anchor-center'); maps.markers.push(this); }
    setLngLat(coordinate: Coordinate) { this.coordinate = coordinate; return this; }
    addTo(map: MockMap) { map.options.container.append(this.options.element); return this; } on() { return this; } remove() { this.options.element.remove(); }
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
import { api } from '../src/lib/api';
import * as transitMap from '../src/lib/transitMap';

beforeEach(() => {
  maps.instances.length = 0; maps.markers.length = 0; vi.mocked(loadMapStyle).mockClear();
  vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue({ type: 'FeatureCollection', features: [] });
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

it('adds and removes transit overlays on the retained map, keeping red closures above bus routes', async () => {
  const network: TransitNetwork = { version: 'local-test', importedAt: null, evaluatedAt: departureAt, eventRevision: 0, disruptionRevision: 0, sources: [], disruptions: [], limitations: [],
    routes: [{ id: 'bus', name: 'City bus', shortName: 'B1', agency: 'Test', color: '#2f6fd3', sourceId: 'test', coverage: 'stops-and-shape' }], stops: [{ id: 'a', name: 'First stop', coordinate: [73.03, 33.64] }, { id: 'b', name: 'Last stop', coordinate: [73.05, 33.66] }],
    patterns: [{ id: 'bus-0', routeId: 'bus', directionId: '0', headsign: 'Last stop', stopIds: ['a', 'b'], geometryQuality: 'provided-shape', geometry: { type: 'LineString', coordinates: [[73.03, 33.64], [73.05, 33.66]] } }], statuses: [{ patternId: 'bus-0', availability: 'uncertain', closureIds: ['road'], disruptionIds: [], closureAssessment: 'provided-shape' }] };
  const base = props(), result = render(<MapView {...base} />); await act(async () => {});
  const map = maps.instances[0], source = map.getSource('manzil-transit')!;
  const validation = validateStyleMin({ version: 8, glyphs: 'https://example.com/{fontstack}/{range}.pbf', sources: Object.fromEntries([...map.sources].map(([id, source]) => [id, { type: 'geojson', data: source.data }])), layers: [...map.layers.values()] as LayerSpecification[] });
  expect(validation.map(issue => issue.message)).toEqual([]);
  expect(map.layers.get('manzil-transit-journey-line')).toMatchObject({ source: 'manzil-transit-journey', type: 'line' });
  result.rerender(<MapView {...base} transit={{ network, selectedPatternId: 'bus-0', journey: null, stale: false }} />); await act(async () => {});
  expect(source.data.features[0].properties).toMatchObject({ color: '#697781', selected: true, patternId: 'bus-0' });
  expect(map.getSource('manzil-transit-stops')?.data.features).toHaveLength(2);
  const layers = [...map.layers.keys()]; expect(layers.indexOf('manzil-closure-roads-line')).toBeGreaterThan(layers.indexOf('manzil-transit-line'));
  result.rerender(<MapView {...base} transit={null} />); await act(async () => {});
  expect(source.data.features).toEqual([]); expect(map.getSource('manzil-transit-stops')?.data.features).toEqual([]);
  expect(maps.instances).toHaveLength(1); expect(map.setStyle).toHaveBeenCalledOnce();
});

it('keeps road-aligned bus lines and stops legible, with solid bus strokes and closure precedence', async () => {
  render(<MapView {...props()} mapStyle="minimal" />); await act(async () => {});
  const map = maps.instances[0], layers = [...map.layers.keys()];
  const paint = (id: string) => (map.layers.get(id) as { paint: Record<string, unknown> }).paint;
  const evaluate = (expression: unknown, zoom: number, selected: boolean): number => {
    if (typeof expression === 'number') return expression;
    const parsed = createExpression(expression, 'test.paint');
    if (parsed.result !== 'success') throw new Error(JSON.stringify(parsed.value));
    return parsed.value.evaluate({ zoom }, { type: 'Point', properties: { selected } });
  };
  for (const name of ['manzil-transit-line']) {
    const style = paint(name);
    expect(evaluate(style['line-width'], 11.5, false)).toBeGreaterThanOrEqual(4);
    expect(evaluate(style['line-width'], 11.5, true)).toBeGreaterThanOrEqual(7);
    expect(evaluate(style['line-opacity'], 11.5, false)).toBeGreaterThanOrEqual(.9);
    expect(style['line-color']).toEqual(['get', 'color']);
  }
  const casing = paint('manzil-transit-casing');
  expect(casing['line-color']).not.toBe('#ffffff'); expect(evaluate(casing['line-opacity'], 11.5, false)).toBeLessThanOrEqual(.2);
  const stops = paint('manzil-transit-stops');
  expect(evaluate(stops['circle-radius'], 11.5, false)).toBeGreaterThanOrEqual(2.25);
  expect(evaluate(stops['circle-opacity'], 11.5, false)).toBeGreaterThanOrEqual(.9);
  expect(evaluate(stops['circle-stroke-opacity'], 11.5, false)).toBeGreaterThanOrEqual(.9);
  expect(evaluate(stops['circle-radius'], 9, false)).toBeLessThan(evaluate(stops['circle-radius'], 11.5, false));
  expect(evaluate(stops['circle-opacity'], 9, false)).toBeLessThan(evaluate(stops['circle-opacity'], 11.5, false));
  expect(evaluate(stops['circle-radius'], 9, true)).toBeGreaterThanOrEqual(5); expect(evaluate(stops['circle-opacity'], 9, true)).toBe(1);
  const busLayers = [...map.layers.values()].filter((layer): layer is LayerSpecification & { paint: Record<string, unknown> } => {
    const value = layer as { id: string; type: string; source?: string };
    return value.type === 'line' && ['manzil-transit', 'manzil-transit-journey'].includes(value.source ?? '') && value.id !== 'manzil-transit-walk-line';
  });
  expect(busLayers.length).toBeGreaterThanOrEqual(4);
  for (const layer of busLayers) {
    expect(layer.paint['line-dasharray'], layer.id).toBeUndefined();
    expect(layers.indexOf('manzil-closure-roads-line')).toBeGreaterThan(layers.indexOf(layer.id));
  }
  expect(paint('manzil-transit-walk-line')['line-dasharray']).toEqual([1, 1.4]);
  expect(layers.indexOf('manzil-closure-roads-line')).toBeGreaterThan(layers.indexOf('manzil-transit-stops'));
  const validation = validateStyleMin({ version: 8, glyphs: 'https://example.com/{fontstack}/{range}.pbf', sources: Object.fromEntries([...map.sources].map(([id, source]) => [id, { type: 'geojson', data: source.data }])), layers: [...map.layers.values()] as LayerSpecification[] });
  expect(validation.map(issue => issue.message)).toEqual([]); expect(maps.instances).toHaveLength(1);
});

it('does not rebuild transit sources for an equivalent wrapper or unrelated map UI changes', async () => {
  const network: TransitNetwork = { version: 'stable-transit', importedAt: null, evaluatedAt: departureAt, eventRevision: 0, disruptionRevision: 0, sources: [], disruptions: [], limitations: [],
    routes: [{ id: 'bus', name: 'City bus', shortName: 'B1', agency: 'Test', color: '#2f6fd3', sourceId: 'test', coverage: 'stops-and-shape' }], stops: [{ id: 'a', name: 'First stop', coordinate: [73.03, 33.64] }, { id: 'b', name: 'Last stop', coordinate: [73.05, 33.66] }],
    patterns: [{ id: 'bus-0', routeId: 'bus', directionId: '0', headsign: 'Last stop', stopIds: ['a', 'b'], geometryQuality: 'provided-shape', geometry: { type: 'LineString', coordinates: [[73.03, 33.64], [73.04, 33.64], [73.05, 33.66]] } }], statuses: [{ patternId: 'bus-0', availability: 'available', closureIds: [], disruptionIds: [], closureAssessment: 'provided-shape' }] };
  const build = vi.spyOn(transitMap, 'transitOverlayFeatures');
  try {
    const base = { ...props(), transit: { network, selectedPatternId: null, journey: null, stale: false } };
    const result = render(<MapView {...base} />); await act(async () => {});
    const map = maps.instances[0], before = build.mock.calls.length;
    const sources = ['manzil-transit', 'manzil-transit-stops', 'manzil-transit-journey'].map(id => map.getSource(id)!);
    const writes = sources.map(source => source.setData.mock.calls.length);
    result.rerender(<MapView {...base} theme="dark" departureAt="2026-10-17T12:01:00Z" closures={[]} transit={{ ...base.transit }} />); await act(async () => {});
    expect(build).toHaveBeenCalledTimes(before);
    expect(sources.map(source => source.setData.mock.calls.length)).toEqual(writes);
    result.rerender(<MapView {...base} transit={{ ...base.transit, selectedPatternId: 'bus-0' }} />); await act(async () => {});
    expect(build).toHaveBeenCalledTimes(before + 1);
    expect(sources[0].data.features[0].properties?.selected).toBe(true);
    expect(sources[1].data.features.every(feature => feature.properties?.selected === true)).toBe(true);
    expect(map.setStyle).toHaveBeenCalledOnce(); expect(maps.instances).toHaveLength(1);
  } finally { build.mockRestore(); }
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

it('shows raw location uncertainty below routes and closures, updates it without moving endpoints, and restores it after a style swap', async () => {
  const getCurrentPosition = vi.fn(), watchPosition = vi.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition, watchPosition } });
  const selected = route('current', 0), base = { ...props(), mapStyle: 'minimal' as const, selectedRoute: selected, routeOptions: [selected],
    origin: { name: 'Start', coordinate: selected.snappedOrigin }, destination: { name: 'End', coordinate: selected.snappedDestination }, followPosition: false };
  const raw: Coordinate = [73.04567, 33.65123], next: Coordinate = [73.04613, 33.65189];
  const result = render(<MapView {...base} navigationPosition={raw} navigationAccuracy={500} />); await act(async () => {});
  const map = maps.instances[0], source = map.getSource('manzil-location-accuracy')!;
  expect(source.data.features).toHaveLength(1); expect(source.data.features[0].properties).toEqual({ accuracyMeters: 500 });
  const routeBefore = structuredClone(map.getSource('manzil-routes')!.data);
  const endpointA = maps.markers.find(marker => marker.options.element.classList.contains('map-endpoint-a'))!;
  const endpointB = maps.markers.find(marker => marker.options.element.classList.contains('map-endpoint-b'))!;
  const location = maps.markers.find(marker => marker.options.element.classList.contains('map-navigation-marker'))!;
  expect(location.coordinate).toEqual(raw); expect(location.options.element.getAttribute('aria-label')).toContain('±500 m');
  const order = [...map.layers.keys()];
  for (const id of ['manzil-route-line', 'manzil-closure-roads-line']) {
    expect(order.indexOf('manzil-location-accuracy-fill')).toBeLessThan(order.indexOf(id));
    expect(order.indexOf('manzil-location-accuracy-line')).toBeLessThan(order.indexOf(id));
  }

  result.rerender(<MapView {...base} navigationPosition={next} navigationAccuracy={12} />); await act(async () => {});
  expect(map.getSource('manzil-location-accuracy')).toBe(source); expect(source.data.features[0].properties).toEqual({ accuracyMeters: 12 });
  expect(location.coordinate).toEqual(next); expect(location.options.element.getAttribute('aria-label')).toContain('±12 m');
  expect(endpointA.coordinate).toEqual(selected.snappedOrigin); expect(endpointB.coordinate).toEqual(selected.snappedDestination);
  expect(map.getSource('manzil-routes')!.data).toEqual(routeBefore); expect(base.onEndpointMove).not.toHaveBeenCalled();
  expect(map.easeTo).not.toHaveBeenCalled(); expect(getCurrentPosition).not.toHaveBeenCalled(); expect(watchPosition).not.toHaveBeenCalled();

  // A real style replacement removes GeoJSON sources; model that boundary so
  // this proves the uncertainty is restored even when location itself is stable.
  map.sources.clear(); map.layers.clear();
  result.rerender(<MapView {...base} mapStyle="night" navigationPosition={next} navigationAccuracy={12} />); await act(async () => {});
  const restored = map.getSource('manzil-location-accuracy')!;
  expect(restored).not.toBe(source); expect(restored.data.features).toHaveLength(1);
  expect(restored.data.features[0].properties).toEqual({ accuracyMeters: 12 }); expect(location.coordinate).toEqual(next);
  expect(map.getSource('manzil-routes')!.data).toEqual(routeBefore);
  expect(map.setStyle).toHaveBeenCalledTimes(2); expect(maps.instances).toHaveLength(1);

  result.rerender(<MapView {...base} mapStyle="night" navigationPosition={null} navigationAccuracy={null} />); await act(async () => {});
  expect(restored.data.features).toEqual([]); expect(location.options.element.isConnected).toBe(false);
  expect(endpointA.coordinate).toEqual(selected.snappedOrigin); expect(endpointB.coordinate).toEqual(selected.snappedDestination);
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

const closureFixture = (id: string, scheduled = false): Closure => ({
  id, title: id, reason: 'other', description: '', status: 'published', revision: 1,
  startsAt: scheduled ? '2026-11-18T12:00:00Z' : departureAt, endsAt: '2026-12-18T12:00:00Z', createdAt: departureAt, updatedAt: departureAt,
  geometry: { type: 'Polygon', coordinates: [[[73, 33.6], [73.2, 33.6], [73.2, 33.8], [73, 33.8], [73, 33.6]]] },
});
const closureGeometry = (id: string): FeatureCollection => ({ type: 'FeatureCollection', features: [{ type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[73.03, 33.64], [73.05, 33.64]] }, properties: { closureId: id, title: id } }] });

it('retains MapLibre positioning classes and road anchors across selection, map movement, style and time refreshes', async () => {
  const closure = closureFixture('active'), base = { ...props(), closures: [closure] };
  vi.mocked(api).mockResolvedValue(closureGeometry(closure.id));
  const result = render(<MapView {...base} />); await act(async () => {});
  const map = maps.instances[0], marker = maps.markers.find(item => item.options.element.classList.contains('map-closure-marker'))!;
  expect(marker.coordinate[0]).toBeCloseTo(73.04, 10); expect(marker.coordinate[1]).toBe(33.64);
  expect(marker.options.element.classList.contains('maplibregl-marker')).toBe(true);
  expect(marker.options.element.classList.contains('maplibregl-marker-anchor-center')).toBe(true);
  result.rerender(<MapView {...base} selectedClosureId={closure.id} departureAt="2026-10-17T12:01:00Z" mapStyle="night" />);
  await act(async () => {}); act(() => { map.emit('moveend'); map.emit('zoom'); });
  expect(marker.coordinate[0]).toBeCloseTo(73.04, 10); expect(marker.coordinate[1]).toBe(33.64); expect(marker.options.element.classList.contains('maplibregl-marker')).toBe(true);
  expect(marker.options.element.classList.contains('is-selected')).toBe(true);
  expect(vi.mocked(api)).toHaveBeenCalledOnce();
});

it('keeps future road sections hidden until hover/focus, supports pinned taps, and dismisses outside or on Escape', async () => {
  const closure = closureFixture('future', true), onClosureSelect = vi.fn(), base = { ...props(), closures: [closure], onClosureSelect };
  vi.mocked(api).mockResolvedValue(closureGeometry(closure.id));
  const result = render(<MapView {...base} />); await act(async () => {});
  const map = maps.instances[0], future = result.container.querySelector('.map-closure-marker.is-scheduled')!;
  const yellow = () => map.getSource('manzil-upcoming-roads')!.data.features;
  expect(yellow()).toHaveLength(0); expect(map.getSource('manzil-closure-roads')!.data.features).toHaveLength(0);
  const layerOrder = [...map.layers.keys()];
  expect(layerOrder.indexOf('manzil-upcoming-roads-line')).toBeLessThan(layerOrder.indexOf('manzil-closure-roads-line'));
  expect(vi.mocked(api).mock.calls[0][0]).toContain('includeUpcoming=true');
  fireEvent.mouseEnter(future); expect(yellow()).toHaveLength(1);
  fireEvent.mouseLeave(future); expect(yellow()).toHaveLength(0);
  fireEvent.focus(future); expect(yellow()).toHaveLength(1);
  fireEvent.blur(future); expect(yellow()).toHaveLength(0);
  fireEvent.click(future); fireEvent.mouseLeave(future); expect(yellow()).toHaveLength(1);
  expect(future.getAttribute('aria-pressed')).toBe('true'); expect(onClosureSelect).toHaveBeenCalledWith(closure.id);
  fireEvent.click(future); expect(yellow()).toHaveLength(0); expect(future.getAttribute('aria-pressed')).toBe('false');
  fireEvent.mouseEnter(future); fireEvent.keyDown(document, { key: 'Escape' }); expect(yellow()).toHaveLength(0);
  fireEvent.click(future); expect(yellow()).toHaveLength(1);
  fireEvent.pointerDown(document.body); expect(yellow()).toHaveLength(0);
  fireEvent.focus(future); result.rerender(<MapView {...base} showClosures={false} />); await act(async () => {});
  expect(yellow()).toHaveLength(0); expect(result.container.querySelector('.map-closure-marker')).toBeNull();
  result.rerender(<MapView {...base} />); await act(async () => {}); expect(yellow()).toHaveLength(0);
});

it('switches future inspection to red only when its map time becomes active and suppresses stale edited road geometry', async () => {
  const closure = closureFixture('future', true), base = { ...props(), closures: [closure] };
  vi.mocked(api).mockResolvedValue(closureGeometry(closure.id));
  const result = render(<MapView {...base} />); await act(async () => {});
  const map = maps.instances[0], future = result.container.querySelector('.map-closure-marker')!;
  fireEvent.mouseEnter(future); expect(map.getSource('manzil-upcoming-roads')!.data.features).toHaveLength(1);
  result.rerender(<MapView {...base} departureAt={closure.startsAt} />); await act(async () => {});
  expect(map.getSource('manzil-upcoming-roads')!.data.features).toHaveLength(0);
  expect(map.getSource('manzil-closure-roads')!.data.features).toHaveLength(1);
  expect(future.classList.contains('is-scheduled')).toBe(false); expect(future.classList.contains('maplibregl-marker')).toBe(true);
  vi.mocked(api).mockImplementation(() => new Promise(() => {}));
  result.rerender(<MapView {...base} closures={[{ ...closure, revision: 2 }]} departureAt={closure.startsAt} />); await act(async () => {});
  expect(map.getSource('manzil-closure-roads')!.data.features).toHaveLength(0);
  result.rerender(<MapView {...base} departureAt={closure.endsAt!} />); await act(async () => {});
  expect(result.container.querySelector('.map-closure-marker')).toBeNull();
});

it('keeps Escape and second-tap dismissal latched under a stationary hovered and focused marker', async () => {
  const closure = closureFixture('future', true), base = { ...props(), closures: [closure] };
  vi.mocked(api).mockResolvedValue(closureGeometry(closure.id));
  const result = render(<MapView {...base} />); await act(async () => {});
  const future = result.container.querySelector('.map-closure-marker')!, map = maps.instances[0];
  const yellow = () => map.getSource('manzil-upcoming-roads')!.data.features;
  fireEvent.mouseEnter(future); fireEvent.focus(future); fireEvent.click(future);
  expect(yellow()).toHaveLength(1); expect(future.getAttribute('aria-pressed')).toBe('true');
  fireEvent.keyDown(future, { key: 'Escape' });
  expect(yellow()).toHaveLength(0); expect(future.getAttribute('aria-pressed')).toBe('false');
  // Browsers may repeat entry/focus as the marker's outline/position is updated.
  fireEvent.mouseEnter(future); fireEvent.focus(future);
  result.rerender(<MapView {...base} selectedClosureId={closure.id} departureAt="2026-10-17T12:01:00Z" />); await act(async () => {});
  expect(yellow()).toHaveLength(0); expect(future.classList.contains('is-previewing')).toBe(false);
  fireEvent.mouseLeave(future); fireEvent.mouseEnter(future); expect(yellow()).toHaveLength(1);
  fireEvent.keyDown(future, { key: 'Escape' }); expect(yellow()).toHaveLength(0);
  fireEvent.blur(future); fireEvent.focus(future); expect(yellow()).toHaveLength(1);
  fireEvent.click(future); fireEvent.click(future); expect(yellow()).toHaveLength(0);
  fireEvent.focus(future); fireEvent.mouseEnter(future);
  expect(yellow()).toHaveLength(0); expect(future.classList.contains('is-previewing')).toBe(false);
});

it('ignores a late upcoming-road response after its revision has changed', async () => {
  const closure = closureFixture('future', true), base = { ...props(), closures: [closure] };
  let oldResolve!: (data: FeatureCollection) => void;
  vi.mocked(api).mockImplementationOnce(() => new Promise(resolve => { oldResolve = resolve; }));
  const result = render(<MapView {...base} />); await act(async () => {});
  const latest = closureGeometry(closure.id);
  latest.features[0].geometry = { type: 'LineString', coordinates: [[73.06, 33.66], [73.08, 33.66]] };
  vi.mocked(api).mockResolvedValue(latest);
  result.rerender(<MapView {...base} closures={[{ ...closure, revision: 2 }]} />); await act(async () => {});
  const marker = maps.markers.find(item => item.options.element.classList.contains('map-closure-marker'))!;
  fireEvent.mouseEnter(marker.options.element);
  expect(maps.instances[0].getSource('manzil-upcoming-roads')!.data.features).toEqual(latest.features);
  await act(async () => oldResolve(closureGeometry(closure.id)));
  expect(maps.instances[0].getSource('manzil-upcoming-roads')!.data.features).toEqual(latest.features);
  expect(marker.coordinate[0]).toBeCloseTo(73.07, 10); expect(marker.coordinate[1]).toBe(33.66);
});
