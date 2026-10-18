// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Place } from '../shared/types';
import PlaceInput from '../src/components/PlaceInput';
import { api } from '../src/lib/api';
import { setLanguage } from '../src/lib/language';

vi.mock('../src/lib/api', () => ({ api: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); setLanguage('en'); });
const renderInput = () => { setLanguage('en'); const onChange = vi.fn(); render(<PlaceInput label="Starting point" letter="A" value={null} onChange={onChange} onPick={() => undefined} active={false} />); return onChange; };

it('accepts coordinates immediately while offline without issuing a geocoder request', async () => {
  vi.useFakeTimers(); vi.mocked(api).mockRejectedValue(new Error('Offline')); const onChange = renderInput();
  const input = screen.getByRole('combobox'); fireEvent.focus(input); fireEvent.change(input, { target: { value: '31.56568, 74.31418' } });
  const option = screen.getByRole('option', { name: '31.56568, 74.31418' }); expect(option.textContent).toContain('31.56568, 74.31418');
  fireEvent.click(option); expect(onChange).toHaveBeenCalledWith({ name: '31.56568, 74.31418', coordinate: [74.31418, 31.56568] });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(api).not.toHaveBeenCalled();
});
it('explains invalid coordinate ranges without sending them to the provider', async () => {
  vi.useFakeTimers(); renderInput(); const input = screen.getByRole('combobox');
  fireEvent.focus(input); fireEvent.change(input, { target: { value: '95, 74' } });
  expect(screen.getAllByRole('option')).toHaveLength(2); expect(screen.getByText('Enter latitude from -90 to 90 and longitude from -180 to 180.')).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(api).not.toHaveBeenCalled();
});
it('ignores a stale geocoder response even when the transport ignores its abort signal', async () => {
  vi.useFakeTimers(); let finishOld!: (places: Place[]) => void, finishNew!: (places: Place[]) => void;
  vi.mocked(api).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve; }));
  renderInput(); const input = screen.getByRole('combobox'); fireEvent.focus(input); fireEvent.change(input, { target: { value: 'Lahore' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(230); });
  fireEvent.change(input, { target: { value: 'Karachi' } }); await act(async () => { await vi.advanceTimersByTimeAsync(230); });
  await act(async () => { finishOld([{ name: 'Old Lahore', coordinate: [74, 31] }]); });
  expect(screen.queryByText('Old Lahore')).toBeNull();
  await act(async () => { finishNew([{ name: 'Karachi', coordinate: [67, 24] }]); });
  expect(screen.getByRole('option', { name: 'Karachi' })).toBeTruthy(); expect(screen.queryByText('Old Lahore')).toBeNull();
});

