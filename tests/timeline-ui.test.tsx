// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AppState, Closure, PlanRequest, PlanResponse, RouteOption } from '../shared/types';
import type { MapViewProps } from '../src/components/MapView';
import App from '../src/App';
import PlanAheadTime from '../src/components/PlanAheadTime';
import { signInDevelopment, signOut } from '../src/lib/auth';
import { setLanguage } from '../src/lib/language';

const capture = vi.hoisted(() => ({ props: null as MapViewProps | null }));
vi.mock('../src/components/MapView', () => ({ default: (props: MapViewProps) => {
  capture.props = props;
  return <div data-testid="map" />;
} }));

const now = '2026-10-17T10:00:00.000Z';
const futureInput = '2026-10-18T17:30';
const future = '2026-10-18T12:30:00.000Z';
const closure: Closure = {
  id: 'tomorrow-road', revision: 1, title: 'Tomorrow Road', description: 'Fixture restriction', reason: 'construction',
  status: 'published', startsAt: '2026-10-18T12:00:00.000Z', endsAt: '2026-10-18T13:00:00.000Z', createdAt: now, updatedAt: now,
  geometry: { type: 'Polygon', coordinates: [[[73, 33.7], [73.001, 33.7], [73.001, 33.701], [73, 33.7]]] },
  drawing: { kind: 'line', coordinates: [[73, 33.7], [73.001, 33.701]], widthMeters: 14 },
};
const state: AppState = {
  closures: [closure], commutes: [], alerts: [], notices: [], trips: [], eventRevision: 1,
  profile: { id: 'local', displayName: 'Traveller', theme: 'light', mapDetail: 'clean', mapStyle: 'outdoors', browserNotifications: false, collectTravelData: false, inferFrequentRoutes: false, transport: 'car', createdAt: now, updatedAt: now },
  graph: { ready: true, version: 'fixture', source: 'fixture', nodeCount: 2, edgeCount: 2, importedAt: now, bounds: [72.97, 33.6, 73.16, 33.75], limitations: [] },
  sourceStatus: { enabled: false, state: 'disabled', intervalMinutes: 15, profileUrl: '', lastAttemptAt: null, lastSuccessAt: null, nextCheckAt: null, message: '', noticesCollected: 0, coverage: 'partial' },
};
function route(at: string, id = 'route'): RouteOption {
  return { id, kind: 'direct', label: 'Recommended', validation: 'clear', warnings: [], geometry: { type: 'LineString', coordinates: [[73, 33.7], [73, 33.71]] },
    distanceMeters: 1112, durationSeconds: 120, departureAt: at, arrivalAt: new Date(Date.parse(at) + 120000).toISOString(), steps: [], snappedOrigin: [73, 33.7], snappedDestination: [73, 33.71] };
}
function planResponse(at: string, options = [route(at)]): Response {
  const result: PlanResponse = { options, baseline: null, conflicts: [], warnings: [], evaluatedAt: at, graphVersion: 'fixture', eventRevision: 1, source: 'local-osm' };
  return new Response(JSON.stringify(result));
}
function installApi(onPlan?: (request: PlanRequest) => Response | Promise<Response>) {
  const requests: PlanRequest[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/plan') {
      const request = JSON.parse(String(init?.body)) as PlanRequest;
      requests.push(request);
      return onPlan ? onPlan(request) : planResponse(request.departureAt);
    }
    if (url.startsWith('/api/demos')) return new Response(JSON.stringify({ at: now, scenarios: [] }));
    if (url === '/api/frequent-routes') return new Response(JSON.stringify([]));
    return new Response(JSON.stringify(state));
  });
  vi.stubGlobal('fetch', fetcher);
  return requests;
}
async function openApp(signedIn = false) {
  if (signedIn) signInDevelopment('user@manzil.test', 'ManzilUser123!');
  render(<App />);
  await screen.findByRole('button', { name: 'Find routes' });
  if (!signedIn) fireEvent.click(await screen.findByRole('button', { name: 'Skip tour' }));
  await screen.findByTestId('map');
}
function previewInput(): HTMLInputElement {
  return screen.getByLabelText('Date & time · Pakistan') as HTMLInputElement;
}
function preview(at = futureInput) {
  fireEvent.change(previewInput(), { target: { value: at } });
  fireEvent.click(screen.getByRole('button', { name: 'Show map' }));
}
function headerTimestamp(): string | null {
  return screen.getByRole('banner').querySelector('time')?.getAttribute('datetime') ?? null;
}
let intervals: Map<number, () => void>;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); signOut(); setLanguage('en');
  sessionStorage.setItem('manzil-entry-guest', 'yes'); localStorage.setItem('manzil-tour-v1', 'seen');
  window.location.hash = '';
  capture.props = null;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  intervals = new Map();
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => { intervals.set(delay, callback); return delay; }) as typeof setInterval);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup(); signOut(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  setLanguage('en'); document.documentElement.dir = 'ltr'; window.location.hash = '';
});

