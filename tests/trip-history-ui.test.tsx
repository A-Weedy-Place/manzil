// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppState, Trip } from '../shared/types';
import TripHistory from '../src/components/TripHistory';
import { setLanguage } from '../src/lib/language';

const mock = vi.hoisted(() => ({ userId: 'traveller' as string | null, api: vi.fn(), download: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: mock.api }));
vi.mock('../src/lib/auth', () => ({ getAuthSession: () => ({ user: mock.userId ? { uid: mock.userId } : null }) }));
vi.mock('../src/lib/format', async () => ({ ...(await vi.importActual<typeof import('../src/lib/format')>('../src/lib/format')), downloadJSON: mock.download }));
const at = '2026-10-17T08:00:00Z';
const trip: Trip = { id: 'sample', name: 'Office journey', startedAt: at, endedAt: '2026-10-17T08:10:00Z', points: [], pointCount: 2, contributeToRoadDiscovery: false, distanceMeters: 5000, durationSeconds: 600, createdAt: at, gaps: 0 };
const full: Trip = { ...trip, points: [{ coordinate: [73, 33.7], timestamp: at, accuracy: 10 }, { coordinate: [73.01, 33.71], timestamp: '2026-10-17T08:10:00Z', accuracy: 12 }] };
const state = (trips = [trip], uid = 'traveller') => ({ profile: { createdAt: at, collectTravelData: false }, trips, membership: { uid, role: 'user', verified: false } }) as AppState;
const props = () => ({ reload: vi.fn(async () => {}), notify: vi.fn(), onView: vi.fn() });
beforeEach(() => { mock.userId = 'traveller'; mock.api.mockReset().mockResolvedValue(full); mock.download.mockReset(); setLanguage('en'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('shows private summaries without loading traces, enabling collection, or starting GPS', () => {
  const watchPosition = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition } });
  render(<TripHistory {...props()} state={state()} />);
  expect(screen.getByText('Office journey')).toBeTruthy(); expect(screen.getByText('5.0 km')).toBeTruthy();
  expect(screen.getByText('Fuel estimate unavailable for this trip.')).toBeTruthy();
  expect(mock.api).not.toHaveBeenCalled(); expect(watchPosition).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Start recording' })).toBeNull();
});

it('loads the authorized private trace only after View on map is selected', async () => {
  const callbacks = props(); render(<TripHistory {...callbacks} state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: 'View on map' }));
  await waitFor(() => expect(callbacks.onView).toHaveBeenCalledWith(full));
  expect(mock.api).toHaveBeenCalledWith('/trips/sample', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(mock.download).not.toHaveBeenCalled();
});

