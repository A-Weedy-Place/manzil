import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { Closure, ClosureDraft, Coordinate, Drawing } from '../../shared/types.js';
import { demoCatalogue, type DemoCatalogue } from '../../server/demos.js';
import { FirestoreStore } from '../../server/firestore-store.js';
import { firebaseServices } from '../../server/firebase.js';
import { drawingToPolygon } from '../../server/geometry.js';
import { getRoutingGraph } from '../../server/routing/index.js';
import { distanceMeters, type RoutingGraph } from '../../server/routing/graph.js';
import { closureDraftSchema } from '../../server/validation.js';
import { sampleAccountConfig } from './demo-user.js';

const DAY = 86400_000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const pack = (value: unknown) => ({ json: JSON.stringify(value) });
const markerKey = 'demoScenario:local-test-month:v1';
const selected = [
  ['faisal-avenue', 'Faisal Avenue'], ['nazimuddin-road', 'Sir Khwaja Nazimuddin Road'],
  ['margalla-road', 'Margalla Avenue'], ['rohtas-road-streets', 'Rohtas Road'],
  ['tipu-sultan-streets', 'Tipu Sultan Road'], ['sumbal-road-streets', 'Sumbal Road'],
] as const;
export const LOCAL_TEST_CLOSURE_IDS = [...selected.map(([id]) => `local-test-month-v1-${id}`), 'local-test-month-v1-26-number'];

/** Project only onto the named local road within 80 m, never onto a distant graph edge. */
function shortRoadSection(graph: RoutingGraph, name: string, point: Coordinate): Coordinate[] {
  const scale = Math.cos(point[1] * Math.PI / 180);
  const choices = graph.edges.filter(edge => edge.name === name).map(edge => {
    const a = graph.nodes[edge.from].coordinate, b = graph.nodes[edge.to].coordinate;
    const x = (b[0] - a[0]) * scale, y = b[1] - a[1];
    const fraction = Math.max(0, Math.min(1, ((point[0] - a[0]) * scale * x + (point[1] - a[1]) * y) / (x * x + y * y || 1)));
    const at = (t: number): Coordinate => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return { a, b, fraction, distance: distanceMeters(point, at(fraction)), at };
  }).sort((a, b) => a.distance - b.distance);
  const edge = choices[0];
  if (!edge || edge.distance > 80 || distanceMeters(edge.a, edge.b) < 2) throw new Error(`Local test road section unavailable: ${name}`);
  const centre = Math.max(.25, Math.min(.75, edge.fraction));
  return [edge.at(Math.max(.05, centre - .2)), edge.at(Math.min(.95, centre + .2))];
}

/** Synthetic closures on public road geometry; no claim that any road is actually closed. */
export function localTestClosureDrafts(graph: RoutingGraph, catalogue: DemoCatalogue, now: number): ClosureDraft[] {
  if (!Number.isFinite(now)) throw new Error('Provide a valid local fixture time.');
  const period = { startsAt: new Date(now).toISOString(), endsAt: new Date(now + 32 * DAY).toISOString() };
  const drafts = selected.map(([id, name]) => {
    const scenario = catalogue.scenarios.find(value => value.id === id);
    if (!scenario?.coordinates.length) throw new Error(`Local test scenario unavailable: ${id}`);
    const coordinates = scenario.coordinates.length > 1 ? structuredClone(scenario.coordinates) : shortRoadSection(graph, name, scenario.coordinates[0]);
    const drawing: Drawing = { kind: 'line', coordinates, widthMeters: 20 };
    return closureDraftSchema.parse({ title: `Test · ${name}`, description: `[manzil-local-test-month:v1:${id}] Synthetic 32-day testing closure on public OpenStreetMap road geometry. Not a real traffic advisory.`,
      reason: 'other', status: 'published', ...period, drawing, geometry: drawingToPolygon(drawing) });
  });
  // Public Photon/OSM place node 5318062321: outside the bundled Islamabad road graph.
  // This short line is illustrative, not a verified road section or a distant snap.
  const drawing: Drawing = { kind: 'line', widthMeters: 20, coordinates: [[72.9348, 33.63285], [72.9350241, 33.6330248], [72.93525, 33.6332]] };
  drafts.push(closureDraftSchema.parse({ title: 'Test · 26 Number', reason: 'other', status: 'published', ...period,
    description: '[manzil-local-test-month:v1:26-number] Synthetic 32-day testing closure near the public 26 Number place (OSM node 5318062321). Illustrative section only: outside the bundled road graph, not a verified road alignment or actual closure. No distant road snap was used.',
    sourceUrl: 'https://www.openstreetmap.org/node/5318062321', drawing, geometry: drawingToPolygon(drawing) }));
  return drafts;
}

/** Guarded, explicit CLI seeding only. All seven records and their tombstone marker are atomic. */
export async function seedLocalTestClosures(env: NodeJS.ProcessEnv = process.env,
  servicesFactory: (projectId: string) => { db: Firestore } = firebaseServices, now = Date.now()) {
  const config = sampleAccountConfig(env);
  if (servicesFactory === firebaseServices && env !== process.env) sampleAccountConfig(process.env);
  const graph = getRoutingGraph(); if (!graph) throw new Error('The bundled road graph is unavailable.');
  const { db } = servicesFactory(config.projectId), store = new FirestoreStore(db);
  const drafts = localTestClosureDrafts(graph, await demoCatalogue(store, graph, new Date(now).toISOString()), now);
  const root = db.collection('manzil').doc('v1'), marker = root.collection('meta').doc(hash(markerKey));
  const revision = root.collection('meta').doc(hash('eventRevision'));
  const refs = LOCAL_TEST_CLOSURE_IDS.map(id => root.collection('closure').doc(hash(id)));
  const result = await db.runTransaction(async tx => {
    const [markerDoc, revisionDoc, ...existing] = await tx.getAll(marker, revision, ...refs);
    if (markerDoc.exists) return { result: 'already-seeded' as const, createdCount: 0 };
    const previousRevision: unknown = revisionDoc.data()?.json ? JSON.parse(revisionDoc.data()!.json) : 0;
    if (!Number.isSafeInteger(previousRevision) || (previousRevision as number) < 0) throw new Error('Invalid local event revision; no test closures were written.');
    let count = 0;
    for (const [index, ref] of refs.entries()) {
      if (existing[index].exists) continue;
      const stamp = new Date(now).toISOString(), closure: Closure = { ...drafts[index], id: LOCAL_TEST_CLOSURE_IDS[index],
        moderation: 'approved', revision: 1, createdAt: stamp, updatedAt: stamp };
      tx.create(ref, { ...pack(closure), status: 'published', updatedAt: stamp }); count++;
    }
    if (count) tx.set(revision, pack((previousRevision as number) + count));
    tx.create(marker, pack({ version: 1, synthetic: true, createdAt: new Date(now).toISOString(), days: 32, createdCount: count, closureIds: LOCAL_TEST_CLOSURE_IDS }));
    return { result: 'created' as const, createdCount: count };
  });
  return { ...result, closureIds: LOCAL_TEST_CLOSURE_IDS };
}
