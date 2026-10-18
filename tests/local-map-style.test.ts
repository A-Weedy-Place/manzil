// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLocalMapStyle } from '../src/lib/useLocalMapStyle';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('defaults Local to Minimal and remembers its explicit choice across reloads', () => {
  const first = renderHook(() => useLocalMapStyle());
  expect(first.result.current[0]).toBe('minimal');
  act(() => first.result.current[1]('night'));
  expect(first.result.current[0]).toBe('night');
  first.unmount();
  expect(renderHook(() => useLocalMapStyle()).result.current[0]).toBe('night');
});

it('keeps separate guest and account choices on the first render after switching', () => {
  const hook = renderHook(({ uid }: { uid?: string }) => useLocalMapStyle(uid), { initialProps: { uid: undefined } as { uid?: string } });
  act(() => hook.result.current[1]('night'));
  hook.rerender({ uid: 'alice' });
  expect(hook.result.current[0]).toBe('minimal');
  act(() => hook.result.current[1]('outdoors'));
  hook.rerender({ uid: 'bob' });
  expect(hook.result.current[0]).toBe('minimal');
  hook.rerender({ uid: 'alice' });
  expect(hook.result.current[0]).toBe('outdoors');
  hook.rerender({ uid: undefined });
  expect(hook.result.current[0]).toBe('night');
});

it('ignores invalid or retired choices and keeps a usable preference when storage is blocked', () => {
  localStorage.setItem('manzil-local-map-style-v1:guest', 'contrast');
  const hook = renderHook(() => useLocalMapStyle());
  expect(hook.result.current[0]).toBe('minimal');
  act(() => hook.result.current[1]('streets'));
  expect(hook.result.current[0]).toBe('minimal');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  const blocked = renderHook(() => useLocalMapStyle('alice'));
  expect(blocked.result.current[0]).toBe('minimal');
  act(() => blocked.result.current[1]('night'));
  expect(blocked.result.current[0]).toBe('night');
});
