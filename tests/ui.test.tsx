// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountPanel from '../src/components/AccountPanel';
import WelcomeTour, { TOUR_KEY } from '../src/components/WelcomeTour';
import NavigationPanel from '../src/components/NavigationPanel';
import { setLanguage } from '../src/lib/language';
import { speechText } from '../shared/speech';
import { NavigationSpeaker } from '../src/lib/speech';
import type { Coordinate, RouteOption } from '../shared/types';
import { getAuthSession, signOut } from '../src/lib/auth';
const route: RouteOption = { id: 'direct', kind: 'direct', label: 'Recommended', validation: 'clear', warnings: [], geometry: { type: 'LineString', coordinates: [[73, 33.7], [73, 33.71]] }, distanceMeters: 1112, durationSeconds: 120,
  departureAt: '2026-10-15T10:00:00Z', arrivalAt: '2026-10-15T10:02:00Z', steps: [{ instruction: 'Continue', roadName: 'Test Road', distanceMeters: 1112, durationSeconds: 120 }], snappedOrigin: [73, 33.7], snappedDestination: [73, 33.71] };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); signOut(); setLanguage('en'); });
afterEach(() => { cleanup(); signOut(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setLanguage('en'); });
describe('bilingual first-use and account surfaces', () => {
  it('enables dummy login locally, leaves future account screens disabled and removes Google sign-in', () => {
    const close = vi.fn(); render(<AccountPanel onClose={close} />);
    expect(screen.getByLabelText('Email').matches(':disabled')).toBe(false);
    expect(screen.getByLabelText('Password').matches(':disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByRole('heading', { name: 'Reset password' })).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByLabelText('Email').matches(':disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    fireEvent.click(screen.getByText('Continue as guest', { selector: 'button' }));
    expect(close).toHaveBeenCalled();
  });
  it('signs in the selected normal/admin dummy account without persisting a password', async () => {
    const close = vi.fn(); render(<AccountPanel onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: /Normal user/ }));
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
    expect(getAuthSession().user).toMatchObject({ uid: 'dev-user', role: 'user' });
    expect(sessionStorage.getItem('manzil-dev-session')).toBe('dev-user');
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    signOut(); fireEvent.click(screen.getByRole('button', { name: /Admin user/ }));
    fireEvent.submit(screen.getByRole('form', { name: 'Sign in' }));
    await waitFor(() => expect(getAuthSession().user).toMatchObject({ uid: 'dev-admin', role: 'admin' })); await waitFor(() => expect(close).toHaveBeenCalledTimes(2));
    expect(JSON.stringify(sessionStorage)).not.toContain('ManzilAdmin123!');
  });
  it('renders Urdu account and tour copy, remembers skipping and never asks for GPS', async () => {
    const watchPosition = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition } });
    setLanguage('ur'); const close = vi.fn(); render(<WelcomeTour onClose={close} />);
    expect(screen.getByRole('heading', { name: 'منزل میں خوش آمدید' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'اگلا' }));
    expect(screen.getByRole('heading', { name: 'اپنا سفر منتخب کریں' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(localStorage.getItem(TOUR_KEY)).toBe('seen'); expect(close).toHaveBeenCalledOnce(); expect(watchPosition).not.toHaveBeenCalled();
  });
  it('keeps the shade outside the card and moves above the legend in the reported viewport', async () => {
    vi.stubGlobal('innerWidth', 715); vi.stubGlobal('innerHeight', 431);
    const legend = document.createElement('div'); legend.className = 'map-legend'; document.body.appendChild(legend);
    let legendTop = 365;
    legend.getBoundingClientRect = () => ({ left: 39, top: legendTop, right: 319, bottom: legendTop + 50, width: 280, height: 50, x: 39, y: legendTop, toJSON: () => ({}) });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(350);
    render(<WelcomeTour onClose={vi.fn()} />);
    for (let index = 0; index < 3; index++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.tour-shade')).toBeNull(); expect(dialog.parentElement!.querySelector('.tour-shade')).not.toBeNull();
    expect(Number.parseFloat(dialog.style.top) + Number.parseFloat(dialog.style.maxHeight)).toBeLessThan(legendTop);
    const previousTop = dialog.style.top; legendTop = 200; fireEvent(window, new Event('resize'));
    await waitFor(() => expect(dialog.style.top).not.toBe(previousTop)); legend.remove();
  });
});
describe('foreground automatic rerouting', () => {
  it('preserves unvisited stops and omits a stop only after accurate fixes reach its route position', async () => {
    let location!: PositionCallback, now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now);
    const stopRoute = { ...route, geometry: { type: 'LineString' as const, coordinates: [[73, 33.7], [73, 33.705], [73, 33.71]] }, snappedWaypoints: [[73, 33.705] as Coordinate] };
    const onReplan = vi.fn(async (_coordinate: Coordinate, _visited: number) => stopRoute);
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: (callback: PositionCallback) => { location = callback; return 8; }, clearWatch: vi.fn() } });
    render(<NavigationPanel route={stopRoute} stops={[[73, 33.705]]} destination="Test destination" stale={false} onBack={vi.fn()} onPosition={vi.fn()} onReplan={onReplan} onFocus={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' }));
    async function emit(delta: number, longitude: number, latitude: number) { now += delta; await act(async () => location({ timestamp: now, coords: { longitude, latitude, accuracy: 8 } } as GeolocationPosition)); }
    await emit(0, 73, 33.7); expect(onReplan.mock.calls[0][1]).toBe(0);
    await emit(10000, 73, 33.705); await emit(1000, 73, 33.705);
    await emit(1000, 73.001, 33.705); await emit(2000, 73.0012, 33.705); await emit(2000, 73.0014, 33.705);
    await waitFor(() => expect(onReplan).toHaveBeenCalledTimes(2)); expect(onReplan.mock.calls[1][1]).toBe(1);
  });
  it('reroutes after a sustained wrong turn, preserves voice language, and stops accepting GPS after Stop', async () => {
    let location!: PositionCallback;
    const clearWatch = vi.fn(), onReplan = vi.fn(async (_coordinate: Coordinate, _visited: number) => route), onPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: vi.fn((callback: PositionCallback) => { location = callback; return 7; }), clearWatch } });
    render(<NavigationPanel route={route} destination="Test destination" stale={false} onBack={vi.fn()} onPosition={onPosition} onReplan={onReplan} onFocus={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Voice language'), { target: { value: 'ur' } });
    expect(localStorage.getItem('manzil-voice-language')).toBe('ur');
    fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' }));
    const start = Date.now();
    async function emit(timestamp: number, longitude: number, latitude: number) {
      await act(async () => { location({ timestamp, coords: { longitude, latitude, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null } } as GeolocationPosition); });
    }
    await emit(start, 73, 33.7); await waitFor(() => expect(onReplan).toHaveBeenCalledTimes(1));
    await emit(start + 100, 73.001, 33.701); await emit(start + 2100, 73.0012, 33.701);
    expect(onReplan).toHaveBeenCalledTimes(1);
    await emit(start + 4100, 73.0014, 33.701); await waitFor(() => expect(onReplan).toHaveBeenCalledTimes(2));
    expect(onReplan.mock.calls[1]).toEqual([[73.0014, 33.701], 0]);
    fireEvent.click(screen.getByRole('button', { name: 'Stop guidance' })); expect(clearWatch).toHaveBeenCalledWith(7);
    const calls = onPosition.mock.calls.length; await emit(start + 4500, 73.002, 33.702); expect(onPosition).toHaveBeenCalledTimes(calls);
  });
  it('renders Urdu route instructions while preserving real road names', () => {
    setLanguage('ur'); render(<NavigationPanel route={route} destination="F-8" stale={false} onBack={vi.fn()} onPosition={vi.fn()} onReplan={vi.fn()} onFocus={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'جی پی ایس رہنمائی شروع کریں' })).toBeTruthy();
    expect(screen.getAllByText(speechText({ kind: 'turn', turn: 'start', road: 'Test Road' }, 'ur')).length).toBeGreaterThan(0);
  });
  it('revalidates automatically when the closure revision invalidates a running journey', async () => {
    let location!: PositionCallback;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: (callback: PositionCallback) => { location = callback; return 9; }, clearWatch: vi.fn() } });
    const onReplan = vi.fn(async () => route), props = { route, destination: 'F-8', onBack: vi.fn(), onPosition: vi.fn(), onReplan, onFocus: vi.fn() };
    const view = render(<NavigationPanel {...props} stale={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start GPS guidance' }));
    await act(async () => location({ timestamp: Date.now(), coords: { longitude: 73, latitude: 33.7, accuracy: 8 } } as GeolocationPosition));
    expect(onReplan).toHaveBeenCalledTimes(1);
    view.rerender(<NavigationPanel {...props} stale />);
    await waitFor(() => expect(onReplan).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Direction prompts paused')).toBeTruthy();
  });
});

describe('navigation audio lifetime', () => {
  it('never plays a late cloud response after navigation was cancelled', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(value => { resolve = value; })));
    const audio = vi.fn(); vi.stubGlobal('Audio', audio);
    const speaker = new NavigationSpeaker(); const request = speaker.speak({ kind: 'test' }, 'ur');
    speaker.cancel(); await Promise.resolve(); resolve(new Response(new Blob(['fixture'], { type: 'audio/mpeg' }))); await request;
    expect(audio).not.toHaveBeenCalled();
  });
});
