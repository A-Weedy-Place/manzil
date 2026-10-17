import { createHash, randomUUID } from 'node:crypto';
import type { Firestore, DocumentReference, CollectionReference } from 'firebase-admin/firestore';
import type { Alert, Closure, ClosureInput, LocalProfile, SourceNotice, SourceStatus, Trip } from '../shared/types.js';
import { HttpError } from './errors.js';
import { closureSummary } from './community.js';
import { sameVehicle } from '../shared/fuel.js';
import { tripWithCurrentVehicle } from './fuel.js';
import { defaultProfile, defaultSourceStatus, type RecordKind, type PersonalRecordKind, type Repository, type RoutingSnapshot } from './repository.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const decode = <T>(data: FirebaseFirestore.DocumentData | undefined): T | undefined => data?.json ? JSON.parse(data.json) as T : undefined;
const pack = (value: unknown) => ({ json: JSON.stringify(value) });
const sharedMeta = (key: string) => /^(source|fuel:|demoScenario:|streetRouteDemo:|speech:|community:member:|eventRevision$)/.test(key);
interface SharedCache { snapshot?: RoutingSnapshot }

/** Durable repository used unchanged by emulators and Cloud Run. No local-file fallback. */
export class FirestoreStore implements Repository {
  readonly backend = 'firestore' as const;
  private root: DocumentReference;
  private lease = randomUUID();
  constructor(private db: Firestore, private uid: string | null = null, private cache: SharedCache = {}) { this.root = db.collection('manzil').doc('v1'); }
  forUser(uid: string | null) { return new FirestoreStore(this.db, uid, this.cache); }
  close() { /* SDK lifecycle is owned by bootstrap. */ }
  private user() { if (!this.uid) throw new HttpError(401, 'Sign in for personal features.'); return this.db.collection('users').doc(this.uid); }
  private records(kind: RecordKind): CollectionReference { return (kind === 'closure' ? this.root : this.user()).collection(kind); }
  private record(kind: RecordKind, id: string) { return this.records(kind).doc(hash(id)); }
  private metaRef(key: string) { return (sharedMeta(key) ? this.root : this.user()).collection('meta').doc(hash(key)); }
  async meta<T>(key: string): Promise<T | undefined> { return decode<T>((await this.metaRef(key).get()).data()); }
  async setMeta(key: string, value: unknown) { await this.metaRef(key).set(pack(value)); }
  async claimFuelCheck(day: string) {
    const ref = this.metaRef('fuel:checkedDay');
    return this.db.runTransaction(async tx => {
      if (decode<string>((await tx.get(ref)).data()) === day) return false;
      tx.set(ref, pack(day)); return true;
    });
  }
  async profile() {
    if (!this.uid) return defaultProfile();
    const profile = await this.meta<LocalProfile>('profile') ?? await this.updateProfile({});
    return { collectTravelData: false, travelDataChoiceMade: false, ...profile, theme: profile.theme ?? 'dark' as const, mapStyle: profile.mapStyle ?? 'night' as const };
  }
  async updateProfile(patch: Partial<Omit<LocalProfile, 'id' | 'createdAt' | 'updatedAt'>>) {
    const ref = this.metaRef('profile');
    return this.db.runTransaction(async tx => { const old = decode<LocalProfile>((await tx.get(ref)).data()) ?? defaultProfile(); const next = { collectTravelData: false, travelDataChoiceMade: false, ...old, ...patch, theme: patch.theme ?? old.theme ?? 'dark' as const, mapStyle: patch.mapStyle ?? old.mapStyle ?? 'night' as const, updatedAt: new Date().toISOString() }; if (patch.vehicle && !sameVehicle(old.vehicle, patch.vehicle)) next.vehicleUpdatedAt = next.updatedAt; if (!next.collectTravelData) next.inferFrequentRoutes = false; tx.set(ref, pack(next)); tx.set(this.user(), { active: true }, { merge: true }); return next; });
  }
  async list<T>(kind: RecordKind, limit = 500): Promise<T[]> {
    const snapshot = await this.records(kind).orderBy('updatedAt', 'desc').limit(limit).get();
    return snapshot.docs.map(doc => decode<T>(doc.data())!);
  }
  async listTripSummaries(limit = 50) { return this.list<Trip>('trip', limit); }
  async saveTripIfConsented(input: Trip) {
    const ref = this.record('trip', input.id), profileRef = this.metaRef('profile');
    await this.db.runTransaction(async tx => {
      const profile = decode<LocalProfile>((await tx.get(profileRef)).data());
      if (!profile?.collectTravelData) throw new HttpError(403, 'Allow travel data collection in Profile before saving a trip.');
      const priced = tripWithCurrentVehicle(input, profile);
      const trip = Date.parse(input.endedAt) < Date.now() - 30 * 86400_000 ? { ...priced, points: [] } : priced;
      tx.set(this.user(), { active: true }, { merge: true });
      for (let offset = 0; offset < trip.points.length; offset += 200) tx.set(ref.collection('points').doc(String(offset / 200)), { ...pack(trip.points.slice(offset, offset + 200)), index: offset / 200 });
      tx.set(ref, { ...pack({ ...trip, pointCount: trip.points.length, points: [] }), updatedAt: trip.createdAt, endedAt: trip.endedAt, hasPoints: !!trip.points.length });
    });
  }
  async get<T>(kind: RecordKind, id: string): Promise<T | undefined> {
    const ref = this.record(kind, id), value = decode<T>((await ref.get()).data());
    if (kind !== 'trip' || !value) return value;
    const chunks = await ref.collection('points').orderBy('index').get();
    return { ...value, points: chunks.docs.flatMap(doc => decode<Trip['points']>(doc.data()) ?? []) } as T;
  }
  async put<T extends { id: string }>(kind: PersonalRecordKind, value: T, now = new Date().toISOString()) {
    const ref = this.record(kind, value.id), batch = this.db.batch();
    batch.set(this.user(), { active: true }, { merge: true });
    if (kind === 'trip') {
      const input = value as unknown as Trip;
      const trip = Date.parse(input.endedAt) < Date.now() - 30 * 86400_000 ? { ...input, points: [] } : input;
      const previous = await ref.collection('points').get(), chunks = Math.ceil(trip.points.length / 200);
      previous.docs.filter(doc => doc.data().index >= chunks).forEach(doc => batch.delete(doc.ref));
      // Firestore rejects nested coordinate arrays and documents over 1 MiB. JSON envelopes
      // and bounded chunks preserve the API contract without one write per GPS sample.
      for (let offset = 0; offset < trip.points.length; offset += 200) batch.set(ref.collection('points').doc(String(offset / 200)), { ...pack(trip.points.slice(offset, offset + 200)), index: offset / 200 });
      batch.set(ref, { ...pack({ ...trip, pointCount: trip.points.length, points: [] }), updatedAt: now, endedAt: trip.endedAt, hasPoints: !!trip.points.length });
    } else batch.set(ref, { ...pack(value), updatedAt: now });
    await batch.commit();
  }
  async delete(kind: PersonalRecordKind, id: string) {
    const ref = this.record(kind, id), batch = this.db.batch();
    if (kind === 'trip') (await ref.collection('points').get()).docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(ref); await batch.commit();
  }
  async recentInferenceTrips(now: number): Promise<Trip[]> {
    const docs = await this.records('trip').where('endedAt', '>=', new Date(now - 30 * 86400_000).toISOString()).where('endedAt', '<=', new Date(now).toISOString()).orderBy('endedAt', 'desc').limit(200).get();
    const trips: Trip[] = [];
    for (const doc of docs.docs) { const trip = decode<Trip>(doc.data())!; if ((trip.pointCount ?? 0) >= 8) trips.push((await this.get<Trip>('trip', trip.id))!); }
    return trips;
  }
  async retainTrips(now: number) {
    // Drain matching pages, not merely the first display page. Summaries with no
    // points cannot starve older raw traces out of the retention query.
    for (const raw of [false, true]) {
      let query = this.records('trip').where('endedAt', '<', new Date(now - (raw ? 30 : 90) * 86400_000).toISOString());
      if (raw) query = query.where('hasPoints', '==', true);
      while (true) {
        const docs = await query.limit(200).get();
        for (const doc of docs.docs) {
          const trip = decode<Trip>(doc.data())!;
          if (raw) await this.put('trip', { ...trip, points: [], pointCount: 0 });
          else await this.delete('trip', trip.id);
        }
        if (docs.size < 200) break;
      }
    }
  }
  async routingSnapshot(includeUnpublished = false): Promise<RoutingSnapshot> {
    const result = await this.db.runTransaction(async tx => {
      const revision = decode<number>((await tx.get(this.metaRef('eventRevision'))).data()) ?? 0;
      if (!includeUnpublished && this.cache.snapshot?.revision === revision) return this.cache.snapshot;
      const docs = await tx.get(includeUnpublished ? this.records('closure').orderBy('updatedAt', 'desc') : this.records('closure').where('status', '==', 'published'));
      return { revision, closures: docs.docs.map(doc => decode<Closure>(doc.data())!).filter(closure => includeUnpublished || !closure.moderation || closure.moderation === 'approved').map(closureSummary) };
    });
    if (!includeUnpublished && (!this.cache.snapshot || result.revision >= this.cache.snapshot.revision)) this.cache.snapshot = result;
    return structuredClone(result);
  }
  async saveClosure(draft: ClosureInput, id?: string, expectedRevision?: number): Promise<Closure> {
    const updating = id !== undefined; id ??= randomUUID();
    const ref = this.record('closure', id), revisionRef = this.metaRef('eventRevision');
    const closure = await this.db.runTransaction(async tx => {
      const [oldDoc, revisionDoc] = await tx.getAll(ref, revisionRef), previous = decode<Closure>(oldDoc.data());
      if (updating && !previous) throw new HttpError(404, 'Closure not found.');
      if (previous && previous.revision !== expectedRevision) throw new HttpError(409, 'Closure changed. Reload before saving.');
      const now = new Date().toISOString(), next = { ...draft, id, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
      tx.set(ref, { ...pack(next), status: next.status, updatedAt: now });
      tx.set(revisionRef, pack((decode<number>(revisionDoc.data()) ?? 0) + 1)); return next;
    });
    this.cache.snapshot = undefined; return closure;
  }
  async sourceStatus() { return await this.meta<SourceStatus>('sourceStatus') ?? defaultSourceStatus(process.env.X_SCRAPER_ENABLED === 'true'); }
  async updateSourceStatus(patch: Partial<SourceStatus>) {
    const ref = this.metaRef('sourceStatus');
    return this.db.runTransaction(async tx => { const old = decode<SourceStatus>((await tx.get(ref)).data()) ?? defaultSourceStatus(process.env.X_SCRAPER_ENABLED === 'true'); const next = { ...old, ...patch, profileUrl: old.profileUrl, coverage: 'partial' as const }; tx.set(ref, pack(next)); return next; });
  }
  async acquireSourceLease(now: number) {
    const ref = this.metaRef('sourceLeaseUntil');
    return this.db.runTransaction(async tx => { const old = (await tx.get(ref)).data(); if ((old?.until ?? 0) > now) return false; tx.set(ref, { until: now + 70_000, owner: this.lease, ...pack(now + 70_000) }); return true; });
  }
  async releaseSourceLease() {
    const ref = this.metaRef('sourceLeaseUntil');
    await this.db.runTransaction(async tx => { if ((await tx.get(ref)).data()?.owner === this.lease) tx.delete(ref); });
  }
  async listNotices(limit = 150) { return (await this.root.collection('notices').orderBy('receivedAt', 'desc').limit(limit).get()).docs.map(doc => decode<SourceNotice>(doc.data())!); }
  private noticeRef(id: string) { return this.root.collection('notices').doc(id); }
  async getNotice(id: string) { return decode<SourceNotice>((await this.noticeRef(id).get()).data()); }
  async upsertNotice(input: Omit<SourceNotice, 'id' | 'revision' | 'receivedAt' | 'status'>) {
    const ref = this.noticeRef(hash(`${input.source}:${input.sourceId}`));
    return this.db.runTransaction(async tx => {
      const old = decode<SourceNotice>((await tx.get(ref)).data());
      if (old?.contentHash === input.contentHash) return { notice: old, changed: false };
      const statusRef = this.metaRef('sourceStatus');
      const status = input.source === 'x' && !old ? decode<SourceStatus>((await tx.get(statusRef)).data()) ?? defaultSourceStatus(process.env.X_SCRAPER_ENABLED === 'true') : null;
      const notice: SourceNotice = { ...input, id: ref.id, revision: (old?.revision ?? 0) + 1, receivedAt: new Date().toISOString(), status: 'pending_agent' };
      tx.set(ref, { ...pack(notice), status: notice.status, receivedAt: notice.receivedAt });
      tx.set(ref.collection('versions').doc(String(notice.revision)), pack(notice));
      if (status) tx.set(statusRef, pack({ ...status, noticesCollected: status.noticesCollected + 1 }));
      // Current revision/status is the durable outbox; historical revisions cannot
      // remain independently pending after an edit.
      return { notice, changed: true };
    });
  }
  async setNoticeStatus(id: string, status: SourceNotice['status']) {
    const ref = this.noticeRef(id);
    return this.db.runTransaction(async tx => { const previous = decode<SourceNotice>((await tx.get(ref)).data()); if (!previous) throw new HttpError(404, 'Notice not found.'); const next = { ...previous, status }; tx.set(ref, { ...pack(next), status, receivedAt: next.receivedAt }); return next; });
  }
  async pendingAgentNotices() { return (await this.root.collection('notices').where('status', '==', 'pending_agent').limit(100).get()).docs.map(doc => decode<SourceNotice>(doc.data())!); }
  async pendingAgentCount() { return (await this.root.collection('notices').where('status', '==', 'pending_agent').count().get()).data().count; }
  async addSourceRun(result: unknown) {
    await this.root.collection('sourceRuns').add({ ...pack(result), createdAt: new Date().toISOString() });
    const old = await this.root.collection('sourceRuns').orderBy('createdAt', 'desc').offset(100).limit(100).get();
    if (old.size) { const batch = this.db.batch(); old.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); }
  }
  async addAlertOnce(id: string, alert: Omit<Alert, 'id'>) {
    const ref = this.record('alert', id);
    await this.db.runTransaction(async tx => {
      const previous = await tx.get(ref);
      if (alert.frequentRouteId) {
        const profile = decode<LocalProfile>((await tx.get(this.metaRef('profile'))).data());
        if (!profile?.collectTravelData || !profile.inferFrequentRoutes) throw new HttpError(409, 'Usual-journey notifications are disabled.');
      }
      if (!previous.exists) tx.set(ref, { ...pack({ ...alert, id }), updatedAt: alert.createdAt });
    });
  }
  async speechUsage(month: string) { return await this.meta<number>(`speech:${month}`) ?? 0; }
  async reserveSpeech(month: string, characters: number, limit: number) {
    const ref = this.metaRef(`speech:${month}`);
    await this.db.runTransaction(async tx => { const used = decode<number>((await tx.get(ref)).data()) ?? 0; if (used + characters > limit) throw new HttpError(429, 'The configured monthly voice allowance has been reached.'); tx.set(ref, pack(used + characters)); });
  }
  async cachedSpeech(key: string) { const value = (await this.root.collection('speech').doc(key).get()).data(); return value?.audio ? Buffer.from(value.audio) : undefined; }
  async cacheSpeech(key: string, audio: Buffer) {
    // Keep one document comfortably below Firestore's document limit.
    if (audio.length > 800_000) return;
    await this.root.collection('speech').doc(key).set({ audio, createdAt: Date.now() });
    const old = await this.root.collection('speech').orderBy('createdAt', 'desc').offset(256).limit(100).get();
    if (old.size) { const batch = this.db.batch(); old.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); }
  }
}
