// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Coordinate, Drawing } from '../shared/types';
import { api } from '../src/lib/api';
import { useRoadSelection, type RoadSelectionKind } from '../src/lib/useRoadSelection';

vi.mock('../src/lib/api', () => ({ api: vi.fn() }));
const emptyDrawing: Drawing = { kind: 'line', coordinates: [], widthMeters: 14 };
const first = { drawing: { kind: 'line', coordinates: [[73, 33.7], [73.001, 33.7], [73.001, 33.701]], widthMeters: 14 } as Drawing, roadNames: ['Bent Road'], distanceMeters: 203 };
const interval = { drawing: { kind: 'line', coordinates: [[73.0004, 33.7], [73.001, 33.7], [73.001, 33.7008]], widthMeters: 14 } as Drawing, roadNames: ['Bent Road'], distanceMeters: 145 };
const click: Coordinate = [73.0004, 33.7001], secondClick: Coordinate = [73.00102, 33.7008];
type Props = { enabled: boolean; owner: string | null; drawing: Drawing | null; kind?: RoadSelectionKind };
function setup(initial: Props = { enabled: true, owner: 'first-user', drawing: emptyDrawing }) {
  const onDraw = vi.fn(), onRoadName = vi.fn();
  const hook = renderHook((props: Props) => useRoadSelection({ ...props, onDraw, onRoadName }), { initialProps: initial });
  return { ...hook, onDraw, onRoadName };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => { vi.mocked(api).mockReset(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('selects a usable first road section, anchors to its road geometry and sends longitude before latitude', async () => {
  vi.mocked(api).mockResolvedValue(first);
  const hook = setup();
  await act(async () => hook.result.current.choose(click));
  expect(vi.mocked(api)).toHaveBeenCalledWith('/roads/point', expect.objectContaining({ method: 'POST', body: JSON.stringify({ coordinate: click }), signal: expect.any(AbortSignal) }));
  expect(hook.onDraw).toHaveBeenCalledWith(first.drawing); expect(hook.onRoadName).toHaveBeenCalledWith('Bent Road');
  expect(hook.result.current.anchors[0][0]).toBeCloseTo(73.0004, 9); expect(hook.result.current.anchors[0][1]).toBe(33.7);
  expect(hook.result.current.distanceMeters).toBe(203); expect(hook.result.current.busy).toBe(false); expect(hook.result.current.error).toBe('');
  hook.rerender({ enabled: true, owner: 'first-user', drawing: first.drawing });
  expect(hook.result.current.anchors).toHaveLength(1); expect(hook.result.current.distanceMeters).toBe(203);
});

it('uses the snapped first anchor for a same-road interval, then starts a new selection on the third point', async () => {
  vi.mocked(api).mockResolvedValueOnce(first).mockResolvedValueOnce(interval).mockResolvedValueOnce(first);
  const hook = setup();
  await act(async () => hook.result.current.choose(click)); hook.rerender({ enabled: true, owner: 'first-user', drawing: first.drawing });
  await act(async () => hook.result.current.choose(secondClick));
  expect(vi.mocked(api).mock.calls[1][0]).toBe('/roads/section');
  expect(JSON.parse(String(vi.mocked(api).mock.calls[1][1]!.body))).toEqual({ from: [73.0004, 33.7], to: secondClick });
  expect(hook.result.current.anchors).toEqual([interval.drawing.coordinates[0], interval.drawing.coordinates.at(-1)]);
  hook.rerender({ enabled: true, owner: 'first-user', drawing: interval.drawing });
  await act(async () => hook.result.current.choose(click));
  expect(vi.mocked(api).mock.calls[2][0]).toBe('/roads/point'); expect(hook.result.current.anchors).toHaveLength(1);
  expect(hook.onDraw.mock.calls.map(call => call[0])).toEqual([first.drawing, interval.drawing, first.drawing]);
});

it('preserves the first resolved selection after a failed second point and retries from the same snapped anchor', async () => {
  vi.mocked(api).mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('Choose both ends on the same road.')).mockResolvedValueOnce(interval);
  const hook = setup(); await act(async () => hook.result.current.choose(click));
  hook.rerender({ enabled: true, owner: 'first-user', drawing: first.drawing });
  const anchor = hook.result.current.anchors[0];
  await act(async () => hook.result.current.choose([73.002, 33.702]));
  expect(hook.result.current.anchors).toEqual([anchor]); expect(hook.result.current.distanceMeters).toBe(first.distanceMeters);
  expect(hook.result.current.error).toBe('Choose both ends on the same road.'); expect(hook.result.current.busy).toBe(false); expect(hook.onDraw).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.choose(secondClick));
  expect(vi.mocked(api).mock.calls[2][0]).toBe('/roads/section'); expect(hook.result.current.anchors).toHaveLength(2); expect(hook.result.current.error).toBe('');
});

it('cancels a pending first map click when another point is picked and ignores its late success or failure', async () => {
  const old = deferred<typeof first>(), fresh = deferred<typeof first>();
  vi.mocked(api).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const hook = setup(); let oldWork!: Promise<void>, newWork!: Promise<void>;
  act(() => { oldWork = hook.result.current.choose([73.003, 33.703]); });
  const oldSignal = vi.mocked(api).mock.calls[0][1]!.signal!;
  expect(hook.result.current.busy).toBe(true);
  act(() => { newWork = hook.result.current.choose(click); });
  expect(oldSignal.aborted).toBe(true); expect(vi.mocked(api).mock.calls[1][0]).toBe('/roads/point');
  await act(async () => { old.resolve(interval); await oldWork; });
  expect(hook.onDraw).not.toHaveBeenCalled(); expect(hook.result.current.busy).toBe(true);
  await act(async () => { fresh.resolve(first); await newWork; });
  expect(hook.onDraw).toHaveBeenCalledExactlyOnceWith(first.drawing); expect(hook.result.current.busy).toBe(false);
});

it('accepts its own first drawing commit while a rapid second selection is pending', async () => {
  const next = deferred<typeof interval>(); vi.mocked(api).mockResolvedValueOnce(first).mockReturnValueOnce(next.promise);
  const hook = setup(); let work!: Promise<void>;
  await act(async () => { await hook.result.current.choose(click); work = hook.result.current.choose(secondClick); });
  hook.rerender({ enabled: true, owner: 'first-user', drawing: first.drawing });
  expect(hook.result.current.busy).toBe(true); expect(hook.result.current.anchors).toHaveLength(1);
  await act(async () => { next.resolve(interval); await work; });
  expect(hook.onDraw).toHaveBeenLastCalledWith(interval.drawing); expect(hook.result.current.anchors).toHaveLength(2); expect(hook.result.current.busy).toBe(false);
});

it.each(['reset', 'owner', 'sign-out', 'mode', 'drawing', 'kind', 'unmount'] as const)('rejects a late section response after %s changes the selection context', async change => {
  const next = deferred<typeof interval>(); vi.mocked(api).mockResolvedValueOnce(first).mockReturnValueOnce(next.promise);
  const hook = setup(); await act(async () => hook.result.current.choose(click));
  hook.rerender({ enabled: true, owner: 'first-user', drawing: first.drawing });
  let work!: Promise<void>; act(() => { work = hook.result.current.choose(secondClick); });
  const signal = vi.mocked(api).mock.calls[1][1]!.signal!;
  if (change === 'reset') act(() => hook.result.current.reset());
  else if (change === 'unmount') hook.unmount();
  else hook.rerender({ enabled: change !== 'mode', owner: change === 'owner' ? 'second-user' : change === 'sign-out' ? null : 'first-user', drawing: change === 'drawing' ? interval.drawing : first.drawing, kind: change === 'kind' ? 'blockade' : 'road_closure' });
  expect(signal.aborted).toBe(true);
  await act(async () => { next.resolve(interval); await work; });
  expect(hook.onDraw).toHaveBeenCalledTimes(1); expect(hook.onRoadName).toHaveBeenCalledTimes(1);
  if (change !== 'unmount') { expect(hook.result.current.anchors).toEqual([]); expect(hook.result.current.busy).toBe(false); expect(hook.result.current.error).toBe(''); }
});

it('does not let a cancelled section rejection alter a newer owner’s selection', async () => {
  const old = deferred<typeof interval>(); vi.mocked(api).mockResolvedValueOnce(first).mockReturnValueOnce(old.promise).mockResolvedValueOnce(interval);
  const hook = setup(); await act(async () => hook.result.current.choose(click));
  hook.rerender({ enabled: true, owner: 'first-user', drawing: first.drawing });
  let oldWork!: Promise<void>; act(() => { oldWork = hook.result.current.choose(secondClick); });
  hook.rerender({ enabled: true, owner: 'second-user', drawing: emptyDrawing });
  await act(async () => hook.result.current.choose(secondClick));
  const anchors = hook.result.current.anchors;
  await act(async () => { old.reject(new Error('Old owner failed')); await oldWork; });
  expect(hook.result.current.anchors).toEqual(anchors); expect(hook.result.current.error).toBe(''); expect(hook.result.current.busy).toBe(false);
  expect(vi.mocked(api).mock.calls[2][0]).toBe('/roads/point'); expect(hook.onDraw).toHaveBeenLastCalledWith(interval.drawing);
});

it.each<RoadSelectionKind>(['road_closure', 'blockade'])('ends a timed-out %s selection even if the API adapter ignores cancellation and never applies its late result', async kind => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => { const controller = new AbortController(); setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), milliseconds); return controller.signal; });
  const hung = deferred<typeof interval>();
  if (kind === 'road_closure') vi.mocked(api).mockResolvedValueOnce(first).mockReturnValueOnce(hung.promise);
  else vi.mocked(api).mockReturnValueOnce(hung.promise);
  const hook = setup({ enabled: true, owner: 'first-user', drawing: emptyDrawing, kind }); await act(async () => hook.result.current.choose(kind === 'blockade' ? barrierFrom : click));
  hook.rerender({ enabled: true, owner: 'first-user', drawing: hook.onDraw.mock.calls[0][0], kind });
  let work!: Promise<void>; act(() => { work = hook.result.current.choose(kind === 'blockade' ? barrierTo : secondClick); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); await work; });
  expect(hook.result.current.busy).toBe(false); expect(hook.result.current.error).toBe('Road selection timed out. Try again.'); expect(hook.result.current.anchors).toHaveLength(1);
  await act(async () => { hung.resolve(interval); await Promise.resolve(); });
  expect(hook.onDraw).toHaveBeenCalledTimes(1); expect(hook.result.current.error).toBe('Road selection timed out. Try again.');
});