it.each(['Starting point', 'Destination', 'Stop 1'])('offers explicit current location first for %s without requesting GPS on focus', async label => {
  vi.useFakeTimers(); const getPosition = vi.fn((success: PositionCallback) => success({ coords: { longitude: 73.05, latitude: 33.7 } } as GeolocationPosition));
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: getPosition } });
  vi.mocked(api).mockResolvedValue([]); const onChange = vi.fn();
  render(<PlaceInput label={label} letter={label === 'Starting point' ? 'A' : label === 'Destination' ? 'B' : '1'} value={null} onChange={onChange} onPick={() => undefined} active={false} />);
  fireEvent.focus(screen.getByRole('combobox')); expect(getPosition).not.toHaveBeenCalled();
  expect(screen.getAllByRole('option')[0].textContent).toBe('Use current location');
  fireEvent.click(screen.getByRole('option', { name: 'Use current location' }));
  expect(onChange).toHaveBeenCalledWith({ name: 'Current location', coordinate: [73.05, 33.7] });
  expect(screen.queryByRole('listbox')).toBeNull();
});
it('keeps map selection available offline and never requests GPS when Enter selects a searched place', async () => {
  vi.useFakeTimers(); const getPosition = vi.fn(), onPick = vi.fn(), onChange = vi.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: getPosition } });
  vi.mocked(api).mockResolvedValue([{ name: 'I-8', coordinate: [73.07, 33.67] }]);
  render(<PlaceInput label="Starting point" letter="A" value={null} onChange={onChange} onPick={onPick} active={false} />);
  const input = screen.getByRole('combobox'); fireEvent.focus(input); fireEvent.change(input, { target: { value: 'I8' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(230); }); fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith({ name: 'I-8', coordinate: [73.07, 33.67] }); expect(getPosition).not.toHaveBeenCalled();
  fireEvent.focus(input); fireEvent.click(screen.getByRole('option', { name: 'Choose on map' }));
  expect(onPick).toHaveBeenCalledOnce(); expect(getPosition).not.toHaveBeenCalled();
});
it('shows a bounded search timeout and ignores a late response from an uncooperative provider', async () => {
  vi.useFakeTimers(); let resolve!: (value: Place[]) => void;
  vi.mocked(api).mockImplementation(() => new Promise(done => { resolve = done; })); renderInput();
  const input = screen.getByRole('combobox'); fireEvent.focus(input); fireEvent.change(input, { target: { value: 'I8' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(10230); });
  expect(screen.queryByText('Searching places…')).toBeNull(); expect(screen.getByText('Place search timed out. Try again or choose on map.')).toBeTruthy();
  await act(async () => { resolve([{ name: 'Late result', coordinate: [73, 33] }]); });
  expect(screen.queryByText('Late result')).toBeNull(); expect(screen.getByRole('option', { name: 'Choose on map' })).toBeTruthy();
});

it('cancels pending GPS immediately when a searched place is selected or a blank stop layout changes', async () => {
  vi.useFakeTimers(); let success!: PositionCallback;
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: PositionCallback) => { success = ok; } } });
  vi.mocked(api).mockResolvedValue([{ name: 'I-8', coordinate: [73.07, 33.67] }]); const onChange = vi.fn();
  const props = { label: 'Stop 1', letter: '1', value: null, onChange, onPick: vi.fn(), active: false, locationContext: 0 };
  const ui = render(<PlaceInput {...props} />); const input = screen.getByRole('combobox'); fireEvent.focus(input);
  await act(async () => { await vi.advanceTimersByTimeAsync(230); });
  fireEvent.click(screen.getByRole('option', { name: 'Use current location' })); fireEvent.click(screen.getByRole('option', { name: 'I-8' }));
  onChange.mockClear(); act(() => success({ coords: { longitude: 74, latitude: 31 } } as GeolocationPosition)); expect(onChange).not.toHaveBeenCalled();
  fireEvent.focus(input); fireEvent.click(screen.getByRole('option', { name: 'Use current location' }));
  ui.rerender(<PlaceInput {...props} locationContext={1} />);
  act(() => success({ coords: { longitude: 74, latitude: 31 } } as GeolocationPosition)); expect(onChange).not.toHaveBeenCalled();
  expect((input as HTMLInputElement).value).toBe('I-8');
});
it('preserves the current place after denied GPS and rejects a position arriving after a manual edit or unmount', async () => {
  vi.useFakeTimers(); let success!: PositionCallback, error!: PositionErrorCallback;
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => { success = ok; error = fail; } } });
  vi.mocked(api).mockResolvedValue([]); const onChange = vi.fn();
  const ui = render(<PlaceInput label="Destination" letter="B" value={{ name: 'Original', coordinate: [73, 33] }} onChange={onChange} onPick={() => undefined} active={false} />);
  const input = screen.getByRole('combobox'); fireEvent.focus(input); fireEvent.click(screen.getByRole('option', { name: 'Use current location' }));
  act(() => error({ code: 1 } as GeolocationPositionError)); expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('permission was declined'); expect(input.getAttribute('value')).toBe('Original');
  fireEvent.click(screen.getByRole('option', { name: 'Use current location' })); fireEvent.change(input, { target: { value: 'New search' } }); onChange.mockClear();
  act(() => success({ coords: { longitude: 73.05, latitude: 33.7 } } as GeolocationPosition)); expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('option', { name: 'Use current location' })); ui.unmount();
  act(() => success({ coords: { longitude: 73.05, latitude: 33.7 } } as GeolocationPosition)); expect(onChange).not.toHaveBeenCalled();
});
