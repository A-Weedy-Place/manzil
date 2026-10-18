import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import booleanIntersects from '@turf/boolean-intersects';
import { getRoutingGraph } from '../server/routing';
import { LocalRouter } from '../server/routing/engine';
import { activeClosureRoads } from '../server/routing/closure-segments';
import { drawingToPolygon } from '../server/geometry';
import type { OsmDocument } from '../server/routing/graph';
import { streetRouteDemo } from '../server/street-demo';
import type { Closure, Coordinate } from '../shared/types';

// Reproducible public-data illustration only: no account, database, GPS or network access.
// Run: node node_modules/tsx/dist/cli.mjs scripts/generate-entry-preview.ts
const graph = getRoutingGraph();
if (!graph) throw new Error('Import the bundled Islamabad road graph before generating the preview.');
const source = JSON.parse(gunzipSync(await readFile(new URL('../assets/routing/osm-islamabad.json.gz', import.meta.url))).toString()) as OsmDocument;
const at = '2026-10-18T08:00:00.000Z';
const demo = streetRouteDemo(graph, at);
const drawing = { ...demo.closure.drawing!, widthMeters: 120 };
const closure: Closure = { ...demo.closure, drawing, geometry: drawingToPolygon(drawing), id: 'entry-preview-simulated-park-road', revision: 1, createdAt: at, updatedAt: at };
const plan = new LocalRouter(graph).plan({ origin: demo.destination, destination: demo.origin, departureAt: at, compareDepartures: false }, [closure], 1);
const route = plan.options[0];
if (!route || route.kind !== 'detour' || !plan.baseline || !plan.conflicts.length || booleanIntersects(route.geometry, closure.geometry)) throw new Error('The preview needs an actual clear, road-connected detour around its simulated closure.');
const directedEdges = new Set(graph.edges.map(edge => `${graph.nodes[edge.from].coordinate}|${graph.nodes[edge.to].coordinate}`));
for (let i = 1; i < route.geometry.coordinates.length; i++) {
  if (!directedEdges.has(`${route.geometry.coordinates[i - 1]}|${route.geometry.coordinates[i]}`)) throw new Error('A preview route segment is not a real directed road edge.');
}

const width = 700, height = 900;
const center: Coordinate = [73.0348, 33.7120];
const scale = .52, rotation = -28 * Math.PI / 180;
type Point = [number, number];
// All base roads, routed segments, clipped closure sections and pins share this projection.
// Rotated local equirectangular metres preserve the neighbourhood's actual street geometry.
const project = ([lon, lat]: number[]): Point => {
  const x = (lon - center[0]) * 111195 * Math.cos(center[1] * Math.PI / 180), y = (center[1] - lat) * 111195;
  return [width / 2 + scale * (x * Math.cos(rotation) - y * Math.sin(rotation)), height / 2 + scale * (x * Math.sin(rotation) + y * Math.cos(rotation))];
};
const format = (value: number) => value.toFixed(2);
const path = (coordinates: number[][]) => coordinates.map((coordinate, index) => `${index ? 'L' : 'M'}${project(coordinate).map(format).join(' ')}`).join('');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const inFrame = ([x, y]: Point, inset = 0) => x >= inset && x <= width - inset && y >= inset && y <= height - inset;
const nodes = new Map(source.elements.filter(item => item.type === 'node').map(item => [item.id, item]));
const roadClasses = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'service', 'living_street', 'footway', 'pedestrian', 'path', 'cycleway', 'steps']);
const roads = source.elements.filter(item => item.type === 'way' && roadClasses.has(item.tags?.highway ?? '') && item.nodes?.length).map(way => {
  const coordinates = way.nodes!.map(id => nodes.get(id)).filter(node => node?.lon !== undefined && node.lat !== undefined).map(node => [node!.lon!, node!.lat!]);
  return { way, coordinates, points: coordinates.map(project) };
}).filter(road => road.points.some(point => inFrame(point, -100)));
// Check the displayed basemap as well as the router graph: a stale or mismatched
// raw OSM asset must never leave a valid graph route floating off its drawn road.
const displayedSegments = new Set<string>();
for (const { coordinates } of roads) for (let i = 1; i < coordinates.length; i++) {
  displayedSegments.add(`${coordinates[i - 1]}|${coordinates[i]}`);
  displayedSegments.add(`${coordinates[i]}|${coordinates[i - 1]}`);
}
for (let i = 1; i < route.geometry.coordinates.length; i++) {
  if (!displayedSegments.has(`${route.geometry.coordinates[i - 1]}|${route.geometry.coordinates[i]}`)) throw new Error('A preview route segment is missing from the displayed OSM streets.');
}
const major = (highway: string) => /^(motorway|trunk|primary|secondary|tertiary)/.test(highway);
const localRoads = roads.filter(road => !major(road.way.tags!.highway));
const mainRoads = roads.filter(road => major(road.way.tags!.highway));
const renderRoads = (collection: typeof roads, casing: boolean) => collection.map(({ way, coordinates }) => {
  const highway = way.tags!.highway, arterial = major(highway), walking = ['footway', 'path', 'cycleway', 'steps', 'pedestrian'].includes(highway);
  const stroke = arterial ? casing ? '#d3ae72' : '#f2d59a' : walking ? '#d3d7ce' : casing ? '#d8ddd3' : '#fffefa';
  const roadWidth = arterial ? casing ? 15 : 11 : walking ? 1.5 : casing ? 7 : 4.5;
  return `<path d="${path(coordinates)}" stroke="${stroke}" stroke-width="${roadWidth}"${walking ? ' stroke-dasharray="2 4"' : ''}/>`;
}).join('\n');

