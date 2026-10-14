import { useEffect, useRef } from 'react';
import type { Alert, AppState } from '../../shared/types';

const KEY = 'manzil-notified-alerts-v1';
type IdStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function readNotifiedIds(storage: Pick<Storage, 'getItem'>): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length <= 512).slice(-500) : [];
  } catch { return []; }
}
export function canNotifyAlert(state: AppState | null, alert: Alert): boolean {
  const latest = state?.alerts.find(item => item.id === alert.id);
  return Boolean(state?.profile?.browserNotifications && latest && !latest.read &&
    (!latest.frequentRouteId || state.profile.inferFrequentRoutes));
}
/** The first snapshot and all alerts observed while opted out are deliberately quiet. */
export class AlertNotificationTracker {
  private seen: Set<string> | null = null;
  ids() { return [...(this.seen ?? [])]; }
  update(state: AppState, persisted: string[] = [], now = Date.now()): Alert[] {
    if (!this.seen) { this.seen = new Set([...persisted, ...state.alerts.map(alert => alert.id)].slice(-500)); return []; }
    for (const id of persisted) this.seen.add(id);
    const fresh = state.alerts.filter(alert => !this.seen!.has(alert.id));
    for (const alert of state.alerts) this.seen.add(alert.id);
    this.seen = new Set(this.ids().slice(-500));
    return fresh.filter(alert => {
      const age = now - Date.parse(alert.createdAt);
      return canNotifyAlert(state, alert) && Number.isFinite(age) && age >= -5 * 60_000 && age <= 15 * 60_000;
    });
  }
}
function bounded<T>(promise: Promise<T>, milliseconds = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Notification worker is not ready.')), milliseconds);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
let worker: Promise<ServiceWorkerRegistration | null> | null = null;
function notificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!worker) worker = (async () => {
    try {
      const registration = await bounded(navigator.serviceWorker.register('/notifications-sw.js'));
      return registration.active?.state === 'activated' ? registration : await bounded(navigator.serviceWorker.ready);
    } catch { return null; }
  })().finally(() => { worker = null; });
  return worker;
}
export async function enableBrowserNotifications(): Promise<boolean> {
  if (!('Notification' in window)) throw new Error('This browser does not support system notifications. In-app alerts still work.');
  const permission = window.Notification.permission === 'default' ? await window.Notification.requestPermission() : window.Notification.permission;
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can change this in your browser’s site settings.');
  // A failed worker must not make a granted desktop permission look denied.
  // Delivery can fall back to the desktop Notification API; the inbox stays durable.
  void notificationWorker();
  return true;
}
export async function showJourneyNotification(title: string, options: NotificationOptions, allowed: () => boolean, onOpen: () => void): Promise<void> {
  if (!allowed() || !('Notification' in window) || window.Notification.permission !== 'granted') return;
  const registration = await notificationWorker();
  // The user may revoke preferences or read the alert while a worker is installing.
  if (!allowed() || window.Notification.permission !== 'granted') return;
  if (registration) {
    try { await registration.showNotification(title, options); return; }
    catch { /* Desktop browsers may still support constructor delivery. */ }
  }
  if (!allowed()) return;
  try {
    const notification = new window.Notification(title, options);
    notification.onclick = () => { window.focus(); onOpen(); notification.close(); };
  } catch { /* OS delivery is best effort; the inbox remains the delivery record. */ }
}
export function useAlertNotifications(state: AppState | null, onOpen: () => void) {
  const tracker = useRef<AlertNotificationTracker | null>(null);
  if (!tracker.current) tracker.current = new AlertNotificationTracker();
  const latest = useRef(state); latest.current = state;
  const open = useRef(onOpen); open.current = onOpen;
  useEffect(() => {
    if (!state) return;
    let storage: IdStorage | undefined;
    try { storage = window.localStorage; } catch { /* Private mode may block storage. */ }
    const fresh = tracker.current!.update(state, storage ? readNotifiedIds(storage) : []);
    try { storage?.setItem(KEY, JSON.stringify(tracker.current!.ids())); } catch { /* In-app alerts remain available. */ }
    if (!fresh.length) return;
    if (fresh.length > 3) {
      void showJourneyNotification(`${fresh.length} new journey alerts`, {
        body: 'Open your inbox to review scheduled closures and journey options.', icon: '/manzil-logo.png',
        tag: 'manzil-journey-updates', data: { url: '/#alerts' },
      }, () => fresh.some(alert => canNotifyAlert(latest.current, alert)), () => open.current());
      return;
    }
    for (const alert of fresh) {
      const options = { body: alert.message, icon: '/manzil-logo.png', tag: `manzil-${alert.id}`, data: { url: '/#alerts' } };
      void showJourneyNotification(alert.title, options, () => canNotifyAlert(latest.current, alert), () => open.current());
    }
  }, [state]);
}
