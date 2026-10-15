import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import buffer from '@turf/buffer';
import { lineString } from '@turf/helpers';
import type { Polygon } from 'geojson';
import type { RoutingGraph } from '../server/routing/graph';
import { closureEdgeFractions } from '../server/routing/closure-segments';
import { LocalRouter } from '../server/routing/engine';
import type { Closure, Coordinate, PlanRequest } from '../shared/types';

// No database, source archive or GPS history: all restrictions here are explicit synthetic fixtures.
const readGraph = (): RoutingGraph => JSON.parse(gunzipSync(readFileSync(new URL('../assets/routing/islamabad.json.gz', import.meta.url))).toString());
const graph = readGraph();
const lines: Coordinate[][] = [
  [[73.0505, 33.7131], [73.0505, 33.7141]],
  [[73.0517, 33.7098], [73.0527, 33.7098]],
  [[73.0500, 33.7052], [73.0510, 33.7052]],
  [[73.0175, 33.7229], [73.0185, 33.7229]],
];
const geometries = lines.map(coordinates => buffer(lineString(coordinates), 30, { units: 'meters' })!.geometry as Polygon);
const elapsed = (run: () => unknown) => { const start = performance.now(); run(); return Math.round((performance.now() - start) * 100) / 100; };
const firstMs = elapsed(() => geometries.forEach(geometry => closureEdgeFractions(graph, geometry)));
const warmRuns = Array.from({ length: 20 }, () => elapsed(() => geometries.forEach(geometry => closureEdgeFractions(graph, geometry))));
const request: PlanRequest = { origin: { name: 'Faisal Mosque approach', coordinate: [73.0376503, 33.7314163] }, destination: { name: 'Centaurus', coordinate: [73.0492744, 33.7081776] }, departureAt: '2027-01-15T11:00:00.000Z', compareDepartures: false };
const closures: Closure[] = geometries.map((geometry, i) => ({ id: `benchmark-only-${i}`, title: 'Synthetic benchmark only', description: 'Not live traffic', reason: 'other', status: 'published', geometry, startsAt: '2027-01-15T10:30:00.000Z', endsAt: '2027-01-15T13:00:00.000Z', revision: 1, createdAt: request.departureAt, updatedAt: request.departureAt }));
const router = new LocalRouter(graph);
let options = 0;
const planMs = elapsed(() => { options = router.plan(request, closures, 1).options.length; });
console.log(JSON.stringify({ directedEdges: graph.edges.length, closureCount: geometries.length, affectedEdges: geometries.map(geometry => closureEdgeFractions(graph, geometry).size), firstGeometryMs: firstMs, warmGeometryMedianMs: [...warmRuns].sort((a,b) => a-b)[10], warmGeometryWorstMs: Math.max(...warmRuns), routePlanMs: planMs, routeOptions: options }, null, 2));