const routePoints = route.geometry.coordinates.map(project);
const pointToSegment = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const labelCandidates = new Map<string, { a: Point; b: Point; length: number }>();
for (const road of roads) {
  const name = road.way.tags?.['name:en'] || road.way.tags?.name;
  if (!name || !/^[\x20-\x7E]+$/.test(name) || name.length > 28) continue;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < Math.max(62, name.length * 6.3) || !inFrame(middle, 62) || routePoints.slice(1).some((point, index) => pointToSegment(middle, routePoints[index], point) < 24)) continue;
    if (length > (labelCandidates.get(name)?.length ?? 0)) labelCandidates.set(name, { a, b, length });
  }
}
const labels = [...labelCandidates].sort((a, b) => b[1].length - a[1].length).slice(0, 17).map(([name, { a, b }]) => {
  const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
  let angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  if (angle > 90) angle -= 180; if (angle < -90) angle += 180;
  return `<text x="${format(x)}" y="${format(y - 8)}" transform="rotate(${format(angle)} ${format(x)} ${format(y)})">${escape(name)}</text>`;
}).join('\n');
const closedRoads = activeClosureRoads(graph, [closure], at).features;
if (!closedRoads.length) throw new Error('The preview closure did not resolve to actual road sections.');
const closedPaths = closedRoads.map(feature => path(feature.geometry.coordinates));
const [closureX, closureY] = project(drawing.coordinates[0]);
const marker = (coordinate: number[], letter: string, color: string) => {
  const [x, y] = project(coordinate);
  if (!inFrame([x, y], 80)) throw new Error('Keep route endpoints inset for responsive image cropping.');
  return `<g transform="translate(${format(x)} ${format(y)})" filter="url(#pin-shadow)"><circle r="25" fill="#fff"/><circle r="20" fill="${color}"/><text y="7" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="21" font-weight="700">${letter}</text></g>`;
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">
  <title>Islamabad Park Road: an actual road-aligned route preview</title>
  <desc>Real OpenStreetMap streets from the bundled 14 October 2026 Islamabad snapshot. Blue follows the local router's connected public-road detour through Street 21, Street 25 and Street 20. Red is an invented 120-metre-wide Park Road test closure, not a current traffic advisory. All roads, route, closure clips and endpoints use one shared geographic projection.</desc>
  <metadata>${escape(JSON.stringify({ source: 'OpenStreetMap via bundled Overpass snapshot', sourceTimestamp: graph.sourceTimestamp, attribution: graph.attribution, projection: 'Local equirectangular metres; -28 degree display rotation; uniform scale', graphVersion: graph.version, closure: 'Synthetic illustration only; not a live road closure', route: { origin: route.snappedOrigin, destination: route.snappedDestination, distanceMeters: route.distanceMeters, roads: route.steps.map(step => step.roadName) }, generatedBy: 'scripts/generate-entry-preview.ts', license: 'OSM-derived produced work; underlying data ODbL 1.0' }))}</metadata>
  <defs><filter id="pin-shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#183c45" flood-opacity=".18"/></filter></defs>
  <path fill="#f4f4e7" d="M0 0H${width}V${height}H0z"/>
  <g stroke-linecap="round" stroke-linejoin="round">${renderRoads(localRoads, true)}\n${renderRoads(localRoads, false)}\n${renderRoads(mainRoads, true)}\n${renderRoads(mainRoads, false)}</g>
  <g fill="#65736e" font-family="Arial,sans-serif" font-size="12" text-anchor="middle" paint-order="stroke" stroke="#f4f4e7" stroke-width="3" stroke-linejoin="round">${labels}</g>
  <g stroke-linecap="round" stroke-linejoin="round">
    ${closedPaths.map(d => `<path d="${d}" stroke="#fff" stroke-width="17"/>`).join('')}
    ${closedPaths.map(d => `<path d="${d}" stroke="#ff244b" stroke-width="11"/>`).join('')}
    <path d="${path(route.geometry.coordinates)}" stroke="#fff" stroke-width="18"/>
    <path d="${path(route.geometry.coordinates)}" stroke="#2467ed" stroke-width="11"/>
  </g>
  <g transform="translate(${format(closureX)} ${format(closureY)})" filter="url(#pin-shadow)"><circle r="18" fill="#fff"/><circle r="14" fill="#ff244b"/><path d="M-6 0H6" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/></g>
  ${marker(route.snappedOrigin, 'A', '#2467ed')}
  ${marker(route.snappedDestination, 'B', '#08775e')}
</svg>\n`;
await writeFile(new URL('../public/manzil-route-preview.svg', import.meta.url), svg);
console.log(JSON.stringify({ output: 'public/manzil-route-preview.svg', roadWays: roads.length, routeSegments: route.geometry.coordinates.length - 1, closedSections: closedRoads.length, routeMeters: Math.round(route.distanceMeters), roads: route.steps.map(step => step.roadName), sourceTimestamp: graph.sourceTimestamp }, null, 2));
