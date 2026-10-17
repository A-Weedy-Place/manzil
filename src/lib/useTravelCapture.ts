import { useCallback, useEffect, useRef } from 'react';
import type { LocalProfile, RecordedPoint, TripDraft } from '../../shared/types';
import { api } from './api';
import { getAuthSession } from './auth';
import { meters } from './navigation';

interface Options { userId: string | null | undefined; profile: LocalProfile | null | undefined; onSaved?: () => void | Promise<void>; onError?: (message: string) => void }
/** Receives existing navigation GPS fixes. It never starts a location watcher. */
export function useTravelCapture({ userId, profile, onSaved, onError }: Options) {
  const current = useRef({ userId, allowed: profile?.collectTravelData === true, onSaved, onError });
  current.current = { userId, allowed: profile?.collectTravelData === true, onSaved, onError };
  const points = useRef<RecordedPoint[]>([]), owner = useRef<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const discard = useCallback(() => { points.current = []; owner.current = null; pending.current?.abort(); pending.current = null; }, []);
  useEffect(() => { discard(); return discard; }, [userId, profile?.collectTravelData, discard]);
  useEffect(() => {
    const hide = () => { if (document.hidden) discard(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); discard(); };
  }, [discard]);
  const capture = useCallback((point: RecordedPoint | null) => {
    const settings = current.current;
    const eligible = !!settings.userId && settings.allowed && !document.hidden && getAuthSession().user?.uid === settings.userId;
    if (!eligible) { discard(); return; }
    if (owner.current && owner.current !== settings.userId) discard();
    if (point) {
      const timestamp = Date.parse(point.timestamp), now = Date.now();
      if (!Number.isFinite(timestamp) || now - timestamp > 15_000 || timestamp - now > 5_000 || !Number.isFinite(point.accuracy) || point.accuracy < 0 || point.accuracy > 60 || point.coordinate.length !== 2 || !point.coordinate.every(Number.isFinite) || Math.abs(point.coordinate[0]) > 180 || Math.abs(point.coordinate[1]) > 90) return;
      const last = points.current.at(-1);
      if (last && timestamp - Date.parse(last.timestamp) < 4000) return;
      if (last && timestamp - Date.parse(last.timestamp) > 120_000) points.current = [];
      if (points.current.length >= 20_000) { discard(); return; }
      owner.current = settings.userId!;
      points.current.push({ ...point, coordinate: [...point.coordinate] });
      return;
    }
    const samples = points.current; points.current = []; owner.current = null;
    if (samples.length < 2 || Date.parse(samples.at(-1)!.timestamp) - Date.parse(samples[0].timestamp) < 60_000) return;
    const travelled = samples.reduce((sum, item, i) => sum + (i ? meters(samples[i - 1].coordinate, item.coordinate) : 0), 0);
    if (travelled < 100) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    const draft: TripDraft = { name: 'Navigation trip', startedAt: samples[0].timestamp, endedAt: samples.at(-1)!.timestamp, points: samples, contributeToRoadDiscovery: false };
    void api('/trips', { method: 'POST', body: JSON.stringify(draft), signal: controller.signal }).then(async () => {
      if (!controller.signal.aborted && current.current.allowed && current.current.userId === settings.userId) await current.current.onSaved?.();
    }).catch(error => {
      if (!controller.signal.aborted && current.current.allowed && current.current.userId === settings.userId) current.current.onError?.(error instanceof Error ? error.message : 'Could not save this navigation trip.');
    }).finally(() => { if (pending.current === controller) pending.current = null; });
  }, [discard]);
  return { capture };
}
