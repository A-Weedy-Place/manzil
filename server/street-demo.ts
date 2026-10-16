import type { Closure, ClosureDraft, Coordinate, Place } from '../shared/types';
import { drawingToPolygon } from './geometry';
import { HttpError } from './errors';
import type { RoutingGraph } from './routing/graph';
import type { Repository } from './repository';

export interface StreetRouteDemo {
  id: string; title: string; origin: Place; destination: Place;
  closure: ClosureDraft; streetNames: string[]; expectedStreetMeters: number;
  closureId?: string;
}

const ID = 'park-road-street-detour';
const TAG = '[manzil-street-demo:v1:park-road]';
const META_KEY = 'streetRouteDemo:v1:park-road';
const ORIGIN: Coordinate = [73.0396635, 33.7145674];
const DESTINATION: Coordinate = [73.0299184, 33.709286];
const CLOSURE_CENTER: Coordinate = [73.03651175, 33.71277725];

/** These pins are actual road nodes in the attributed bundled OSM snapshot.
 * The closed Park Road segment has a connected F-8 residential detour. A real-
 * graph regression checks its OSM highway tags, rather than inventing a path.
 */
export function streetRouteDemo(graph: RoutingGraph, at: string): StreetRouteDemo {
  for (const coordinate of [ORIGIN, DESTINATION]) {
    const index = graph.nodes.findIndex(node => node.coordinate[0] === coordinate[0] && node.coordinate[1] === coordinate[1]);
    if (index < 0 || !graph.edges.some(edge => edge.name === 'Park Road' && (edge.from === index || edge.to === index))) {
      throw new HttpError(503, 'The Park Road street demo is unavailable in this road graph.');
    }
  }
  const drawing = { kind: 'point' as const, coordinates: [[...CLOSURE_CENTER] as Coordinate], widthMeters: 35 };
  return {
    id: ID, title: 'Demo · F-8 street detour',
    origin: { id: 'demo-park-road-northeast', name: 'Park Road · F-8 northeast', coordinate: [...ORIGIN] },
    destination: { id: 'demo-park-road-southwest', name: 'Park Road · F-8 southwest', coordinate: [...DESTINATION] },
    closure: {
      title: 'Demo · Park Road street detour', description: `${TAG} Synthetic testing closure only; not a real traffic advisory.`,
      reason: 'other', status: 'published',
      startsAt: new Date(Date.parse(at) - 30 * 60_000).toISOString(),
      endsAt: new Date(Date.parse(at) + 120 * 60_000).toISOString(),
      drawing, geometry: drawingToPolygon(drawing),
    },
    // Measured first-detour residential distance in the bundled snapshot. Other
    // user closures may change the chosen streets; the normal planner validates
    // all of them and returns unavailable rather than substituting this fixture.
    streetNames: ['Street 20', 'Street 25', 'Street 21'], expectedStreetMeters: 489,
  };
}

/** Explicit loading affects only this owned synthetic closure. */
export async function loadStreetRouteDemo(store: Repository, graph: RoutingGraph, at: string): Promise<StreetRouteDemo> {
  const demo = streetRouteDemo(graph, at);
  const previousId = await store.meta<string>(META_KEY);
  const candidate = previousId ? await store.get<Closure>('closure', previousId) : undefined;
  const previous = candidate?.title.startsWith('Demo · ') && candidate.description.includes(TAG) ? candidate : undefined;
  const sameDraft = previous && Object.entries(demo.closure).every(([key, value]) => JSON.stringify(previous[key as keyof ClosureDraft]) === JSON.stringify(value));
  const saved = sameDraft ? previous : await store.saveClosure(demo.closure, previous?.id, previous?.revision);
  await store.setMeta(META_KEY, saved.id);
  return { ...demo, closureId: saved.id };
}
