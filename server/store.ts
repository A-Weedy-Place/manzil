import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Alert, Closure, ClosureDraft, LocalProfile, SourceNotice, SourceStatus, Trip } from '../shared/types.js';
import { HttpError } from './errors.js';

type Kind = 'closure' | 'commute' | 'alert' | 'trip';
const PROFILE_URL = 'https://x.com/shaheryarhassan';

/** A single-user, local database. All SQL values are bound parameters. */
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (
        kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(kind,id)
      );
      CREATE TABLE IF NOT EXISTS notices (
        id TEXT PRIMARY KEY, source TEXT NOT NULL, source_id TEXT NOT NULL,
        data TEXT NOT NULL, received_at TEXT NOT NULL, UNIQUE(source,source_id)
      );
      CREATE TABLE IF NOT EXISTS notice_versions (
        notice_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY(notice_id,revision)
      );
      CREATE TABLE IF NOT EXISTS agent_outbox (
        id TEXT PRIMARY KEY, notice_id TEXT NOT NULL, revision INTEGER NOT NULL,
        state TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_runs (
        id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
    if (this.meta<number>('eventRevision') === undefined) this.setMeta('eventRevision', 0);
    if (!this.meta<LocalProfile>('profile')) {
      const now = new Date().toISOString();
      this.setMeta('profile', { id: 'local', displayName: 'Traveller', theme: 'system', mapDetail: 'clean',
        browserNotifications: false, inferFrequentRoutes: false, transport: 'car', createdAt: now, updatedAt: now } satisfies LocalProfile);
    }
    if (!this.meta<SourceStatus>('sourceStatus')) this.setMeta('sourceStatus', {
      enabled: process.env.X_SCRAPER_ENABLED !== 'false', intervalMinutes: 15, profileUrl: PROFILE_URL,
      lastAttemptAt: null, lastSuccessAt: null, nextCheckAt: null,
      state: process.env.X_SCRAPER_ENABLED === 'false' ? 'disabled' : 'idle',
      message: 'Public accountless collection has not run. Coverage is always partial.',
      noticesCollected: 0, coverage: 'partial',
    } satisfies SourceStatus);
  }
  close() { this.db.close(); }
  transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = run(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  meta<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
    return row ? JSON.parse(String(row.value)) as T : undefined;
  }
  setMeta(key: string, value: unknown) {
    this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, JSON.stringify(value));
  }
  get eventRevision() { return this.meta<number>('eventRevision') ?? 0; }
  profile(): LocalProfile { return this.meta<LocalProfile>('profile')!; }
  updateProfile(patch: Partial<Omit<LocalProfile, 'id' | 'createdAt' | 'updatedAt'>>): LocalProfile {
    return this.transaction(() => {
      const profile: LocalProfile = { ...this.profile(), ...patch, updatedAt: new Date().toISOString() };
      this.setMeta('profile', profile); return profile;
    });
  }
  *recentInferenceTrips(now: number): Generator<Trip> {
    // Iterate rather than materialize hundreds of large point arrays together in memory.
    const rows = this.db.prepare(`SELECT data FROM records WHERE kind='trip'
      AND julianday(json_extract(data,'$.endedAt')) >= julianday(?)
      AND julianday(json_extract(data,'$.endedAt')) <= julianday(?)
      AND json_array_length(json_extract(data,'$.points')) >= 8
      ORDER BY updated_at DESC LIMIT 200`).iterate(new Date(now - 30 * 86400_000).toISOString(), new Date(now).toISOString());
    for (const row of rows) yield JSON.parse(String(row.data)) as Trip;
  }
  list<T>(kind: Kind, limit = 500): T[] {
    return this.db.prepare('SELECT data FROM records WHERE kind=? ORDER BY updated_at DESC LIMIT ?')
      .all(kind, limit).map(row => JSON.parse(String(row.data)) as T);
  }
  listTripSummaries(limit = 50): Trip[] {
    // Strip point arrays in SQLite so frequent state polls do not materialize traces in JS.
    return this.db.prepare(`SELECT json_set(data, '$.pointCount', json_array_length(json_extract(data,'$.points')), '$.points', json('[]')) AS summary
      FROM records WHERE kind='trip' ORDER BY updated_at DESC LIMIT ?`).all(limit)
      .map(row => JSON.parse(String(row.summary)) as Trip);
  }
  routingClosures(): Closure[] {
    // Display pagination must never silently drop an older, still-active restriction.
    return this.db.prepare("SELECT data FROM records WHERE kind='closure' AND json_extract(data,'$.status')='published'")
      .all().map(row => JSON.parse(String(row.data)) as Closure);
  }
  retainTrips(now: number) {
    this.transaction(() => {
      this.db.prepare("DELETE FROM records WHERE kind='trip' AND julianday(json_extract(data,'$.endedAt')) < julianday(?)")
        .run(new Date(now - 90 * 86400_000).toISOString());
      this.db.prepare("UPDATE records SET data=json_set(data,'$.points',json('[]')) WHERE kind='trip' AND julianday(json_extract(data,'$.endedAt')) < julianday(?) AND json_array_length(json_extract(data,'$.points')) > 0")
        .run(new Date(now - 30 * 86400_000).toISOString());
    });
  }
  get<T>(kind: Kind, id: string): T | undefined {
    const row = this.db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind, id);
    return row ? JSON.parse(String(row.data)) as T : undefined;
  }
  put<T extends { id: string }>(kind: Kind, value: T, now = new Date().toISOString()) {
    this.db.prepare('INSERT INTO records(kind,id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at')
      .run(kind, value.id, JSON.stringify(value), now);
  }
  delete(kind: Kind, id: string) { this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id); }
  saveClosure(draft: ClosureDraft, id?: string, expectedRevision?: number): Closure {
    return this.transaction(() => {
      const previous = id ? this.get<Closure>('closure', id) : undefined;
      if (id && !previous) throw new HttpError(404, 'Closure not found.');
      if (previous && previous.revision !== expectedRevision) throw new HttpError(409, 'Closure changed. Reload before saving.');
      const now = new Date().toISOString();
      const closure: Closure = { ...draft, id: id ?? randomUUID(), revision: (previous?.revision ?? 0) + 1,
        createdAt: previous?.createdAt ?? now, updatedAt: now };
      this.put('closure', closure, now);
      this.setMeta('eventRevision', this.eventRevision + 1);
      return closure;
    });
  }
  sourceStatus(): SourceStatus {
    const status = this.meta<SourceStatus>('sourceStatus')!;
    const count = this.db.prepare("SELECT COUNT(*) AS n FROM notices WHERE source='x'").get();
    return { ...status, profileUrl: PROFILE_URL, coverage: 'partial', noticesCollected: Number(count?.n ?? 0) };
  }
  updateSourceStatus(patch: Partial<SourceStatus>) {
    const status = { ...this.sourceStatus(), ...patch, profileUrl: PROFILE_URL, coverage: 'partial' as const };
    this.setMeta('sourceStatus', status);
    return status;
  }
  acquireSourceLease(now: number): boolean {
    return this.transaction(() => {
      if ((this.meta<number>('sourceLeaseUntil') ?? 0) > now) return false;
      this.setMeta('sourceLeaseUntil', now + 70_000);
      return true;
    });
  }
  releaseSourceLease() { this.setMeta('sourceLeaseUntil', 0); }
  listNotices(limit = 150): SourceNotice[] {
    return this.db.prepare('SELECT data FROM notices ORDER BY received_at DESC LIMIT ?').all(limit)
      .map(row => JSON.parse(String(row.data)) as SourceNotice);
  }
  getNotice(id: string): SourceNotice | undefined {
    const row = this.db.prepare('SELECT data FROM notices WHERE id=?').get(id);
    return row ? JSON.parse(String(row.data)) as SourceNotice : undefined;
  }
  /** Notice revision and its pending-agent job are committed atomically. */
  upsertNotice(input: Omit<SourceNotice, 'id' | 'revision' | 'receivedAt' | 'status'>): { notice: SourceNotice; changed: boolean } {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT data FROM notices WHERE source=? AND source_id=?').get(input.source, input.sourceId);
      const old: SourceNotice | undefined = row ? JSON.parse(String(row.data)) as SourceNotice : undefined;
      if (old?.contentHash === input.contentHash) return { notice: old, changed: false };
      const notice: SourceNotice = { ...input, id: old?.id ?? randomUUID(), receivedAt: new Date().toISOString(),
        revision: (old?.revision ?? 0) + 1, status: 'pending_agent' };
      this.db.prepare('INSERT INTO notices(id,source,source_id,data,received_at) VALUES(?,?,?,?,?) ON CONFLICT(source,source_id) DO UPDATE SET data=excluded.data,received_at=excluded.received_at')
        .run(notice.id, notice.source, notice.sourceId, JSON.stringify(notice), notice.receivedAt);
      this.db.prepare('INSERT INTO notice_versions(notice_id,revision,data) VALUES(?,?,?)')
        .run(notice.id, notice.revision, JSON.stringify(notice));
      this.db.prepare("UPDATE agent_outbox SET state='superseded' WHERE notice_id=? AND state='pending_agent'")
        .run(notice.id);
      this.db.prepare('INSERT INTO agent_outbox(id,notice_id,revision,state,created_at) VALUES(?,?,?,?,?)')
        .run(`${notice.id}:${notice.revision}`, notice.id, notice.revision, 'pending_agent', notice.receivedAt);
      return { notice, changed: true };
    });
  }
  setNoticeStatus(id: string, status: SourceNotice['status']): SourceNotice {
    return this.transaction(() => {
      const notice = this.getNotice(id);
      if (!notice) throw new HttpError(404, 'Notice not found.');
      notice.status = status;
      this.db.prepare('UPDATE notices SET data=? WHERE id=?').run(JSON.stringify(notice), id);
      this.db.prepare('UPDATE agent_outbox SET state=? WHERE notice_id=? AND revision=?')
        .run(status === 'pending_agent' ? status : 'resolved', id, notice.revision);
      return notice;
    });
  }
  pendingAgentCount() {
    return Number(this.db.prepare("SELECT COUNT(*) AS n FROM agent_outbox WHERE state='pending_agent'").get()?.n ?? 0);
  }
  pendingAgentNotices(): SourceNotice[] {
    return this.db.prepare("SELECT n.data FROM agent_outbox o JOIN notices n ON n.id=o.notice_id WHERE o.state='pending_agent' ORDER BY o.created_at ASC LIMIT 100")
      .all().map(row => JSON.parse(String(row.data)) as SourceNotice);
  }
  addSourceRun(result: unknown) {
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO source_runs(id,data,created_at) VALUES(?,?,?)').run(randomUUID(), JSON.stringify(result), now);
    this.db.exec('DELETE FROM source_runs WHERE id NOT IN (SELECT id FROM source_runs ORDER BY created_at DESC LIMIT 100)');
  }
  addAlertOnce(id: string, alert: Omit<Alert, 'id'>) {
    if (!this.get<Alert>('alert', id)) this.put('alert', { ...alert, id });
  }
}
