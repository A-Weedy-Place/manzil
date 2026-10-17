// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AppState, Closure, RouteOption, Trip } from '../shared/types';
import type { MapViewProps } from '../src/components/MapView';
import { setLanguage } from '../src/lib/language';
import { getAuthSession, signInDevelopment, signOut } from '../src/lib/auth';
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
  localStorage.clear(); sessionStorage.clear(); signOut(); sessionStorage.setItem('manzil-entry-guest', 'yes'); localStorage.setItem('manzil-tour-v1', 'seen'); setLanguage('en'); capture.props = null; capture.mounts = 0;
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); signOut(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setLanguage('en'); document.documentElement.dir = 'ltr'; });
it('recentres My location without editing endpoints, stops, route geometry or planned time', async () => {
  let locateSuccess!: PositionCallback;
  const getPosition = vi.fn((success: PositionCallback) => { locateSuccess = success; });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: getPosition, watchPosition: vi.fn() } });
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/plan') { const request = JSON.parse(init!.body as string); return new Response(JSON.stringify({ options: [{ ...option, departureAt: request.departureAt }], baseline: null, conflicts: [], warnings: [], evaluatedAt: date, graphVersion: 'test', eventRevision: 0, source: 'local-osm' })); }
    return responseFor(url);
  });
  vi.stubGlobal('fetch', fetcher); render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
  act(() => capture.props!.onWaypointMove?.(0, [73.041, 33.72]));
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  await waitFor(() => expect(capture.props?.routeOptions).toHaveLength(1));
  const before = capture.props!;
  expect(getPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'My location' }));
  expect(screen.getByRole('button', { name: 'My location' }).matches(':disabled')).toBe(true);
  act(() => locateSuccess({ coords: { longitude: 73.123, latitude: 33.678 } } as GeolocationPosition));
  expect(capture.props!.focus?.coordinates).toEqual([[73.123, 33.678]]);
  expect(capture.props!.origin).toEqual(before.origin); expect(capture.props!.destination).toEqual(before.destination); expect(capture.props!.waypoints).toEqual(before.waypoints);
  expect(capture.props!.selectedRoute).toEqual(before.selectedRoute); expect(capture.props!.departureAt).toBe(before.departureAt);
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/plan')).toHaveLength(1);
});
it('ignores an old-account location response and keeps a declined request editable', async () => {
  signInDevelopment('user@manzil.test', 'ManzilUser123!');
  let success!: PositionCallback, failure!: PositionErrorCallback;
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: PositionCallback, error: PositionErrorCallback) => { success = ok; failure = error; } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responseFor(url)));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  fireEvent.click(screen.getByRole('button', { name: 'My location' }));
  act(() => failure({ code: 1 } as GeolocationPositionError));
  expect(screen.getByRole('button', { name: 'My location' }).matches(':disabled')).toBe(false);
  expect(screen.getByText('Location is unavailable or permission was declined. You can still select any point on the map.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'My location' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('dialog', { name: 'Manzil' });
  act(() => success({ coords: { longitude: 73.123, latitude: 33.678 } } as GeolocationPosition));
  expect(capture.props!.focus?.coordinates).not.toEqual([[73.123, 33.678]]);
});
it.each([false, true])('persists the header appearance toggle independently of the map style (signed in: %s)', async signedIn => {
  if (signedIn) signInDevelopment('user@manzil.test', 'ManzilUser123!');
  let profile = { ...state.profile, theme: 'system' as 'system' | 'light' | 'dark' };
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/profile') { const patch = JSON.parse(init!.body as string); profile = { ...profile, ...patch }; return new Response(JSON.stringify(patch)); }
    return new Response(JSON.stringify({ ...state, profile }));
  });
  vi.stubGlobal('fetch', fetcher); render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  if (screen.queryByRole('button', { name: 'Skip tour' })) fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  expect(capture.props!.mapStyle).toBe('outdoors');
  fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  expect(capture.props!.mapStyle).toBe('outdoors');
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/profile').map(([, init]) => JSON.parse(init!.body as string))).toEqual([{ theme: 'light' }, { theme: 'dark' }]);
});
it('opens sign-in first and only enters guest planning after an explicit skip', async () => {
  sessionStorage.removeItem('manzil-entry-guest');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responseFor(url)));
  render(<App />);
  expect(await screen.findByRole('dialog', { name: 'Manzil' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Find routes' })).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue as guest' }).at(-1)!);
  expect(await screen.findByRole('button', { name: 'Skip tour' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  expect(screen.getByRole('button', { name: 'Find routes' })).toBeTruthy();
});
it('takes an administrator from sign-in to the control centre', async () => {
  sessionStorage.removeItem('manzil-entry-guest');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responseFor(url)));
  render(<App />); await screen.findByRole('form', { name: 'Sign in' });
  fireEvent.click(screen.getByText('Choose a development account'));
  fireEvent.click(screen.getByRole('button', { name: /Admin user/ }));
  fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
  expect(await screen.findByRole('heading', { name: 'Control centre' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'People' })).toBeTruthy();
});
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
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in for personal features' }));
  fireEvent.click(screen.getByText('Choose a development account'));
  fireEvent.click(screen.getByRole('button', { name: /Normal user/ }));
  fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open profile' }));
  expect(screen.getByText('Normal user')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'User profile' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  expect(screen.queryByRole('heading', { name: 'User profile' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  expect(screen.getByRole('heading', { name: 'User profile' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
  expect(screen.getByRole('heading', { name: 'Your activity' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
  expect(screen.queryByRole('heading', { name: 'Sign in for personal features' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.getByRole('dialog', { name: 'Manzil' })).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue as guest' }).at(-1)!);
  expect(await screen.findByRole('button', { name: 'Find routes' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Activity' })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Welcome to Manzil' })).toBeTruthy();
});
it('clears a private report editor, its evidence and map selection when signing out into guest mode', async () => {
  signInDevelopment('user@manzil.test', 'ManzilUser123!');
  const privateReport: Closure = {
    id: 'private-report', revision: 3, title: 'Private service road', description: 'Private draft note', reason: 'construction',
    status: 'draft', moderation: 'pending', startsAt: date, endsAt: null, createdAt: date, updatedAt: date,
    author: { uid: 'dev-user', displayName: 'Demo traveller', role: 'user' }, photoCount: 1,
    photos: ['data:image/jpeg;base64,/9j/2Q=='],
    geometry: { type: 'Polygon', coordinates: [[[73.03, 33.70], [73.031, 33.70], [73.031, 33.701], [73.03, 33.70]]] },
    drawing: { kind: 'line', coordinates: [[73.03, 33.70], [73.031, 33.70]], widthMeters: 14 },
  };
  const { photos: _privatePhotos, ...summary } = privateReport;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/state') return new Response(JSON.stringify({ ...state, closures: getAuthSession().user?.uid === 'dev-user' ? [summary] : [] }));
    if (url === '/api/closures/private-report') return new Response(JSON.stringify(privateReport));
    return responseFor(url);
  }));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  fireEvent.click(screen.getByRole('button', { name: 'Closures' }));
  fireEvent.click(screen.getByRole('button', { name: /Private service road/ }));
  expect(await screen.findByRole('img', { name: 'Closure photo 1' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(await screen.findByRole('heading', { name: 'Edit restriction' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Road / place' }).getAttribute('value')).toBe(privateReport.title);
  expect(capture.props?.drawing).toEqual(privateReport.drawing); expect(capture.props?.selectedClosureId).toBe(privateReport.id);
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('dialog', { name: 'Manzil' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue as guest' }).at(-1)!);
  await screen.findByRole('button', { name: 'Skip tour' }); fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  fireEvent.click(screen.getByRole('button', { name: 'Closures' }));
  expect(screen.getByRole('heading', { name: 'Road closures' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Edit restriction' })).toBeNull();
  expect(screen.queryByDisplayValue(privateReport.title)).toBeNull(); expect(screen.queryByText(privateReport.description)).toBeNull();
  expect(screen.queryByRole('img', { name: 'Closure photo 1' })).toBeNull();
  expect(capture.props?.drawing).toBeNull(); expect(capture.props?.selectedClosureId).toBeNull(); expect(capture.props?.closures).toEqual([]);
});
it('keeps published closures visible, gates guest reports behind sign-in and repeats guest tours', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responseFor(url)));
  const first = render(<App />);
  await screen.findByRole('dialog', { name: 'Welcome to Manzil' });
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  expect(screen.queryByRole('button', { name: 'Try street detour' })).toBeNull();
  expect(screen.queryByText('Demo closures')).toBeNull();
  expect(capture.props?.mapStyle).toBe('outdoors');
  expect(document.querySelector('.nav-rail small')).toBeNull();
  expect(screen.getByRole('button', { name: 'Help & demos' }).getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Closures' }));
  expect(screen.getByRole('heading', { name: 'Road closures' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add restriction on map' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add closure' }));
  expect(screen.getByRole('form', { name: 'Sign in' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Add a road restriction' })).toBeNull();
  first.unmount(); render(<App />);
  expect(await screen.findByRole('dialog', { name: 'Welcome to Manzil' })).toBeTruthy();
});

it('loads demo endpoints into ordinary planning, clears existing stops and requests the usual plan API', async () => {
  signInDevelopment('admin@manzil.test', 'ManzilAdmin123!');
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
  render(<App />); await screen.findByRole('heading', { name: 'Control centre' });
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
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
  signInDevelopment('admin@manzil.test', 'ManzilAdmin123!');
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
  render(<App />); await screen.findByRole('heading', { name: 'Control centre' });
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Language' }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'اردو' }));
  expect(document.documentElement.dir).toBe('rtl'); expect(document.documentElement.lang).toBe('ur');
  expect(screen.getByRole('button', { name: 'راستے تلاش کریں' })).toBeTruthy(); expect(capture.mounts).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'محفوظ' }));
  expect(screen.getByRole('heading', { name: 'ذاتی سہولتوں کے لیے سائن ان کریں' })).toBeTruthy();
});
it('has one header profile control and opens read-only monthly statistics beside the profile', async () => {
  signInDevelopment('user@manzil.test', 'ManzilUser123!');
  const watch = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: vi.fn() } });
  const summary = { period: 'month', tripCount: 0, distanceMeters: 0, durationSeconds: 0, costPkr: 0, litres: 0, pricedTripCount: 0, unpricedTripCount: 0, complete: true };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/trips/statistics' ? new Response(JSON.stringify({ month: summary })) : responseFor(url)));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  expect(document.querySelector('.account-trigger')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Open profile' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Personal statistics/ }));
  expect(await screen.findByRole('dialog', { name: 'Personal statistics' })).toBeTruthy();
  expect(await screen.findByText('No recorded trips this month.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'This week' })).toBeNull();
  expect(watch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close statistics' }));
  expect(screen.queryByRole('dialog', { name: 'Personal statistics' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'User profile' })).toBeTruthy();
});
it('opens profile details and trip history in the same secondary panel without mounting another recorder', async () => {
  signInDevelopment('user@manzil.test', 'ManzilUser123!');
  const watch = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: vi.fn() } });
  const sample = { id: 'demo-summary', name: 'Demo · F-8 commute', startedAt: date, endedAt: date, createdAt: date, distanceMeters: 12000, durationSeconds: 1500, points: [], pointCount: 0, gaps: 0, contributeToRoadDiscovery: false, demoData: true };
  const fetcher = vi.fn(async (url: string) => url === '/api/state' ? new Response(JSON.stringify({ ...state, profile: { ...state.profile, city: 'Islamabad', location: 'F-8', demoData: true }, trips: [sample] })) : responseFor(url));
  vi.stubGlobal('fetch', fetcher);
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  expect(screen.queryByLabelText('City')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const details = screen.getByRole('dialog', { name: 'Personal information' });
  expect(details.parentElement!.classList.contains('profile-settings-dialog')).toBe(true);
  expect(within(details).getByLabelText('City')).toHaveProperty('value', 'Islamabad');
  fireEvent.change(within(details).getByLabelText('City'), { target: { value: 'Lahore' } });
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('City')).toHaveProperty('value', 'Islamabad');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Trip history' }));
  const history = screen.getByRole('dialog', { name: 'Trip history' });
  expect(history.parentElement!.classList.contains('profile-settings-dialog')).toBe(true);
  expect(within(history).getByText('Demo · F-8 commute')).toBeTruthy();
  expect(within(history).getByText('Demo data')).toBeTruthy();
  expect(within(history).queryByRole('button', { name: 'Start recording' })).toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url.startsWith('/api/trips/'))).toBe(false);
  expect(watch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close trip history' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('shows a selected history trace while preserving a paused recording draft for later resumption', async () => {
  signInDevelopment('user@manzil.test', 'ManzilUser123!');
  let clock = Date.now(), location!: PositionCallback;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  const clear = vi.fn(), watch = vi.fn((callback: PositionCallback) => { location = callback; return 44; });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: clear } });
  const saved: Trip = { id: 'saved-trace', name: 'Saved history route', startedAt: date, endedAt: date, createdAt: date, distanceMeters: 500, durationSeconds: 180, points: [{ coordinate: [73.08, 33.72], timestamp: date, accuracy: 10 }, { coordinate: [73.085, 33.72], timestamp: date, accuracy: 10 }], pointCount: 2, gaps: 0, contributeToRoadDiscovery: false };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/state') return new Response(JSON.stringify({ ...state, profile: { ...state.profile, collectTravelData: true }, trips: [{ ...saved, points: [] }] }));
    if (url === '/api/trips/saved-trace') return new Response(JSON.stringify(saved));
    return responseFor(url);
  }));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
  await act(async () => location({ timestamp: clock, coords: { longitude: 73, latitude: 33.7, accuracy: 10 } } as GeolocationPosition));
  clock += 6000;
  await act(async () => location({ timestamp: clock, coords: { longitude: 73.001, latitude: 33.7, accuracy: 10 } } as GeolocationPosition));
  await waitFor(() => expect(capture.props?.recordedPoints).toHaveLength(2));
  const draft = capture.props!.recordedPoints;
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  expect(clear).toHaveBeenCalledWith(44);
  fireEvent.click(screen.getByRole('button', { name: 'Trip history' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Trip history' })).getByRole('button', { name: 'View on map' }));
  await waitFor(() => expect(capture.props?.recordedPoints).toEqual(saved.points));
  expect(screen.queryByRole('dialog', { name: 'Trip history' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Hide recorded trip' }));
  expect(capture.props?.recordedPoints).toEqual(draft);
  fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
  expect(screen.getByRole('button', { name: 'Resume recording' })).toBeTruthy();
  expect(watch).toHaveBeenCalledTimes(1);
});
it('asks only a newly registered account for optional trip data before its tour and remembers Not now', async () => {
  sessionStorage.setItem('manzil-travel-data-choice-v1:dev-user', 'pending');
  signInDevelopment('user@manzil.test', 'ManzilUser123!');
  localStorage.removeItem('manzil-tour-v1');
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => url === '/api/profile' && init?.method === 'PATCH' ? new Response(JSON.stringify({ ...state.profile, ...JSON.parse(String(init.body)) })) : responseFor(url));
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  expect(await screen.findByRole('dialog', { name: 'Personal trip data' })).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'Welcome to Manzil' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  expect(await screen.findByRole('dialog', { name: 'Welcome to Manzil' })).toBeTruthy();
  expect(sessionStorage.getItem('manzil-travel-data-choice-v1:dev-user')).toBeNull();
  const request = fetcher.mock.calls.find(([url]) => url === '/api/profile');
  expect(JSON.parse(String(request?.[1]?.body))).toEqual({ travelDataChoiceMade: true, collectTravelData: false, inferFrequentRoutes: false });
});
it('never uses a previous account’s acknowledged profile to dismiss a new account’s data choice', async () => {
  signInDevelopment('admin@manzil.test', 'ManzilAdmin123!');
  let resolveNewState!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/state') {
      if (getAuthSession().user?.uid === 'dev-user') return new Promise<Response>(resolve => { resolveNewState = resolve; });
      return new Response(JSON.stringify({ ...state, profile: { ...state.profile, travelDataChoiceMade: true } }));
    }
    return responseFor(url);
  }));
  render(<App />); await screen.findByRole('heading', { name: 'Control centre' });
  sessionStorage.setItem('manzil-travel-data-choice-v1:dev-user', 'pending');
  act(() => signInDevelopment('user@manzil.test', 'ManzilUser123!'));
  await waitFor(() => expect(resolveNewState).toBeTypeOf('function'));
  expect(sessionStorage.getItem('manzil-travel-data-choice-v1:dev-user')).toBe('pending');
  expect(screen.queryByRole('dialog', { name: 'Welcome to Manzil' })).toBeNull();
  await act(async () => resolveNewState(new Response(JSON.stringify(state))));
  expect(await screen.findByRole('dialog', { name: 'Personal trip data' })).toBeTruthy();
  expect(sessionStorage.getItem('manzil-travel-data-choice-v1:dev-user')).toBe('pending');
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
  expect(screen.queryByRole('button', { name: 'Block a point on this route' })).toBeNull();
  const geometry = capture.props!.routeOptions![0].geometry;
  await act(async () => { intervals.get(60000)!(); });
  await waitFor(() => expect(requests).toBe(2));
  expect(capture.props!.updating).toBe(true); expect(capture.props!.selectedRoute).toBeNull();
  expect(capture.props!.routeOptions![0].geometry).toEqual(geometry); expect(capture.mounts).toBe(1);
  expect(screen.getByRole('button', { name: 'Navigate' }).matches(':disabled')).toBe(true);
  expect(screen.getByRole('heading', { name: 'Your routes' })).toBeTruthy();
  await act(async () => { resolvePlan(new Response(JSON.stringify({ options: [], baseline: null, conflicts: [], warnings: [], evaluatedAt: date, graphVersion: 'test', eventRevision: 0, source: 'local-osm' }))); });
});