it('keeps the live header a readout and reserves the date picker for Plan ahead', async () => {
  installApi(); await openApp();
  const header = screen.getByRole('banner');
  expect(within(header).getByText('Live map')).toBeTruthy();
  expect(headerTimestamp()).toBe(now);
  expect(header.querySelector('input[type="datetime-local"]')).toBeNull();
  expect(within(header).queryByRole('button', { name: /time|date|Live map/i })).toBeNull();
  expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' }));
  expect(await screen.findByRole('heading', { name: 'Plan ahead' })).toBeTruthy();
  expect(previewInput()).toBeTruthy();
  expect(within(header).getByText('Planned map')).toBeTruthy();
});

it('applies a PKT preview explicitly, returns Map to now and remembers the planned date', async () => {
  const requests = installApi(); await openApp();
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' }));
  const initiallyPreviewed = capture.props!.departureAt;
  fireEvent.change(previewInput(), { target: { value: futureInput } });
  expect(capture.props!.departureAt).toBe(initiallyPreviewed);
  fireEvent.click(screen.getByRole('button', { name: 'Show map' }));
  expect(capture.props!.departureAt).toBe(future);
  expect(headerTimestamp()).toBe(future);
  expect(screen.getByRole('button', { name: 'Show restrictions layer' }).textContent).toContain('1');
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  await waitFor(() => expect(capture.props!.routeOptions).toHaveLength(1));
  expect(requests.at(-1)?.departureAt).toBe(future);
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  await waitFor(() => expect(capture.props!.routeOptions?.[0]?.departureAt).toBe(now));
  expect(capture.props!.departureAt).toBe(now);
  expect(screen.getByRole('button', { name: 'Show restrictions layer' }).textContent).not.toContain('1');
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' }));
  await waitFor(() => expect(capture.props!.routeOptions?.[0]?.departureAt).toBe(future));
  expect(previewInput().value).toBe(futureInput);
  expect(capture.props!.departureAt).toBe(future);
});

it('updates live time while a fixed planned snapshot and its route stay fixed', async () => {
  const requests = installApi(); await openApp();
  vi.setSystemTime('2026-10-17T10:01:00.000Z');
  await act(async () => intervals.get(60000)!());
  expect(capture.props!.departureAt).toBe('2026-10-17T10:01:00.000Z');
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' })); preview();
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  await waitFor(() => expect(capture.props!.routeOptions).toHaveLength(1));
  const requestCount = requests.length;
  vi.setSystemTime('2026-10-17T10:02:00.000Z');
  await act(async () => intervals.get(60000)!());
  expect(headerTimestamp()).toBe(future);
  expect(capture.props!.departureAt).toBe(future);
  expect(capture.props!.routeOptions?.[0]?.departureAt).toBe(future);
  expect(requests).toHaveLength(requestCount);
  fireEvent.click(screen.getByRole('button', { name: 'Return to live map' }));
  await waitFor(() => expect(capture.props!.routeOptions?.[0]?.departureAt).toBe('2026-10-17T10:02:00.000Z'));
  expect(headerTimestamp()).toBe('2026-10-17T10:02:00.000Z');
});

