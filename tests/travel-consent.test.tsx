// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, LocalProfile, RecordedPoint } from '../shared/types';
import { useTravelCapture } from '../src/lib/useTravelCapture';
import ActivityPanel from '../src/components/ActivityPanel';
import ProfilePanel from '../src/components/ProfilePanel';
const mock = vi.hoisted(() => ({ userId: 'one' as string | null, api: vi.fn(), send: vi.fn(), photo: vi.fn() }));
vi.mock('../src/lib/api', () => ({ api: mock.api, send: mock.send }));
vi.mock('../src/lib/auth', () => ({ AUTH_MODE: 'emulator', getAuthSession: () => ({ user: mock.userId ? { uid: mock.userId } : null }) }));
vi.mock('../src/lib/images', () => ({ fileToPhotoDataUrl: mock.photo }));
// Profile save/consent behavior does not depend on downloading the full gazetteer.
// The separate real-city-data suite validates that catalogue and its source scope.
vi.mock('../src/lib/pakistanCities', async original => ({ ...(await original<object>()), loadPakistanCities: async () => [{ name: 'Islamabad', region: '08', search: 'islamabad islamabad capital territory' }] }));
const profile: LocalProfile = { id: 'local', displayName: 'Traveller', theme: 'light', mapStyle: 'outdoors', mapDetail: 'clean', browserNotifications: false, inferFrequentRoutes: false, transport: 'car', createdAt: '', updatedAt: '' };
const state = (patch: Partial<LocalProfile> = {}) => ({ profile: { ...profile, ...patch }, trips: [], commutes: [], alerts: [], closures: [], notices: [], eventRevision: 0 } as unknown as AppState);
const now = Date.parse('2026-10-17T08:00:00Z');
function sample(at: number, longitude = 73): RecordedPoint { vi.setSystemTime(at); return { coordinate: [longitude, 33.7], timestamp: new Date(at).toISOString(), accuracy: 10 }; }
beforeEach(() => {
  mock.userId = 'one'; mock.api.mockReset().mockResolvedValue([]); mock.send.mockReset().mockResolvedValue({}); mock.photo.mockReset();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('Notification', { permission: 'default' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('foreground navigation trip consent', () => {
  it('never starts a GPS watcher or saves an unconsented navigation session', () => {
    vi.useFakeTimers(); const watch = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: vi.fn() } });
    const { result } = renderHook(() => useTravelCapture({ userId: 'one', profile }));
    act(() => { result.current.capture(sample(now)); result.current.capture(sample(now + 60_000, 73.002)); result.current.capture(null); });
    expect(watch).not.toHaveBeenCalled(); expect(mock.api).not.toHaveBeenCalled();
  });
  it('saves one meaningful trip from the existing guidance samples without road-sharing consent', async () => {
    vi.useFakeTimers(); const saved = vi.fn();
    const { result } = renderHook(() => useTravelCapture({ userId: 'one', profile: { ...profile, collectTravelData: true }, onSaved: saved }));
    act(() => { result.current.capture(sample(now)); result.current.capture(sample(now + 60_000, 73.002)); result.current.capture(null); result.current.capture(null); });
    await act(async () => { await Promise.resolve(); });
    expect(mock.api).toHaveBeenCalledTimes(1);
    const draft = JSON.parse(mock.api.mock.calls[0][1].body); expect(draft).toMatchObject({ name: 'Navigation trip', contributeToRoadDiscovery: false });
    expect(draft.points).toHaveLength(2); expect(draft.points[0].coordinate).toEqual([73, 33.7]); expect(saved).toHaveBeenCalledTimes(1);
  });
  it('discards samples on opt-out or account changes and aborts an outstanding save', () => {
    vi.useFakeTimers(); mock.api.mockReturnValue(new Promise(() => {}));
    const { result, rerender } = renderHook(({ userId, allowed }) => useTravelCapture({ userId, profile: { ...profile, collectTravelData: allowed } }), { initialProps: { userId: 'one', allowed: true } });
    act(() => { result.current.capture(sample(now)); result.current.capture(sample(now + 60_000, 73.002)); });
    rerender({ userId: 'one', allowed: false }); act(() => result.current.capture(null)); expect(mock.api).not.toHaveBeenCalled();
    rerender({ userId: 'one', allowed: true }); act(() => { result.current.capture(sample(now)); result.current.capture(sample(now + 60_000, 73.002)); result.current.capture(null); });
    const signal = mock.api.mock.calls[0][1].signal as AbortSignal; expect(signal.aborted).toBe(false);
    mock.userId = 'two'; rerender({ userId: 'two', allowed: true }); expect(signal.aborted).toBe(true);
    act(() => result.current.capture(null)); expect(mock.api).toHaveBeenCalledTimes(1);
  });
  it('discards hidden-page samples and ignores stale, inaccurate and stationary fixes', () => {
    vi.useFakeTimers(); const { result } = renderHook(() => useTravelCapture({ userId: 'one', profile: { ...profile, collectTravelData: true } }));
    act(() => { result.current.capture(sample(now)); result.current.capture(sample(now + 60_000)); result.current.capture(null); });
    expect(mock.api).not.toHaveBeenCalled();
    act(() => { result.current.capture(sample(now)); result.current.capture({ ...sample(now + 60_000, 73.002), accuracy: 150 }); result.current.capture(null); });
    expect(mock.api).not.toHaveBeenCalled();
    act(() => { result.current.capture(sample(now)); const stale = sample(now + 60_000, 73.002); vi.setSystemTime(now + 120_000); result.current.capture(stale); result.current.capture(null); });
    expect(mock.api).not.toHaveBeenCalled();
    act(() => { result.current.capture(sample(now)); result.current.capture(sample(now + 60_000, 73.002)); });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); act(() => document.dispatchEvent(new Event('visibilitychange')));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); act(() => result.current.capture(null)); expect(mock.api).not.toHaveBeenCalled();
  });
});
describe('personal permission and profile controls', () => {
  const props = { reload: vi.fn(async () => {}), notify: vi.fn(), onSources: vi.fn(), onActivity: vi.fn(), onSaveProposal: vi.fn(async () => {}) };
  it('makes trip permission explicit, defaults off, and enables learning only with the same permission action', async () => {
    render(<ProfilePanel {...props} state={state({ inferFrequentRoutes: true })} personalFeaturesAvailable account={{ uid: 'one', displayName: 'Ali', email: 'ali@example.test', role: 'user', provider: 'firebase' }} />);
    fireEvent.click(screen.getByText('Journey alerts'));
    expect(screen.getByRole('switch', { name: 'Learn usual journeys and alert me' }).matches(':disabled')).toBe(true);
    expect(mock.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Personal trip data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Allow personal trip data & usual-route alerts' }));
    await waitFor(() => expect(mock.send).toHaveBeenCalledWith('/profile', { collectTravelData: true, inferFrequentRoutes: true, travelDataChoiceMade: true }, 'PATCH'));
    expect(screen.queryByText('Source updates & collector')).toBeNull();
  });
  it('saves name and coarse city/area together and disables collection with learning', async () => {
    const ui = render(<ProfilePanel {...props} state={state()} personalFeaturesAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Islamabad' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Islamabad, Islamabad Capital Territory' }));
    fireEvent.change(screen.getByLabelText('Area (optional)'), { target: { value: 'F-8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(mock.send).toHaveBeenCalledWith('/profile', { displayName: 'Ali', city: 'Islamabad', location: 'F-8' }, 'PATCH'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Personal trip data' }));
    expect(screen.getByRole('button', { name: 'Allow personal trip data & usual-route alerts' }).matches(':disabled')).toBe(false);
    ui.rerender(<ProfilePanel {...props} state={state({ collectTravelData: true })} personalFeaturesAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop collecting trip data' }));
    await waitFor(() => expect(mock.send).toHaveBeenCalledWith('/profile', { collectTravelData: false, inferFrequentRoutes: false, travelDataChoiceMade: true }, 'PATCH'));
  });
  it('stages a profile photo and name until Save, and Cancel discards both', async () => {
    mock.photo.mockResolvedValue('data:image/jpeg;base64,cHJldmlldw==');
    render(<ProfilePanel {...props} state={state()} personalFeaturesAvailable />);
    expect(screen.queryByLabelText('Your name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Unsaved name' } });
    fireEvent.change(screen.getByLabelText('Choose profile photo'), { target: { files: [new File(['test'], 'profile.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByAltText('Your profile photo').getAttribute('src')).toBe('data:image/jpeg;base64,cHJldmlldw=='));
    expect(mock.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByAltText('Your profile photo')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Traveller');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Ali' } });
    fireEvent.change(screen.getByLabelText('Choose profile photo'), { target: { files: [new File(['test'], 'profile.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save profile' }).matches(':disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(mock.send).toHaveBeenCalledWith('/profile', { displayName: 'Ali', city: '', location: '', photoDataUrl: 'data:image/jpeg;base64,cHJldmlldw==' }, 'PATCH'));
  });
  it('discards an asynchronous photo draft across an account change', async () => {
    let complete!: (value: string) => void;
    mock.photo.mockReturnValue(new Promise<string>(resolve => { complete = resolve; }));
    const ui = render(<ProfilePanel {...props} state={state()} personalFeaturesAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Choose profile photo'), { target: { files: [new File(['test'], 'profile.jpg', { type: 'image/jpeg' })] } });
    mock.userId = 'two'; ui.rerender(<ProfilePanel {...props} state={state({ displayName: 'Second user' })} personalFeaturesAvailable />);
    await act(async () => complete('data:image/jpeg;base64,cHJpdmF0ZQ=='));
    expect(screen.queryByAltText('Your profile photo')).toBeNull();
    expect(screen.queryByLabelText('Your name')).toBeNull();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('opens personal monthly statistics separately without enabling collection', () => {
    const onStatistics = vi.fn();
    render(<ProfilePanel {...props} onStatistics={onStatistics} state={state()} personalFeaturesAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Personal statistics' }));
    expect(onStatistics).toHaveBeenCalledTimes(1); expect(props.onActivity).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled();
  });
  it('keeps the overview compact and uses the same separate dialog for every settings section', () => {
    const watch = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: vi.fn() } });
    render(<ProfilePanel {...props} state={state()} personalFeaturesAvailable />);
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByLabelText('Vehicle type')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    const sections = [
      ['Edit', 'Personal information'], ['Your vehicle', 'Your vehicle'], ['Personal trip data', 'Personal trip data'],
      ['Appearance & language', 'Appearance & language'], ['Journey alerts', 'Journey alerts'], ['Fuel prices', 'Fuel prices'],
    ];
    for (const [buttonName, title] of sections) {
      const trigger = screen.getByRole('button', { name: buttonName }); trigger.focus(); fireEvent.click(trigger);
      const panel = screen.getByRole('dialog', { name: title });
      expect(panel.parentElement?.classList.contains('profile-settings-dialog')).toBe(true);
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(within(panel).getByRole('button', { name: 'Close settings' })).toBeTruthy();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
    }
    expect(mock.send).not.toHaveBeenCalled(); expect(watch).not.toHaveBeenCalled();
  });
  it('routes settings, statistics and history through the parent section controller', () => {
    const onSectionChange = vi.fn();
    const ui = render(<ProfilePanel {...props} state={state()} personalFeaturesAvailable section={null} onSectionChange={onSectionChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Your vehicle' })); expect(onSectionChange).toHaveBeenLastCalledWith('vehicle');
    expect(screen.queryByRole('dialog')).toBeNull();
    ui.rerender(<ProfilePanel {...props} state={state()} personalFeaturesAvailable section="vehicle" onSectionChange={onSectionChange} />);
    expect(screen.getByRole('dialog', { name: 'Your vehicle' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' })); expect(onSectionChange).toHaveBeenLastCalledWith(null);
    ui.rerender(<ProfilePanel {...props} state={state()} personalFeaturesAvailable section={null} onSectionChange={onSectionChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Personal statistics' })); expect(onSectionChange).toHaveBeenLastCalledWith('statistics');
    fireEvent.click(screen.getByRole('button', { name: 'Trip history' })); expect(onSectionChange).toHaveBeenLastCalledWith('history');
  });
  it('discards a pending photo on panel close without leaving the next panel busy', async () => {
    let complete!: (value: string) => void; mock.photo.mockReturnValue(new Promise<string>(resolve => { complete = resolve; }));
    render(<ProfilePanel {...props} state={state()} personalFeaturesAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Choose profile photo'), { target: { files: [new File(['test'], 'profile.jpg', { type: 'image/jpeg' })] } });
    expect(screen.getByRole('button', { name: 'Save profile' }).matches(':disabled')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await act(async () => complete('data:image/jpeg;base64,cHJpdmF0ZQ=='));
    expect(screen.queryByAltText('Your profile photo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save profile' }).matches(':disabled')).toBe(false);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('keeps an unsaved edit and its error inside the panel after a failed write', async () => {
    mock.send.mockRejectedValueOnce(new Error('Profile unavailable'));
    render(<ProfilePanel {...props} state={state()} personalFeaturesAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Unsaved traveller' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('Profile unavailable');
    expect(screen.getByRole('dialog', { name: 'Personal information' }).contains(error)).toBe(true);
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Unsaved traveller');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Traveller');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('does not start manual recording before permission and clears its watcher after revocation', () => {
    const watch = vi.fn(() => 7), clear = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: clear } });
    const points = vi.fn(); const activity = { points: [], setPoints: points, reload: props.reload, notify: props.notify, onView: vi.fn() };
    const ui = render(<ActivityPanel {...activity} state={state()} />);
    expect(screen.getByRole('button', { name: 'Start recording' }).matches(':disabled')).toBe(true); expect(watch).not.toHaveBeenCalled();
    ui.rerender(<ActivityPanel {...activity} state={state({ collectTravelData: true })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' })); expect(watch).toHaveBeenCalledTimes(1);
    ui.rerender(<ActivityPanel {...activity} state={state()} />); expect(clear).toHaveBeenCalledWith(7); expect(points).toHaveBeenLastCalledWith([]);
  });
  it('pauses manual recording when leaving Activity and ignores queued fixes from its former watcher', () => {
    let callback!: PositionCallback; const watch = vi.fn((next: PositionCallback) => { callback = next; return 9; }), clear = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: clear } });
    const points = vi.fn(), activity = { points: [], setPoints: points, reload: props.reload, notify: props.notify, onView: vi.fn(), state: state({ collectTravelData: true }) };
    const ui = render(<ActivityPanel {...activity} active />); fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    ui.rerender(<ActivityPanel {...activity} active={false} />); expect(clear).toHaveBeenCalledWith(9);
    const before = points.mock.calls.length;
    act(() => callback({ timestamp: Date.now(), coords: { longitude: 73, latitude: 33.7, accuracy: 10 } } as GeolocationPosition));
    expect(points).toHaveBeenCalledTimes(before);
  });
});
