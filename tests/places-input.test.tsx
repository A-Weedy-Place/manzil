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
  const option = screen.getByRole('option'); expect(option.textContent).toContain('31.56568, 74.31418');
  fireEvent.click(option); expect(onChange).toHaveBeenCalledWith({ name: '31.56568, 74.31418', coordinate: [74.31418, 31.56568] });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(api).not.toHaveBeenCalled();
});
it('explains invalid coordinate ranges without sending them to the provider', async () => {
  vi.useFakeTimers(); renderInput(); const input = screen.getByRole('combobox');
  fireEvent.focus(input); fireEvent.change(input, { target: { value: '95, 74' } });
  expect(screen.queryByRole('option')).toBeNull(); expect(screen.getByText('Enter latitude from -90 to 90 and longitude from -180 to 180.')).toBeTruthy();
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
  expect(screen.getByRole('option').textContent).toContain('Karachi'); expect(screen.queryByText('Old Lahore')).toBeNull();
});
