// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DemoClosures from '../src/components/DemoClosures';
import { setLanguage } from '../src/lib/language';

const requests = vi.hoisted(() => ({ catalogue: vi.fn(), mutate: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: requests.catalogue, send: requests.mutate }));

const at = '2026-10-17T10:00:00Z';
const later = '2026-10-17T11:00:00Z';
const journey = { origin: { name: 'Street test start', coordinate: [73.03, 33.70] }, destination: { name: 'Street test finish', coordinate: [73.04, 33.71] } };
const street = { id: 'street-test', title: 'Demo · Street test', description: 'Synthetic fixture', enabled: false, closureIds: [], coordinates: [[73.035, 33.705]], timing: 'active', startsAt: at, endsAt: later, suggestedJourney: journey, includeInBulk: false };
const catalogue = { at, scenarios: [street] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const callbacks = () => ({ reload: vi.fn(async () => {}), notify: vi.fn(), onFocus: vi.fn(), onTryJourney: vi.fn() });
async function openCatalogue() {
  fireEvent.click(screen.getByText('Demo closures'));
  return screen.findByRole('button', { name: 'Try route: Street test' });
}

beforeEach(() => {
  setLanguage('en');
  requests.catalogue.mockReset().mockResolvedValue(catalogue);
  requests.mutate.mockReset().mockResolvedValue({ at, scenarios: [{ ...street, enabled: true }] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage('en'); });

it('applies suggested endpoints only after the closure mutation and state refresh complete', async () => {
  const refreshed = deferred<void>(), props = callbacks();
  props.reload.mockImplementation(() => refreshed.promise);
  render(<DemoClosures at={at} revision={0} {...props} />);
  fireEvent.click(await openCatalogue());
  await waitFor(() => expect(props.reload).toHaveBeenCalledTimes(1));
  expect(requests.mutate).toHaveBeenCalledWith('/demos', { scenario: street.id, at, enabled: true });
  expect(props.onTryJourney).not.toHaveBeenCalled();
  await act(async () => refreshed.resolve());
  expect(props.onTryJourney).toHaveBeenCalledExactlyOnceWith(journey);
});

it('does not replace the journey with stale demo endpoints after the selected map time changes', async () => {
  const mutation = deferred<typeof catalogue>(), props = callbacks();
  requests.catalogue.mockResolvedValueOnce(catalogue).mockResolvedValueOnce({ at: later, scenarios: [{ ...street, title: 'Demo · Later-time street' }] });
  requests.mutate.mockImplementation(() => mutation.promise);
  const view = render(<DemoClosures at={at} revision={0} {...props} />);
  fireEvent.click(await openCatalogue());
  expect(requests.mutate).toHaveBeenCalledTimes(1);
  view.rerender(<DemoClosures at={later} revision={0} {...props} />);
  await screen.findByRole('button', { name: 'Try route: Later-time street' });
  await act(async () => mutation.resolve(catalogue));
  expect(props.reload).toHaveBeenCalledTimes(1);
  expect(props.onTryJourney).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Try route: Later-time street' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try route: Street test' })).toBeNull();
});

it('does not change the journey after the user leaves the demo panel while refresh is pending', async () => {
  const refreshed = deferred<void>(), props = callbacks();
  props.reload.mockImplementation(() => refreshed.promise);
  const view = render(<DemoClosures at={at} revision={0} {...props} />);
  fireEvent.click(await openCatalogue());
  await waitFor(() => expect(props.reload).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => refreshed.resolve());
  expect(props.onTryJourney).not.toHaveBeenCalled();
});

it('keeps the current journey when enabling a test closure fails', async () => {
  const props = callbacks();
  requests.mutate.mockRejectedValue(new Error('Administrator sign-in required.'));
  render(<DemoClosures at={at} revision={0} {...props} />);
  fireEvent.click(await openCatalogue());
  expect((await screen.findByRole('alert')).textContent).toBe('Administrator sign-in required.');
  expect(props.reload).toHaveBeenCalledTimes(1);
  expect(props.onTryJourney).not.toHaveBeenCalled();
});

it('excludes local street experiments from Add defaults so unrelated journeys remain usable', async () => {
  const base = { ...street, id: 'main-road-test', title: 'Demo · Main road test', suggestedJourney: undefined, includeInBulk: true };
  requests.catalogue.mockResolvedValue({ at, scenarios: [base, street] });
  requests.mutate.mockResolvedValue({ at, scenarios: [{ ...base, enabled: true }, street] });
  const props = callbacks();
  render(<DemoClosures at={at} revision={0} {...props} />);
  await openCatalogue();
  fireEvent.click(screen.getByRole('button', { name: 'Add defaults' }));
  await waitFor(() => expect(props.reload).toHaveBeenCalledTimes(1));
  expect(requests.mutate).toHaveBeenCalledExactlyOnceWith('/demos', { scenario: base.id, at, enabled: true });
  expect(props.onTryJourney).not.toHaveBeenCalled();
});
