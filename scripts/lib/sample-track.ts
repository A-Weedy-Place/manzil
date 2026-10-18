import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Coordinate, RecordedPoint } from '../../shared/types.js';
import { summarizeTrace, distanceMeters } from '../../server/geometry.js';
import { LocalRouter } from '../../server/routing/engine.js';
import type { RoutingGraph } from '../../server/routing/graph.js';

// These are public landmarks, not a person's captured locations. Paths are
// calculated from the bundled public OSM graph when the local seed is invoked.
const landmarks = [
  { name: 'F-8', coordinate: [73.0255, 33.7088] as Coordinate },
  { name: 'Blue Area', coordinate: [73.0678, 33.7204] as Coordinate },
  { name: 'Faisal Mosque', coordinate: [73.0376503, 33.7314163] as Coordinate },
  { name: 'Aabpara', coordinate: [73.0881746, 33.7101232] as Coordinate },
  { name: 'PIMS', coordinate: [73.052076, 33.7060737] as Coordinate },
  { name: 'Zero Point', coordinate: [73.0690063, 33.6885463] as Coordinate },
];
let templates: { name: string; coordinates: Coordinate[] }[] | undefined;
function routeTemplates() {
  if (templates) return templates;
  const graph = JSON.parse(gunzipSync(readFileSync(new URL('../../assets/routing/islamabad.json.gz', import.meta.url))).toString()) as RoutingGraph;
  const router = new LocalRouter(graph);
  templates = Array.from({ length: 6 }, (_, index) => {
    const pair = Math.floor(index / 2) * 2, reverse = index % 2;
    const origin = landmarks[pair + reverse], destination = landmarks[pair + 1 - reverse];
    const result = router.plan({ origin, destination, departureAt: '2026-10-01T03:20:00.000Z' }, [], 0);
    if (!result.baseline || result.baseline.geometry.coordinates.length < 2)
      throw new Error('The local OSM sample route is unavailable; fictional traces were not seeded.');
    return { name: `${origin.name} → ${destination.name}`, coordinates: result.baseline.geometry.coordinates as Coordinate[] };
  });
  return templates;
}

/** Deterministic simulation, never live GPS. No trace arrays are kept in Git. */
export function simulatedSampleTrack(index: number, startedAt: number, durationSeconds: number) {
  if (!Number.isInteger(index) || index < 0 || !Number.isFinite(startedAt) || !Number.isFinite(durationSeconds) || durationSeconds < 1)
    throw new Error('Invalid simulated trip input.');
  const template = routeTemplates()[index % 6];
  // During the first few minutes of a month, keep the abbreviated preview at a
  // plausible speed instead of squeezing a whole city journey into two minutes.
  const route: Coordinate[] = [[...template.coordinates[0]]];
  let length = 0, shortened = false;
  for (let point = 1; point < template.coordinates.length; point++) {
    const a = template.coordinates[point - 1], b = template.coordinates[point], segment = distanceMeters(a, b);
    if (segment < .05) continue;
    const remaining = durationSeconds * 15 - length;
    if (segment > remaining) {
      const fraction = remaining / segment;
      route.push([a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]);
      length += remaining; shortened = true; break;
    }
    route.push([...b]); length += segment;
  }
  if (length < 1) throw new Error('The simulated route has no usable length.');
  const coordinates: Coordinate[] = [route[0]], progress: number[] = [0];
  const spacing = Math.min(60, length * 20 / durationSeconds);
  let travelled = 0;
  for (let point = 1; point < route.length; point++) {
    const a = route[point - 1], b = route[point], segment = distanceMeters(a, b), count = Math.max(1, Math.ceil(segment / spacing));
    for (let part = 1; part <= count; part++) {
      const fraction = part / count;
      coordinates.push([a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]);
      progress.push(travelled + segment * fraction);
    }
    travelled += segment;
  }
  const points: RecordedPoint[] = coordinates.map((coordinate, point) => ({ coordinate,
    timestamp: new Date(startedAt + durationSeconds * 1000 * progress[point] / length).toISOString(), accuracy: 12 }));
  return { name: shortened ? `${template.name.split(' → ')[0]} local journey` : template.name, points, pointCount: points.length, ...summarizeTrace(points) };
}
