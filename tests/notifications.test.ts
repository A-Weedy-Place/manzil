import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Alert, AppState, LocalProfile } from '../shared/types';
import { AlertNotificationTracker, canNotifyAlert, readNotifiedIds, showJourneyNotification } from '../src/lib/notifications';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const profile: LocalProfile = { id: 'local', displayName: 'Traveller', theme: 'system', mapDetail: 'clean', mapStyle: 'streets',
  browserNotifications: true, inferFrequentRoutes: false, transport: 'car', createdAt: '', updatedAt: '' };
const alert = (id: string, changes: Partial<Alert> = {}): Alert => ({ id, title: 'Journey disruption', message: 'Review your next trip.',
  createdAt: new Date(NOW).toISOString(), read: false, ...changes });
const state = (alerts: Alert[], preferences: Partial<LocalProfile> = {}): AppState => ({ alerts, profile: { ...profile, ...preferences } } as AppState);
afterEach(() => vi.unstubAllGlobals());

describe('quiet initial notification state and explicit consent', () => {
  it('rejects corrupt notification storage instead of crashing the app', () => {
    for (const value of ['null', '{}', '42', 'invalid json']) expect(readNotifiedIds({ getItem: () => value })).toEqual([]);
    expect(readNotifiedIds({ getItem: () => '["good",1,null,"also-good"]' })).toEqual(['good', 'also-good']);
    expect(readNotifiedIds({ getItem: () => { throw new Error('Storage blocked'); } })).toEqual([]);
  });
  it('seeds existing alerts quietly and delivers each genuinely new alert only once', () => {
    const tracker = new AlertNotificationTracker();
    expect(tracker.update(state([alert('existing')]), [], NOW)).toEqual([]);
    expect(tracker.ids()).toContain('existing');
    expect(tracker.update(state([alert('new'), alert('existing')]), [], NOW).map(item => item.id)).toEqual(['new']);
    expect(tracker.update(state([alert('new'), alert('existing')]), [], NOW)).toEqual([]);
  });
  it('does not replay alerts first observed while notifications or learned-route consent were off', () => {
    const tracker = new AlertNotificationTracker(); tracker.update(state([]), [], NOW);
    expect(tracker.update(state([alert('while-off')], { browserNotifications: false }), [], NOW)).toEqual([]);
    expect(tracker.update(state([alert('while-off')]), [], NOW)).toEqual([]);
    const learned = alert('learned', { frequentRouteId: 'usual-route' });
    expect(tracker.update(state([learned]), [], NOW)).toEqual([]);
    expect(tracker.update(state([learned], { inferFrequentRoutes: true }), [], NOW)).toEqual([]);
    const freshLearned = alert('new-learned', { frequentRouteId: 'usual-route' });
    expect(tracker.update(state([freshLearned, learned], { inferFrequentRoutes: true }), [], NOW)).toEqual([freshLearned]);
  });
  it('ignores read, stale, implausibly future, and already-notified-in-another-tab alerts', () => {
    const tracker = new AlertNotificationTracker(); tracker.update(state([]), [], NOW);
    const alerts = [alert('read', { read: true }), alert('stale', { createdAt: new Date(NOW - 3600_000).toISOString() }),
      alert('future', { createdAt: new Date(NOW + 3600_000).toISOString() }), alert('other-tab'), alert('fresh')];
    expect(tracker.update(state(alerts), ['other-tab'], NOW).map(item => item.id)).toEqual(['fresh']);
  });
});

describe('best-effort delivery without real permission prompts', () => {
  it('rechecks learned-route consent after asynchronous worker setup', async () => {
    const native = vi.fn(); const permissionRequest = vi.fn();
    class FakeNotification { static permission = 'granted'; static requestPermission = permissionRequest; constructor() { native(); } }
    vi.stubGlobal('window', { Notification: FakeNotification });
    let ready!: (value: ServiceWorkerRegistration) => void;
    const registration = new Promise<ServiceWorkerRegistration>(resolve => { ready = resolve; });
    vi.stubGlobal('navigator', { serviceWorker: { register: () => registration } });
    const learned = alert('learned', { frequentRouteId: 'usual' }); let latest = state([learned], { inferFrequentRoutes: true });
    const show = vi.fn();
    const delivery = showJourneyNotification('Journey disruption', {}, () => canNotifyAlert(latest, learned), () => {});
    latest = state([learned], { inferFrequentRoutes: false });
    ready({ active: { state: 'activated' }, showNotification: show } as unknown as ServiceWorkerRegistration);
    await delivery;
    expect(show).not.toHaveBeenCalled(); expect(native).not.toHaveBeenCalled(); expect(permissionRequest).not.toHaveBeenCalled();
  });
  it('falls back to a desktop notification after worker registration fails', async () => {
    const native = vi.fn(), permissionRequest = vi.fn(), focus = vi.fn(), open = vi.fn();
    let delivered: { onclick: (() => void) | null; close: () => void } | undefined;
    class FakeNotification {
      static permission = 'granted'; static requestPermission = permissionRequest;
      onclick: (() => void) | null = null; close = vi.fn();
      constructor(title: string, options: NotificationOptions) { native(title, options); delivered = this; }
    }
    vi.stubGlobal('window', { Notification: FakeNotification, focus });
    vi.stubGlobal('navigator', { serviceWorker: { register: async () => { throw new Error('Worker unavailable'); } } });
    await showJourneyNotification('New closure', { body: 'Review this route.' }, () => true, open);
    expect(native).toHaveBeenCalledWith('New closure', { body: 'Review this route.' });
    delivered?.onclick?.(); expect(focus).toHaveBeenCalledOnce(); expect(open).toHaveBeenCalledOnce(); expect(permissionRequest).not.toHaveBeenCalled();
  });
});
