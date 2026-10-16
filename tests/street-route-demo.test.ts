import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import booleanIntersects from '@turf/boolean-intersects';
import type { Closure, ClosureDraft, Coordinate } from '../shared/types';
import { createApp } from '../server/app';
import { loadStreetRouteDemo, streetRouteDemo, type StreetRouteDemo } from '../server/street-demo';
import { SourceService } from '../server/source';
import { Store } from '../server/store';
import { demoCatalogue, toggleDemo } from '../server/demos';
import { getRoutingGraph, planJourney } from '../server/routing';
import type { OsmDocument } from '../server/routing/graph';

const at = '2027-01-15T11:00:00.000Z';
const graph = getRoutingGraph()!;
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
function createStore() { const store = new Store(':memory:'); cleanup.push(() => store.close()); return store; }
const segmentKey = (a: number[], b: number[]) => `${a.join(',')}:${b.join(',')}`;

describe('real F-8 residential street detour demo', () => {
  it('reroutes a blocked Park Road through original OSM-tagged residential streets', async () => {
    const demo = streetRouteDemo(graph, at);
    const request = { origin: demo.origin, destination: demo.destination, departureAt: at, compareDepartures: false };
    const direct = (await planJourney(request, [], 0)).baseline!;
    const closure: Closure = { ...demo.closure, id: 'test-only', revision: 1, createdAt: at, updatedAt: at };
    const plan = await planJourney(request, [closure], 1);
    expect(plan.conflicts.map(item => item.closureId)).toEqual(['test-only']);
    const route = plan.options[0]; expect(route.kind).toBe('detour');
    expect(route.durationSeconds).toBeGreaterThan(direct.durationSeconds);
    expect(route.distanceMeters).toBeGreaterThan(direct.distanceMeters);
    expect(route.geometry.coordinates[0]).toEqual(demo.origin.coordinate);
    expect(route.geometry.coordinates.at(-1)).toEqual(demo.destination.coordinate);
    expect(booleanIntersects(direct.geometry, closure.geometry)).toBe(true);
    for (const option of plan.options) expect(booleanIntersects(option.geometry, closure.geometry)).toBe(false);

    const source = JSON.parse(gunzipSync(readFileSync(new URL('../assets/routing/osm-islamabad.json.gz', import.meta.url))).toString()) as OsmDocument;
    const sourceWays = new Map(source.elements.filter(item => item.type === 'way').map(item => [String(item.id), item]));
    const edges = new Map(graph.edges.map(edge => [segmentKey(graph.nodes[edge.from].coordinate, graph.nodes[edge.to].coordinate), edge]));
    const residential = new Map<string, number>();
    for (let index = 1; index < route.geometry.coordinates.length; index++) {
      const edge = edges.get(segmentKey(route.geometry.coordinates[index - 1], route.geometry.coordinates[index]));
      expect(edge, 'Every detour leg must be a real directed graph edge').toBeDefined();
      const way = sourceWays.get(edge!.wayId)!;
      if (way.tags?.highway === 'residential') residential.set(edge!.name, (residential.get(edge!.name) ?? 0) + edge!.distance);
    }
    const residentialMeters = [...residential.values()].reduce((sum, length) => sum + length, 0);
    expect(residentialMeters).toBeGreaterThan(450);
    expect(Math.round(residentialMeters)).toBe(demo.expectedStreetMeters);
    expect([...residential.keys()]).toEqual(demo.streetNames);
    expect(residential.size).toBeGreaterThanOrEqual(2);
  });

  it('does not disable other demos or ordinary closures, and repeated loads do not duplicate the owned fixture', async () => {
    const store = createStore();
    const ordinary: ClosureDraft = { ...streetRouteDemo(graph, at).closure, title: 'Ordinary user closure', description: 'Preserve ordinary changes',
      drawing: undefined, geometry: { type: 'Polygon', coordinates: [[[73.08, 33.7], [73.081, 33.7], [73.081, 33.701], [73.08, 33.7]]] } };
    const original = store.saveClosure(ordinary);
    const otherDemo = store.saveClosure({ ...ordinary, title: 'Demo · Existing scenario', description: '[manzil-demo:v1:other] Existing unrelated demo' });
    const first = (await loadStreetRouteDemo(store, graph, at));
    const revision = store.eventRevision;
    const repeat = (await loadStreetRouteDemo(store, graph, at));
    expect(repeat).toEqual(first); expect(store.eventRevision).toBe(revision);
    expect(store.list('closure')).toHaveLength(3);
    const moved = (await loadStreetRouteDemo(store, graph, '2027-01-16T11:00:00.000Z'));
    expect(moved.closureId).toBe(first.closureId); expect(store.list('closure')).toHaveLength(3);
    expect(store.get('closure', original.id)).toEqual(original);
    expect(store.get('closure', otherDemo.id)).toEqual(otherDemo);
    const closure = store.get<Closure>('closure', first.closureId!)!;
    store.saveClosure({ ...closure, status: 'cancelled' }, closure.id, closure.revision);
    expect((await loadStreetRouteDemo(store, graph, at)).closureId).toBe(first.closureId);
    expect(store.get<Closure>('closure', first.closureId!)!.status).toBe('published');
  });

  it('still uses the residential detour with all six existing demo scenarios enabled', async () => {
    const store = createStore();
    for (const scenario of (await demoCatalogue(store, graph, at)).scenarios) (await toggleDemo(store, graph, scenario.id, at, true));
    const demo = (await loadStreetRouteDemo(store, graph, at));
    const result = await planJourney({ origin: demo.origin, destination: demo.destination, departureAt: at, compareDepartures: false }, store.routingClosures(), store.eventRevision);
    expect(store.routingClosures()).toHaveLength(7);
    expect(result.options[0]?.kind).toBe('detour');
    expect(result.conflicts.map(conflict => conflict.closureId)).toEqual([demo.closureId]);
    for (const streetName of demo.streetNames) expect(result.options[0].steps.some(step => step.roadName === streetName)).toBe(true);
    for (const closure of store.routingClosures().filter(item => Date.parse(item.startsAt) <= Date.parse(at) && (!item.endsAt || Date.parse(item.endsAt) > Date.parse(at)))) {
      expect(booleanIntersects(result.options[0].geometry, closure.geometry)).toBe(false);
    }
  });

  it('serves a read-only preview, explicitly loads the fixture, and rejects invalid requests without mutation', async () => {
    const store = createStore();
    const source = new SourceService(store, async () => ({ state: 'blocked', posts: [], observedCount: 0, message: 'Test only' }));
    const { app } = createApp(store, { source });
    const server = await new Promise<Server>(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
    cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing port');
    const request = (suffix = '', body?: unknown) => fetch(`http://127.0.0.1:${address.port}/api/demos/street-route${suffix}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const previewResponse = await request(`?at=${at}`); expect(previewResponse.status).toBe(200);
    const preview: StreetRouteDemo = await previewResponse.json(); expect(preview.closureId).toBeUndefined();
    expect(store.list('closure')).toHaveLength(0);
    const loadedResponse = await request('', { at }); expect(loadedResponse.status).toBe(200);
    const loaded: StreetRouteDemo = await loadedResponse.json(); expect(loaded.closureId).toBeTruthy();
    expect(store.get<Closure>('closure', loaded.closureId!)!.geometry).toEqual(preview.closure.geometry);
    expect((await request('?at=tomorrow')).status).toBe(400);
    expect((await request('', { at: 'tomorrow' })).status).toBe(400);
    expect((await request('', { at, enabled: false })).status).toBe(400);
    expect(store.list('closure')).toHaveLength(1);
  });

  it('reports unavailable if the genuine Park Road node fixture is absent', async () => {
    expect(() => streetRouteDemo({ ...graph, nodes: [], edges: [] }, at)).toThrow('unavailable');
  });
});
