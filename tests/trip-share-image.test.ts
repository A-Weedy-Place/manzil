// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Trip } from '../shared/types';
import type { WeatherReading } from '../shared/weather';
import { tripTraceBounds, tripTraceSections } from '../src/lib/tripTrace';
import { drawTripShareWeather } from '../src/lib/tripShareWeather';

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
  for (const method of ['fillRect', 'beginPath', 'closePath', 'roundRect', 'fill', 'stroke', 'moveTo', 'lineTo', 'arc', 'bezierCurveTo', 'translate', 'scale', 'save', 'restore', 'clip']) context[method] = vi.fn();
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

it('keeps the journey eyebrow below the circular logo without moving the map or journey title', async () => {
  await renderTripShareImage(trip, { signal: new AbortController().signal });
  const logo = context.drawImage.mock.calls.find(call => call[1] === 51 && call[2] === 37);
  const eyebrow = context.fillText.mock.calls.find(call => call[0] === 'MY JOURNEY');
  const title = context.fillText.mock.calls.find(call => call[0] === trip.name);
  expect(logo).toBeDefined(); expect(eyebrow?.[2] - 22).toBeGreaterThan(37 + 78 + 12);
  expect(title?.[2]).toBe(204); expect(title?.[2] - 36).toBeGreaterThan(eyebrow?.[2] + 10);
  expect(context.drawImage.mock.calls.some(call => call[1] === 36 && call[2] === 240 && call[4] === 640)).toBe(true);
});

const weather: WeatherReading = { location: 'Islamabad', coordinate: [73.0479, 33.6844], at: '2026-10-17T08:00:00Z',
  temperatureC: 24.4, weatherCode: 61, isDay: true, fetchedAt: '2026-10-17T07:30:00Z', source: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/' };

it('shares the saved trip temperature with a native rain symbol and weather source, without requesting fresh weather', async () => {
  const fetch = vi.fn(() => { throw new Error('Sharing must not request weather'); }); vi.stubGlobal('fetch', fetch);
  const reading = Object.freeze({ ...weather });
  await renderTripShareImage({ ...trip, weather: reading }, { signal: new AbortController().signal });
  expect(fetch).not.toHaveBeenCalled(); expect(reading).toEqual(weather);
  const saved = context.fillText.mock.calls.find(call => call[0] === 'Islamabad · 24°C');
  expect(saved).toEqual(['Islamabad · 24°C', 1020, 155]);
  expect(context.fillText).toHaveBeenCalledWith('Weather · Open-Meteo model · open-meteo.com', 1032, 1314);
  expect(context.bezierCurveTo).toHaveBeenCalled();
  expect(context.lineTo).toHaveBeenCalledWith(8, 39); // rain beneath the cloud
});

it('omits weather for legacy history and invalid snapshots instead of substituting today’s temperature', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await renderTripShareImage(trip, { signal: new AbortController().signal });
  const text = context.fillText.mock.calls.map(call => call[0]).join(' ');
  expect(text).not.toContain('Islamabad ·'); expect(text).not.toContain('Open-Meteo'); expect(fetch).not.toHaveBeenCalled();
  context.fillText.mockClear();
  expect(drawTripShareWeather(context as unknown as CanvasRenderingContext2D, { ...weather, temperatureC: Number.NaN }, 1080, 1360)).toBe(false);
  expect(context.fillText).not.toHaveBeenCalled();
});

it.each([
  ['sun', 0, true], ['moon', 0, false], ['cloud-sun', 2, true], ['cloud-moon', 2, false], ['cloud', 3, true],
  ['fog', 45, true], ['drizzle', 51, true], ['rain', 65, true], ['snow', 75, true], ['thunderstorm', 95, true], ['unknown', 999, true],
])('renders the %s diagram locally from its saved condition', (_name, weatherCode, isDay) => {
  expect(drawTripShareWeather(context as unknown as CanvasRenderingContext2D, { ...weather, weatherCode: weatherCode as number, isDay: isDay as boolean }, 1080, 1360)).toBe(true);
  expect(context.translate).toHaveBeenCalled(); expect(context.scale).toHaveBeenCalledWith(.85, .85);
  expect(context.fillText).toHaveBeenCalledWith('Islamabad · 24°C', 1020, 155);
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
