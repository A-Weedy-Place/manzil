// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import NavigationPanel from '../src/components/NavigationPanel';
import { setLanguage } from '../src/lib/language';
import type { RouteOption } from '../shared/types';
import { speechText, type Language, type SpeechPrompt } from '../shared/speech';

const audio = vi.hoisted(() => ({ speak: vi.fn(async (_prompt: SpeechPrompt, _language: Language, _status?: (message: string) => void) => {}) }));
vi.mock('../src/lib/speech', () => ({ NavigationSpeaker: class { cancel() {} prepare() {} speak = audio.speak; } }));

const date = new Date('2026-10-18T10:00:00Z');
const route: RouteOption = {
  id: 'clear', kind: 'direct', label: 'Recommended', validation: 'clear', warnings: [],
  geometry: { type: 'LineString', coordinates: [[73, 33.7], [73, 33.71]] }, distanceMeters: 1112, durationSeconds: 120,
  departureAt: date.toISOString(), arrivalAt: '2026-10-18T10:02:00Z',
  steps: [{ instruction: 'Continue', roadName: 'Test Road', distanceMeters: 1112, durationSeconds: 120 }],
  snappedOrigin: [73, 33.7], snappedDestination: [73, 33.71],
};
const position = (accuracy = 12, timestamp = Date.now(), longitude = 73, latitude = 33.7) => ({ timestamp, coords: { longitude, latitude, accuracy } }) as GeolocationPosition;
const props = () => ({ route, destination: 'F-8', stale: false, onBack: vi.fn(), onPosition: vi.fn(), onSample: vi.fn(), onReplan: vi.fn(async () => route), onFocus: vi.fn() });
function provider() {
  let receive!: PositionCallback, fail!: PositionErrorCallback;
  const polls: { receive: PositionCallback; fail: PositionErrorCallback }[] = [];
  const geo = {
    watchPosition: vi.fn((ok: PositionCallback, error: PositionErrorCallback) => { receive = ok; fail = error; return 0; }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn((ok: PositionCallback, error: PositionErrorCallback, _options?: PositionOptions) => { polls.push({ receive: ok, fail: error }); }),
  };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo });
  return { geo, polls, receive: (fix: GeolocationPosition) => receive(fix), fail: (code: number) => fail({ code } as GeolocationPositionError) };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(date); localStorage.clear(); setLanguage('en'); audio.speak.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); setLanguage('en'); });
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

