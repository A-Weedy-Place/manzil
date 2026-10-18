// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AppState, Closure, RouteOption, Trip } from '../shared/types';
import type { MapViewProps } from '../src/components/MapView';
import { setLanguage } from '../src/lib/language';
import { getAuthSession, signInDevelopment, signOut } from '../src/lib/auth';
import App from '../src/App';
import type { AgentProposal } from '../shared/agent';
import { extraction as agentExtraction, location as agentLocation, notice as agentNotice } from './agent-fixtures';
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
async function chooseEndpoints() {
  await screen.findByTestId('map');
  act(() => {
    capture.props!.onEndpointMove('A', [73, 33.7]);
    capture.props!.onEndpointMove('B', [73, 33.71]);
  });
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); signOut(); sessionStorage.setItem('manzil-entry-guest', 'yes'); localStorage.setItem('manzil-tour-v1', 'seen'); setLanguage('en'); capture.props = null; capture.mounts = 0;
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => { cleanup(); signOut(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setLanguage('en'); document.documentElement.dir = 'ltr'; });
it('opens an empty planner without sample pins or an automatic route request', async () => {
  const fetcher = vi.fn(async (url: string) => responseFor(url)); vi.stubGlobal('fetch', fetcher);
  render(<App />); const find = await screen.findByRole('button', { name: 'Find routes' }); await screen.findByTestId('map');
  expect(capture.props!.origin).toBeNull(); expect(capture.props!.destination).toBeNull(); expect(capture.props!.waypoints).toEqual([]);
  expect(screen.getByRole('combobox', { name: /Starting point/ })).toHaveProperty('value', '');
  expect(screen.getByRole('combobox', { name: /Destination/ })).toHaveProperty('value', '');
  expect(find.matches(':disabled')).toBe(true); expect(capture.props!.routeOptions).toEqual([]);
  expect(fetcher.mock.calls.some(([url]) => url === '/api/plan')).toBe(false);
  act(() => capture.props!.onEndpointMove('A', [73, 33.7])); expect(find.matches(':disabled')).toBe(true);
  act(() => capture.props!.onEndpointMove('B', [73, 33.71])); expect(find.matches(':disabled')).toBe(false);
  expect(fetcher.mock.calls.some(([url]) => url === '/api/plan')).toBe(false);
});
it('offers departure comparisons only in Plan ahead and never requests them for the live map', async () => {
  const requests: boolean[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/plan') {
      const request = JSON.parse(init!.body as string); requests.push(request.compareDepartures);
      return new Response(JSON.stringify({ options: [{ ...option, departureAt: request.departureAt }], baseline: null, conflicts: [], warnings: [], evaluatedAt: date, graphVersion: 'test', eventRevision: 0, source: 'local-osm' }));
    }
    return responseFor(url);
  }));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  await chooseEndpoints();
  expect(screen.queryByRole('checkbox', { name: 'Also compare leaving earlier or later' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' })); await waitFor(() => expect(requests).toEqual([false]));
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' }));
  expect(screen.getByRole('checkbox', { name: 'Also compare leaving earlier or later' })).toHaveProperty('checked', true);
  await waitFor(() => expect(requests.at(-1)).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  await waitFor(() => expect(requests.at(-1)).toBe(false));
  expect(screen.queryByRole('checkbox', { name: 'Also compare leaving earlier or later' })).toBeNull();
});
it('recentres My location without editing endpoints, stops, route geometry or planned time', async () => {
  let locateSuccess!: PositionCallback;
  const getPosition = vi.fn((success: PositionCallback, _failure?: PositionErrorCallback, _options?: PositionOptions) => { locateSuccess = success; });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: getPosition, watchPosition: vi.fn() } });
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/plan') { const request = JSON.parse(init!.body as string); return new Response(JSON.stringify({ options: [{ ...option, departureAt: request.departureAt }], baseline: null, conflicts: [], warnings: [], evaluatedAt: date, graphVersion: 'test', eventRevision: 0, source: 'local-osm' })); }
    return responseFor(url);
  });
  vi.stubGlobal('fetch', fetcher); render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  await chooseEndpoints();
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
  act(() => capture.props!.onWaypointMove?.(0, [73.041, 33.72]));
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  await waitFor(() => expect(capture.props?.routeOptions).toHaveLength(1));
  const before = capture.props!;
  expect(getPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'My location' }));
  expect(screen.getByRole('button', { name: 'My location' }).matches(':disabled')).toBe(true);
  act(() => locateSuccess({ timestamp: Date.now(), coords: { longitude: 73.123, latitude: 33.678, accuracy: 12 } } as GeolocationPosition));
  expect(capture.props!.focus?.coordinates).toEqual([[73.123, 33.678]]);
  expect(getPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  expect(screen.getByText('GPS estimate · reported accuracy about 12 m')).toBeTruthy();
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
  expect(screen.getByText('Location permission was declined. You can still select a point on the map.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'My location' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('dialog', { name: 'Manzil' });
  act(() => success({ timestamp: Date.now(), coords: { longitude: 73.123, latitude: 33.678, accuracy: 12 } } as GeolocationPosition));
  expect(capture.props!.focus?.coordinates).not.toEqual([[73.123, 33.678]]);
});
it('reports a coarse browser location honestly without moving route endpoints or requesting a plan', async () => {
  let success!: PositionCallback;
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: PositionCallback) => { success = ok; } } });
  const fetcher = vi.fn(async (url: string) => responseFor(url)); vi.stubGlobal('fetch', fetcher);
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  fireEvent.click(screen.getByRole('button', { name: 'My location' }));
  act(() => success({ timestamp: Date.now(), coords: { longitude: 73.05, latitude: 33.7, accuracy: 500 } } as GeolocationPosition));
  expect(screen.getByText('GPS estimate · reported accuracy about 500 m')).toBeTruthy();
  expect(capture.props!.focus?.coordinates).toEqual([[73.05, 33.7]]);
  expect(capture.props!.origin).toBeNull(); expect(capture.props!.destination).toBeNull();
  expect(capture.props!.navigationPosition).toEqual([73.05, 33.7]);
  expect(fetcher.mock.calls.some(([url]) => url === '/api/plan')).toBe(false);
});
it('recentres the navigation-owned position without starting a competing map lookup', async () => {
  let receive!: PositionCallback;
  const getPosition = vi.fn(), watch = vi.fn((ok: PositionCallback) => { receive = ok; return 6; });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: getPosition, watchPosition: watch, clearWatch: vi.fn() } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/plan') { const request = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ options: [{ ...option, departureAt: request.departureAt }], baseline: null, conflicts: [], warnings: [], evaluatedAt: request.departureAt, graphVersion: 'test', eventRevision: 0, source: 'local-osm' })); }
    return responseFor(url);
  }));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' }); await chooseEndpoints();
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' })); fireEvent.click(await screen.findByRole('button', { name: 'Navigate' }));
  expect(screen.getByRole('button', { name: 'My location' }).matches(':disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' }));
  await act(async () => receive({ timestamp: Date.now(), coords: { longitude: 73, latitude: 33.7, accuracy: 8 } } as GeolocationPosition));
  expect(capture.props!.navigationPosition).toEqual([73, 33.7]); expect(capture.props!.navigationAccuracy).toBe(8);
  const myLocation = screen.getByRole('button', { name: 'My location' }); expect(myLocation.matches(':disabled')).toBe(false); fireEvent.click(myLocation);
  expect(getPosition).not.toHaveBeenCalled(); expect(watch).toHaveBeenCalledOnce(); expect(capture.props!.focus?.coordinates).toEqual([[73, 33.7]]);
  expect(capture.props!.navigationPosition).toEqual([73, 33.7]); expect(capture.props!.navigationAccuracy).toBe(8);
});
it('cancels a pending map refinement on entering navigation so late coarse callbacks cannot replace its fix', async () => {
  let first!: PositionCallback; const watches: PositionCallback[] = [], clear = vi.fn();
  const getPosition = vi.fn((ok: PositionCallback) => { first = ok; }), watch = vi.fn((ok: PositionCallback) => { watches.push(ok); return watches.length + 40; });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: getPosition, watchPosition: watch, clearWatch: clear } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/plan') { const request = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ options: [{ ...option, departureAt: request.departureAt }], baseline: null, conflicts: [], warnings: [], evaluatedAt: request.departureAt, graphVersion: 'test', eventRevision: 0, source: 'local-osm' })); }
    return responseFor(url);
  }));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' }); await chooseEndpoints();
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' })); const navigate = await screen.findByRole('button', { name: 'Navigate' });
  fireEvent.click(screen.getByRole('button', { name: 'My location' }));
  act(() => first({ timestamp: Date.now(), coords: { longitude: 74, latitude: 31, accuracy: 500 } } as GeolocationPosition));
  expect(watches).toHaveLength(1); fireEvent.click(navigate); expect(clear).toHaveBeenCalledWith(41);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' })); expect(watches).toHaveLength(2);
  await act(async () => watches[1]({ timestamp: Date.now(), coords: { longitude: 73, latitude: 33.7, accuracy: 8 } } as GeolocationPosition));
  const before = capture.props!.focus;
  act(() => {
    watches[0]({ timestamp: Date.now(), coords: { longitude: 74, latitude: 31, accuracy: 500 } } as GeolocationPosition);
    first({ timestamp: Date.now(), coords: { longitude: 74, latitude: 31, accuracy: 20 } } as GeolocationPosition);
  });
  expect(capture.props!.navigationPosition).toEqual([73, 33.7]); expect(capture.props!.navigationAccuracy).toBe(8); expect(capture.props!.focus).toBe(before);
  expect(getPosition).toHaveBeenCalledOnce();
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
it.each([undefined, 'light', 'dark', 'system'] as const)('uses Dark while loading and preserves the saved appearance %s', async savedTheme => {
  let finishLoading!: (response: Response) => void;
  let changeSystemTheme!: (event: MediaQueryListEvent) => void;
  const media = { matches: false, addEventListener: (_event: string, listener: typeof changeSystemTheme) => { changeSystemTheme = listener; }, removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  const fetcher = vi.fn((url: string) => url === '/api/state'
    ? new Promise<Response>(resolve => { finishLoading = resolve; })
    : Promise.resolve(responseFor(url)));
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  expect(document.documentElement.dataset.theme).toBe('dark');
  await waitFor(() => expect(finishLoading).toBeTypeOf('function'));
  await act(async () => finishLoading(new Response(JSON.stringify({ ...state, profile: { ...state.profile, theme: savedTheme, mapStyle: undefined } }))));
  await screen.findByRole('button', { name: 'Find routes' });
  expect(document.documentElement.dataset.theme).toBe(savedTheme === 'light' || savedTheme === 'system' ? 'light' : 'dark');
  expect(capture.props!.mapStyle).toBe('outdoors');
  act(() => { media.matches = true; changeSystemTheme({ matches: true } as MediaQueryListEvent); });
  expect(document.documentElement.dataset.theme).toBe(savedTheme === 'light' ? 'light' : 'dark');
  expect(fetcher.mock.calls.some(([url]) => url === '/api/profile')).toBe(false);
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
  expect(screen.getByRole('tab', { name: 'Users' })).toBeTruthy();
});
it('opens an agent proposal with its map drawing and populated fields, then approves through the protected proposal endpoint', async () => {
  signInDevelopment('admin@manzil.test', 'ManzilAdmin123!');
  const post = agentNotice({ status: 'reviewed' }), value = agentExtraction(), event = value.events[0];
  const proposal: AgentProposal = { index: 0, version: 'offline-version', state: 'pending', action: 'closure', impact: 'closed', mapping: 'road',
    targetId: 'offline-agent-closure', targetRevision: null, locationKey: agentLocation().key, issues: [],
    draft: { title: event.title, reason: 'vip', description: post.text, sourceUrl: post.url, startsAt: event.startsAt!, endsAt: event.endsAt,
      status: 'draft', drawing: agentLocation().drawing, geometry: agentLocation().geometry } };
  const result = { noticeId: post.id, noticeRevision: 1, state: 'review', extraction: value, proposals: [proposal], issues: [], closureIds: [] };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/state') return new Response(JSON.stringify({ ...state, notices: [post] }));
    if (url === '/api/agent/results') return new Response(JSON.stringify([result]));
    if (url === '/api/agent/status') return new Response(JSON.stringify({ enabled: true, configured: true, autoPublish: false, dailyLimit: 20, attemptedToday: 1, pending: 0 }));
    if (url === '/api/geometry') return new Response(JSON.stringify(agentLocation().geometry));
    if (url.endsWith('/review')) return new Response(JSON.stringify({ result, proposal: { ...proposal, state: 'approved' },
      closure: { ...JSON.parse(init!.body as string).draft, id: proposal.targetId, revision: 1, createdAt: date, updatedAt: date } }));
    return responseFor(url);
  });
  vi.stubGlobal('fetch', fetcher); render(<App />); await screen.findByRole('tab', { name: 'Pipeline' });
  fireEvent.click(screen.getByRole('tab', { name: 'Pipeline' }));
  const panel = screen.getByRole('tabpanel', { name: 'Pipeline' });
  await within(panel).findByText('Map draft prepared; awaiting approval.');
  fireEvent.click(panel.querySelector('.pipeline-post>summary')!);
  fireEvent.click(within(panel).getByRole('button', { name: 'Review on map' }));
  expect(await screen.findByRole('heading', { name: 'Review agent map proposal' })).toBeTruthy();
  expect((screen.getByLabelText('Reason') as HTMLSelectElement).value).toBe('vip');
  expect((screen.getByLabelText('Road / place') as HTMLInputElement).value).toBe(event.title);
  expect(capture.props?.drawing).toEqual(agentLocation().drawing);
  expect(capture.props?.focus?.coordinates).toEqual(agentLocation().drawing.coordinates);
  fireEvent.click(screen.getByRole('button', { name: 'Approve and add to map' }));
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url === `/api/agent/notices/${post.id}/review`)).toBe(true));
  const approval = fetcher.mock.calls.find(([url]) => url.endsWith('/review'))!;
  expect(JSON.parse(approval[1]!.body as string)).toMatchObject({ noticeRevision: 1, index: 0, version: proposal.version, decision: 'approve', draft: { title: event.title, reason: 'vip', status: 'published' } });
  expect(fetcher.mock.calls.some(([url]) => url === '/api/closures')).toBe(false);
});
it('does not automatically show the tour on ordinary login even on a browser without a completion flag', async () => {
  sessionStorage.removeItem('manzil-entry-guest'); localStorage.removeItem('manzil-tour-v1');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responseFor(url)));
  render(<App />);
  fireEvent.click(screen.getByText('Choose a development account'));
  fireEvent.click(screen.getByRole('button', { name: /Normal user/ }));
  fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
  await screen.findByRole('button', { name: 'Find routes' });
  expect(screen.queryByRole('dialog', { name: 'Welcome to Manzil' })).toBeNull();
  expect(screen.queryByRole('dialog', { name: 'Personal trip data' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Help & demos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Replay tour' }));
  expect(screen.getByRole('dialog', { name: 'Welcome to Manzil' })).toBeTruthy();
});
it('walks through Closures, Saved and Profile without planning or requesting GPS and preserves a planned route', async () => {
  const getCurrentPosition = vi.fn(), watchPosition = vi.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition, watchPosition } });
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/plan') { const request = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ options: [{ ...option, departureAt: request.departureAt }], baseline: null, conflicts: [], warnings: [], evaluatedAt: date, graphVersion: 'test', eventRevision: 0, source: 'local-osm' })); }
    return responseFor(url);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  await chooseEndpoints();
  fireEvent.click(screen.getByRole('button', { name: 'Plan ahead' }));
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  await waitFor(() => expect(capture.props?.routeOptions).toHaveLength(1));
  const before = capture.props!;
  fireEvent.click(screen.getByRole('button', { name: 'Help & demos' }));
  fireEvent.click(screen.getByRole('button', { name: 'Replay tour' }));
  for (let index = 0; index < 9; index++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('dialog', { name: 'Road closures' })).toBeTruthy();
  expect(within(screen.getByRole('complementary', { name: 'closures controls' })).getByRole('heading', { name: 'Road closures' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Saved' }).getAttribute('aria-current')).toBe('page');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Profile' }).getAttribute('aria-current')).toBe('page');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  expect(screen.getByRole('heading', { name: 'Plan ahead' })).toBeTruthy();
  expect(capture.props!.routeOptions).toEqual(before.routeOptions);
  expect(capture.props!.departureAt).toBe(before.departureAt);
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/plan')).toHaveLength(1);
  expect(getCurrentPosition).not.toHaveBeenCalled(); expect(watchPosition).not.toHaveBeenCalled();
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
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  await chooseEndpoints();
  const plan = screen.getByRole('button', { name: 'Find routes' });
  expect(plan.matches(':disabled')).toBe(false);
  fireEvent.click(plan);
  await waitFor(() => expect(capture.props?.routeOptions).toHaveLength(1));
  expect(fetcher.mock.calls.some(([url]) => url === '/api/plan')).toBe(true);
});