it.each([null, { ...first, drawing: { ...first.drawing, coordinates: [[NaN, 33.7], [73.1, 33.7]] } }, { ...first, drawing: { ...first.drawing, coordinates: [[73, 33.7], [73, 33.7]] } }, { ...first, drawing: { ...first.drawing, widthMeters: 0 } }, { ...first, roadNames: [null] }])('does not accept malformed or degenerate road geometry %j', async response => {
  vi.mocked(api).mockResolvedValue(response);
  const hook = setup(); await act(async () => hook.result.current.choose(click));
  expect(hook.onDraw).not.toHaveBeenCalled(); expect(hook.result.current.anchors).toEqual([]); expect(hook.result.current.error).toBe('Road selection unavailable.'); expect(hook.result.current.busy).toBe(false);
});

it('does not request roads when inactive, signed out or given invalid longitude/latitude', async () => {
  const hook = setup({ enabled: false, owner: 'first-user', drawing: emptyDrawing }); await act(async () => hook.result.current.choose(click));
  hook.rerender({ enabled: true, owner: null, drawing: emptyDrawing }); await act(async () => hook.result.current.choose(click));
  hook.rerender({ enabled: true, owner: 'first-user', drawing: emptyDrawing });
  for (const coordinate of [[181, 33.7], [73, 91], [NaN, 33.7], [73, 33, 1]] as Coordinate[]) await act(async () => hook.result.current.choose(coordinate));
  expect(api).not.toHaveBeenCalled(); expect(hook.result.current.busy).toBe(false); expect(hook.result.current.error).toBe('Road selection unavailable.');
});

