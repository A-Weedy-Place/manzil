// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Trip } from '../shared/types';
import { tripTraceBounds, tripTraceSections } from '../src/lib/tripTrace';

const mock = vi.hoisted(() => ({ fail: false, wait: false, instances: [] as FakeMap[], style: vi.fn() }));
class FakeMap {
  handlers = new Map<string, (() => void)[]>(); layers: { id: string; paint: Record<string, unknown> }[] = [];
  remove = vi.fn(); addSource = vi.fn(); canvas = document.createElement('canvas');
  constructor(readonly options: { container: HTMLElement; canvasContextAttributes: object; bounds: number[][] }) {
    if (mock.fail) throw new Error('No WebGL'); mock.instances.push(this);
    queueMicrotask(() => { if (!mock.wait) this.emit('load'); });
  }
  on(name: string, listener: () => void) { this.handlers.set(name, [...(this.handlers.get(name) ?? []), listener]); return this; }
  once(name: string, listener: () => void) { return this.on(name, listener); }
  emit(name: string) { this.handlers.get(name)?.forEach(listener => listener()); }
  triggerRepaint() { queueMicrotask(() => this.emit('idle')); }
  addLayer(layer: { id: string; paint: Record<string, unknown> }) { this.layers.push(layer); }
  getCanvas() { return this.canvas; }
  project(coordinate: number[]) { return { x: 120 + (coordinate[0] - 73) * 10000, y: 120 + (coordinate[1] - 33.7) * 10000 }; }
}
vi.mock('maplibre-gl', () => ({ Map: FakeMap }));
vi.mock('../src/lib/mapStyle', () => ({ loadMapStyle: mock.style }));
import { renderTripShareImage } from '../src/lib/tripShareImage';

const at = '2026-10-17T08:00:00Z';
const trip: Trip = { id: 'private-trip', name: 'F-8 → Blue Area', startedAt: at, endedAt: '2026-10-17T08:01:00Z', createdAt: at,
  points: [{ coordinate: [73, 33.7], timestamp: at, accuracy: 10 }, { coordinate: [73.001, 33.701], timestamp: '2026-10-17T08:00:30Z', accuracy: 10 }, { coordinate: [73.002, 33.702], timestamp: '2026-10-17T08:01:00Z', accuracy: 10 }],
  contributeToRoadDiscovery: false, distanceMeters: 300, durationSeconds: 60, gaps: 0 };
let context: Record<string, unknown> & { fillText: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };
beforeEach(() => {
  mock.fail = false; mock.wait = false; mock.instances.length = 0; mock.style.mockReset().mockResolvedValue({ version: 8, sources: {}, layers: [] });
  context = { fillText: vi.fn(), drawImage: vi.fn(), measureText: (value: string) => ({ width: value.length * 12 }) };
  for (const method of ['fillRect', 'beginPath', 'roundRect', 'fill', 'stroke', 'moveTo', 'lineTo', 'arc', 'save', 'restore', 'clip']) context[method] = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['png'], { type: 'image/png' })));
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    removeAttribute() {}
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.replaceChildren(); });

it('renders an attributed actual basemap with green route and PNG branding, then disposes of its map', async () => {
  const controller = new AbortController(), image = await renderTripShareImage(trip, { signal: controller.signal, mapStyle: 'minimal' });
  expect(image.basemap).toBe('map'); expect(image.blob.type).toBe('image/png');
  const map = mock.instances[0]; expect(map.options.canvasContextAttributes).toEqual({ preserveDrawingBuffer: true });
  expect(map.options.bounds).toEqual([[73, 33.7], [73.002, 33.702]]);
  expect(map.layers.find(layer => layer.id === 'share-trip-line')?.paint['line-color']).toBe('#12bd78');
  expect(map.remove).toHaveBeenCalledOnce(); expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  const text = context.fillText.mock.calls.map(call => call[0]).join(' ');
  expect(text).toContain('manzil.'); expect(text).toContain('OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors'); expect(text).toContain('F-8'); expect(text).toContain('Blue Area'); expect(text).toContain('17 Oct 2026');
  expect(mock.style).toHaveBeenCalledWith('minimal', 'clean', expect.any(AbortSignal));
});

it('uses an explicitly labelled geographic illustration only when WebGL or tiles are unavailable', async () => {
  mock.fail = true;
  const image = await renderTripShareImage({ ...trip, demoData: true }, { signal: new AbortController().signal });
  expect(image.basemap).toBe('illustration'); expect(image.blob.type).toBe('image/png');
  const text = context.fillText.mock.calls.map(call => call[0]).join(' ');
  expect(text).toContain('Route illustration · basemap unavailable'); expect(text).toContain('Simulated journey · fictional GPS and fuel estimate');
  expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
});

it('aborts without producing a fallback or retaining a map when the user leaves', async () => {
  mock.wait = true; const controller = new AbortController();
  const promise = renderTripShareImage(trip, { signal: controller.signal });
  await vi.waitFor(() => expect(mock.instances).toHaveLength(1));
  controller.abort(); await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  expect(mock.instances[0].remove).toHaveBeenCalledOnce(); expect(context.fillText).not.toHaveBeenCalled(); expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
});

it('bounds a stalled tile render and clears the temporary map before offering an illustration', async () => {
  vi.useFakeTimers(); mock.wait = true;
  const promise = renderTripShareImage(trip, { signal: new AbortController().signal });
  await vi.advanceTimersByTimeAsync(10001);
  expect((await promise).basemap).toBe('illustration'); expect(mock.instances[0].remove).toHaveBeenCalledOnce();
  expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
});

it('bounds even a style request that ignores cancellation without leaving an offscreen map', async () => {
  vi.useFakeTimers(); mock.style.mockReturnValue(new Promise(() => {}));
  const promise = renderTripShareImage(trip, { signal: new AbortController().signal });
  await vi.advanceTimersByTimeAsync(15001);
  expect((await promise).basemap).toBe('illustration'); expect(mock.instances).toHaveLength(0);
  expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
});

it('never joins recording gaps or invalid fixes and bounds the whole trace rather than endpoints only', () => {
  const data = [trip.points[0], { ...trip.points[1], coordinate: [73.05, 33.74] as [number, number] }, trip.points[2]];
  expect(tripTraceBounds(data)).toEqual([[73, 33.7], [73.05, 33.74]]);
  expect(tripTraceSections([...trip.points, { coordinate: [73.003, 33.703], timestamp: '2026-10-17T08:10:00Z', accuracy: 10 }])).toEqual([trip.points.map(point => point.coordinate)]);
  expect(tripTraceSections([trip.points[0], { ...trip.points[1], accuracy: 200 }, trip.points[2]])).toEqual([]);
  expect(tripTraceSections([{ ...trip.points[0], timestamp: 'invalid' }, trip.points[1], trip.points[2]])).toEqual([[trip.points[1].coordinate, trip.points[2].coordinate]]);
});