it('unlocks existing personal screens with a dummy account and returns to guest planning on sign-out', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responseFor(url)));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  expect(screen.queryByRole('button', { name: 'Activity' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in for personal features' }));
  fireEvent.click(screen.getByText('Choose a development account'));
  fireEvent.click(screen.getByRole('button', { name: /Normal user/ }));
  fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open profile' }));
  expect(screen.getByText('Not verified')).toBeTruthy();
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
  expect(await screen.findByRole('heading', { name: 'Edit closure' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Road / place' }).getAttribute('value')).toBe(privateReport.title);
  expect(capture.props?.drawing).toEqual(privateReport.drawing); expect(capture.props?.selectedClosureId).toBe(privateReport.id);
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('dialog', { name: 'Manzil' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue as guest' }).at(-1)!);
  await screen.findByRole('button', { name: 'Skip tour' }); fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  fireEvent.click(screen.getByRole('button', { name: 'Closures' }));
  expect(screen.getByRole('heading', { name: 'Road closures' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Edit closure' })).toBeNull();
  expect(screen.queryByDisplayValue(privateReport.title)).toBeNull(); expect(screen.queryByText(privateReport.description)).toBeNull();
  expect(screen.queryByRole('img', { name: 'Closure photo 1' })).toBeNull();
  expect(capture.props?.drawing).toBeNull(); expect(capture.props?.selectedClosureId).toBeNull(); expect(capture.props?.closures).toEqual([]);
});
it('starts the tour on explicit guest entry, gates guest reports and resumes without another automatic tour', async () => {
  sessionStorage.removeItem('manzil-entry-guest');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => responseFor(url)));
  const first = render(<App />);
  fireEvent.click(screen.getByText('Continue as guest', { selector: 'button' }));
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
  await screen.findByRole('button', { name: 'Find routes' });
  expect(screen.queryByRole('dialog', { name: 'Welcome to Manzil' })).toBeNull();
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
  const summary = { period: 'month', from: '2026-09-30T19:00:00Z', until: date, tripCount: 0, distanceMeters: 0, durationSeconds: 0, costPkr: 0, litres: 0, pricedTripCount: 0, unpricedTripCount: 0, unpricedDistanceMeters: 0, complete: true };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/trips/statistics' ? new Response(JSON.stringify({ month: summary })) : responseFor(url)));
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  expect(document.querySelector('.account-trigger')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Open profile' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
  fireEvent.click(screen.getByRole('button', { name: /Personal statistics/ }));
  expect(await screen.findByRole('dialog', { name: 'Personal statistics' })).toBeTruthy();
  expect(await screen.findByText('No recorded trips this month.')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'This week' })).toBeTruthy();
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
  expect(within(history).queryByText('Demo data')).toBeNull();
  expect(within(history).queryByRole('button', { name: 'Start recording' })).toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url.startsWith('/api/trips/'))).toBe(false);
  expect(watch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close trip history' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('views and hides a saved trace from read-only Activity and opens its journey editor without collecting GPS', async () => {
  signInDevelopment('user@manzil.test', 'ManzilUser123!');
  const clear = vi.fn(), watch = vi.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: clear } });
  const endedAt = '2026-10-15T10:03:00Z';
  const saved: Trip = { id: 'saved-trace', name: 'Faisal Mosque → Centaurus', startedAt: date, endedAt, createdAt: endedAt, distanceMeters: 500, durationSeconds: 180, points: [{ coordinate: [73.08, 33.72], timestamp: date, accuracy: 10 }, { coordinate: [73.085, 33.72], timestamp: endedAt, accuracy: 10 }], pointCount: 2, gaps: 0, contributeToRoadDiscovery: false };
  const totals = { period: 'month', from: null, until: endedAt, complete: true, tripCount: 1, distanceMeters: 500, durationSeconds: 180, pricedTripCount: 0, unpricedTripCount: 1, unpricedDistanceMeters: 500, costPkr: 0, litres: 0 };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/state') return new Response(JSON.stringify({ ...state, profile: { ...state.profile, collectTravelData: true }, trips: [{ ...saved, points: [] }] }));
    if (url === '/api/trips/saved-trace') return new Response(JSON.stringify(saved));
    if (url === '/api/trips/statistics') return new Response(JSON.stringify({ month: totals, week: { ...totals, period: 'week' } }));
    if (url === '/api/plan') { const request = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ options: [{ ...option, departureAt: request.departureAt }], baseline: null, conflicts: [], warnings: [], evaluatedAt: request.departureAt, graphVersion: 'test', eventRevision: 0, source: 'local-osm' })); }
    return responseFor(url);
  }); vi.stubGlobal('fetch', fetcher);
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  await chooseEndpoints(); fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  await waitFor(() => expect(capture.props!.routeOptions).toHaveLength(1));
  const planned = { origin: capture.props!.origin, destination: capture.props!.destination, route: capture.props!.selectedRoute, options: capture.props!.routeOptions };
  fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
  expect(screen.queryByRole('button', { name: 'Start recording' })).toBeNull(); expect(screen.queryByText('Record a trip')).toBeNull();
  expect(capture.props!.recordedPoints).toEqual([]); expect(watch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View on map' }));
  await waitFor(() => expect(capture.props?.recordedPoints).toEqual(saved.points));
  expect(capture.props!.routeOptions).toEqual([]); expect(capture.props!.selectedRoute).toBeNull(); expect(capture.props!.baseline).toBeNull();
  expect(capture.props!.origin).toBeNull(); expect(capture.props!.destination).toBeNull(); expect(capture.props!.waypoints).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Fit journey on map' }));
  expect(capture.props!.focus?.coordinates).toEqual(saved.points.map(point => point.coordinate));
  fireEvent.click(screen.getByRole('button', { name: 'Hide recorded trip' }));
  expect(capture.props?.recordedPoints).toEqual([]);
  expect(capture.props!.origin).toEqual(planned.origin); expect(capture.props!.destination).toEqual(planned.destination);
  expect(capture.props!.selectedRoute).toEqual(planned.route); expect(capture.props!.routeOptions).toEqual(planned.options);
  fireEvent.click(screen.getByRole('button', { name: 'Save journey' }));
  expect(await screen.findByRole('heading', { name: 'New commute' })).toBeTruthy();
  expect(screen.getByLabelText('Commute name')).toHaveProperty('value', saved.name);
  expect(screen.getByLabelText('Usual departure · Pakistan time')).toHaveProperty('value', '15:00');
  expect(capture.props!.origin).toEqual({ name: 'Faisal Mosque', coordinate: saved.points[0].coordinate });
  expect(capture.props!.destination).toEqual({ name: 'Centaurus', coordinate: saved.points.at(-1)!.coordinate });
  expect(screen.getByRole('button', { name: 'Save commute' }).matches(':disabled')).toBe(false);
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/trips/saved-trace')).toHaveLength(2);
  expect(fetcher.mock.calls.some(([url]) => url === '/api/commutes')).toBe(false);
  expect(fetcher.mock.calls.filter(([url]) => url === '/api/plan')).toHaveLength(1);
  expect(watch).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
});
it('asks only a newly registered account for optional trip data before its tour and remembers Not now', async () => {
  sessionStorage.setItem('manzil-travel-data-choice-v1:dev-user', 'pending');
  sessionStorage.setItem('manzil-registration-tour-v1:dev-user', 'pending');
  signInDevelopment('user@manzil.test', 'ManzilUser123!');
  localStorage.removeItem('manzil-tour-v1');
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => url === '/api/profile' && init?.method === 'PATCH' ? new Response(JSON.stringify({ ...state.profile, ...JSON.parse(String(init.body)) })) : responseFor(url));
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  expect(await screen.findByRole('dialog', { name: 'Personal trip data' })).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'Welcome to Manzil' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  expect(await screen.findByRole('dialog', { name: 'Welcome to Manzil' })).toBeTruthy();
  expect(sessionStorage.getItem('manzil-registration-tour-v1:dev-user')).toBe('pending');
  fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  expect(sessionStorage.getItem('manzil-registration-tour-v1:dev-user')).toBeNull();
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
it('retains selected blue routes during passive refresh and atomically replaces them only after fresh validation', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime('2026-10-18T08:00:00Z');
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
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  await chooseEndpoints();
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' }));
  await waitFor(() => expect(capture.props?.routeOptions).toHaveLength(1));
  expect(screen.queryByRole('button', { name: 'Block a point on this route' })).toBeNull();
  const selected = capture.props!.selectedRoute!, geometry = selected.geometry;
  vi.setSystemTime('2026-10-18T08:01:00Z');
  await act(async () => { intervals.get(60000)!(); });
  await waitFor(() => expect(requests).toBe(2));
  expect(capture.props!.refreshing).toBe(true); expect(capture.props!.updating).toBe(false); expect(capture.props!.selectedRoute).toEqual(selected);
  expect(capture.props!.routeOptions![0].geometry).toEqual(geometry); expect(capture.mounts).toBe(1);
  expect(screen.getByRole('button', { name: 'Navigate' }).matches(':disabled')).toBe(true);
  expect(screen.getByRole('heading', { name: 'Choose your route' })).toBeTruthy();
  const routeCard = screen.getByRole('button', { name: /Recommended route/ });
  expect(routeCard.matches(':disabled')).toBe(false); expect(routeCard.getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('.route-result-controls')?.matches(':disabled')).toBe(false);
  expect(screen.queryByText('Restrictions changed')).toBeNull(); expect(screen.queryByText('Finding routes…')).toBeNull(); expect(screen.queryByText('Updating…')).toBeNull();
  const next = { ...option, id: 'fresh-detour', kind: 'detour', durationSeconds: 240, geometry: { type: 'LineString', coordinates: [[73, 33.7], [73.001, 33.705], [73, 33.71]] }, departureAt: '2026-10-18T08:01:00.000Z' };
  await act(async () => { resolvePlan(new Response(JSON.stringify({ options: [next], baseline: null, conflicts: [], warnings: [], evaluatedAt: '2026-10-18T08:01:00.000Z', graphVersion: 'test', eventRevision: 0, source: 'local-osm' }))); });
  await waitFor(() => expect(capture.props!.selectedRoute?.id).toBe('fresh-detour'));
  expect(capture.props!.refreshing).toBe(false); expect(capture.props!.updating).toBe(false);
  expect(capture.props!.routeOptions).toHaveLength(1); expect(capture.props!.routeOptions![0].geometry).toEqual(next.geometry); expect(capture.mounts).toBe(1);
  expect(screen.getByRole('button', { name: 'Navigate' }).matches(':disabled')).toBe(false);
});

