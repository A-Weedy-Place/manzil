import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_ACCOUNT, sampleAccountConfig, sampleAccountData, seedSampleAccount } from '../scripts/lib/demo-user';
import { travelStatistics } from '../server/fuel';
import { Store } from '../server/store';
import { profilePatchSchema, tripSchema } from '../server/validation';

const checkedAt = Date.parse('2026-10-17T07:00:00Z');
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
    };
    const result = await run(transaction); for (const [path, value] of writes) documents.set(path, value); return result;
  }) };
  const factory = vi.fn(() => ({ auth, db }) as unknown as Parameters<typeof seedSampleAccount>[1] extends ((project: string) => infer T) | undefined ? T : never);
  return { users, documents, auth, db, factory };
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
      collectTravelData: false, inferFrequentRoutes: false, browserNotifications: false, travelDataChoiceMade: true });
    expect([...fixture.documents.keys()].every(path => path === 'users/dev-user-123' || path.startsWith('users/dev-user-123/'))).toBe(true);
    expect([...fixture.documents.keys()].some(path => /points|closure|fuel:status/.test(path))).toBe(false);
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
  it('retains no raw GPS, real source claims or future/out-of-month trip summaries', () => {
    const fixture = sampleAccountData(checkedAt);
    expect(fixture.trips).toHaveLength(12);
    for (const trip of fixture.trips) {
      expect(trip).toMatchObject({ demoData: true, points: [], pointCount: 0, contributeToRoadDiscovery: false });
      expect(trip.name.startsWith('Demo · ')).toBe(true);
      expect(Date.parse(trip.startedAt)).toBeGreaterThanOrEqual(Date.parse('2026-09-30T19:00:00Z'));
      expect(Date.parse(trip.endedAt)).toBeLessThanOrEqual(checkedAt);
      expect(trip.fuelEstimate?.rates[0].sourceUrl).toBe('https://example.invalid/manzil-demo-fuel');
      expect(trip.fuelEstimate?.rates[0].pricePerLitre).toBe(280);
      expect(trip.fuelEstimate?.costPkr).toBeCloseTo(trip.distanceMeters / 1000 / 14.5 * 280);
    }
    expect(fixture.commutes.every(commute => !commute.enabled && commute.name.startsWith('Demo · '))).toBe(true);
    expect(sampleAccountData(Date.parse('2026-11-01T19:01:00Z')).trips.every(trip => Date.parse(trip.endedAt) <= Date.parse('2026-11-01T19:01:00Z'))).toBe(true);
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
});
