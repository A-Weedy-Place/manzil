// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { AppState } from '../shared/types';
import type { TransitNetwork, TransitPlanResponse } from '../shared/transit';
import type { MapViewProps } from '../src/components/MapView';
import { signInDevelopment, signOut } from '../src/lib/auth';
import { setLanguage } from '../src/lib/language';
import { api, send } from '../src/lib/api';
import { useTransit } from '../src/lib/useTransit';
import App from '../src/App';
import TransitPanel, { ServiceNoticeForm } from '../src/components/TransitPanel';

const capture = vi.hoisted(() => ({ props: null as MapViewProps | null, mounts: 0 }));
vi.mock('../src/components/MapView', () => ({ default: (props: MapViewProps) => { capture.props = props; useEffect(() => { capture.mounts++; }, []); return <div data-testid="map" />; } }));
vi.mock('../src/lib/api', () => ({ api: vi.fn(), send: vi.fn() }));
const at = '2026-10-18T08:00:00.000Z';
const network: TransitNetwork = { version: 'network-v1', importedAt: at, evaluatedAt: at, eventRevision: 0, disruptionRevision: 0, sources: [{ id: 'publisher', name: 'Public network source', url: 'https://example.com/network', license: 'Public test fixture', retrievedAt: at, limitations: [] }], limitations: [], disruptions: [],
  routes: [{ id: 'ev1', shortName: 'EV05101', name: 'Station A to Station C', agency: 'PMA', color: '#2475d1', sourceId: 'publisher', coverage: 'stops-and-shape' }],
  stops: [{ id: 'a', name: 'Station A', coordinate: [73, 33.7] }, { id: 'b', name: 'Station B', coordinate: [73.01, 33.7] }, { id: 'c', name: 'Station C', coordinate: [73.02, 33.7] }],
  patterns: [{ id: 'ev1-0', routeId: 'ev1', directionId: '0', headsign: 'Station C', stopIds: ['a', 'b', 'c'], geometry: { type: 'LineString', coordinates: [[73, 33.7], [73.01, 33.7], [73.02, 33.7]] }, geometryQuality: 'provided-shape' }],
  statuses: [{ patternId: 'ev1-0', availability: 'available', closureIds: [], disruptionIds: [], closureAssessment: 'provided-shape' }] };
const state: AppState = { closures: [], commutes: [], alerts: [], notices: [], trips: [], eventRevision: 0,
  profile: { id: 'local', displayName: 'Traveller', theme: 'dark', mapDetail: 'clean', mapStyle: 'outdoors', browserNotifications: false, collectTravelData: false, inferFrequentRoutes: false, transport: 'car', createdAt: at, updatedAt: at },
  graph: { ready: true, version: 'test', source: 'fixture', nodeCount: 2, edgeCount: 2, importedAt: at, bounds: [72.97, 33.6, 73.16, 33.75], limitations: [] },
  sourceStatus: { enabled: false, state: 'disabled', intervalMinutes: 15, profileUrl: '', lastAttemptAt: null, lastSuccessAt: null, nextCheckAt: null, message: '', noticesCollected: 0, coverage: 'partial' } };
