// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TravelDataChoice from '../src/components/TravelDataChoice';
const mock = vi.hoisted(() => ({ uid: 'new-user' as string | null, send: vi.fn(), clear: vi.fn() }));
vi.mock('../src/lib/api', () => ({ send: mock.send }));
vi.mock('../src/lib/auth', () => ({ getAuthSession: () => ({ user: mock.uid ? { uid: mock.uid } : null }), clearTravelDataChoicePrompt: mock.clear }));
beforeEach(() => { mock.uid = 'new-user'; mock.send.mockReset().mockResolvedValue({ collectTravelData: false, travelDataChoiceMade: true }); mock.clear.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('does not enable anything on opening and persists a skipped choice without asking for GPS', async () => {
  const watch = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch } });
  const done = vi.fn(); render(<TravelDataChoice uid="new-user" onComplete={done} />);
  expect(mock.send).not.toHaveBeenCalled(); expect(watch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(expect.objectContaining({ collectTravelData: false })));
  expect(mock.send).toHaveBeenCalledWith('/profile', { travelDataChoiceMade: true, collectTravelData: false, inferFrequentRoutes: false }, 'PATCH');
  expect(mock.clear).toHaveBeenCalledWith('new-user'); expect(watch).not.toHaveBeenCalled();
});
it('requires an explicit allow action and never starts a location watcher when the preference saves', async () => {
  const watch = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch } });
  const done = vi.fn(); render(<TravelDataChoice uid="new-user" onComplete={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Allow personal trip data' }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(mock.send).toHaveBeenCalledWith('/profile', { travelDataChoiceMade: true, collectTravelData: true, inferFrequentRoutes: true }, 'PATCH');
  expect(watch).not.toHaveBeenCalled();
});
it('does not claim a lost preference response succeeded and safely retries a skipped choice', async () => {
  mock.send.mockRejectedValue(new Error('Offline')); const done = vi.fn();
  render(<TravelDataChoice uid="new-user" onComplete={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Allow personal trip data' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not confirm your choice. Please try again.');
  expect(done).not.toHaveBeenCalled(); expect(mock.clear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  await waitFor(() => expect(mock.send).toHaveBeenCalledTimes(2));
  expect(done).not.toHaveBeenCalled(); expect(mock.clear).not.toHaveBeenCalled();
  mock.send.mockResolvedValueOnce({ collectTravelData: false, travelDataChoiceMade: true });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Not now' }).matches(':disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(expect.objectContaining({ collectTravelData: false })));
  expect(mock.clear).toHaveBeenCalledWith('new-user');
});
it('never applies an old account’s late preference response to a new session', async () => {
  let resolve!: (value: unknown) => void; mock.send.mockReturnValue(new Promise(next => { resolve = next; }));
  const done = vi.fn(); render(<TravelDataChoice uid="new-user" onComplete={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Allow personal trip data' }));
  mock.uid = 'other-user'; await act(async () => resolve({ collectTravelData: true }));
  expect(done).not.toHaveBeenCalled(); expect(mock.clear).not.toHaveBeenCalled();
});