it('supports standalone UI accounts even though the local storage membership is different', async () => {
  mock.userId = 'dev-user';
  const callbacks = props(); render(<TripHistory {...callbacks} state={state([trip], 'local-admin')} showHeading={false} />);
  expect(screen.queryByRole('heading', { name: 'Trip history' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'View on map' }));
  await waitFor(() => expect(callbacks.onView).toHaveBeenCalledWith(full));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('exports explicit detail as longitude-latitude GeoJSON without sharing or recording', async () => {
  const callbacks = props(); render(<TripHistory {...callbacks} state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  await waitFor(() => expect(mock.download).toHaveBeenCalledWith('manzil-trip-sample.geojson', { type: 'Feature', properties: { name: full.name, startedAt: full.startedAt, endedAt: full.endedAt }, geometry: { type: 'LineString', coordinates: [[73, 33.7], [73.01, 33.71]] } }));
  expect(callbacks.onView).not.toHaveBeenCalled(); expect(mock.api).toHaveBeenCalledTimes(1);
});

it('requires confirmation to delete a trip and refreshes summaries only after success', async () => {
  const callbacks = props(); render(<TripHistory {...callbacks} state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Office journey' }));
  expect(mock.api).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
  expect(screen.queryByRole('button', { name: 'Delete trip' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Delete Office journey' })); fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }));
  await waitFor(() => expect(callbacks.notify).toHaveBeenCalledWith('Trip deleted.'));
  expect(mock.api).toHaveBeenCalledWith('/trips/sample', expect.objectContaining({ method: 'DELETE', signal: expect.any(AbortSignal) }));
  expect(callbacks.reload).toHaveBeenCalledTimes(1); expect(screen.queryByRole('button', { name: 'Delete trip' })).toBeNull();
});

it('keeps a failed deletion visible and never reports it successful', async () => {
  mock.api.mockRejectedValue(new Error('Could not delete this trip.'));
  const callbacks = props(); render(<TripHistory {...callbacks} state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Office journey' })); fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Could not delete this trip.');
  expect(screen.getByRole('button', { name: 'Delete trip' })).toBeTruthy(); expect(callbacks.reload).not.toHaveBeenCalled(); expect(callbacks.notify).not.toHaveBeenCalled();
});

it('disables trace actions for retained summary-only trips and reports missing full traces honestly', async () => {
  const callbacks = props(); const ui = render(<TripHistory {...callbacks} state={state([{ ...trip, pointCount: 0 }])} />);
  expect((screen.getByRole('button', { name: 'View on map' }) as HTMLButtonElement).disabled).toBe(true); expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(true);
  ui.rerender(<TripHistory {...callbacks} state={state()} />); mock.api.mockResolvedValue(trip);
  fireEvent.click(screen.getByRole('button', { name: 'View on map' }));
  expect((await screen.findByRole('alert')).textContent).toBe('This trip’s saved trace is no longer available.'); expect(callbacks.onView).not.toHaveBeenCalled();
});

it('drops and aborts an outstanding trace when the account changes', async () => {
  let resolve!: (trip: Trip) => void; mock.api.mockReturnValue(new Promise<Trip>(done => { resolve = done; }));
  const callbacks = props(); const ui = render(<TripHistory {...callbacks} state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export' })); const signal = mock.api.mock.calls[0][1].signal as AbortSignal;
  mock.userId = 'other'; ui.rerender(<TripHistory {...callbacks} state={state([], 'other')} />);
  expect(signal.aborted).toBe(true); await act(async () => resolve(full));
  expect(mock.download).not.toHaveBeenCalled(); expect(callbacks.onView).not.toHaveBeenCalled();
});

it('ignores a completed private request after closing history or signing out without rerender', async () => {
  let resolve!: (trip: Trip) => void; mock.api.mockReturnValue(new Promise<Trip>(done => { resolve = done; }));
  const callbacks = props(); const ui = render(<TripHistory {...callbacks} state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: 'View on map' })); mock.userId = null;
  await act(async () => resolve(full)); expect(callbacks.onView).not.toHaveBeenCalled();
  ui.unmount(); expect((mock.api.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
});

it('never publishes deletion completion or reloads another account after switching users', async () => {
  let resolve!: () => void; mock.api.mockReturnValue(new Promise<void>(done => { resolve = done; }));
  const callbacks = props(); const ui = render(<TripHistory {...callbacks} state={state()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Office journey' })); fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }));
  mock.userId = 'other'; ui.rerender(<TripHistory {...callbacks} state={state([], 'other')} />);
  await act(async () => resolve()); expect(callbacks.reload).not.toHaveBeenCalled(); expect(callbacks.notify).not.toHaveBeenCalled();
});

it('labels individual synthetic trips and their fuel prices without presenting a real-source link', () => {
  const sample: Trip & { demoData: boolean } = { ...trip, name: 'Demo office journey', demoData: true, fuelEstimate: { costPkr: 150, litres: .5, distanceMeters: 5000, calculatedAt: at, vehicle: { kind: 'car', label: 'Demo car', fuelType: 'petrol', kmPerLitre: 10 }, rates: [{ pricePerLitre: 300, effectiveFrom: at, sourceUrl: 'https://example.invalid/demo', distanceMeters: 5000, litres: .5, costPkr: 150 }] } };
  render(<TripHistory {...props()} state={state([sample])} />);
  expect(screen.getByText('Demo data')).toBeTruthy(); expect(screen.getByText('≈ PKR 150')).toBeTruthy();
  expect(screen.getByText(/Demo fuel price/)).toBeTruthy(); expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByText('Saved estimate. Changes to your vehicle or fuel prices do not change this trip.')).toBeTruthy();
});
