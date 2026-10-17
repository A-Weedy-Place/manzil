// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState, FuelPriceStatus, PlanResponse, RouteOption, Trip, TripStatistics, VehicleProfile } from '../shared/types';
import ProfilePanel from '../src/components/ProfilePanel';
import RouteResults from '../src/components/RouteResults';
import ActivityPanel from '../src/components/ActivityPanel';
import MonthlyStatistics from '../src/components/MonthlyStatistics';
import FuelPrices from '../src/components/FuelPrices';
import VehicleSettings from '../src/components/VehicleSettings';
import AdminPanel from '../src/components/AdminPanel';
import { setLanguage } from '../src/lib/language';
import { estimateRouteFuel } from '../shared/fuel';

const calls = vi.hoisted(() => ({ api: vi.fn(), send: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: calls.api, send: calls.send }));
const at = '2026-10-17T08:00:00Z';
const vehicle: VehicleProfile = { kind: 'car', label: 'My car', fuelType: 'petrol', kmPerLitre: 10 };
const fuel: FuelPriceStatus = { state: 'fresh', lastCheckedAt: at, lastSuccessAt: at, nextCheckAt: '2099-10-17T19:00:00Z', message: '', records: [
  { effectiveFrom: '2026-10-01T19:00:00Z', petrolPerLitre: 300, dieselPerLitre: 320, sourceUrl: 'https://psopk.com/example', sourceName: 'PSO reference prices', retrievedAt: at },
  { effectiveFrom: '2026-10-15T19:00:00Z', petrolPerLitre: 310, dieselPerLitre: 330, sourceUrl: 'https://psopk.com/example', sourceName: 'PSO reference prices', retrievedAt: at },
] };
const state = (patch: Partial<AppState> = {}): AppState => ({
  closures: [], commutes: [], alerts: [], notices: [], trips: [], eventRevision: 0,
  profile: { id: 'local', displayName: 'Ali', theme: 'light', mapStyle: 'outdoors', mapDetail: 'clean', browserNotifications: false, inferFrequentRoutes: false, transport: 'car', createdAt: at, updatedAt: at },
  graph: { ready: false, source: 'fixture', version: 'test', nodeCount: 0, edgeCount: 0, importedAt: null, bounds: [72, 33, 74, 35], limitations: [] },
  sourceStatus: { enabled: false, intervalMinutes: 15, profileUrl: '', lastAttemptAt: null, lastSuccessAt: null, nextCheckAt: null, state: 'disabled', message: '', noticesCollected: 0, coverage: 'partial' }, fuel, ...patch,
});
const profileProps = () => ({ personalFeaturesAvailable: true, reload: vi.fn(async () => {}), notify: vi.fn(), onSources: vi.fn(), onActivity: vi.fn(), onSaveProposal: vi.fn(async () => {}) });
const route: RouteOption = { id: 'direct', kind: 'direct', label: 'Recommended', validation: 'clear', warnings: [], geometry: { type: 'LineString', coordinates: [[73, 33.7], [73, 33.71]] }, distanceMeters: 10_000, durationSeconds: 1200, departureAt: at, arrivalAt: '2026-10-17T08:20:00Z', steps: [], snappedOrigin: [73, 33.7], snappedDestination: [73, 33.71] };
const plan: PlanResponse = { options: [route, { ...route, id: 'longer', label: 'Alternative 1', kind: 'alternative', distanceMeters: 15_000 }], baseline: { ...route, distanceMeters: 8_000 }, conflicts: [{ closureId: 'closed', title: 'Park Road', entryAt: at, exitAt: at }], warnings: [], evaluatedAt: at, graphVersion: 'test', eventRevision: 0, source: 'local-osm' };
const routeProps = () => ({ plan, selectedId: 'direct', onSelect: vi.fn(), onSaveCommute: vi.fn(), onNavigate: vi.fn(), onDemo: vi.fn(), demoBusy: false });
function summary(period: TripStatistics['period'], tripCount: number, costPkr: number): TripStatistics {
  return { period, from: null, until: at, tripCount, distanceMeters: tripCount * 10_000, durationSeconds: tripCount * 600, pricedTripCount: tripCount - 1, unpricedTripCount: 1, unpricedDistanceMeters: 10_000, costPkr, litres: costPkr / 310, complete: true };
}
const statistics = { week: summary('week', 61, 18_600), month: summary('month', 100, 31_000), all: summary('all', 150, 46_500) };
const trip: Trip = { id: 'one', name: 'Recorded commute', startedAt: at, endedAt: '2026-10-17T08:10:00Z', points: [], pointCount: 4, contributeToRoadDiscovery: false, distanceMeters: 10_000, durationSeconds: 600, createdAt: at, gaps: 0, fuelEstimate: estimateRouteFuel(10_000, at, vehicle, fuel.records)! };
const activityProps = () => ({ points: [], setPoints: vi.fn(), reload: vi.fn(async () => {}), notify: vi.fn(), onView: vi.fn() });
beforeEach(() => { setLanguage('en'); calls.api.mockReset().mockResolvedValue(statistics); calls.send.mockReset().mockResolvedValue({}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage('en'); });

it('saves motorcycle, fuel type and decimal km/litre without enabling GPS collection or changing the routing profile', async () => {
  render(<ProfilePanel {...profileProps()} state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Your vehicle' }));
  fireEvent.change(screen.getByLabelText('Vehicle type'), { target: { value: 'motorcycle' } });
  fireEvent.change(screen.getByLabelText('Fuel type'), { target: { value: 'diesel' } });
  fireEvent.change(screen.getByLabelText('Vehicle name (optional)'), { target: { value: 'Daily bike' } });
  fireEvent.change(screen.getByLabelText('Mileage (km/litre)'), { target: { value: '42.5' } });
  expect(screen.getByText('Motorcycle is used for fuel estimates. Routes and time estimates still use the current car-road network.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save vehicle' }));
  await waitFor(() => expect(calls.send).toHaveBeenCalledWith('/profile', { vehicle: { kind: 'motorcycle', label: 'Daily bike', fuelType: 'diesel', kmPerLitre: 42.5 } }, 'PATCH'));
});

it('rejects invalid mileage and allows an empty field to disable estimates', async () => {
  const onSave = vi.fn(async () => {}); const ui = render(<VehicleSettings vehicle={vehicle} busy={false} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('Mileage (km/litre)'), { target: { value: '0' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save vehicle' }).closest('form')!);
  expect(screen.getByRole('alert').textContent).toContain('1 to 200'); expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Mileage (km/litre)'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save vehicle' }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...vehicle, kmPerLitre: null }));
  fireEvent.change(screen.getByLabelText('Vehicle name (optional)'), { target: { value: 'Unsaved name' } });
  ui.rerender(<VehicleSettings vehicle={{ ...vehicle }} busy={false} onSave={onSave} />);
  expect((screen.getByLabelText('Vehicle name (optional)') as HTMLInputElement).value).toBe('Unsaved name');
});

