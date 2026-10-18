import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { Closure, ClosureDraft, Drawing } from '../../shared/types.js';
import { demoCatalogue, type DemoCatalogue } from '../../server/demos.js';
import { firebaseServices } from '../../server/firebase.js';
import { FirestoreStore } from '../../server/firestore-store.js';
import { drawingToPolygon } from '../../server/geometry.js';
import { getRoutingGraph } from '../../server/routing/index.js';
import { closureDraftSchema } from '../../server/validation.js';
import { sampleAccountConfig } from './demo-user.js';

const DAY = 86400_000, PKT = 5 * 3600_000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const pack = (value: unknown) => ({ json: JSON.stringify(value) });
const markerKey = 'demoScenario:local-test-upcoming:v1';
const selected = [
  ['ibn-e-sina', 'ibn-e-sina', 'Ibn-e-Sina Road'],
  ['aabpara', 'aabpara-future', 'Aabpara · Municipal Road'],
  ['zero-point', 'zero-point-expired', 'Zero Point · Islamabad Expressway'],
] as const;
export const LOCAL_UPCOMING_CLOSURE_IDS = selected.map(([id]) => `local-test-upcoming-v1-${id}`);

/** Same PKT calendar date next month (clamped at month end), at 09:00. */
function nextMonthMorning(now: number): number {
  const local = new Date(now + PKT), year = local.getUTCFullYear(), month = local.getUTCMonth() + 1;
  const day = Math.min(local.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return Date.UTC(year, month, day, 9) - PKT;
}

/** Genuine public OSM road chains, scheduled later; these are not traffic reports. */
export function localUpcomingClosureDrafts(catalogue: DemoCatalogue, now: number): ClosureDraft[] {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new Error('Provide a valid local fixture time.');
  const firstStart = nextMonthMorning(now);
  return selected.map(([id, scenarioId, name], index) => {
    const scenario = catalogue.scenarios.find(value => value.id === scenarioId);
    if (!scenario || scenario.coordinates.length < 2) throw new Error(`Local upcoming road section unavailable: ${scenarioId}`);
    const drawing: Drawing = { kind: 'line', coordinates: structuredClone(scenario.coordinates), widthMeters: 20 };
    const startsAt = firstStart + index * DAY;
    return closureDraftSchema.parse({ title: `Test · Upcoming · ${name}`, reason: 'other', status: 'published',
      startsAt: new Date(startsAt).toISOString(), endsAt: new Date(startsAt + 32 * DAY).toISOString(),
      description: `[manzil-local-test-upcoming:v1:${id}] Synthetic upcoming 32-day testing closure on public OpenStreetMap road geometry. Not a real traffic advisory.`,
      drawing, geometry: drawingToPolygon(drawing) });
  });
}

/** Explicit guarded emulator action, independent of the seven active fixtures. */
export async function seedLocalUpcomingClosures(env: NodeJS.ProcessEnv = process.env,
  servicesFactory: (projectId: string) => { db: Firestore } = firebaseServices, now = Date.now()) {
  const config = sampleAccountConfig(env);
  if (servicesFactory === firebaseServices && env !== process.env) sampleAccountConfig(process.env);
  const graph = getRoutingGraph(); if (!graph) throw new Error('The bundled road graph is unavailable.');
  const { db } = servicesFactory(config.projectId), store = new FirestoreStore(db);
  const drafts = localUpcomingClosureDrafts(await demoCatalogue(store, graph, new Date(now).toISOString()), now);
  const root = db.collection('manzil').doc('v1'), marker = root.collection('meta').doc(hash(markerKey));
  const revision = root.collection('meta').doc(hash('eventRevision'));
  const refs = LOCAL_UPCOMING_CLOSURE_IDS.map(id => root.collection('closure').doc(hash(id)));
  const result = await db.runTransaction(async tx => {
    const [markerDoc, revisionDoc, ...existing] = await tx.getAll(marker, revision, ...refs);
    if (markerDoc.exists) return { result: 'already-seeded' as const, createdCount: 0 };
    const previousRevision: unknown = revisionDoc.data()?.json ? JSON.parse(revisionDoc.data()!.json) : 0;
    if (!Number.isSafeInteger(previousRevision) || (previousRevision as number) < 0) throw new Error('Invalid local event revision; no upcoming closures were written.');
    let count = 0;
    for (const [index, ref] of refs.entries()) {
      if (existing[index].exists) continue;
      const stamp = new Date(now).toISOString(), closure: Closure = { ...drafts[index], id: LOCAL_UPCOMING_CLOSURE_IDS[index],
        moderation: 'approved', revision: 1, createdAt: stamp, updatedAt: stamp };
      tx.create(ref, { ...pack(closure), status: 'published', updatedAt: stamp }); count++;
    }
    if (count) tx.set(revision, pack((previousRevision as number) + count));
    tx.create(marker, pack({ version: 1, synthetic: true, createdAt: new Date(now).toISOString(), days: 32,
      createdCount: count, closureIds: LOCAL_UPCOMING_CLOSURE_IDS }));
    return { result: 'created' as const, createdCount: count };
  });
  return { ...result, closureIds: LOCAL_UPCOMING_CLOSURE_IDS };
}
