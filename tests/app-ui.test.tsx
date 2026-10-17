// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AppState, RouteOption } from '../shared/types';
import type { MapViewProps } from '../src/components/MapView';
import { setLanguage } from '../src/lib/language';
import { signOut } from '../src/lib/auth';
import App from '../src/App';
const capture = vi.hoisted(() => ({ props: null as MapViewProps | null, mounts: 0 }));
vi.mock('../src/components/MapView', () => ({ default: (props: MapViewProps) => { capture.props = props; useEffect(() => { capture.mounts++; }, []); return <div data-testid="map" />; } }));
const date = '2026-10-15T10:00:00Z';
const state: AppState = { closures: [], commutes: [], alerts: [], notices: [], trips: [], eventRevision: 0,
  profile: { id: 'local', displayName: 'Traveller', theme: 'light', mapDetail: 'clean', mapStyle: 'streets', browserNotifications: false, inferFrequentRoutes: false, transport: 'car', createdAt: date, updatedAt: date },
  graph: { ready: true, version: 'test', source: 'fixture', nodeCount: 2, edgeCount: 2, importedAt: date, bounds: [72.97, 33.6, 73.16, 33.75], limitations: [] },
  sourceStatus: { enabled: false, state: 'disabled', intervalMinutes: 15, profileUrl: '', lastAttemptAt: null, lastSuccessAt: null, nextCheckAt: null, message: '', noticesCollected: 0, coverage: 'partial' } };
const option: RouteOption = { id: 'direct', kind: 'direct', label: 'Recommended', validation: 'clear', warnings: [], geometry: { type: 'LineString', coordinates: [[73, 33.7], [73, 33.71]] }, distanceMeters: 1112, durationSeconds: 120,
  departureAt: date, arrivalAt: '2026-10-15T10:02:00Z', steps: [], snappedOrigin: [73, 33.7], snappedDestination: [73, 33.71] };
const responseFor = (url: string) => new Response(JSON.stringify(url.startsWith('/api/demos?') ? { at: date, scenarios: [] } : state));
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); signOut(); localStorage.setItem('manzil-tour-v1', 'seen'); setLanguage('en'); capture.props = null; capture.mounts = 0;
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); signOut(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setLanguage('en'); document.documentElement.dir = 'ltr'; });
it('can request and display online routes when the bundled local graph is unavailable', async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/plan') {
      const request = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ options: [{ ...option, departureAt: request.departureAt }], baseline: null, conflicts: [], warnings: [], evaluatedAt: date, graphVersion: 'osrm', eventRevision: 0, source: 'osrm' }));
    }
    if (url === '/api/state') return new Response(JSON.stringify({ ...state, graph: { ...state.graph, ready: false } }));
    return responseFor(url);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<App />); await screen.findByRole('button', { name: 'Skip tour' });
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  const plan = screen.getByRole('button', { name: 'Find routes' });
  expect(plan.matches(':disabled')).toBe(false);
  fireEvent.click(plan);
  await waitFor(() => expect(capture.props?.routeOptions).toHaveLength(1));
  expect(fetcher.mock.calls.some(([url]) => url === '/api/plan')).toBe(true);
});

