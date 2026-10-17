// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WeatherResponse } from '../shared/weather';
import MapTimeControl from '../src/components/MapTimeControl';
import { setLanguage } from '../src/lib/language';

const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: mock.api }));
const hour = '2026-10-18T08:00:00.000Z';
function forecast(at = hour, temperatureC = 27, state: WeatherResponse['state'] = 'fresh'): WeatherResponse {
  return { location: 'Islamabad', at, state, reading: { location: 'Islamabad', coordinate: [73.0479, 33.6844], at, temperatureC, weatherCode: 2, isDay: true, fetchedAt: hour, source: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/' }, fetchedAt: hour, nextRefreshAt: '2026-10-18T09:00:00.000Z', availableFrom: '2026-10-16T00:00:00.000Z', availableUntil: '2026-11-03T00:00:00.000Z', message: '' };
}
beforeEach(() => {
  mock.api.mockReset().mockResolvedValue(forecast());
  setLanguage('en'); vi.useFakeTimers(); vi.setSystemTime(hour);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); setLanguage('en'); });
async function settle() { await act(async () => { await Promise.resolve(); }); }

it('shows the hourly Islamabad forecast beside live time, with accessible condition and source details', async () => {
  render(<MapTimeControl at="2026-10-18T08:23:00Z" live />); await settle();
  expect(screen.getByText('Live map')).toBeTruthy(); expect(screen.getByText('27°C')).toBeTruthy();
  const trigger = screen.getByLabelText(/Islamabad weather: 27°C/);
  fireEvent.click(trigger); expect(trigger.closest('details')?.open).toBe(true);
  expect(screen.getByRole('link', { name: 'Weather by Open-Meteo' }).getAttribute('href')).toBe('https://open-meteo.com/');
  fireEvent.keyDown(document, { key: 'Escape' }); expect(trigger.closest('details')?.open).toBe(false);
  expect(mock.api.mock.calls[0][0]).toBe(`/weather?at=${encodeURIComponent(hour)}`);
});

it('does not refetch for minute ticks or repeated tab focus; refreshes once after an hour', async () => {
  const view = render(<MapTimeControl at="2026-10-18T08:01:00Z" live />); await settle();
  view.rerender(<MapTimeControl at="2026-10-18T08:40:00Z" live />);
  fireEvent(document, new Event('visibilitychange')); await settle(); expect(mock.api).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
  expect(mock.api).toHaveBeenCalledTimes(2); expect(screen.getByText('27°C')).toBeTruthy();
});

it('matches planned hours and rejects a late response belonging to the previous map time', async () => {
  let resolveOld!: (value: WeatherResponse) => void;
  mock.api.mockImplementationOnce(() => new Promise<WeatherResponse>(resolve => { resolveOld = resolve; }));
  const view = render(<MapTimeControl at={hour} live />);
  const future = '2026-10-19T17:00:00.000Z'; mock.api.mockResolvedValue(forecast(future, 20));
  view.rerender(<MapTimeControl at="2026-10-19T17:45:00Z" live={false} />); await settle();
  expect(screen.getByText('Planned map')).toBeTruthy(); expect(screen.getByText('20°C')).toBeTruthy();
  await act(async () => { resolveOld(forecast(hour, 35)); });
  expect(screen.queryByText('35°C')).toBeNull(); expect(screen.getByText('20°C')).toBeTruthy();
});

it('never displays the previous forecast on a new out-of-range date or invents a temperature', async () => {
  const view = render(<MapTimeControl at={hour} live />); await settle();
  mock.api.mockResolvedValue({ ...forecast(), state: 'unavailable', reading: null });
  view.rerender(<MapTimeControl at="2026-12-20T08:00:00Z" live={false} />); await settle();
  expect(screen.queryByText('27°C')).toBeNull(); expect(screen.getByLabelText(/Islamabad weather: —, Weather unavailable/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText(/Islamabad weather/));
  expect(screen.getByText('Weather is available within the forecast window only.')).toBeTruthy();
});

it('marks stale cached forecasts and handles malformed or failed API responses without disrupting the clock', async () => {
  mock.api.mockResolvedValue(forecast(hour, 25, 'stale'));
  const view = render(<MapTimeControl at={hour} live />); await settle();
  expect(screen.getByLabelText(/25°C, Cached forecast/)).toBeTruthy();
  mock.api.mockRejectedValue(new Error('Offline'));
  view.rerender(<MapTimeControl at="2026-10-18T09:00:00Z" live />); await settle();
  expect(screen.getByText('Live map')).toBeTruthy(); expect(screen.queryByText('25°C')).toBeNull();
  expect(screen.getByLabelText(/Weather unavailable/)).toBeTruthy();
});

it('keeps existing weather visible during same-hour background refresh and closes details outside', async () => {
  render(<MapTimeControl at={hour} live />); await settle();
  const trigger = screen.getByLabelText(/Islamabad weather/); fireEvent.click(trigger);
  fireEvent.pointerDown(document.body); expect(trigger.closest('details')?.open).toBe(false);
  let resolve!: (value: WeatherResponse) => void;
  mock.api.mockImplementationOnce(() => new Promise<WeatherResponse>(done => { resolve = done; }));
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
  expect(screen.getByText('27°C')).toBeTruthy();
  await act(async () => { resolve(forecast(hour, 28)); }); expect(screen.getByText('28°C')).toBeTruthy();
});