it('shows a coarse location and its actual uncertainty without using it for rerouting or trip capture', async () => {
  const source = provider(), callbacks = props(); const view = render(<NavigationPanel {...callbacks} />);
  expect(source.geo.watchPosition).not.toHaveBeenCalled(); expect(source.geo.getCurrentPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' }));
  expect(source.geo.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  await act(async () => source.receive(position(500)));
  expect(screen.getByText('±500 m')).toBeTruthy(); expect(screen.getByRole('heading', { name: 'Improve location accuracy' })).toBeTruthy();
  expect(callbacks.onPosition).toHaveBeenCalledWith([73, 33.7], 500);
  expect(callbacks.onReplan).not.toHaveBeenCalled(); expect(callbacks.onSample).not.toHaveBeenCalled();
  expect(view.container.querySelector('.navigation-metrics')).toBeNull();
  expect(screen.getByRole('button', { name: 'Recalculate from here' }).matches(':disabled')).toBe(true);
});

it('recovers automatically when a fresh accurate fix replaces an approximate location', async () => {
  const source = provider(), callbacks = props(); const view = render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' })); await act(async () => source.receive(position(500)));
  await advance(1000); await act(async () => source.receive(position(16)));
  expect(callbacks.onReplan).toHaveBeenCalledExactlyOnceWith([73, 33.7], 0);
  expect(callbacks.onSample).toHaveBeenCalledExactlyOnceWith({ coordinate: [73, 33.7], timestamp: new Date(Date.now()).toISOString(), accuracy: 16 });
  expect(callbacks.onPosition).toHaveBeenLastCalledWith([73, 33.7], 16); expect(screen.getByText('±16 m')).toBeTruthy();
  expect(screen.queryByText('Improve location accuracy')).toBeNull(); expect(view.container.querySelector('.navigation-metrics')).toBeTruthy();
});

it('expires a coarse raw marker once, retains its timestamp guard, then recovers with a newer accurate fix', async () => {
  const source = provider(), callbacks = props(); render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' })); await act(async () => source.receive(position(500)));
  expect(callbacks.onPosition).toHaveBeenLastCalledWith([73, 33.7], 500); expect(screen.getByText('±500 m')).toBeTruthy();
  await advance(16000);
  expect(callbacks.onPosition).toHaveBeenLastCalledWith(null); expect(screen.queryByText('±500 m')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Location signal lost' })).toBeTruthy();
  expect(callbacks.onReplan).not.toHaveBeenCalled(); expect(callbacks.onSample).not.toHaveBeenCalled();
  const calls = callbacks.onPosition.mock.calls.length;
  await advance(2000); await act(async () => source.polls[0].receive(position(8, date.getTime())));
  expect(callbacks.onPosition).toHaveBeenCalledTimes(calls); expect(callbacks.onSample).not.toHaveBeenCalled();
  await act(async () => source.receive(position(8)));
  expect(callbacks.onPosition).toHaveBeenLastCalledWith([73, 33.7], 8); expect(screen.getByText('±8 m')).toBeTruthy(); expect(callbacks.onReplan).toHaveBeenCalledOnce();
});

it('refreshes a quiet watch with an uncached high-accuracy request and recovers after the old fix expires', async () => {
  const source = provider(), callbacks = props(); const view = render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' })); await act(async () => source.receive(position()));
  await advance(9000); expect(source.geo.getCurrentPosition).not.toHaveBeenCalled();
  await advance(1000); expect(source.geo.getCurrentPosition).toHaveBeenCalledExactlyOnceWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  await advance(6000); expect(source.geo.getCurrentPosition).toHaveBeenCalledOnce();
  expect(screen.getByRole('heading', { name: 'Location signal lost' })).toBeTruthy(); expect(view.container.querySelector('.navigation-metrics')).toBeNull();
  await act(async () => source.polls[0].receive(position(10)));
  expect(screen.getByText('±10 m')).toBeTruthy(); expect(view.container.querySelector('.navigation-metrics')).toBeTruthy();
  expect(callbacks.onSample).toHaveBeenCalledTimes(2); expect(callbacks.onReplan).toHaveBeenCalledOnce();
});

it.each(['stop', 'unmount', 'denied'] as const)('clears the watch and rejects late watch/poll callbacks after %s', async end => {
  const source = provider(), callbacks = props(), view = render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' })); await advance(10000); expect(source.polls).toHaveLength(1);
  if (end === 'stop') fireEvent.click(screen.getByRole('button', { name: 'Stop guidance' }));
  else if (end === 'unmount') view.unmount();
  else await act(async () => source.fail(1));
  expect(source.geo.clearWatch).toHaveBeenCalledWith(0);
  expect(callbacks.onPosition).toHaveBeenLastCalledWith(null); expect(callbacks.onSample).toHaveBeenLastCalledWith(null);
  const positionCalls = callbacks.onPosition.mock.calls.length, sampleCalls = callbacks.onSample.mock.calls.length;
  await advance(1); await act(async () => { source.receive(position()); source.polls[0].receive(position()); source.polls[0].fail({ code: 2 } as GeolocationPositionError); });
  expect(callbacks.onPosition).toHaveBeenCalledTimes(positionCalls); expect(callbacks.onSample).toHaveBeenCalledTimes(sampleCalls); expect(callbacks.onReplan).not.toHaveBeenCalled();
  if (end !== 'unmount') expect(screen.getByRole('button', { name: 'Start GPS guidance' })).toBeTruthy();
});

it('keeps a transient timeout recoverable while a later fresh watch fix resumes guidance', async () => {
  const source = provider(), callbacks = props(); const view = render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' })); await act(async () => source.fail(3));
  expect(screen.getByRole('button', { name: 'Stop guidance' })).toBeTruthy(); expect(screen.getByRole('button', { name: 'Retry location' })).toBeTruthy();
  expect(source.geo.clearWatch).not.toHaveBeenCalled(); expect(callbacks.onSample).not.toHaveBeenCalled();
  await advance(1000); await act(async () => source.receive(position()));
  expect(callbacks.onReplan).toHaveBeenCalledOnce(); expect(callbacks.onSample).toHaveBeenCalledOnce(); expect(view.container.querySelector('.navigation-metrics')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Retry location' })).toBeNull();
});

it('ignores an out-of-order coarse fix instead of regressing an accurate accepted location', async () => {
  const source = provider(), callbacks = props(), view = render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' })); await act(async () => source.receive(position()));
  await advance(1000); await act(async () => source.receive(position(500, date.getTime() - 1000)));
  expect(callbacks.onPosition).toHaveBeenCalledOnce(); expect(callbacks.onSample).toHaveBeenCalledOnce(); expect(screen.getByText('±12 m')).toBeTruthy();
  expect(screen.queryByText('Improve location accuracy')).toBeNull(); expect(view.container.querySelector('.navigation-metrics')).toBeTruthy();
});

it('does not let an old expired poll response interrupt a newer accurate watch update', async () => {
  const source = provider(), callbacks = props(), view = render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' })); await act(async () => source.receive(position()));
  await advance(16000); expect(source.polls).toHaveLength(1);
  await act(async () => source.receive(position(8)));
  expect(view.container.querySelector('.navigation-metrics')).toBeTruthy();
  await act(async () => source.polls[0].receive(position(500, date.getTime())));
  expect(screen.getByText('±8 m')).toBeTruthy(); expect(view.container.querySelector('.navigation-metrics')).toBeTruthy();
  expect(callbacks.onSample).toHaveBeenCalledTimes(2); expect(callbacks.onReplan).toHaveBeenCalledOnce();
});

it('keeps a newer watch fix when an earlier refresh poll subsequently times out', async () => {
  const source = provider(), callbacks = props(), view = render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' })); await act(async () => source.receive(position()));
  await advance(10000); expect(source.polls).toHaveLength(1);
  await advance(1000); await act(async () => source.receive(position(8)));
  await advance(1000); await act(async () => source.polls[0].fail({ code: 3 } as GeolocationPositionError));
  expect(screen.getByText('±8 m')).toBeTruthy(); expect(view.container.querySelector('.navigation-metrics')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Location signal lost' })).toBeNull();
  expect(callbacks.onSample).toHaveBeenCalledTimes(2); expect(callbacks.onReplan).toHaveBeenCalledOnce();
});

it.each([
  ['over one kilometre', 33.7, 1112],
  ['50 metres', 33.70955, 50],
] as const)('keeps the final straight leg as a straight instruction when %s from the destination', async (_label, latitude, distanceMeters) => {
  const source = provider();
  const currentRoute: RouteOption = { ...route, geometry: { type: 'LineString', coordinates: [[73, latitude], [73, 33.71]] }, distanceMeters,
    snappedOrigin: [73, latitude], steps: [{ instruction: 'Continue', roadName: 'Test Road', distanceMeters, durationSeconds: 120 }] };
  const callbacks = { ...props(), route: currentRoute, onReplan: vi.fn(async () => currentRoute) };
  const view = render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' }));
  await act(async () => source.receive(position(8, Date.now(), 73, latitude)));
  expect(callbacks.onReplan).toHaveBeenCalledOnce(); expect(view.container.querySelector('.navigation-metrics')).toBeTruthy();
  expect(screen.getByRole('heading', { name: /Continue straight/ })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Near the destination road point' })).toBeNull();
  expect(view.container.querySelector('.guidance-card .lucide-flag')).toBeNull(); expect(view.container.querySelector('.guidance-card .lucide-arrow-up')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Voice guidance/ }));
  fireEvent.click(screen.getByText('Voice settings', { selector: 'summary' }));
  const repeat = screen.getByRole('button', { name: 'Repeat instruction' }); expect(repeat.matches(':disabled')).toBe(false); fireEvent.click(repeat);
  expect(audio.speak).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'turn', turn: 'straight' }), 'en', expect.any(Function));
  expect(audio.speak.mock.calls.some(([prompt]) => prompt.kind === 'turn' && prompt.turn === 'arrive')).toBe(false);
});

it('still previews the destination as an arrival step without starting GPS', () => {
  const source = provider(), callbacks = props(), view = render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByText('Route guidance steps', { selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
  expect(screen.getByRole('heading', { name: speechText({ kind: 'turn', turn: 'arrive' }, 'en') })).toBeTruthy();
  expect(view.container.querySelector('.guidance-card .lucide-flag')).toBeTruthy();
  expect(callbacks.onPosition).not.toHaveBeenCalled(); expect(callbacks.onFocus).toHaveBeenCalledWith([[73, 33.71]]);
  expect(source.geo.watchPosition).not.toHaveBeenCalled(); expect(source.geo.getCurrentPosition).not.toHaveBeenCalled();
});

it('allows the arrival icon and spoken arrival only once accurate guidance is near the destination', async () => {
  const source = provider(), latitude = 33.7098;
  const nearRoute: RouteOption = { ...route, geometry: { type: 'LineString', coordinates: [[73, latitude], [73, 33.71]] }, distanceMeters: 22, snappedOrigin: [73, latitude] };
  const callbacks = { ...props(), route: nearRoute, onReplan: vi.fn(async () => nearRoute) }, view = render(<NavigationPanel {...callbacks} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' })); await act(async () => source.receive(position(8, Date.now(), 73, latitude)));
  expect(screen.getByRole('heading', { name: 'Near the destination road point' })).toBeTruthy(); expect(view.container.querySelector('.guidance-card .lucide-flag')).toBeTruthy();
  fireEvent.click(screen.getByText('Voice settings', { selector: 'summary' })); fireEvent.click(screen.getByRole('button', { name: 'Repeat instruction' }));
  expect(audio.speak).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'turn', turn: 'arrive' }), 'en', expect.any(Function));
});
