import type { Alert, Closure, ClosureInput, LocalProfile, SourceNotice, SourceStatus, Trip } from '../shared/types.js';

export type Awaitable<T> = T | Promise<T>;
export type RecordKind = 'closure' | 'commute' | 'alert' | 'trip';
export type PersonalRecordKind = Exclude<RecordKind, 'closure'>;
export interface RoutingSnapshot { closures: Closure[]; revision: number }
/** Infrastructure boundary. SQLite remains synchronous; callers await both adapters. */
export interface Repository {
  readonly backend: 'sqlite' | 'firestore';
  /** False after a local adapter closes; async work must stop before touching its data. */
  readonly isOpen?: boolean;
  forUser(uid: string | null): Repository;
  close(): void;
  meta<T>(key: string): Awaitable<T | undefined>;
  setMeta(key: string, value: unknown): Awaitable<void>;
  /** Durable global once-per-PKT-day claim, including failed attempts. */
  claimFuelCheck(day: string): Awaitable<boolean>;
  profile(): Awaitable<LocalProfile>;
  updateProfile(patch: Partial<Omit<LocalProfile, 'id' | 'createdAt' | 'updatedAt'>>): Awaitable<LocalProfile>;
  recentInferenceTrips(now: number): Awaitable<Iterable<Trip>>;
  list<T>(kind: RecordKind, limit?: number): Awaitable<T[]>;
  listTripSummaries(limit?: number): Awaitable<Trip[]>;
  saveTripIfConsented(trip: Trip): Awaitable<void>;
  routingSnapshot(includeUnpublished?: boolean): Awaitable<RoutingSnapshot>;
  retainTrips(now: number): Awaitable<void>;
  get<T>(kind: RecordKind, id: string): Awaitable<T | undefined>;
  put<T extends { id: string }>(kind: PersonalRecordKind, value: T, now?: string): Awaitable<void>;
  delete(kind: PersonalRecordKind, id: string): Awaitable<void>;
  saveClosure(draft: ClosureInput, id?: string, revision?: number): Awaitable<Closure>;
  sourceStatus(): Awaitable<SourceStatus>;
  updateSourceStatus(patch: Partial<SourceStatus>): Awaitable<SourceStatus>;
  acquireSourceLease(now: number): Awaitable<boolean>;
  releaseSourceLease(): Awaitable<void>;
  listNotices(limit?: number): Awaitable<SourceNotice[]>;
  getNotice(id: string): Awaitable<SourceNotice | undefined>;
  upsertNotice(input: Omit<SourceNotice, 'id' | 'revision' | 'receivedAt' | 'status'>): Awaitable<{ notice: SourceNotice; changed: boolean }>;
  setNoticeStatus(id: string, status: SourceNotice['status']): Awaitable<SourceNotice>;
  pendingAgentCount(): Awaitable<number>;
  pendingAgentNotices(): Awaitable<SourceNotice[]>;
  addSourceRun(result: unknown): Awaitable<void>;
  addAlertOnce(id: string, alert: Omit<Alert, 'id'>): Awaitable<void>;
  speechUsage(month: string): Awaitable<number>;
  reserveSpeech(month: string, characters: number, limit: number): Awaitable<void>;
  cachedSpeech(key: string): Awaitable<Buffer | undefined>;
  cacheSpeech(key: string, audio: Buffer): Awaitable<void>;
}

export function defaultProfile(): LocalProfile {
  const now = new Date().toISOString();
  return { id: 'local', displayName: 'Traveller', theme: 'dark', mapDetail: 'clean', mapStyle: 'outdoors', browserNotifications: false,
    collectTravelData: false, travelDataChoiceMade: false, inferFrequentRoutes: false, transport: 'car', createdAt: now, updatedAt: now };
}
export function defaultSourceStatus(enabled = false): SourceStatus {
  return { enabled, intervalMinutes: 15, profileUrl: 'https://x.com/shaheryarhassan', lastAttemptAt: null, lastSuccessAt: null, nextCheckAt: null,
    state: enabled ? 'idle' : 'disabled', message: 'Public collection has not run. Coverage is partial.', noticesCollected: 0, coverage: 'partial' };
}