it('unlocks existing personal screens with a dummy account and returns to guest planning on sign-out', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responseFor(url)));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  expect(screen.queryByRole('button', { name: 'Activity' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  fireEvent.click(screen.getByRole('button', { name: /Normal user/ }));
  fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Demo traveller' }));
  expect(screen.getByText('DEV · Normal user')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Profile & settings' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  expect(screen.queryByRole('heading', { name: 'Profile & settings' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Demo traveller' }));
  expect(screen.getByRole('heading', { name: 'Profile & settings' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
  expect(screen.getByRole('heading', { name: 'Your activity' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
  expect(screen.queryByRole('heading', { name: 'Sign in for personal features' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Find routes' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Activity' })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Welcome to Manzil' })).toBeTruthy();
});
it('keeps closures and generic demos available without a separate street-routing feature, and repeats guest tours', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responseFor(url)));
  const first = render(<App />);
  await screen.findByRole('dialog', { name: 'Welcome to Manzil' });
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  expect(screen.queryByRole('button', { name: 'Try street detour' })).toBeNull();
  expect(screen.getByText('Demo closures')).toBeTruthy();
  expect(capture.props?.mapStyle).toBe('outdoors');
  expect(document.querySelector('.nav-rail small')).toBeNull();
  expect(screen.getByRole('button', { name: 'Help & demos' }).getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Closures' }));
  expect(screen.getByRole('heading', { name: 'Road closures' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add restriction on map' }));
  expect(screen.getByRole('heading', { name: 'Add a road restriction' })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  first.unmount(); render(<App />);
  expect(await screen.findByRole('dialog', { name: 'Welcome to Manzil' })).toBeTruthy();
});

it('loads demo endpoints into ordinary planning, clears existing stops and requests the usual plan API', async () => {
  const journey = { origin: { name: 'Demo start', coordinate: [73.0294, 33.7038] }, destination: { name: 'Demo end', coordinate: [73.0302, 33.7079] } };
  const scenario = { id: 'park-road-street-detour', title: 'Demo · Park Road', description: 'Synthetic fixture', enabled: false, closureIds: [], coordinates: [[73.03, 33.705]], timing: 'active', startsAt: date, endsAt: '2026-10-15T11:00:00Z', suggestedJourney: journey, includeInBulk: false };
  let enabled = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/demos') enabled = true;
    if (url.startsWith('/api/demos')) return new Response(JSON.stringify({ at: date, scenarios: [{ ...scenario, enabled }] }));
    if (url === '/api/state') return new Response(JSON.stringify({ ...state, eventRevision: enabled ? 1 : 0 }));
    if (url === '/api/plan') {
      const request = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ options: [{ ...option, departureAt: request.departureAt }], baseline: null, conflicts: [], warnings: [], evaluatedAt: date, graphVersion: 'test', eventRevision: 1, source: 'local-osm' }));
    }
    return responseFor(url);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<App />); await screen.findByRole('button', { name: 'Skip tour' });
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
  expect(capture.props?.waypoints).toEqual([null]);
  fireEvent.click(screen.getByText('Demo closures'));
  fireEvent.click(await screen.findByRole('button', { name: 'Try route: Park Road' }));
  await waitFor(() => expect(capture.props?.routeOptions).toHaveLength(1));
  expect(capture.props?.origin).toEqual(journey.origin);
  expect(capture.props?.destination).toEqual(journey.destination);
  expect(capture.props?.waypoints).toEqual([]);
  const mutation = fetcher.mock.calls.find(([url]) => url === '/api/demos');
  expect(JSON.parse(mutation![1]!.body as string)).toMatchObject({ scenario: scenario.id, enabled: true });
  const plans = fetcher.mock.calls.filter(([url]) => url === '/api/plan');
  expect(plans).toHaveLength(1);
  expect(JSON.parse(plans[0][1]!.body as string)).toMatchObject({ ...journey, waypoints: [] });
  expect(fetcher.mock.calls.some(([url]) => url.includes('/demos/street-route'))).toBe(false);
  const demoIndex = fetcher.mock.calls.findIndex(([url]) => url === '/api/demos');
  const planIndex = fetcher.mock.calls.findIndex(([url]) => url === '/api/plan');
  expect(fetcher.mock.calls.slice(demoIndex + 1, planIndex).some(([url]) => url === '/api/state')).toBe(true);
});

it('preserves a stop added while a demo mutation is pending instead of replacing the edited journey', async () => {
  const journey = { origin: { name: 'Demo start', coordinate: [73.0294, 33.7038] }, destination: { name: 'Demo end', coordinate: [73.0302, 33.7079] } };
  const scenario = { id: 'park-road-street-detour', title: 'Demo · Park Road', description: 'Synthetic fixture', enabled: false, closureIds: [], coordinates: [[73.03, 33.705]], timing: 'active', startsAt: date, endsAt: '2026-10-15T11:00:00Z', suggestedJourney: journey, includeInBulk: false };
  let resolveMutation!: (response: Response) => void, enabled = false;
  const fetcher = vi.fn(async (url: string) => {
    if (url === '/api/demos') return new Promise<Response>(resolve => { resolveMutation = resolve; });
    if (url.startsWith('/api/demos?')) return new Response(JSON.stringify({ at: date, scenarios: [{ ...scenario, enabled }] }));
    if (url === '/api/state') return new Response(JSON.stringify({ ...state, eventRevision: enabled ? 1 : 0 }));
    return responseFor(url);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<App />); await screen.findByRole('button', { name: 'Skip tour' });
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  const originalOrigin = capture.props?.origin, originalDestination = capture.props?.destination;
  fireEvent.click(screen.getByText('Demo closures'));
  const tryRoute = await screen.findByRole('button', { name: 'Try route: Park Road' });
  fireEvent.click(tryRoute);
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === '/api/demos')).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
  expect(capture.props?.waypoints).toEqual([null]);
  enabled = true;
  await act(async () => resolveMutation(new Response(JSON.stringify({ at: date, scenarios: [{ ...scenario, enabled }] }))));
  await waitFor(() => expect(tryRoute.matches(':disabled')).toBe(false));
  expect(capture.props?.origin).toEqual(originalOrigin);
  expect(capture.props?.destination).toEqual(originalDestination);
  expect(capture.props?.waypoints).toEqual([null]);
  expect(fetcher.mock.calls.some(([url]) => url === '/api/plan')).toBe(false);
  const mutationIndex = fetcher.mock.calls.findIndex(([url]) => url === '/api/demos');
  expect(fetcher.mock.calls.slice(mutationIndex + 1).some(([url]) => url === '/api/state')).toBe(true);
});
it('preserves map identity and handlers across polling, switches the complete shell to Urdu and gates personal screens', async () => {
  const intervals = new Map<number, () => void>();
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => { intervals.set(delay, callback); return delay; }) as typeof setInterval);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responseFor(url)));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' }); await screen.findByTestId('map');
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  const move = capture.props!.onWaypointMove, camera = capture.props!.focus;
  await act(async () => { intervals.get(20000)!(); });
  expect(capture.mounts).toBe(1); expect(capture.props!.onWaypointMove).toBe(move); expect(capture.props!.focus).toBe(camera);
  fireEvent.click(screen.getByRole('button', { name: 'اردو میں دیکھیں' }));
  expect(document.documentElement.dir).toBe('rtl'); expect(document.documentElement.lang).toBe('ur');
  expect(screen.getByRole('button', { name: 'راستے تلاش کریں' })).toBeTruthy(); expect(capture.mounts).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'محفوظ' }));
  expect(screen.getByRole('heading', { name: 'ذاتی سہولتوں کے لیے سائن ان کریں' })).toBeTruthy();
});
it('keeps pending route geometry labelled unavailable instead of blanking the map on a clock update', async () => {
  const intervals = new Map<number, () => void>(); let resolvePlan!: (value: Response) => void; let requests = 0;
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => { intervals.set(delay, callback); return delay; }) as typeof setInterval);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/plan') {
      requests++;
      if (requests > 1) return new Promise<Response>(resolve => { resolvePlan = resolve; });
      const body = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ options: [{ ...option, departureAt: body.departureAt }], baseline: null, conflicts: [], warnings: [], evaluatedAt: date, graphVersion: 'test', eventRevision: 0, source: 'local-osm' }));
    }
    return responseFor(url);
  }));
  render(<App />); await screen.findByRole('button', { name: 'Skip tour' });
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  await waitFor(() => expect(capture.props?.routeOptions).toHaveLength(1));
  expect(screen.getByRole('button', { name: 'Block a point on this route' })).toBeTruthy();
  const geometry = capture.props!.routeOptions![0].geometry;
  await act(async () => { intervals.get(60000)!(); });
  await waitFor(() => expect(requests).toBe(2));
  expect(capture.props!.updating).toBe(true); expect(capture.props!.selectedRoute).toBeNull();
  expect(capture.props!.routeOptions![0].geometry).toEqual(geometry); expect(capture.mounts).toBe(1);
  expect(screen.getByRole('button', { name: 'Navigate' }).matches(':disabled')).toBe(true);
  expect(screen.getByRole('heading', { name: 'Your routes' })).toBeTruthy();
  await act(async () => { resolvePlan(new Response(JSON.stringify({ options: [], baseline: null, conflicts: [], warnings: [], evaluatedAt: date, graphVersion: 'test', eventRevision: 0, source: 'local-osm' }))); });
});
