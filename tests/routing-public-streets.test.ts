import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import booleanIntersects from '@turf/boolean-intersects';
import { afterEach, describe, expect, it } from 'vitest';
import type { Closure, Coordinate, PlanRequest } from '../shared/types';
import { demoCatalogue, toggleDemo } from '../server/demos';
import { Store } from '../server/store';
import { getRoutingGraph, planJourney } from '../server/routing';
import { buildGraph, type OsmDocument } from '../server/routing/graph';
import { LocalRouter } from '../server/routing/engine';

const at = '2027-01-15T11:00:00.000Z';
const graph = getRoutingGraph()!;
const source = JSON.parse(gunzipSync(readFileSync(new URL('../assets/routing/osm-islamabad.json.gz', import.meta.url))).toString()) as OsmDocument;
const ways = new Map(source.elements.filter(item => item.type === 'way').map(item => [String(item.id), item]));
const segmentKey = (a: number[], b: number[]) => `${a.join(',')}:${b.join(',')}`;
const edges = new Map(graph.edges.map(edge => [segmentKey(graph.nodes[edge.from].coordinate, graph.nodes[edge.to].coordinate), edge]));
const cleanup: Store[] = [];
afterEach(() => { for (const store of cleanup.splice(0)) store.close(); });

describe('ordinary routing through public streets', () => {
  it.each([
    ['park-road-street-detour', ['Street 20', 'Street 25', 'Street 21'], 489],
    ['rohtas-road-streets', ['Street 36', 'Street 37', 'Street 43'], 361],
    ['tipu-sultan-streets', ['Street 104', 'Street 102'], 1042],
    ['sumbal-road-streets', ['Street 57', 'Street 53', 'Street 40'], 396],
  ] as const)('automatically avoids %s on real connected residential ways, with no forced stops', async (id, streetNames, residentialMeters) => {
    const store = new Store(':memory:'); cleanup.push(store);
    const scenario = (await demoCatalogue(store, graph, at)).scenarios.find(item => item.id === id)!;
    expect(scenario.includeInBulk).toBe(false); expect(scenario.suggestedJourney).toBeDefined();
    const request: PlanRequest = { ...scenario.suggestedJourney!, departureAt: at, compareDepartures: false };
    expect(request.waypoints).toBeUndefined();
    const open = await planJourney(request, [], 0);
    const loaded = await toggleDemo(store, graph, id, at, true);
    const closureId = loaded.scenarios.find(item => item.id === id)!.closureIds[0];
    const closure = store.get<Closure>('closure', closureId)!;
    expect(closure.title).toMatch(/^Demo · /); expect(closure.description).toContain('Synthetic');
    const plan = await planJourney(request, store.routingClosures(), store.eventRevision);
    expect(plan.source).toBe('local-osm'); expect(plan.conflicts.map(conflict => conflict.closureId)).toEqual([closureId]);
    const route = plan.options[0]; expect(route.kind).toBe('detour');
    expect(route.geometry.coordinates[0]).toEqual(request.origin.coordinate);
    expect(route.geometry.coordinates.at(-1)).toEqual(request.destination.coordinate);
    expect(route.durationSeconds).toBeGreaterThan(open.options[0].durationSeconds);
    expect(booleanIntersects(plan.baseline!.geometry, closure.geometry)).toBe(true);
    for (const option of plan.options) expect(booleanIntersects(option.geometry, closure.geometry)).toBe(false);
    let residential = 0; const streets = new Set<string>();
    for (let index = 1; index < route.geometry.coordinates.length; index++) {
      const edge = edges.get(segmentKey(route.geometry.coordinates[index - 1], route.geometry.coordinates[index]));
      expect(edge, 'Every route segment must be a real directed graph edge').toBeDefined();
      const way = ways.get(edge!.wayId)!;
      if (way.tags?.highway === 'residential') { residential += edge!.distance; streets.add(edge!.name); }
    }
    expect(Math.round(residential)).toBe(residentialMeters); expect([...streets]).toEqual([...streetNames]);
    await toggleDemo(store, graph, id, at, false);
    const reopened = await planJourney(request, store.routingClosures(), store.eventRevision);
    expect(reopened.conflicts).toHaveLength(0); expect(reopened.options[0].geometry).toEqual(open.options[0].geometry);
    expect(store.get<Closure>('closure', closureId)!.status).toBe('cancelled');
  });

  it('ranks main roads and streets by original travel time and automatically takes streets when the main route closes', () => {
    const coordinates: Coordinate[] = [[73, 33.68], [73.01, 33.68], [73, 33.683], [73.01, 33.683], [73.005, 33.6804]];
    const roadGraph = buildGraph({ elements: [
      ...coordinates.map(([lon, lat], index) => ({ type: 'node' as const, id: index + 1, lon, lat })),
      { type: 'way', id: 100, nodes: [1, 3, 4, 2], tags: { highway: 'primary', name: 'Main road' } },
      { type: 'way', id: 200, nodes: [1, 5, 2], tags: { highway: 'residential', name: 'Public street' } },
      { type: 'way', id: 300, nodes: [1, 2], tags: { highway: 'residential', name: 'Private shortcut', access: 'private' } },
      { type: 'way', id: 400, nodes: [1, 2], tags: { highway: 'footway', name: 'Walking shortcut' } },
    ] });
    const router = new LocalRouter(roadGraph);
    const request: PlanRequest = { origin: { name: 'Start', coordinate: coordinates[0] }, destination: { name: 'End', coordinate: coordinates[1] }, departureAt: at, compareDepartures: false };
    const open = router.plan(request, [], 0);
    expect(open.options[0].steps.map(step => step.roadName)).toEqual(['Main road']);
    const closure: Closure = { id: 'test', title: 'Test road closed', description: 'Synthetic unit test only', reason: 'other', status: 'published', revision: 1, createdAt: at, updatedAt: at,
      startsAt: at, endsAt: '2027-01-15T12:00:00.000Z', geometry: { type: 'Polygon', coordinates: [[[73.004, 33.6829], [73.006, 33.6829], [73.006, 33.6831], [73.004, 33.6831], [73.004, 33.6829]]] } };
    const closed = router.plan(request, [closure], 1);
    expect(closed.options[0].steps.map(step => step.roadName)).toEqual(['Public street']);
    expect(closed.options[0].distanceMeters).toBeLessThan(open.options[0].distanceMeters);
    expect(closed.options[0].durationSeconds).toBeGreaterThan(open.options[0].durationSeconds);
    expect(roadGraph.edges.every(edge => !['Private shortcut', 'Walking shortcut'].includes(edge.name))).toBe(true);
    const streetsAlreadyFaster = new LocalRouter({ ...roadGraph, edges: roadGraph.edges.map(edge => edge.name === 'Main road' ? { ...edge, seconds: edge.seconds * 2 } : edge) }).plan(request, [], 0);
    expect(streetsAlreadyFaster.options[0].steps.map(step => step.roadName)).toEqual(['Public street']);
  });
});
