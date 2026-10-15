import { getLanguage, t } from './language';
import type { Closure } from '../../shared/types';

export const TIME_ZONE = 'Asia/Karachi';
export function localInput(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function inputISO(value: string): string {
  const date = new Date(`${value}${value.length === 16 ? ':00' : ''}+05:00`);
  if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid date and time.');
  return date.toISOString();
}
export function time(value: string) { return new Intl.DateTimeFormat(getLanguage() === 'ur' ? 'ur-PK' : 'en-PK', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
export function dateTime(value: string) { return new Intl.DateTimeFormat(getLanguage() === 'ur' ? 'ur-PK' : 'en-PK', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
export function dayDate(value: string) { return new Intl.DateTimeFormat(getLanguage() === 'ur' ? 'ur-PK' : 'en-PK', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value)); }
export function distance(meters: number) { return meters < 1000 ? t(`${Math.round(meters)} m`) : t(`${(meters / 1000).toFixed(1)} km`); }
export function duration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? t(`${minutes} min`) : t(`${Math.floor(minutes / 60)} hr ${minutes % 60} min`);
}
export function closureState(closure: Closure, at = new Date().toISOString()) {
  if (closure.status === 'cancelled') return 'cancelled';
  if (closure.status === 'draft') return 'draft';
  const stamp = new Date(at).getTime();
  if (new Date(closure.startsAt).getTime() > stamp) return 'scheduled';
  if (closure.endsAt && new Date(closure.endsAt).getTime() <= stamp) return 'ended';
  return 'active';
}
export function relative(value: string | null) {
  if (!value) return 'Not checked yet';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes} min ago` : dateTime(value);
}
export function downloadJSON(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/geo+json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
