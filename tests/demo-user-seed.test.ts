import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_ACCOUNT, legacySampleAccountData, sampleAccountConfig, sampleAccountData, seedSampleAccount } from '../scripts/lib/demo-user';
import { travelStatistics } from '../server/fuel';
import { Store } from '../server/store';
import { profilePatchSchema, tripSchema } from '../server/validation';
import { summarizeTrace } from '../server/geometry';

const checkedAt = Date.parse('2026-10-17T07:00:00Z');
const DAY = 86400_000;
const env = { MANZIL_MODE: 'emulator', FIREBASE_PROJECT_ID: 'demo-manzil',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function services() {
  const users = new Map<string, { uid: string; email: string; displayName?: string; customClaims?: { admin?: boolean } }>();
  const documents = new Map<string, unknown>();
  function collection(path: string) {
    return { doc: (id: string) => ({ path: `${path}/${id}`, collection: (name: string) => collection(`${path}/${id}/${name}`) }) };
  }
  const auth = {
    getUser: vi.fn(async (uid: string) => { const user = users.get(uid); if (!user) throw { code: 'auth/user-not-found' }; return user; }),
    createUser: vi.fn(async (value: typeof SAMPLE_ACCOUNT) => { users.set(value.uid, value); return value; }),
  };
  const db = { collection, runTransaction: vi.fn(async (run: (transaction: unknown) => unknown) => {
    const writes: [string, unknown][] = [];
    const transaction = {
      getAll: async (...refs: { path: string }[]) => refs.map(ref => ({ exists: documents.has(ref.path), data: () => documents.get(ref.path) })),
      create: (ref: { path: string }, value: unknown) => { if (documents.has(ref.path)) throw new Error('Already exists'); writes.push([ref.path, value]); },
      set: (ref: { path: string }, value: unknown) => { writes.push([ref.path, value]); },
    };
    const result = await run(transaction); for (const [path, value] of writes) documents.set(path, value); return result;
  }) };
  const factory = vi.fn(() => ({ auth, db }) as unknown as Parameters<typeof seedSampleAccount>[1] extends ((project: string) => infer T) | undefined ? T : never);
  return { users, documents, auth, db, factory };
}
function seedV1(fixture: ReturnType<typeof services>, now = checkedAt) {
  const data = legacySampleAccountData(now), user = 'users/dev-user-123';
  fixture.users.set(SAMPLE_ACCOUNT.uid, SAMPLE_ACCOUNT);
  fixture.documents.set(user, { active: true });
  fixture.documents.set(`${user}/meta/${hash('profile')}`, { json: JSON.stringify(data.profile) });
  fixture.documents.set(`${user}/meta/${hash('demo:sample-user:v1')}`, { json: JSON.stringify({ version: 1, createdAt: new Date(now).toISOString(), synthetic: true }) });
  for (const trip of data.trips) fixture.documents.set(`${user}/trip/${hash(trip.id)}`, { json: JSON.stringify(trip), updatedAt: trip.createdAt, endedAt: trip.endedAt, hasPoints: false });
  return data;
}

describe('explicit localhost sample account', () => {
  it('rejects production, missing/alternate hosts, projects and standalone mode before initializing any service', async () => {
    const fixture = services();
    for (const override of [ { MANZIL_MODE: 'local' }, { MANZIL_MODE: 'production' }, { FIREBASE_PROJECT_ID: 'manzil-app-v1' },
      { FIREBASE_PROJECT_ID: 'demo-manzil-test' }, { FIREBASE_AUTH_EMULATOR_HOST: 'evil.example:9099' },
      { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' }, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180' },
      { FIRESTORE_EMULATOR_HOST: '' }, { K_SERVICE: 'cloud-run-service' } ]) {
      await expect(seedSampleAccount({ ...env, ...override }, fixture.factory, checkedAt)).rejects.toThrow();
    }
    expect(fixture.factory).not.toHaveBeenCalled();
    expect(sampleAccountConfig(env)).toMatchObject({ mode: 'emulator', projectId: 'demo-manzil' });
    expect(sampleAccountConfig({ ...env, FIRESTORE_EMULATOR_HOST: 'localhost:8080' }).projectId).toBe('demo-manzil');
  });
  it('creates only the fixed ordinary UID with the requested password and explicit sample metadata', async () => {
    const fixture = services();
    expect(await seedSampleAccount(env, fixture.factory, checkedAt)).toMatchObject({ result: 'created', uid: 'dev-user-123', tripCount: 12 });
    expect(fixture.auth.createUser).toHaveBeenCalledWith({ uid: 'dev-user-123', email: 'user123@manzil.test', displayName: 'User 123', password: 'User 123' });
    const profilePath = `users/dev-user-123/meta/${hash('profile')}`;
    expect(JSON.parse((fixture.documents.get(profilePath) as { json: string }).json)).toMatchObject({ demoData: true,
      collectTravelData: false, inferFrequentRoutes: false, browserNotifications: false, travelDataChoiceMade: true, theme: 'dark', mapStyle: 'outdoors' });
    expect([...fixture.documents.keys()].every(path => path === 'users/dev-user-123' || path.startsWith('users/dev-user-123/'))).toBe(true);
    expect([...fixture.documents.keys()].some(path => /points/.test(path))).toBe(true);
    expect([...fixture.documents.keys()].some(path => /closure|fuel:status/.test(path))).toBe(false);
    const tripPath = `users/dev-user-123/trip/${hash('demo-user-123-trip-1')}`;
    const summary = JSON.parse((fixture.documents.get(tripPath) as { json: string }).json);
    expect(summary.points).toEqual([]); expect(summary.pointCount).toBeGreaterThan(8);
    const chunks = [...fixture.documents].filter(([path]) => path.startsWith(`${tripPath}/points/`)).map(([, value]) => value as { index: number; json: string }).sort((a, b) => a.index - b.index);
    expect(chunks.flatMap(chunk => JSON.parse(chunk.json))).toHaveLength(summary.pointCount);
  });
  it('preserves modified profiles, consent, deleted sample trips and other users when restarted', async () => {
    const fixture = services(); await seedSampleAccount(env, fixture.factory, checkedAt);
    const profilePath = `users/dev-user-123/meta/${hash('profile')}`, tripPath = `users/dev-user-123/trip/${hash('demo-user-123-trip-1')}`;
    fixture.documents.set(profilePath, { json: JSON.stringify({ displayName: 'Edited name', collectTravelData: true }) });
    fixture.documents.delete(tripPath); fixture.documents.set('users/someone-else/meta/profile', { untouched: true });
    const before = structuredClone([...fixture.documents]);
    expect((await seedSampleAccount(env, fixture.factory, checkedAt + 86400_000)).result).toBe('already-seeded');
    expect([...fixture.documents]).toEqual(before); expect(fixture.auth.createUser).toHaveBeenCalledTimes(1);
  });
  it('does not replace an existing ordinary account profile that has never been sample-seeded', async () => {
    const fixture = services(); fixture.users.set(SAMPLE_ACCOUNT.uid, { uid: SAMPLE_ACCOUNT.uid, email: SAMPLE_ACCOUNT.email, displayName: 'Keep this name' });
    fixture.documents.set(`users/dev-user-123/meta/${hash('profile')}`, { json: '{"displayName":"Existing profile"}' });
    const before = structuredClone([...fixture.documents]);
    expect((await seedSampleAccount(env, fixture.factory, checkedAt)).result).toBe('preserved-existing-user');
    expect([...fixture.documents]).toEqual(before); expect(fixture.auth.createUser).not.toHaveBeenCalled();
  });
  it('refuses a UID belonging to a different or privileged account without modifying it', async () => {
    for (const user of [{ uid: SAMPLE_ACCOUNT.uid, email: 'other@manzil.test' },
      { uid: SAMPLE_ACCOUNT.uid, email: SAMPLE_ACCOUNT.email, customClaims: { admin: true } }]) {
      const fixture = services(); fixture.users.set(SAMPLE_ACCOUNT.uid, user);
      await expect(seedSampleAccount(env, fixture.factory, checkedAt)).rejects.toThrow('left unchanged');
      expect(fixture.db.runTransaction).not.toHaveBeenCalled(); expect(fixture.auth.createUser).not.toHaveBeenCalled();
    }
  });
  it('generates internally consistent simulated public-road traces without capturing GPS or claiming real prices', () => {
    const fixture = sampleAccountData(checkedAt);
    expect(fixture.trips).toHaveLength(12);
    for (const trip of fixture.trips) {
      expect(trip).toMatchObject({ demoData: true, contributeToRoadDiscovery: false, gaps: 0 });
      expect(trip.pointCount).toBe(trip.points.length); expect(trip.points.length).toBeGreaterThan(8);
      expect(trip.name.startsWith('Demo · ')).toBe(false);
      expect(trip.points[0].timestamp).toBe(trip.startedAt); expect(trip.points.at(-1)!.timestamp).toBe(trip.endedAt);
      expect(summarizeTrace(trip.points)).toEqual({ distanceMeters: trip.distanceMeters, gaps: 0 });
      expect((Date.parse(trip.endedAt) - Date.parse(trip.startedAt)) / 1000).toBe(trip.durationSeconds);
      expect(trip.points.every(point => point.coordinate[0] > 72 && point.coordinate[0] < 74 && point.coordinate[1] > 33 && point.coordinate[1] < 34)).toBe(true);
      expect(Date.parse(trip.startedAt)).toBeGreaterThanOrEqual(Date.parse('2026-09-30T19:00:00Z'));
      expect(Date.parse(trip.endedAt)).toBeLessThanOrEqual(checkedAt);
      expect(trip.fuelEstimate?.rates[0].sourceUrl).toBe('https://example.invalid/manzil-demo-fuel');
      expect(trip.fuelEstimate?.rates[0].pricePerLitre).toBe(280);
      expect(trip.fuelEstimate?.costPkr).toBeCloseTo(trip.distanceMeters / 1000 / 14.5 * 280);
    }
    expect(fixture.commutes.every(commute => !commute.enabled && commute.name.startsWith('Demo · '))).toBe(true);
    expect(sampleAccountData(Date.parse('2026-11-01T19:01:00Z')).trips.every(trip => Date.parse(trip.endedAt) <= Date.parse('2026-11-01T19:01:00Z'))).toBe(true);
    expect(sampleAccountData(checkedAt).trips).toEqual(fixture.trips);
  });
  it('produces consistent monthly aggregate math while normal trip consent stays denied', async () => {
    const fixture = sampleAccountData(checkedAt), store = new Store(':memory:');
    try {
      store.setMeta('profile', fixture.profile); for (const trip of fixture.trips) store.put('trip', trip);
      const statistics = await travelStatistics(store, checkedAt);
      expect(statistics.month).toMatchObject({ period: 'month', tripCount: 12, pricedTripCount: 12, unpricedTripCount: 0, complete: true });
      expect(statistics.month.distanceMeters).toBe(fixture.trips.reduce((total, trip) => total + trip.distanceMeters, 0));
      expect(statistics.month.costPkr).toBeCloseTo(statistics.month.distanceMeters / 1000 / 14.5 * 280);
      expect(() => store.saveTripIfConsented({ ...fixture.trips[0], id: 'new-real-trip' })).toThrow('Allow travel data');
      expect(profilePatchSchema.safeParse({ demoData: true }).success).toBe(false);
      expect(tripSchema.safeParse({ ...fixture.trips[0], demoData: true }).success).toBe(false);
    } finally { store.close(); }
  });
  it('keeps an early-month abbreviated trace plausible, within month and without a future sample', () => {
    const now = Date.parse('2026-10-31T19:02:00Z'), data = sampleAccountData(now);
    expect(data.trips).toHaveLength(1);
    const trip = data.trips[0];
    expect(trip.name).toBe('F-8 local journey'); expect(trip.durationSeconds).toBe(120);
    expect(Date.parse(trip.startedAt)).toBe(Date.parse('2026-10-31T19:00:00Z'));
    expect(Date.parse(trip.endedAt)).toBe(now); expect(trip.distanceMeters).toBeLessThanOrEqual(1801);
    expect(summarizeTrace(trip.points)).toEqual({ distanceMeters: trip.distanceMeters, gaps: 0 });
  });
  it('upgrades only untouched v1 summary rows and never changes profile edits, consent, deletions or other users', async () => {
    const fixture = services(), old = seedV1(fixture);
    const profilePath = `users/dev-user-123/meta/${hash('profile')}`, deleted = `users/dev-user-123/trip/${hash(old.trips[0].id)}`;
    const edited = `users/dev-user-123/trip/${hash(old.trips[1].id)}`, traceEdited = `users/dev-user-123/trip/${hash(old.trips[2].id)}`;
    const changedProfile = { ...old.profile, displayName: 'User one', city: 'Karachi', photoDataUrl: 'data:image/png;base64,AA==', collectTravelData: true, inferFrequentRoutes: true, theme: 'light', vehicle: { ...old.profile.vehicle, label: 'My new vehicle' } };
    fixture.documents.set(profilePath, { json: JSON.stringify(changedProfile) }); fixture.documents.delete(deleted);
    const changedTrip = { ...old.trips[1], name: 'Renamed by owner' };
    fixture.documents.set(edited, { ...(fixture.documents.get(edited) as object), json: JSON.stringify(changedTrip) });
    fixture.documents.set(`${traceEdited}/points/0`, { json: '[]', index: 0 });
    fixture.documents.set('users/another-user/trip/private', { keep: true });
    expect(await seedSampleAccount(env, fixture.factory, checkedAt + DAY)).toMatchObject({ result: 'upgraded-traces', tripCount: 9 });
    expect(JSON.parse((fixture.documents.get(profilePath) as { json: string }).json)).toEqual(changedProfile);
    expect(fixture.documents.has(deleted)).toBe(false);
    expect(JSON.parse((fixture.documents.get(edited) as { json: string }).json)).toEqual(changedTrip);
    expect(fixture.documents.get(`${traceEdited}/points/0`)).toEqual({ json: '[]', index: 0 });
    expect(fixture.documents.get('users/another-user/trip/private')).toEqual({ keep: true });
    const untouched = `users/dev-user-123/trip/${hash(old.trips[3].id)}`;
    expect(JSON.parse((fixture.documents.get(untouched) as { json: string }).json)).toMatchObject({ demoData: true, points: [] });
    expect((fixture.documents.get(untouched) as { hasPoints: boolean }).hasPoints).toBe(true);
    fixture.documents.delete(untouched);
    const before = structuredClone([...fixture.documents]);
    expect((await seedSampleAccount(env, fixture.factory, checkedAt + 2 * DAY)).result).toBe('already-seeded');
    expect([...fixture.documents]).toEqual(before); expect(fixture.auth.createUser).not.toHaveBeenCalled();
  });
  it('does not restore traces outside raw retention or reseed a later month', async () => {
    const fixture = services(), original = seedV1(fixture);
    expect(await seedSampleAccount(env, fixture.factory, checkedAt + 45 * DAY)).toMatchObject({ result: 'upgraded-traces', tripCount: 0 });
    expect([...fixture.documents.keys()].some(path => /\/points\//.test(path))).toBe(false);
    expect([...fixture.documents.values()].filter(value => (value as { hasPoints?: boolean }).hasPoints === false)).toHaveLength(original.trips.length);
  });
  it('safely marks an empty early-month v1 fixture without an invalid empty getAll call', async () => {
    const fixture = services(), at = Date.parse('2026-10-31T19:01:00Z');
    expect(seedV1(fixture, at).trips).toHaveLength(0);
    const original = fixture.db.runTransaction.getMockImplementation()!;
    fixture.db.runTransaction.mockImplementation(async run => original(async value => {
      const transaction = value as { getAll: (...refs: unknown[]) => Promise<unknown[]> };
      const getAll = transaction.getAll;
      transaction.getAll = (...refs: unknown[]) => { if (!refs.length) throw new Error('getAll requires a reference'); return getAll(...refs); };
      return run(transaction);
    }));
    expect(await seedSampleAccount(env, fixture.factory, at + 86400_000)).toMatchObject({ result: 'upgraded-traces', tripCount: 0 });
    expect([...fixture.documents.keys()].some(path => path.includes('/trip/'))).toBe(false);
    expect((await seedSampleAccount(env, fixture.factory, at + 2 * 86400_000)).result).toBe('already-seeded');
  });
});
