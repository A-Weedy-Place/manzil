import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { addSuppliedRoadAnchors, buildBusRoadGraph, BusRoadMatcher, restoreSourceStops } from './lib/transitRoadAlignment';
import type { OsmDocument, RoutingGraph } from '../server/routing/graph';
import type { TransitDataset } from '../shared/transit';

// Development-only preprocessing. No account/GPS/database/API/routing at view time.
// First reproduce the existing reviewed base using scripts/import-transit.py.
const args = new Map<string,string>();
for(let index=2;index<process.argv.length;index+=2){const key=process.argv[index],value=process.argv[index+1];if(!key.startsWith('--')||!value||value.startsWith('--'))throw new Error('Use --option value pairs.');args.set(key,value);}
const input = args.get('--input') ?? '.local-tools/transit/road-alignment/base.json.gz';
const roadPath = args.get('--roads') ?? '.local-tools/transit/road-alignment/roads.json.gz';
const output = args.get('--output') ?? 'assets/transit/road-alignment.json.gz';
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const baseBytes = gunzipSync(await readFile(input)), base = JSON.parse(baseBytes.toString()) as TransitDataset;
const roadBytes = gunzipSync(await readFile(roadPath)), osm = JSON.parse(roadBytes.toString()) as OsmDocument;
const sourceMeta = JSON.parse(await readFile(roadPath.replace(/[^/\\]+$/, 'source.json'), 'utf8'));
if (hash(roadBytes) !== sourceMeta.normalizedRoadsSha256) throw new Error('Road input changed; review/re-extract the pinned public PBF.');
if(!/^[a-f0-9]{64}$/.test(sourceMeta.pbfSha256??'')||sourceMeta.nodes<10000||sourceMeta.ways<1000)throw new Error('A complete reviewed bounded public road extract is required; small fixtures are never runtime fallback data.');
const retrievedAt=args.get('--retrieved-at')??sourceMeta.retrievedAt;
if(typeof retrievedAt!=='string'||!Number.isFinite(Date.parse(retrievedAt)))throw new Error('Retain the actual public road-source retrieval timestamp.');
const sourceId = `osm-bus-road-alignment-${sourceMeta.sourceTimestamp.slice(0, 10)}`;
const bounds: RoutingGraph['bounds'] = sourceMeta.bounds;
const sparseSupplied=new Set(['z3t6g','rn4hb','hb2jn','wqwen','n95vp']);
const candidates = base.patterns.filter(pattern => pattern.geometryQuality === 'stops-only'||sparseSupplied.has(pattern.id));
if (candidates.length !== 49) throw new Error('Unexpected base coverage; review which source patterns need road alignment.');
const graph = buildBusRoadGraph(osm, bounds), lookup = new Map(base.stops.map(stop => [stop.id, stop]));
const expanded=new Map(candidates.map(pattern=>[pattern.id,addSuppliedRoadAnchors(pattern,lookup)]));
const stops=[...new Map([...expanded.values()].flatMap(value=>value.stops).map(stop=>[stop.id,stop])).values()];
const metroRoutes=new Set(base.routes.filter(route=>/^RLRT/.test(route.shortName)).map(route=>route.id));
const metroStops=new Set(candidates.filter(pattern=>metroRoutes.has(pattern.routeId)).flatMap(pattern=>expanded.get(pattern.id)!.pattern.stopIds));
const matcher = new BusRoadMatcher(graph, stops,metroStops), patterns = [], used = new Set<number>(), started = performance.now();
for (const pattern of candidates) {
  const anchors=expanded.get(pattern.id)!,result = matcher.align(anchors.pattern, new Map(stops.map(stop=>[stop.id,stop])), sourceId),restored=restoreSourceStops(pattern,result.pattern,anchors.originalStopIndexes,lookup); patterns.push(restored); result.usedEdges.forEach(index => used.add(index));
  console.log(`${pattern.id}: ${restored.roadSegments!.filter(Boolean).length}/${pattern.stopIds.length - 1} stop pairs; ${restored.roadAlignment!.unresolved.length} gaps`);
}
// A small OSM derivative retains only directed proof edges used by the estimate.
// It can validate each inferred subsegment in CI without shipping the full PBF.
const proofEdges = [...used].sort((a, b) => a - b).map(index => {
  const edge = matcher.graph.edges[index]; return { from: matcher.graph.nodes[edge.from].coordinate, to: matcher.graph.nodes[edge.to].coordinate, wayId: edge.wayId };
});
const source = { id: sourceId, name: 'OpenStreetMap bus-road alignment estimate', url: 'https://download.geofabrik.de/asia/pakistan.html', license: '© OpenStreetMap contributors, ODbL 1.0. Geometry estimates only; no operator route approval.', retrievedAt, limitations: ['Shortest mapped bus/PSV-access road paths through ordered published stops; actual operator streets and stop access can differ.', 'Directed topology, bus/PSV access and basic node turn restrictions are enforced; unsupported via-way restrictions and conditional access are conservatively excluded.', 'Only stops within 150 m of mapped supported roads are considered; no off-road stop-access connector is drawn.', 'Documented source gaps and unresolved bounded road connections remain excluded; no road path is invented across them.', 'This development-time derivative makes no public routing calls when a person opens Local.'] };
const unresolved = patterns.flatMap(pattern => pattern.roadAlignment!.unresolved.map(item => ({ patternId: pattern.id, ...item })));
const replacedIds=new Set(candidates.map(pattern=>pattern.id));
const preserved=base.patterns.filter(pattern=>!replacedIds.has(pattern.id)).map(pattern=>({patternId:pattern.id,sha256:hash(JSON.stringify(pattern))}));
const refinedSupplied=base.patterns.filter(pattern=>sparseSupplied.has(pattern.id));
const sourceStopCoordinateSha256=hash(JSON.stringify(base.stops.map(stop=>[stop.id,stop.coordinate])));
const originalGeometryLimitations=base.sources.map(source=>({sourceId:source.id,limitations:source.limitations}));
const sourceGapPairs=candidates.reduce((sum,pattern)=>sum+(pattern.breakAfterStopIndexes?.length??0),0);
const document = { baseVersion: base.version, baseNormalizedSha256: hash(baseBytes), sourceStopCoordinateSha256, originalGeometryLimitations,preserved, refinedSupplied, source, roadSource: sourceMeta, graphStats: { nodes: graph.nodes.length, directedEdges: graph.edges.length, restrictions: graph.restrictions.length, importStats: graph.importStats }, patterns, proofEdges, summary: { patterns: patterns.length, completePatterns: patterns.filter(pattern => !pattern.roadAlignment!.unresolved.length).length, refinedSuppliedPatterns:refinedSupplied.length,totalPairs:candidates.reduce((sum,pattern)=>sum+pattern.stopIds.length-1,0), alignedPairs: patterns.reduce((sum, pattern) => sum + pattern.roadSegments!.filter(Boolean).length, 0), unresolvedPairs: unresolved.length, sourceGapPairs, newlyUnresolvedPairs:unresolved.length-sourceGapPairs, proofEdges: proofEdges.length, preservedPatterns: base.patterns.length - patterns.length }, unresolved };
const encoded = JSON.stringify(document); await writeFile(output, gzipSync(encoded, { level: 9 }));
console.log(JSON.stringify({ ...document.summary, normalizedSha256: hash(encoded), output, elapsedSeconds: ((performance.now() - started) / 1000).toFixed(2) }, null, 2));