it('shows fuel costs for each actual alternative and keeps the blocked original comparison separate', () => {
  const props = routeProps(); render(<RouteResults {...props} vehicle={vehicle} fuel={fuel} />);
  expect(screen.getByText('≈ PKR 310')).toBeTruthy(); expect(screen.getByText('≈ PKR 465')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect original blocked route' }));
  expect(screen.getByText('≈ PKR 248')).toBeTruthy(); expect(screen.getByText('Unavailable · comparison only')).toBeTruthy();
  expect(props.onNavigate).not.toHaveBeenCalled(); expect(props.onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Navigate' })); expect(props.onNavigate).toHaveBeenCalledTimes(1);
});

it('does not invent prices for missing mileage or an unknown historical fuel period', () => {
  const props = routeProps(); const ui = render(<RouteResults {...props} vehicle={{ ...vehicle, kmPerLitre: null }} fuel={fuel} />);
  expect(screen.queryByText(/≈ PKR/)).toBeNull(); expect(screen.getByText('Add vehicle mileage in Profile for fuel estimates.')).toBeTruthy();
  ui.rerender(<RouteResults {...props} vehicle={vehicle} fuel={{ ...fuel, records: [] }} />);
  expect(screen.queryByText(/≈ PKR/)).toBeNull(); expect(screen.getAllByText('Fuel estimate unavailable')).toHaveLength(2);
  expect(screen.getByText('Unavailable')).toBeTruthy();
});

it('shows daily price provenance with date-only effective dates and labels a failed check as cached', () => {
  render(<FuelPrices status={{ ...fuel, state: 'error' }} />);
  expect(screen.getByText('Cached reference')).toBeTruthy();
  const effective = screen.getByText(/Effective from/); expect(effective.textContent).toContain('16 Oct 2026'); expect(effective.textContent).not.toContain('12:00');
  expect(screen.getByRole('link', { name: 'PSO reference prices' }).getAttribute('href')).toBe('https://psopk.com/example');
  expect(screen.getByText('The latest check is overdue or failed. Estimates use the saved reference price.')).toBeTruthy();
});

it('shows monthly retained-history totals beyond the recent list without reading raw GPS', async () => {
  render(<ActivityPanel {...activityProps()} state={state({ trips: [trip, { ...trip, id: 'old', name: 'Old trip', fuelEstimate: undefined }] })} />);
  await screen.findByText('≈ PKR 31,000'); expect(screen.getByText('100')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'This week' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'All retained trips' })).toBeNull();
  expect(calls.api).toHaveBeenCalledWith('/trips/statistics', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(calls.api).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Trips without an estimate are excluded from cost totals. Older trips are not repriced after changing your vehicle.')).toBeTruthy();
  expect(screen.getByText('Fuel estimate unavailable for this trip.')).toBeTruthy();
});

it('keeps saved trip costs after the current vehicle changes and reports totals unavailable on an API failure', async () => {
  calls.api.mockRejectedValue(new Error('offline'));
  const profile = { ...state().profile, vehicle: { ...vehicle, kmPerLitre: 50 } };
  render(<ActivityPanel {...activityProps()} state={state({ profile, trips: [trip] })} />);
  await screen.findByRole('alert'); expect(screen.getByText('≈ PKR 310')).toBeTruthy();
  expect(screen.queryByText('≈ PKR 62')).toBeNull(); expect(screen.queryByText('≈ PKR 18,600')).toBeNull();
  expect(screen.getByText('Could not load monthly statistics.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' })); await waitFor(() => expect(calls.api).toHaveBeenCalledTimes(2));
});

