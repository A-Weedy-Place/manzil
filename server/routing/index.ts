import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import type { Closure, GraphStatus, Place, PlanRequest, PlanResponse } from '../../shared/types';
import { LocalRouter } from './engine';
import { DEFAULT_BOUNDS, type RoutingGraph } from './graph';

let router: LocalRouter | null = null;
let loadError = '';
try {
  const graph = JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL('../../assets/routing/islamabad.json.gz', import.meta.url)))).toString()) as RoutingGraph;
  if (!graph.nodes.length || !graph.edges.length) throw new Error('Road graph is empty.');
  router = new LocalRouter(graph);
} catch (error) { loadError = error instanceof Error ? error.message : String(error); }

const LIMITATIONS = [
  'Ordinary car-road speed estimates only; no current congestion or live traffic.',
  'Bounded Islamabad extract; roads outside the coverage area are unavailable.',
  'Endpoint pins snap to road nodes within 220 m; pin-to-road access is not routed.',
  'Basic OSM node turn restrictions are enforced; unsupported via-way restrictions conservatively exclude via roads.',
  'Conditional access/one-way and reversible roads are excluded conservatively; conditional turn prohibitions apply continuously.',
  'Closure polygons are two-dimensional and can conservatively affect a flyover or both directions.',
  'Bounded temporal detour/departure search is not a globally optimal time-dependent navigation engine.',
  'Road data and announced reopening times can be incomplete or change. Recheck before travel.',
];
export function graphStatus(): GraphStatus {
  return { ready: !!router, source: router?.graph.source ?? 'OpenStreetMap local import', version: router?.graph.version ?? 'not-imported', nodeCount: router?.graph.nodes.length ?? 0, edgeCount: router?.graph.edges.length ?? 0, importedAt: router?.graph.importedAt ?? null, bounds: router?.graph.bounds ?? DEFAULT_BOUNDS, limitations: loadError ? [`Graph unavailable: ${loadError}`, ...LIMITATIONS] : LIMITATIONS };
}
export const getGraphStatus = graphStatus;
/** Shared local road data for closure display and clearly labelled demo fixtures. */
export function getRoutingGraph(): RoutingGraph | null { return router?.graph ?? null; }
export function planJourney(request: PlanRequest, closures: Closure[], eventRevision: number): PlanResponse {
  if (router) return router.plan(request, closures, eventRevision);
  return { options: [], baseline: null, conflicts: [], warnings: [loadError, 'Run npm run data:import to import the real OSM road graph.'], unavailableReason: 'The real Islamabad routing graph is unavailable. No synthetic route has been substituted.', evaluatedAt: new Date().toISOString(), graphVersion: 'not-imported', eventRevision, source: 'local-osm' };
}
const LANDMARKS: Place[] = [
  { id: 'faisal-mosque', name: 'Faisal Mosque Road · approach', coordinate: [73.0376503, 33.7314163] },
  { id: 'pims', name: 'PIMS · Ibn-e-Sina Road approach', coordinate: [73.052076, 33.7060737] },
  { id: 'zero-point', name: 'Zero Point · Expressway approach', coordinate: [73.0690063, 33.6885463] },
  { id: 'aabpara', name: 'Aabpara Market · Municipal Road', coordinate: [73.0881746, 33.7101232] },
  { id: 'centaurus', name: 'Centaurus · Nazimuddin Road', coordinate: [73.0492744, 33.7081776] },
];
export function searchPlaces(query: string): Place[] {
  const q = query.trim().toLowerCase();
  const results = LANDMARKS.filter((place) => !q || place.name.toLowerCase().includes(q));
  if (q.length >= 2 && router) {
    const seen = new Set(results.map((p) => p.name.toLowerCase()));
    for (const edge of router.graph.edges) {
      const coordinate = router.graph.nodes[edge.from].coordinate, bounds = router.graph.bounds;
      if (coordinate[0] < bounds[0] || coordinate[0] > bounds[2] || coordinate[1] < bounds[1] || coordinate[1] > bounds[3]) continue;
      if (edge.name.toLowerCase().includes(q) && !seen.has(edge.name.toLowerCase())) {
        seen.add(edge.name.toLowerCase()); results.push({ id: `osm-way-${edge.wayId}`, name: edge.name, coordinate });
        if (results.length >= 12) break;
      }
    }
  }
  return results.slice(0, 12);
}