it('discards a delayed preview response after returning to a freshly planned live route', async () => {
  let resolvePreview!: (response: Response) => void;
  const requests = installApi(request => request.departureAt === future
    ? new Promise<Response>(resolve => { resolvePreview = resolve; })
    : planResponse(request.departureAt, [route(request.departureAt, 'live-route')]));
  await openApp();
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' })); preview();
  const submit = screen.getByRole('button', { name: 'Find routes' });
  expect(submit.matches(':disabled')).toBe(false);
  fireEvent.click(submit);
  await act(async () => { await Promise.resolve(); });
  await waitFor(() => expect(requests).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  await waitFor(() => expect(capture.props!.routeOptions?.[0]?.id).toBe('live-route'));
  await act(async () => resolvePreview(planResponse(future, [route(future, 'late-preview-route')])));
  expect(capture.props!.departureAt).toBe(now);
  expect(capture.props!.selectedRoute?.id).toBe('live-route');
  expect(capture.props!.routeOptions?.map(option => option.id)).toEqual(['live-route']);
  expect(within(screen.getByRole('banner')).getByText('Live map')).toBeTruthy();
});

it.each([
  { kind: 'leave_earlier' as const, label: 'Leave before closure', at: '2026-10-17T09:30:00.000Z', local: '2026-10-17T14:30' },
  { kind: 'leave_later' as const, label: 'Leave after closure', at: '2026-10-17T11:30:00.000Z', local: '2026-10-17T16:30' },
])('opens Plan ahead when choosing the $kind departure option', async ({ kind, label, at, local }) => {
  const requests = installApi(request => planResponse(request.departureAt, [route(request.departureAt), { ...route(at, kind), kind, label }]));
  await openApp(); fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  await screen.findByRole('heading', { name: 'Choose your route' });
  fireEvent.click(screen.getByText('Compare departure times'));
  fireEvent.click(screen.getByText(label).closest('button')!);
  expect(screen.getByRole('heading', { name: 'Plan ahead' })).toBeTruthy();
  await waitFor(() => expect(requests.at(-1)?.departureAt).toBe(at));
  await waitFor(() => expect(capture.props!.routeOptions?.[0]?.departureAt).toBe(at));
  expect(previewInput().value).toBe(local);
  expect(headerTimestamp()).toBe(at);
});

it('opens a fresh live route instead of starting GPS navigation from a planned snapshot', async () => {
  const watchPosition = vi.fn();
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { geolocation: { watchPosition, getCurrentPosition: vi.fn(), clearWatch: vi.fn() } }));
  const requests = installApi(); await openApp();
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' })); preview();
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View live route' }));
  await waitFor(() => expect(capture.props!.routeOptions?.[0]?.departureAt).toBe(now));
  expect(requests.map(request => request.departureAt)).toEqual([future, now]);
  expect(screen.getByRole('heading', { name: 'Your routes' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Navigate' })).toBeTruthy();
  expect(capture.props!.followPosition).toBe(false);
  expect(watchPosition).not.toHaveBeenCalled();
});

it.each(['Profile', 'Alerts'])('restores live closure time and removes future routes on opening %s', async destination => {
  installApi(); await openApp(true);
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' })); preview();
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  await waitFor(() => expect(capture.props!.routeOptions).toHaveLength(1));
  expect(capture.props!.departureAt).toBe(future);
  fireEvent.click(screen.getByRole('button', { name: destination }));
  expect(screen.getByRole('heading', { name: destination === 'Profile' ? 'Profile & settings' : 'Journey alerts' })).toBeTruthy();
  expect(capture.props!.departureAt).toBe(now);
  expect(capture.props!.routeOptions).toEqual([]);
  expect(capture.props!.selectedRoute).toBeNull();
  expect(headerTimestamp()).toBe(now);
  expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
});

it('rejects a cleared preview date without applying it, then accepts a valid PKT date', () => {
  const onChange = vi.fn(); render(<PlanAheadTime at={future} onChange={onChange} onLive={vi.fn()} />);
  fireEvent.change(previewInput(), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Show map' }));
  expect(screen.getByRole('alert').textContent).toContain('Choose a valid date and time.');
  expect(previewInput().getAttribute('aria-invalid')).toBe('true');
  expect(onChange).not.toHaveBeenCalled();
  preview();
  expect(onChange).toHaveBeenCalledOnce(); expect(onChange).toHaveBeenCalledWith(futureInput);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('submits the date visibly selected by the native picker even before React receives a change event', () => {
  const onChange = vi.fn(); render(<PlanAheadTime at={now} onChange={onChange} onLive={vi.fn()} />);
  const field = previewInput();
  const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setNativeValue.call(field, futureInput);
  expect(field.value).toBe(futureInput);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.submit(field.form!);
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange).toHaveBeenCalledWith(futureInput);
  expect(screen.queryByRole('alert')).toBeNull();
});