const barrierFrom: Coordinate = [73.05, 33.7], barrierTo: Coordinate = [73.0503, 33.7];
const barrier = { drawing: { kind: 'line', coordinates: [barrierFrom, barrierTo], widthMeters: 4 } as Drawing, roadNames: ['Road crossed by barrier'], distanceMeters: 27.75 };

it('keeps a blockade first point raw without an API call, validates its exact second end and starts again on a third pick', async () => {
  vi.mocked(api).mockResolvedValue(barrier);
  const hook = setup({ enabled: true, owner: 'first-user', drawing: emptyDrawing, kind: 'blockade' });
  await act(async () => hook.result.current.choose(barrierFrom));
  const pointDrawing = hook.onDraw.mock.calls[0][0] as Drawing;
  expect(pointDrawing).toEqual({ kind: 'line', coordinates: [barrierFrom], widthMeters: 4 });
  expect(hook.result.current.anchors).toEqual([barrierFrom]); expect(hook.result.current.distanceMeters).toBeNull(); expect(hook.result.current.busy).toBe(false); expect(api).not.toHaveBeenCalled();
  hook.rerender({ enabled: true, owner: 'first-user', drawing: pointDrawing, kind: 'blockade' });
  await act(async () => hook.result.current.choose(barrierTo));
  expect(vi.mocked(api)).toHaveBeenCalledExactlyOnceWith('/roads/blockade', expect.objectContaining({ method: 'POST', body: JSON.stringify({ from: barrierFrom, to: barrierTo }), signal: expect.any(AbortSignal) }));
  expect(hook.result.current.anchors).toEqual([barrierFrom, barrierTo]); expect(hook.result.current.distanceMeters).toBe(27.75); expect(hook.onDraw).toHaveBeenLastCalledWith(barrier.drawing);
  hook.rerender({ enabled: true, owner: 'first-user', drawing: barrier.drawing, kind: 'blockade' });
  const third: Coordinate = [73.06, 33.71]; await act(async () => hook.result.current.choose(third));
  expect(api).toHaveBeenCalledTimes(1); expect(hook.result.current.anchors).toEqual([third]);
  expect(hook.onDraw).toHaveBeenLastCalledWith({ kind: 'line', coordinates: [third], widthMeters: 4 }); expect(hook.result.current.distanceMeters).toBeNull();
});

