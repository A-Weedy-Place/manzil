// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CommutePanel from '../src/components/CommutePanel';
import type { AppState, CommuteImpact, Place } from '../shared/types';
const calls = vi.hoisted(() => ({ uid: 'one' as string | undefined, send: vi.fn(), api: vi.fn() }));
vi.mock('../src/lib/api', () => ({ send: calls.send, api: calls.api }));
vi.mock('../src/lib/auth', () => ({ getAuthSession: () => ({ user: calls.uid ? { uid: calls.uid } : null }) }));
const start: Place = { name: 'Zero Point', coordinate: [73.069, 33.6885] }, end: Place = { name: 'PIMS', coordinate: [73.052, 33.706] };
const current = { commutes: [] } as unknown as AppState;
afterEach(() => { cleanup(); vi.clearAllMocks(); calls.uid = 'one'; });
it('opens an editable history-derived commute and saves its selected recurrence and endpoints', async () => {
  calls.send.mockResolvedValue({}); const reload = vi.fn(async () => {}), notify = vi.fn();
  render(<CommutePanel state={current} origin={start} destination={end} waypoints={[]} initialOpen initialValues={{ name: 'Zero Point → PIMS', departureTime: '08:20' }} reload={reload} notify={notify} onPlan={vi.fn()} onSelectEndpoints={vi.fn()} />);
  expect(screen.getByLabelText('Commute name')).toHaveProperty('value', 'Zero Point → PIMS');
  expect(screen.getByLabelText('Usual departure · Pakistan time')).toHaveProperty('value', '08:20');
  fireEvent.change(screen.getByLabelText('Commute name'), { target: { value: 'Morning commute' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sun' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save commute' }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith('Journey saved.'));
  expect(calls.send).toHaveBeenCalledWith('/commutes', { name: 'Morning commute', origin: start, destination: end, waypoints: [], departureTime: '08:20', days: [0, 1, 2, 3, 4, 5], enabled: true });
  expect(reload).toHaveBeenCalledTimes(1);
});
it('does not navigate to another account’s saved commute after a delayed check', async () => {
  let finish!: (value: CommuteImpact) => void; calls.send.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const onPlan = vi.fn(), reload = vi.fn(async () => {});
  const commute = { id: 'daily', name: 'Office', origin: start, destination: end, departureTime: '08:20', days: [1], enabled: true, createdAt: '', updatedAt: '' };
  render(<CommutePanel state={{ ...current, commutes: [commute] }} origin={start} destination={end} waypoints={[]} initialOpen={false} reload={reload} notify={vi.fn()} onPlan={onPlan} onSelectEndpoints={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Check next departure' })); calls.uid = 'two';
  finish({} as CommuteImpact); await waitFor(() => expect(calls.send).toHaveBeenCalledTimes(1));
  expect(reload).not.toHaveBeenCalled(); expect(onPlan).not.toHaveBeenCalled();
});