it('discards a previous account’s pending route response and clears its chosen endpoints on sign-out', async () => {
  signInDevelopment('user@manzil.test', 'ManzilUser123!');
  let finishPlan!: (value: Response) => void;
  let phase = 'initial'; const planStages: string[] = [];
  const fetcher = vi.fn(async (url: string) => {
    if (url !== '/api/plan') return responseFor(url);
    planStages.push(`${getAuthSession().user?.uid ?? 'guest'}:${phase}`);
    return new Promise<Response>(resolve => { finishPlan = resolve; });
  });
  vi.stubGlobal('fetch', fetcher); render(<App />); await screen.findByRole('button', { name: 'Find routes' }); await chooseEndpoints();
  fireEvent.click(screen.getByRole('button', { name: 'Find routes' })); await waitFor(() => expect(finishPlan).toBeTypeOf('function'));
  phase = 'profile'; fireEvent.click(screen.getByRole('button', { name: 'Open profile' })); phase = 'sign-out'; fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('dialog', { name: 'Manzil' });
  await act(async () => finishPlan(new Response(JSON.stringify({ options: [option], baseline: null, conflicts: [], warnings: [], evaluatedAt: date, graphVersion: 'test', eventRevision: 0, source: 'local-osm' }))));
  expect(screen.queryByRole('button', { name: 'Navigate' })).toBeNull();
  phase = 'guest-entry'; fireEvent.click(screen.getAllByRole('button', { name: 'Continue as guest' }).at(-1)!);
  await screen.findByRole('button', { name: 'Skip tour' }); fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
  await screen.findByTestId('map');
  expect(capture.props!.origin).toBeNull(); expect(capture.props!.destination).toBeNull(); expect(capture.props!.selectedRoute).toBeNull(); expect(capture.props!.routeOptions).toEqual([]);
  expect(screen.queryByRole('button', { name: 'Navigate' })).toBeNull();
  expect(planStages).toEqual(['dev-user:initial']);
});
