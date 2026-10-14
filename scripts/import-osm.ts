import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildGraph, DEFAULT_BOUNDS, type OsmDocument } from '../server/routing/graph';

const directory = fileURLToPath(new URL('../assets/routing/', import.meta.url));
await mkdir(directory, { recursive: true });
let osm: OsmDocument;
try { osm = JSON.parse(gunzipSync(await readFile(`${directory}/osm-islamabad.json.gz`)).toString()) as OsmDocument; }
catch {
  const [west, south, east, north] = DEFAULT_BOUNDS;
  const query = `[out:json][timeout:55];way[highway](${south},${west},${north},${east})->.roads;(relation(bw.roads)[type=restriction];.roads;);(._;>>;);out body;`;
  const errors: string[] = [];
  let downloaded: OsmDocument | undefined;
  for (const endpoint of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const response = await fetch(endpoint, { method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(65000), headers: { 'User-Agent': 'Manzil prototype OSM road import (https://www.openstreetmap.org/copyright)' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const document = await response.json() as OsmDocument;
      if (!document.elements?.some((e) => e.type === 'way')) throw new Error('No road ways returned.');
      downloaded = document;
      await writeFile(`${directory}/osm-islamabad.json.gz`, gzipSync(JSON.stringify(document)));
      break;
    } catch (error) { errors.push(`${endpoint}: ${String(error)}`); }
  }
  if (!downloaded) throw new Error(`Real OSM download failed; no synthetic fallback. ${errors.join('; ')}`);
  osm = downloaded;
}
let bounds = DEFAULT_BOUNDS;
try {
  const metadata = JSON.parse(await readFile(`${directory}/osm-source.json`, 'utf8')) as { bounds?: typeof DEFAULT_BOUNDS };
  if (metadata.bounds?.length === 4) bounds = metadata.bounds;
} catch { /* The default import query uses DEFAULT_BOUNDS. */ }
const graph = buildGraph(osm, bounds);
if (graph.edges.length < 1000 || graph.nodes.length < 500) throw new Error('Downloaded graph is unexpectedly small; refusing to overwrite the city asset.');
await writeFile(`${directory}/islamabad.json.gz`, gzipSync(JSON.stringify(graph), { level: 9 }));
console.log(JSON.stringify({ version: graph.version, nodes: graph.nodes.length, directedEdges: graph.edges.length, turnRestrictions: graph.restrictions.length, stats: graph.importStats, attribution: graph.attribution }, null, 2));
