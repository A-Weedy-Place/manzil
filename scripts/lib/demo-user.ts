import { createHash } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { readConfig } from '../../server/config.js';
import { firebaseServices } from '../../server/firebase.js';
import { defaultProfile } from '../../server/repository.js';
import { estimateRouteFuel } from '../../shared/fuel.js';
import type { Alert, Commute, FuelPriceRecord, LocalProfile, Trip, VehicleProfile } from '../../shared/types.js';
import { simulatedSampleTrack } from './sample-track.js';

/** Public fictional credentials, available only in the guarded localhost emulator. */
export const SAMPLE_ACCOUNT = { uid: 'dev-user-123', email: 'user123@manzil.test', password: 'User 123', displayName: 'User 123' } as const;
const PKT = 5 * 3600_000, DAY = 86400_000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const pack = (value: unknown) => ({ json: JSON.stringify(value) });
type SeedServices = { auth: Pick<Auth, 'getUser' | 'createUser'>; db: Pick<Firestore, 'collection' | 'runTransaction'> };

/** Refuse any cloud, alternate project or alternate-port destination before opening the SDK. */
export function sampleAccountConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = readConfig(env);
  if (config.mode !== 'emulator' || config.projectId !== 'demo-manzil'
    || !/^(127\.0\.0\.1|localhost):9099$/.test(env.FIREBASE_AUTH_EMULATOR_HOST ?? '')
    || !/^(127\.0\.0\.1|localhost):8080$/.test(env.FIRESTORE_EMULATOR_HOST ?? ''))
    throw new Error('Sample data requires demo-manzil with loopback Auth 9099 and Firestore 8080. Cloud seeding is forbidden.');
  return config;
}

/** Exact v1 payload retained only to recognize untouched, previously seeded rows. */
export function legacySampleAccountData(now = Date.now()) {
  if (!Number.isFinite(now)) throw new Error('Provide a valid sample-data timestamp.');
  const today = new Date(now + PKT), year = today.getUTCFullYear(), month = today.getUTCMonth();
  const monthStart = Date.UTC(year, month, 1) - PKT, stamped = new Date(now).toISOString();
  const vehicle: VehicleProfile = { kind: 'car', label: 'Toyota Corolla', fuelType: 'petrol', kmPerLitre: 14.5 };
  const profile: LocalProfile = { ...defaultProfile(), displayName: SAMPLE_ACCOUNT.displayName, city: 'Islamabad', location: 'F-8',
    theme: 'light', mapStyle: 'outdoors', collectTravelData: false, travelDataChoiceMade: true,
    inferFrequentRoutes: false, browserNotifications: false, demoData: true, vehicle,
    vehicleUpdatedAt: new Date(monthStart).toISOString(), createdAt: stamped, updatedAt: stamped };
  const reference: FuelPriceRecord = { effectiveFrom: new Date(monthStart).toISOString(), petrolPerLitre: 280,
    dieselPerLitre: 290, retrievedAt: stamped, sourceName: 'Demo fuel reference — fictional prices',
    sourceUrl: 'https://example.invalid/manzil-demo-fuel' };
  const starts: number[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const day = Date.UTC(year, month, today.getUTCDate()) - PKT - offset * DAY;
    for (const hour of [8, 17]) {
      const start = day + hour * 3600_000 + 20 * 60_000;
      if (start >= monthStart && start + 32 * 60_000 <= now) starts.push(start);
    }
  }
  // Keep the fresh-month preview useful without adding a future trip.
  if (!starts.length && now - monthStart >= 120_000) starts.push(now - 120_000);
  const trips: Trip[] = starts.slice(-12).map((startedAt, index) => {
    const distanceMeters = [11800,12400,12000,11600,13200,12100,8500,9200,14700,11900,12800,12300][index];
    const durationSeconds = Math.min(32 * 60, Math.floor((now - startedAt) / 1000), [1440,1680,1320,1500,1800,1560,1080,1200,1860,1380,1620,1500][index]);
    const start = new Date(startedAt).toISOString(), end = new Date(startedAt + durationSeconds * 1000).toISOString();
    return { id: `demo-user-123-trip-${index + 1}`, name: `Demo · ${index % 2 ? 'Blue Area → F-8' : 'F-8 → Blue Area'}`,
      startedAt: start, endedAt: end, points: [], pointCount: 0, contributeToRoadDiscovery: false,
      distanceMeters, durationSeconds, gaps: 0, createdAt: end, demoData: true,
      fuelEstimate: estimateRouteFuel(distanceMeters, start, vehicle, [reference], stamped)! };
  });
  const origin = { name: 'Demo · F-8 home area', coordinate: [73.0255,33.7088] as [number, number] };
  const destination = { name: 'Demo · Blue Area office', coordinate: [73.0678,33.7204] as [number, number] };
  const commutes: Commute[] = [{ id: 'demo-user-123-office', name: 'Demo · Office commute', origin, destination,
    departureTime: '08:20', days: [1,2,3,4,5], enabled: false, createdAt: stamped, updatedAt: stamped },
  { id: 'demo-user-123-home', name: 'Demo · Journey home', origin: destination, destination: origin,
    departureTime: '17:20', days: [1,2,3,4,5], enabled: false, createdAt: stamped, updatedAt: stamped }];
  const alerts: Alert[] = [{ id: 'demo-user-123-alert', title: 'Demo · Journey preview',
    message: 'Sample notification: this is how a saved-journey update will appear. No road closure has been reported.',
    createdAt: stamped, read: false }];
  return { profile, trips, commutes, alerts };
}