it('avoids loading statistics while Activity is hidden and labels partial totals honestly', async () => {
  calls.api.mockResolvedValue({ ...statistics, month: { ...statistics.month, complete: false } });
  const props = activityProps(); const ui = render(<ActivityPanel {...props} active={false} state={state()} />);
  expect(calls.api).not.toHaveBeenCalled();
  ui.rerender(<ActivityPanel {...props} active state={state()} />);
  expect(await screen.findByText('Partial totals: the retained-history limit was reached.')).toBeTruthy();
});

it('opens monthly statistics without requesting GPS, enabling collection or reading raw traces', async () => {
  const watchPosition = vi.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: vi.fn() } });
  render(<MonthlyStatistics state={state()} />);
  expect(await screen.findByText('≈ PKR 31,000')).toBeTruthy();
  expect(calls.api).toHaveBeenCalledTimes(1); expect(calls.api.mock.calls[0][0]).toBe('/trips/statistics');
  expect(watchPosition).not.toHaveBeenCalled(); expect(calls.send).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Start recording' })).toBeNull();
});

it('provides Urdu labels for the new vehicle and price controls', () => {
  setLanguage('ur'); render(<VehicleSettings vehicle={vehicle} busy={false} onSave={vi.fn(async () => {})} status={fuel} />);
  expect(screen.getByRole('heading', { name: 'آپ کی گاڑی' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'گاڑی محفوظ کریں' })).toBeTruthy();
  expect(screen.getByText('ایندھن کی قیمتیں')).toBeTruthy();
});

it('allows an explicit admin fuel check without starting the notice collector or polling from the browser', async () => {
  const reload = vi.fn(async () => {});
  render(<AdminPanel state={state()} at={at} selectedId={null} reload={reload} notify={vi.fn()} onSelect={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} onReview={vi.fn(async () => {})} onManualClosure={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Pipeline' }));
  expect(calls.send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Check fuel prices' }));
  await waitFor(() => expect(calls.send).toHaveBeenCalledWith('/fuel/check', {}));
  expect(reload).toHaveBeenCalledTimes(1); expect(calls.send).toHaveBeenCalledTimes(1);
});