function transitPlan(): TransitPlanResponse { return { options: [{ id: 'bus-journey', departureAt: at, arrivalAt: null, durationSeconds: null, distanceMeters: 2000, walkingDistanceMeters: 0, transfers: 0, timing: 'unknown', warnings: [], legs: [{ kind: 'ride', routeId: 'ev1', patternId: 'ev1-0', from: network.stops[0], to: network.stops[2], stops: network.stops, geometry: network.patterns[0].geometry, geometryQuality: 'provided-shape', distanceMeters: 2000, durationSeconds: null, departureAt: null, arrivalAt: null, availability: 'available' }] }], departureAt: at, evaluatedAt: at, eventRevision: 0, disruptionRevision: 0, datasetVersion: network.version, warnings: [] }; }
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); signOut(); setLanguage('en'); sessionStorage.setItem('manzil-entry-guest', 'yes'); capture.props = null; capture.mounts = 0;
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); Element.prototype.scrollTo = vi.fn();
  vi.mocked(send).mockReset(); vi.mocked(send).mockResolvedValue({}); vi.mocked(api).mockReset(); vi.mocked(api).mockImplementation(async path => path.startsWith('/transit/network') ? network : path === '/transit/plan' ? transitPlan() : path === '/transit/revision' ? { version: network.version, eventRevision: 0, disruptionRevision: 0 } : state as never);
});
afterEach(() => { cleanup(); signOut(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setLanguage('en'); document.documentElement.dir = 'ltr'; });

it('keeps Local endpoints and transit lines independent of the driving planner while retaining one map', async () => {
  render(<App />); await screen.findByRole('button', { name: 'Find routes' }); await screen.findByTestId('map');
  act(() => { capture.props!.onEndpointMove('A', [73.03, 33.71]); capture.props!.onEndpointMove('B', [73.04, 33.72]); });
  expect(capture.props?.origin?.coordinate).toEqual([73.03, 33.71]);
  fireEvent.click(screen.getByRole('button', { name: 'Local' }));
  await screen.findByRole('heading', { name: 'Local transport' });
  await waitFor(() => expect(capture.props?.transit?.network.version).toBe('network-v1'));
  expect(capture.props?.origin).toBeNull(); expect(capture.props?.destination).toBeNull(); expect(capture.props?.routeOptions).toEqual([]); expect(capture.props?.selectedRoute).toBeNull(); expect(capture.props?.recordedPoints).toEqual([]);
  expect(within(screen.getByRole('banner')).getByText('Live map')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /EV-1 Station A to Station C/ }));
  expect(screen.getByRole('region', { name: 'Selected bus route' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Start at Station A' })); fireEvent.click(screen.getByRole('button', { name: 'End at Station C' }));
  expect(capture.props?.origin?.name).toBe('Station A'); expect(capture.props?.destination?.name).toBe('Station C');
  fireEvent.click(screen.getByRole('button', { name: 'Find local routes' }));
  await screen.findByText('Timetable unavailable'); expect(screen.queryByRole('button', { name: 'Navigate' })).toBeNull();
  expect(vi.mocked(api).mock.calls.filter(([path]) => path === '/transit/plan')).toHaveLength(1);
  expect(vi.mocked(api).mock.calls.some(([path]) => path === '/plan')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  expect(capture.props?.transit).toBeNull(); expect(capture.props?.origin?.coordinate).toEqual([73.03, 33.71]); expect(capture.mounts).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Local' }));
  expect(capture.props?.origin?.name).toBe('Station A');
});

it('supports stop-name and friendly code search and hides publication controls from a guest', async () => {
  render(<App />); await screen.findByRole('button', { name: 'Find routes' }); fireEvent.click(screen.getByRole('button', { name: 'Local' }));
  await screen.findByRole('button', { name: /EV-1 Station A to Station C/ });
  const search = screen.getByRole('textbox', { name: 'Search routes or stops' });
  fireEvent.change(search, { target: { value: 'Station B' } }); expect(screen.getByRole('button', { name: /EV-1 Station A to Station C/ })).toBeTruthy();
  fireEvent.change(search, { target: { value: 'EV-1' } }); expect(screen.getByRole('button', { name: /EV-1 Station A to Station C/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /EV-1 Station A to Station C/ })); expect(screen.queryByRole('button', { name: 'Add service suspension' })).toBeNull();
  fireEvent.change(search, { target: { value: 'nonexistent' } }); expect(screen.getByText('No matching routes or stops')).toBeTruthy();
  fireEvent.click(screen.getByText('Data & coverage')); expect(screen.getAllByRole('link', { name: 'Public network source' }).length).toBeGreaterThan(0);
});

it('previews an independent Local departure with matching map time and returns the main Map to live', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(at);
  render(<App />); await screen.findByRole('button', { name: 'Find routes' }); await screen.findByTestId('map');
  act(() => { capture.props!.onEndpointMove('A', [73.03, 33.71]); capture.props!.onEndpointMove('B', [73.04, 33.72]); });
  fireEvent.click(screen.getByRole('button', { name: 'Local' })); await screen.findByRole('heading', { name: 'Local transport' });
  fireEvent.click(screen.getByText('Leave now')); fireEvent.change(screen.getByLabelText('Local departure · Pakistan time'), { target: { value: '2026-10-19T09:30' } }); fireEvent.click(screen.getByRole('button', { name: 'Set departure' }));
  await waitFor(() => expect(capture.props?.departureAt).toBe('2026-10-19T04:30:00.000Z'));
  expect(within(screen.getByRole('banner')).getByText('Planned map')).toBeTruthy();
  expect(vi.mocked(api).mock.calls.some(([path]) => path === '/transit/network?at=2026-10-19T04%3A30%3A00.000Z')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Map' })); expect(capture.props?.departureAt).toBe(at);
  expect(within(screen.getByRole('banner')).getByText('Live map')).toBeTruthy(); expect(capture.props?.origin?.coordinate).toEqual([73.03, 33.71]);
  fireEvent.click(screen.getByRole('button', { name: 'Local' })); expect(capture.props?.departureAt).toBe('2026-10-19T04:30:00.000Z');
});

it('commits a native Local date-picker value even when an intermediate React change event has not fired', async () => {
  render(<App />); await screen.findByRole('button', { name: 'Find routes' });
  fireEvent.click(screen.getByRole('button', { name: 'Local' })); await screen.findByRole('heading', { name: 'Local transport' });
  fireEvent.click(screen.getByText('Leave now'));
  const picker = screen.getByLabelText('Local departure · Pakistan time') as HTMLInputElement;
  picker.value = '2026-10-20T10:45';
  fireEvent.click(screen.getByRole('button', { name: 'Set departure' }));
  await waitFor(() => expect(capture.props?.departureAt).toBe('2026-10-20T05:45:00.000Z'));
  expect(within(screen.getByRole('banner')).getByText('Planned map')).toBeTruthy();
});

it('does not fetch the network on ordinary live clock ticks, but checks a lightweight revision while Local is open', async () => {
  vi.useFakeTimers(); vi.setSystemTime(at);
  const focus = vi.fn();
  const { rerender, result } = renderHook(({ enabled, time }) => useTransit(enabled, time, 0, [], focus), { initialProps: { enabled: true, time: at } });
  await act(async () => { await Promise.resolve(); }); expect(result.current.network?.version).toBe('network-v1');
  rerender({ enabled: true, time: '2026-10-18T08:01:00.000Z' }); await act(async () => { await Promise.resolve(); });
  expect(vi.mocked(api).mock.calls.filter(([path]) => path.startsWith('/transit/network'))).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
  expect(vi.mocked(api).mock.calls.filter(([path]) => path === '/transit/revision')).toHaveLength(1);
  rerender({ enabled: false, time: at }); await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(vi.mocked(api).mock.calls.filter(([path]) => path === '/transit/revision')).toHaveLength(1);
});

it('rejects an outdated local journey response after its endpoints change', async () => {
  let resolve!: (value: TransitPlanResponse) => void;
  vi.mocked(api).mockImplementation(async path => path.startsWith('/transit/network') ? network : path === '/transit/plan' ? new Promise<TransitPlanResponse>(done => { resolve = done; }) : state as never);
  const { result } = renderHook(() => useTransit(true, at, 0, [], vi.fn())); await act(async () => { await Promise.resolve(); });
  act(() => { result.current.changeEndpoint('A', { name: 'A', coordinate: [73, 33.7] }); result.current.changeEndpoint('B', { name: 'C', coordinate: [73.02, 33.7] }); });
  let request!: Promise<void>; act(() => { request = result.current.calculate(); });
  act(() => result.current.changeEndpoint('B', { name: 'Elsewhere', coordinate: [73.1, 33.8] }));
  await act(async () => { resolve(transitPlan()); await request; });
  expect(result.current.result).toBeNull(); expect(result.current.journey).toBeNull(); expect(result.current.destination?.name).toBe('Elsewhere');
});

it('refreshes a wanted journey on the minute without hiding its previous route or fetching the network again', async () => {
  let resolve!: (value: TransitPlanResponse) => void, requests = 0;
  vi.mocked(api).mockImplementation(async path => path.startsWith('/transit/network') ? network : path === '/transit/plan' ? ++requests === 1 ? transitPlan() : new Promise<TransitPlanResponse>(done => { resolve = done; }) : state as never);
  const { result, rerender } = renderHook(({ time }) => useTransit(true, time, 0, [], vi.fn()), { initialProps: { time: at } }); await act(async () => { await Promise.resolve(); });
  act(() => { result.current.changeEndpoint('A', { name: 'A', coordinate: [73, 33.7] }); result.current.changeEndpoint('B', { name: 'C', coordinate: [73.02, 33.7] }); });
  await act(async () => { await result.current.calculate(); }); expect(result.current.journey?.id).toBe('bus-journey');
  const later = '2026-10-18T08:01:00.000Z'; rerender({ time: later }); await act(async () => { await Promise.resolve(); });
  expect(result.current.planning).toBe(true); expect(result.current.journey?.id).toBe('bus-journey');
  expect(vi.mocked(api).mock.calls.filter(([path]) => path.startsWith('/transit/network'))).toHaveLength(1);
  const next = transitPlan(); next.options[0] = { ...next.options[0], id: 'new-departure', departureAt: later }; next.departureAt = later;
  await act(async () => { resolve(next); await Promise.resolve(); });
  expect(result.current.planning).toBe(false); expect(result.current.journey?.id).toBe('new-departure');
});

it('publishes a strict whole-line notice for both directions by default, and scopes a partial section to one direction', async () => {
  const onSaved = vi.fn(), onClose = vi.fn(); render(<ServiceNoticeForm network={network} pattern={network.patterns[0]} at={at} onSaved={onSaved} onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Announced suspension' } }); fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'Published service notice' } });
  const publish = screen.getByRole('button', { name: 'Publish suspension' });
  expect(screen.getByLabelText('Details')).toHaveProperty('maxLength', 1000);
  expect(screen.getByLabelText('Service scope')).toHaveProperty('value', 'both');
  fireEvent.click(publish); await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(vi.mocked(send).mock.calls[0]).toEqual(['/transit/disruptions', expect.objectContaining({ routeId: 'ev1', status: 'published', startsAt: at, endsAt: '2026-10-18T09:00:00.000Z' })]);
  expect(vi.mocked(send).mock.calls[0][1]).not.toHaveProperty('directionId');
  fireEvent.change(screen.getByLabelText('From stop'), { target: { value: 'a' } }); fireEvent.change(screen.getByLabelText('To stop'), { target: { value: 'c' } });
  expect(screen.getByLabelText('Service scope')).toHaveProperty('value', 'direction'); expect((screen.getByLabelText('Service scope') as HTMLSelectElement).disabled).toBe(true);
  fireEvent.click(publish); await waitFor(() => expect(vi.mocked(send)).toHaveBeenCalledTimes(2));
  expect(vi.mocked(send).mock.calls[1][1]).toMatchObject({ routeId: 'ev1', directionId: '0', fromStopId: 'a', toStopId: 'c' });
});

it('publishes the native date-picker suspension window rather than an older controlled input draft', async () => {
  render(<ServiceNoticeForm network={network} pattern={network.patterns[0]} at={at} onSaved={vi.fn()} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Scheduled suspension' } });
  fireEvent.change(screen.getByLabelText('Details'), { target: { value: 'Reviewed public notice' } });
  (screen.getByLabelText('From · Pakistan time') as HTMLInputElement).value = '2026-10-19T07:30';
  (screen.getByLabelText('Until · Pakistan time') as HTMLInputElement).value = '2026-10-19T08:30';
  fireEvent.click(screen.getByRole('button', { name: 'Publish suspension' }));
  await waitFor(() => expect(vi.mocked(send)).toHaveBeenCalledOnce());
  expect(vi.mocked(send).mock.calls[0][1]).toMatchObject({ startsAt: '2026-10-19T02:30:00.000Z', endsAt: '2026-10-19T03:30:00.000Z' });
});

it('lets an admin end a published service suspension using its revision, without echoing server-owned author fields', async () => {
  signInDevelopment('admin@manzil.test', 'ManzilAdmin123!');
  const suspended = structuredClone(network); suspended.disruptions = [{ id: 'notice', revision: 4, routeId: 'ev1', title: 'Bus suspended', description: 'Announced stoppage', startsAt: at, endsAt: '2026-10-18T10:00:00.000Z', status: 'published', author: { uid: 'another-reviewer', displayName: 'Reviewer', role: 'verified' }, createdAt: at, updatedAt: at }];
  vi.mocked(api).mockResolvedValue(suspended);
  const { result } = renderHook(() => useTransit(true, at, 0, [], vi.fn())); await act(async () => { await Promise.resolve(); });
  render(<TransitPanel transit={{ ...result.current, selectedPatternId: 'ev1-0' }} mode="browse" setMode={vi.fn()} onFocus={vi.fn()} canReview at={at} />);
  fireEvent.click(screen.getByRole('button', { name: 'End suspension' }));
  await waitFor(() => expect(vi.mocked(send)).toHaveBeenCalledOnce());
  expect(vi.mocked(send).mock.calls[0]).toEqual(['/transit/disruptions/notice', expect.objectContaining({ status: 'cancelled', revision: 4 }), 'PUT']);
  expect(vi.mocked(send).mock.calls[0][1]).not.toHaveProperty('author'); expect(vi.mocked(send).mock.calls[0][1]).not.toHaveProperty('id');
});

it.each([false, true])('labels section-only service notices accurately in route details and cards (whole-direction notice also active: %s)', async full => {
  const suspended = structuredClone(network);
  const notice = { id: 'partial', revision: 1, routeId: 'ev1', title: 'Station B–C suspended', description: '', startsAt: at, endsAt: '2026-10-18T10:00:00.000Z', status: 'published' as const, fromStopId: 'b', toStopId: 'c', author: { uid: 'reviewer', displayName: 'Reviewer', role: 'verified' as const }, createdAt: at, updatedAt: at };
  suspended.disruptions = [notice]; suspended.statuses[0] = { ...suspended.statuses[0], availability: 'suspended', disruptionIds: ['partial'] };
  if (full) { suspended.disruptions.push({ ...notice, id: 'full', fromStopId: undefined, toStopId: undefined, directionId: '0' }); suspended.statuses[0].disruptionIds.push('full'); }
  const { result } = renderHook(() => useTransit(true, at, 0, [], vi.fn())); await act(async () => { await Promise.resolve(); });
  render(<TransitPanel transit={{ ...result.current, network: suspended, stale: false, selectedPatternId: 'ev1-0' }} mode="browse" setMode={vi.fn()} onFocus={vi.fn()} canReview={false} at={at} />);
  const label = full ? 'Service suspended' : 'Partial suspension';
  expect(screen.getByRole('region', { name: 'Selected bus route' }).querySelector('.transit-status')?.textContent).toBe(label);
  expect(screen.getByRole('button', { name: `EV-1 Station A to Station C · ${label}` })).toBeTruthy();
});