/** Local fictional preview: public OSM routes simulated at runtime, never captured GPS. */
export function sampleAccountData(now = Date.now()) {
  const data = legacySampleAccountData(now);
  const trips = data.trips.map((trip, index): Trip => {
    const track = simulatedSampleTrack(index, Date.parse(trip.startedAt), trip.durationSeconds);
    const rate = trip.fuelEstimate!.rates[0];
    const reference: FuelPriceRecord = { effectiveFrom: rate.effectiveFrom, petrolPerLitre: rate.pricePerLitre,
      dieselPerLitre: 290, retrievedAt: new Date(now).toISOString(), sourceName: 'Simulated historical price — fictional', sourceUrl: rate.sourceUrl };
    return { ...trip, ...track, fuelEstimate: estimateRouteFuel(track.distanceMeters, trip.startedAt, data.profile.vehicle, [reference], new Date(now).toISOString())! };
  });
  return { ...data, profile: { ...data.profile, theme: 'dark' as const, mapStyle: 'night' as const }, trips };
}

/** Seed one untouched UID or upgrade exact v1 trip rows once; preserve edits and consent. */
export async function seedSampleAccount(env: NodeJS.ProcessEnv = process.env,
  servicesFactory: (projectId: string) => SeedServices = firebaseServices, now = Date.now()) {
  const config = sampleAccountConfig(env), data = sampleAccountData(now);
  // Firebase transports read process.env themselves. An alternate config object
  // must never validate a safe address while the real SDK targets a cloud host.
  if (servicesFactory === firebaseServices && env !== process.env) sampleAccountConfig(process.env);
  const { auth, db } = servicesFactory(config.projectId);
  let account;
  try { account = await auth.getUser(SAMPLE_ACCOUNT.uid); }
  catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    try { account = await auth.createUser(SAMPLE_ACCOUNT); }
    catch (creationError) {
      if ((creationError as { code?: string }).code !== 'auth/uid-already-exists') throw creationError;
      account = await auth.getUser(SAMPLE_ACCOUNT.uid);
    }
  }
  if (account.email !== SAMPLE_ACCOUNT.email || account.customClaims?.admin === true)
    throw new Error('The sample UID belongs to a different or privileged account; it was left unchanged.');
  const user = db.collection('users').doc(SAMPLE_ACCOUNT.uid);
  const marker = user.collection('meta').doc(hash('demo:sample-user:v1'));
  const traceMarker = user.collection('meta').doc(hash('demo:sample-user:v2-traces'));
  const profile = user.collection('meta').doc(hash('profile'));
  const tripRecords = (trips: Trip[]) => trips.map(value => {
    const ref = user.collection('trip').doc(hash(value.id));
    return { ref, value, payload: { ...pack({ ...value, points: [] }), updatedAt: value.createdAt, endedAt: value.endedAt, hasPoints: !!value.points.length },
      chunks: Array.from({ length: Math.ceil(value.points.length / 200) }, (_, index) => ({
        ref: ref.collection('points').doc(String(index)), payload: { ...pack(value.points.slice(index * 200, (index + 1) * 200)), index },
      })) };
  });
  const trips = tripRecords(data.trips);
  const records = [
    ...trips,
    ...trips.flatMap(record => record.chunks),
    ...data.commutes.map(value => ({ ref: user.collection('commute').doc(hash(value.id)), payload: { ...pack(value), updatedAt: value.updatedAt } })),
    ...data.alerts.map(value => ({ ref: user.collection('alert').doc(hash(value.id)), payload: { ...pack(value), updatedAt: value.createdAt } })),
  ];
  const result = await db.runTransaction(async transaction => {
    const existing = await transaction.getAll(user, marker, profile, traceMarker, ...records.map(record => record.ref));
    if (existing[3].exists) return { result: 'already-seeded' as const };
    if (existing[1].exists) {
      const oldMarker = JSON.parse(existing[1].data()?.json ?? 'null') as { version?: number; synthetic?: boolean; createdAt?: string } | null;
      if (oldMarker?.version !== 1 || oldMarker.synthetic !== true || !Number.isFinite(Date.parse(oldMarker.createdAt ?? '')))
        return { result: 'preserved-existing-user' as const };
      const seededAt = Date.parse(oldMarker.createdAt!);
      const original = legacySampleAccountData(seededAt), replacement = tripRecords(sampleAccountData(seededAt).trips);
      const refs = replacement.flatMap(record => [record.ref, ...record.chunks.map(chunk => chunk.ref)]);
      const snapshots = refs.length ? await transaction.getAll(...refs) : [];
      let offset = 0, count = 0;
      for (const [index, record] of replacement.entries()) {
        const document = snapshots[offset++], chunks = snapshots.slice(offset, offset + record.chunks.length); offset += record.chunks.length;
        const payload = document.data();
        // Do not recreate deletions, rename edits, retained traces or any changed row.
        // A version marker makes even skipped/deleted rows permanently one-shot.
        if (!document.exists || payload?.json !== pack(original.trips[index]).json || payload.updatedAt !== original.trips[index].createdAt
          || payload.hasPoints !== false || chunks.some(chunk => chunk.exists) || Date.parse(record.value.endedAt) < now - 30 * DAY) continue;
        transaction.set(record.ref, record.payload);
        for (const chunk of record.chunks) transaction.create(chunk.ref, chunk.payload);
        count++;
      }
      transaction.create(traceMarker, pack({ version: 2, createdAt: new Date(now).toISOString(), synthetic: true, upgradedTrips: count }));
      return { result: 'upgraded-traces' as const, tripCount: count };
    }
    if (existing.some(snapshot => snapshot.exists)) return { result: 'preserved-existing-user' as const };
    transaction.create(user, { active: true });
    transaction.create(profile, pack(data.profile));
    for (const record of records) transaction.create(record.ref, record.payload);
    transaction.create(marker, pack({ version: 1, createdAt: new Date(now).toISOString(), synthetic: true }));
    transaction.create(traceMarker, pack({ version: 2, createdAt: new Date(now).toISOString(), synthetic: true }));
    return { result: 'created' as const, tripCount: data.trips.length };
  });
  return { ...result, uid: SAMPLE_ACCOUNT.uid, email: SAMPLE_ACCOUNT.email };
}