it('preserves the raw first blockade end after server rejection and retries only the second end', async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error('Select a barrier between 2 and 80 metres.')).mockResolvedValueOnce(barrier);
  const hook = setup({ enabled: true, owner: 'first-user', drawing: emptyDrawing, kind: 'blockade' });
  await act(async () => hook.result.current.choose(barrierFrom));
  await act(async () => hook.result.current.choose([73.06, 33.7]));
  expect(hook.result.current.anchors).toEqual([barrierFrom]); expect(hook.onDraw).toHaveBeenCalledTimes(1); expect(hook.result.current.error).toBe('Select a barrier between 2 and 80 metres.');
  await act(async () => hook.result.current.choose(barrierTo));
  expect(vi.mocked(api).mock.calls.every(([path]) => path === '/roads/blockade')).toBe(true);
  expect(hook.result.current.anchors).toEqual([barrierFrom, barrierTo]); expect(hook.result.current.error).toBe('');
});

it('accepts a rapid blockade second pick while its own raw first drawing is committed', async () => {
  const next = deferred<typeof barrier>(); vi.mocked(api).mockReturnValueOnce(next.promise);
  const hook = setup({ enabled: true, owner: 'first-user', drawing: emptyDrawing, kind: 'blockade' }); let work!: Promise<void>;
  await act(async () => { await hook.result.current.choose(barrierFrom); work = hook.result.current.choose(barrierTo); });
  hook.rerender({ enabled: true, owner: 'first-user', drawing: hook.onDraw.mock.calls[0][0], kind: 'blockade' });
  expect(hook.result.current.busy).toBe(true);
  await act(async () => { next.resolve(barrier); await work; });
  expect(hook.onDraw).toHaveBeenLastCalledWith(barrier.drawing); expect(hook.result.current.anchors).toHaveLength(2);
});

it.each(['owner', 'kind', 'mode', 'drawing', 'reset', 'unmount'] as const)('ignores a pending blockade after %s changes without overwriting its external drawing', async change => {
  const pending = deferred<typeof barrier>(); vi.mocked(api).mockReturnValueOnce(pending.promise);
  const hook = setup({ enabled: true, owner: 'first-user', drawing: emptyDrawing, kind: 'blockade' });
  await act(async () => hook.result.current.choose(barrierFrom));
  const pointDrawing = hook.onDraw.mock.calls[0][0] as Drawing; hook.rerender({ enabled: true, owner: 'first-user', drawing: pointDrawing, kind: 'blockade' });
  let work!: Promise<void>; act(() => { work = hook.result.current.choose(barrierTo); });
  const signal = vi.mocked(api).mock.calls[0][1]!.signal!;
  if (change === 'reset') act(() => hook.result.current.reset());
  else if (change === 'unmount') hook.unmount();
  else hook.rerender({ enabled: change !== 'mode', owner: change === 'owner' ? 'second-user' : 'first-user', drawing: change === 'drawing' ? first.drawing : pointDrawing, kind: change === 'kind' ? 'road_closure' : 'blockade' });
  expect(signal.aborted).toBe(true); expect(hook.onDraw).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(barrier); await work; });
  expect(hook.onDraw).toHaveBeenCalledTimes(1);
  if (change !== 'unmount') { expect(hook.result.current.anchors).toEqual([]); expect(hook.result.current.busy).toBe(false); }
});

it.each([{ ...barrier, distanceMeters: 1 }, { ...barrier, distanceMeters: 81 }, { ...barrier, drawing: { ...barrier.drawing, widthMeters: 14 } }, { ...barrier, drawing: { ...barrier.drawing, coordinates: [[73.0501, 33.7], barrierTo] } }])('rejects a blockade response that changes the selected barrier or violates its size contract %j', async response => {
  vi.mocked(api).mockResolvedValue(response);
  const hook = setup({ enabled: true, owner: 'first-user', drawing: emptyDrawing, kind: 'blockade' });
  await act(async () => hook.result.current.choose(barrierFrom)); await act(async () => hook.result.current.choose(barrierTo));
  expect(hook.onDraw).toHaveBeenCalledTimes(1); expect(hook.result.current.anchors).toEqual([barrierFrom]); expect(hook.result.current.error).toBe('Road selection unavailable.'); expect(hook.result.current.busy).toBe(false);
});
