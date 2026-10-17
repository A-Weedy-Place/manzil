import type { Closure, ClosureDraft, Coordinate, Place } from '../shared/types';
import { drawingToPolygon } from './geometry';
import { HttpError } from './errors';
import type { Repository } from './repository';
import type { RoutingGraph } from './routing/graph';
import { distanceMeters } from './routing/graph';
import { streetRouteDemo } from './street-demo';

type Timing = 'active' | 'future' | 'expired';
interface Definition {
  id: string; title: string; roadName: string; coordinate: Coordinate; timing: Timing;
  suggestedJourney?: { origin: Place; destination: Place }; includeInBulk?: boolean;
}
const parkRoadId = 'park-road-street-detour';
const definitions: Definition[] = [
  { id: 'faisal-avenue', title: 'Demo · Faisal Avenue', roadName: 'Faisal Avenue', coordinate: [73.0505, 33.7136], timing: 'active' },
  { id: 'nazimuddin-road', title: 'Demo · Nazimuddin Road', roadName: 'Sir Khwaja Nazimuddin Road', coordinate: [73.0522, 33.7098], timing: 'active' },
  { id: 'ibn-e-sina', title: 'Demo · Ibn-e-Sina Road', roadName: 'Ibn-e-Sina Road', coordinate: [73.0505, 33.7052], timing: 'active' },
  { id: 'margalla-road', title: 'Demo · Margalla Avenue', roadName: 'Margalla Avenue', coordinate: [73.018, 33.7229], timing: 'active' },
  { id: 'aabpara-future', title: 'Demo · Aabpara upcoming closure', roadName: 'Muncipal Road', coordinate: [73.0881, 33.7101], timing: 'future' },
  { id: 'zero-point-expired', title: 'Demo · Zero Point reopened', roadName: 'Islamabad Expressway', coordinate: [73.069, 33.6885], timing: 'expired' },
  { id: parkRoadId, title: 'Demo · Park Road · F-8', roadName: 'Park Road', coordinate: [73.03651175, 33.71277725], timing: 'active', includeInBulk: false,
    suggestedJourney: { origin: { name: 'Park Road · F-8 northeast', coordinate: [73.0396635, 33.7145674] }, destination: { name: 'Park Road · F-8 southwest', coordinate: [73.0299184, 33.709286] } } },
  { id: 'rohtas-road-streets', title: 'Demo · Rohtas Road · G-9', roadName: 'Rohtas Road', coordinate: [73.0343993, 33.68398885], timing: 'active', includeInBulk: false,
    suggestedJourney: { origin: { name: 'Rohtas Road · G-9 south', coordinate: [73.0374153, 33.6799304] }, destination: { name: 'Rohtas Road · G-9 north', coordinate: [73.0320344, 33.6873768] } } },
  { id: 'tipu-sultan-streets', title: 'Demo · Tipu Sultan Road · I-8', roadName: 'Tipu Sultan Road', coordinate: [73.0748665, 33.6659718], timing: 'active', includeInBulk: false,
    suggestedJourney: { origin: { name: 'Tipu Sultan Road · I-8 west', coordinate: [73.0711328, 33.6666615] }, destination: { name: 'Tipu Sultan Road · I-8 east', coordinate: [73.0785179, 33.6644728] } } },
  { id: 'sumbal-road-streets', title: 'Demo · Sumbal Road · F-10', roadName: 'Sumbal Road', coordinate: [73.0114664, 33.6936854], timing: 'active', includeInBulk: false,
    suggestedJourney: { origin: { name: 'Sumbal Road · F-10 northeast', coordinate: [73.0142613, 33.6951718] }, destination: { name: 'Sumbal Road · F-10 southwest', coordinate: [73.0075816, 33.6916557] } } },
];
export interface DemoScenario {
  id: string; title: string; description: string; enabled: boolean; closureIds: string[];
  coordinates: Coordinate[]; timing: Timing; startsAt: string; endsAt: string;
  suggestedJourney?: { origin: Place; destination: Place }; includeInBulk?: boolean;
}
export interface DemoCatalogue { at: string; scenarios: DemoScenario[] }
// Reuse the original Park Road fixture's identity so older clients cannot create
// a duplicate event when the same demo is now loaded from the regular catalogue.
const tag = (id: string) => id === parkRoadId ? '[manzil-street-demo:v1:park-road]' : `[manzil-demo:v1:${id}]`;
const metaKey = (id: string) => id === parkRoadId ? 'streetRouteDemo:v1:park-road' : `demoScenario:v1:${id}`;
const geometryCache = new WeakMap<RoutingGraph, Map<string, Coordinate[]>>();
const presetLandmarks: Coordinate[] = [[73.0376503, 33.7314163], [73.052076, 33.7060737], [73.0690063, 33.6885463], [73.0881746, 33.7101232], [73.0492744, 33.7081776]];
function distanceToSegment(point: Coordinate, a: Coordinate, b: Coordinate): number {
  const scale = Math.cos(point[1] * Math.PI / 180), x = (b[0] - a[0]) * scale, y = b[1] - a[1];
  const t = Math.max(0, Math.min(1, (((point[0] - a[0]) * scale) * x + (point[1] - a[1]) * y) / (x * x + y * y || 1)));
  return distanceMeters(point, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
}

/** A short contiguous chain of real, named OSM segments; no straight invented route. */
function roadCoordinates(graph: RoutingGraph, definition: Definition): Coordinate[] {
  let cache = geometryCache.get(graph);
  if (!cache) { cache = new Map(); geometryCache.set(graph, cache); }
  const cached = cache.get(definition.id); if (cached) return cached;
  if (definition.suggestedJourney) {
    // Test pins are original graph nodes; the normal router still chooses and
    // validates every route. These coordinates are a closure, never route data.
    for (const place of [definition.suggestedJourney.origin, definition.suggestedJourney.destination]) {
      const index = graph.nodes.findIndex(node => node.coordinate[0] === place.coordinate[0] && node.coordinate[1] === place.coordinate[1]);
      if (index < 0 || !graph.edges.some(edge => edge.name === definition.roadName && (edge.from === index || edge.to === index))) {
        throw new HttpError(503, 'The demo road is unavailable in this road graph.');
      }
    }
    const coordinates: Coordinate[] = [[...definition.coordinate]];
    cache.set(definition.id, coordinates); return coordinates;
  }
  const physical = new Map<string, { from: number; to: number; distance: number }>();
  for (const edge of graph.edges) if (edge.name === definition.roadName) {
    // Active samples should demonstrate detours, rather than close the preset pin itself.
    if (definition.timing === 'active' && presetLandmarks.some(point => distanceToSegment(point, graph.nodes[edge.from].coordinate, graph.nodes[edge.to].coordinate) < 160)) continue;
    const key = [edge.from, edge.to].sort((a, b) => a - b).join(':');
    if (!physical.has(key)) physical.set(key, edge);
  }
  const edges = [...physical.values()];
  const seed = edges.sort((a, b) => distanceMeters(graph.nodes[a.from].coordinate, definition.coordinate) - distanceMeters(graph.nodes[b.from].coordinate, definition.coordinate))[0];
  if (!seed) throw new HttpError(503, 'The demo road is unavailable in this road graph.');
  const adjacency = new Map<number, typeof edges>();
  for (const edge of edges) for (const node of [edge.from, edge.to]) { const list = adjacency.get(node) ?? []; list.push(edge); adjacency.set(node, list); }
  const chain = [seed.from, seed.to], used = new Set(chain);
  for (const prepend of [false, true]) {
    let length = seed.distance / 2;
    for (let count = 0; count < 35 && length < 330; count++) {
      const node = prepend ? chain[0] : chain[chain.length - 1];
      const next = (adjacency.get(node) ?? []).map(edge => ({ edge, node: edge.from === node ? edge.to : edge.from }))
        .filter(candidate => !used.has(candidate.node)).sort((a, b) => a.edge.distance - b.edge.distance)[0];
      if (!next || (length > 180 && length + next.edge.distance > 500)) break;
      used.add(next.node); length += next.edge.distance;
      if (prepend) chain.unshift(next.node); else chain.push(next.node);
    }
  }
  const coordinates = chain.map(index => graph.nodes[index].coordinate); cache.set(definition.id, coordinates); return coordinates;
}
function schedule(timing: Timing, at: string) {
  const offsets = timing === 'active' ? [-30, 120] : timing === 'future' ? [45, 150] : [-120, -60];
  return { startsAt: new Date(Date.parse(at) + offsets[0] * 60_000).toISOString(), endsAt: new Date(Date.parse(at) + offsets[1] * 60_000).toISOString() };
}
async function ownedClosure(store: Repository, definition: Definition): Promise<Closure | undefined> {
  const closureId = await store.meta<string>(metaKey(definition.id));
  const closure = closureId ? await store.get<Closure>('closure', closureId) : undefined;
  // Never cancel an ordinary record merely because it has a similar road/title.
  return closure?.title.startsWith('Demo · ') && closure.description.includes(tag(definition.id)) ? closure : undefined;
}
export async function demoCatalogue(store: Repository, graph: RoutingGraph, at: string): Promise<DemoCatalogue> {
  return { at, scenarios: await Promise.all(definitions.map(async definition => {
    const closure = await ownedClosure(store, definition), period = closure?.status === 'published' ? closure : schedule(definition.timing, at);
    return { id: definition.id, title: definition.title, description: `Synthetic ${definition.timing} road closure for local testing.`,
      enabled: closure?.status === 'published', closureIds: closure ? [closure.id] : [], coordinates: roadCoordinates(graph, definition),
      timing: definition.timing, startsAt: period.startsAt, endsAt: period.endsAt ?? '',
      ...(definition.suggestedJourney ? { suggestedJourney: definition.suggestedJourney, includeInBulk: false } : {}) };
  })) };
}
export async function toggleDemo(store: Repository, graph: RoutingGraph, scenario: string, at: string, enabled: boolean): Promise<DemoCatalogue> {
  const definition = definitions.find(item => item.id === scenario);
  if (!definition) throw new HttpError(400, 'Unknown demo scenario.');
  const previous = await ownedClosure(store, definition);
  if (enabled && previous?.status !== 'published') {
    const coordinates = roadCoordinates(graph, definition);
    const drawing = { kind: definition.suggestedJourney ? 'point' as const : 'line' as const, coordinates, widthMeters: definition.suggestedJourney ? 35 : 60 };
    const draft: ClosureDraft = definition.id === parkRoadId ? streetRouteDemo(graph, at).closure : {
      title: definition.title, description: `${tag(scenario)} Synthetic demo only; not a real traffic advisory.`, reason: 'other', status: 'published',
      ...schedule(definition.timing, at), drawing, geometry: drawingToPolygon(drawing) };
    const saved = await store.saveClosure(draft, previous?.id, previous?.revision);
    await store.setMeta(metaKey(scenario), saved.id);
  } else if (!enabled && previous?.status === 'published') await store.saveClosure({ ...previous, status: 'cancelled' }, previous.id, previous.revision);
  return demoCatalogue(store, graph, at);
}
