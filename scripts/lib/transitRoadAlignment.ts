import { buildGraph, distanceMeters, type OsmDocument, type RoutingGraph, type GraphEdge, type TurnRule } from '../../server/routing/graph';
import type { Coordinate } from '../../shared/types';
import type { TransitPattern, TransitStop } from '../../shared/transit';
import type { LineString } from 'geojson';

const DENIED = new Set(['no', 'private', 'destination', 'delivery', 'customers', 'permit', 'agricultural', 'forestry']);
const ACCESS = ['bus', 'psv', 'motor_vehicle', 'vehicle', 'access'];
const EXTRA_ROADS = new Set(['busway', 'bus_guideway']);
/** Reuse the topology/restriction builder with BUS, never car, access priority. */
export function buildBusRoadGraph(osm: OsmDocument, bounds: RoutingGraph['bounds']): RoutingGraph & { buswayIds: string[] } {
  const elements = osm.elements.map(element => {
    const tags = { ...(element.tags ?? {}) };
    if (element.type === 'relation') {
      if ((tags.except ?? '').split(/[;,]/).some(value => ['bus', 'psv', 'motor_vehicle', 'vehicle'].includes(value.trim()))) tags.except = 'motorcar';
      else delete tags.except;
      const rule = tags['restriction:bus'] ?? tags['restriction:bus:conditional']?.split('@')[0].trim() ?? tags['restriction:psv'] ?? tags['restriction:psv:conditional']?.split('@')[0].trim() ?? tags['restriction:motor_vehicle'] ?? tags['restriction:motor_vehicle:conditional']?.split('@')[0].trim() ?? tags['restriction:vehicle'] ?? tags['restriction:vehicle:conditional']?.split('@')[0].trim() ?? tags.restriction ?? tags['restriction:conditional']?.split('@')[0].trim();
      delete tags['restriction:motorcar']; delete tags['restriction:motor_vehicle']; delete tags['restriction:conditional'];
      if (rule) tags.restriction = rule;
      return { ...element, tags };
    }
    const value = ACCESS.map(key => tags[key]).find(Boolean);
    const conditional = ACCESS.some(key => !!tags[`${key}:conditional`]) || ['oneway:bus:conditional', 'oneway:psv:conditional', 'oneway:motor_vehicle:conditional', 'oneway:conditional'].some(key => !!tags[key]);
    tags.motorcar = conditional || value && DENIED.has(value.toLowerCase()) ? 'no' : 'yes';
    if(element.type==='node'&&!value&&!conditional)delete tags.motorcar;
    delete tags['motorcar:conditional'];
    delete tags['oneway:motorcar:conditional'];
    // The graph's generic builder uses these translated bus-direction rules.
    tags['oneway:motorcar'] = tags['oneway:bus'] ?? tags['oneway:psv'] ?? tags['oneway:motor_vehicle'] ?? tags.oneway ?? '';
    if (EXTRA_ROADS.has(tags.highway)) tags.highway = 'service';
    return { ...element, tags };
  });
  const graph = buildGraph({ ...osm, elements }, bounds);
  graph.source = 'OpenStreetMap; static bus/PSV-access road alignment, not an operator route shape';
  return { ...graph, buswayIds:osm.elements.filter(element=>element.type==='way'&&EXTRA_ROADS.has(element.tags?.highway??'')).map(element=>String(element.id)) };
}

interface Snap { node: number; distance: number }
interface PhysicalSegment { a: number; b: number; edges: number[]; splits: { t: number; node: number }[] }
interface Path { edges: number[]; distance: number; last: number | null; geometry: LineString }
export interface RoadAnchorPattern { pattern: TransitPattern; stops: TransitStop[]; originalStopIndexes: number[] }
/** Keep intermediate supplied shape vertices as ordered constraints when a
 * sparse supplied trace needs road refinement. Source stops are not replaced. */
export function addSuppliedRoadAnchors(pattern:TransitPattern,stops:Map<string,TransitStop>):RoadAnchorPattern{
  const originalStopIndexes:number[]=[],expanded:TransitStop[]=[],ids:string[]=[],distances=pattern.stopDistancesMeters;
  const add=(stop:TransitStop)=>{ids.push(stop.id);expanded.push(stop);};
  const cumulative=[0];pattern.geometry.coordinates.slice(1).forEach((point,index)=>cumulative.push(cumulative.at(-1)!+distanceMeters(pattern.geometry.coordinates[index] as Coordinate,point as Coordinate)));
  for(let index=0;index<pattern.stopIds.length;index++){
    if(index&&pattern.geometryQuality==='provided-shape'&&distances?.length===pattern.stopIds.length&&!pattern.breakAfterStopIndexes?.includes(index-1)){
      for(let vertex=1;vertex<pattern.geometry.coordinates.length-1;vertex++)if(cumulative[vertex]>distances[index-1]+2&&cumulative[vertex]<distances[index]-2)add({id:`road-shape-anchor:${pattern.id}:${vertex}`,name:'Supplied route geometry anchor',coordinate:pattern.geometry.coordinates[vertex] as Coordinate});
    }
    originalStopIndexes.push(ids.length);add(stops.get(pattern.stopIds[index])!);
  }
  const breaks=(pattern.breakAfterStopIndexes??[]).map(index=>originalStopIndexes[index+1]-1);
  return{pattern:{...pattern,stopIds:ids,breakAfterStopIndexes:breaks},stops:expanded,originalStopIndexes};
}
function roadGroups(lines:(LineString|null)[]):LineString[]{
  const groups:LineString[]=[];let current:number[][]=[];
  const flush=()=>{if(current.length>=2)groups.push({type:'LineString',coordinates:current});current=[];};
  for(const line of lines){if(!line){flush();continue;}if(current.length&&distanceMeters(current.at(-1)! as Coordinate,line.coordinates[0] as Coordinate)>.1)flush();current.push(...(current.length?line.coordinates.slice(1):line.coordinates));}flush();return groups;
}
export function restoreSourceStops(original:TransitPattern,aligned:TransitPattern,indexes:number[],stops:Map<string,TransitStop>):TransitPattern{
  const segments:(LineString|null)[]=[],unresolved:{afterStopIndex:number;reason:string}[]=[],distances=[0],breaks:number[]=[];
  for(let index=0;index<indexes.length-1;index++){
    const parts=aligned.roadSegments!.slice(indexes[index],indexes[index+1]),groups=roadGroups(parts),gap=parts.some(line=>line===null)||groups.length!==1;
    const line=gap?null:groups[0];segments.push(line);
    distances.push(distances.at(-1)!+(line?line.coordinates.slice(1).reduce((sum,point,i)=>sum+distanceMeters(line.coordinates[i] as Coordinate,point as Coordinate),0):0));
    if(gap){breaks.push(index);const explanation=aligned.roadAlignment!.unresolved.find(item=>item.afterStopIndex>=indexes[index]&&item.afterStopIndex<indexes[index+1]);unresolved.push({afterStopIndex:index,reason:explanation?.reason??'Supplied anchors could not be connected by a bounded directed bus road path.'});}
  }
  const groups=roadGroups(segments),start=stops.get(original.stopIds[0])!.coordinate;
  return{...original,geometryQuality:'road-aligned-estimate',geometrySourceId:aligned.geometrySourceId,roadSegments:segments,geometrySegments:groups,geometry:groups[0]??{type:'LineString',coordinates:[start,start]},stopDistancesMeters:distances.map(value=>Math.round(value*100)/100),breakAfterStopIndexes:breaks,roadAlignment:{method:'ordered-bus-road-shortest-path',snapDistancesMeters:indexes.map(index=>aligned.roadAlignment!.snapDistancesMeters[index]),unresolved}};
}
class Heap {
  values: [number, number][] = [];
  push(item: [number, number]) { const a = this.values; a.push(item); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][1] <= item[1]) break; a[i] = a[p]; i = p; } a[i] = item; }
  pop() { const a = this.values; if (!a.length) return; const first = a[0], last = a.pop()!; if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let child = i * 2 + 1; if (child + 1 < a.length && a[child + 1][1] < a[child][1]) child++; if (last[1] <= a[child][1]) break; a[i] = a[child]; i = child; } a[i] = last; } return first; }
}

/** Development-only road matcher. Every output segment is an original directed
 * OSM road edge or a subdivision of one. Intersections never connect by pixels. */
export class BusRoadMatcher {
  graph: RoutingGraph;
  private segments = new Map<string, PhysicalSegment>();
  private grid = new Map<string, Set<string>>();
  private snaps = new Map<string, Snap[]>();
  private outgoing: number[][] = [];
  private rules = new Map<string, TurnRule[]>();
  private buswayIds:Set<string>;
  private preferBuswayStops:Set<string>;
  private graphSourceEdges:GraphEdge[];
  constructor(source: RoutingGraph & {buswayIds?:string[]}, stops: TransitStop[],preferBuswayStops=new Set<string>()) {
    this.buswayIds=new Set(source.buswayIds??[]);this.preferBuswayStops=preferBuswayStops;this.graphSourceEdges=source.edges;
    this.graph = { ...source, nodes: [...source.nodes], edges: [] };
    source.edges.forEach((edge, i) => {
      const key = [edge.from, edge.to].sort((a, b) => a - b).join(':');
      let segment = this.segments.get(key);
      if (!segment) {
        const [a, b] = [edge.from, edge.to].sort((x, y) => x - y);
        segment = { a, b, edges: [], splits: [{ t: 0, node: a }, { t: 1, node: b }] }; this.segments.set(key, segment);
        const p = source.nodes[a].coordinate, q = source.nodes[b].coordinate;
        for (let x = Math.floor(Math.min(p[0], q[0]) / .001); x <= Math.floor(Math.max(p[0], q[0]) / .001); x++) for (let y = Math.floor(Math.min(p[1], q[1]) / .001); y <= Math.floor(Math.max(p[1], q[1]) / .001); y++) {
          const cell = `${x}:${y}`; if (!this.grid.has(cell)) this.grid.set(cell, new Set()); this.grid.get(cell)!.add(key);
        }
      }
      segment.edges.push(i);
    });
    for (const stop of stops) this.snaps.set(stop.id, this.candidates(stop.coordinate,this.preferBuswayStops.has(stop.id)));
    for (const segment of this.segments.values()) {
      segment.splits.sort((a, b) => a.t - b.t);
      for (const index of segment.edges) {
        const original = source.edges[index], forward = original.from === segment.a, splits = forward ? segment.splits : [...segment.splits].reverse();
        for (let i = 1; i < splits.length; i++) {
          if (splits[i - 1].node === splits[i].node) continue;
          const distance = distanceMeters(this.graph.nodes[splits[i - 1].node].coordinate, this.graph.nodes[splits[i].node].coordinate);
          if (distance < .005) continue;
          this.graph.edges.push({ ...original, from: splits[i - 1].node, to: splits[i].node, distance, seconds: original.seconds * distance / original.distance });
        }
      }
    }
    this.outgoing = this.graph.nodes.map(() => []);
    this.graph.edges.forEach((edge, i) => this.outgoing[edge.from].push(i));
    for (const rule of source.restrictions) { const key = `${rule.via}:${rule.fromWay}`; this.rules.set(key, [...(this.rules.get(key) ?? []), rule]); }
  }
  private candidates(point: Coordinate,preferBusway=false): Snap[] {
    const nearby = new Set<string>(), x = Math.floor(point[0] / .001), y = Math.floor(point[1] / .001);
    for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 2; dy++) for (const key of this.grid.get(`${x + dx}:${y + dy}`) ?? []) nearby.add(key);
    const cosine = Math.cos(point[1] * Math.PI / 180);
    let projected = [...nearby].flatMap(key => {
      const segment = this.segments.get(key)!, a = this.graph.nodes[segment.a].coordinate, b = this.graph.nodes[segment.b].coordinate;
      const dx = (b[0] - a[0]) * cosine, dy = b[1] - a[1], length = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, length ? ((point[0] - a[0]) * cosine * dx + (point[1] - a[1]) * dy) / length : 0));
      const coordinate: Coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], distance = distanceMeters(point, coordinate);
      return distance <= 150 ? [{ segment, t, coordinate, distance }] : [];
    }).sort((a, b) => a.distance - b.distance);
    const isBusway=(item:typeof projected[number])=>item.segment.edges.some(index=>this.buswayIds.has(this.graphSourceEdges[index].wayId));
    if(preferBusway){const dedicated=projected.filter(isBusway);if(dedicated.length)projected=dedicated;}
    const best = projected[0]?.distance ?? Infinity, selected: Snap[] = [];
    let eligible=projected.filter(item=>item.distance<=best+30);
    // Public source EV/feeder stops can use the BRT station's median coordinate.
    // Keep adjacent mapped bus-permitted general carriageways as candidates,
    // rather than spending every slot on equivalent isolated BRT segments.
    if(!preferBusway&&projected[0]&&isBusway(projected[0])){
      const general=projected.filter(item=>!isBusway(item)),first=general[0];
      if(first){const ways=new Set(first.segment.edges.map(index=>this.graphSourceEdges[index].wayId)),other=general.find(item=>item!==first&&item.segment.edges.every(index=>!ways.has(this.graphSourceEdges[index].wayId)))??general.find(item=>item!==first);eligible=[projected[0],first,...(other?[other]:[]),...eligible.filter(item=>item!==projected[0]&&item!==first&&item!==other)];}
    }
    for (const item of eligible) {
      if (selected.length >= 3) break;
      const existing = item.segment.splits.find(split => distanceMeters(this.graph.nodes[split.node].coordinate, item.coordinate) < .1);
      const node = existing?.node ?? this.graph.nodes.length;
      if (!existing) { this.graph.nodes.push({ id: `transit-projection:${item.segment.a}:${item.segment.b}:${item.t}`, coordinate: item.coordinate }); item.segment.splits.push({ t: item.t, node }); }
      if (!selected.some(snap => snap.node === node)) selected.push({ node, distance: item.distance });
    }
    return selected;
  }
  private turnAllowed(incoming: GraphEdge | null, next: GraphEdge) {
    if (!incoming) return true;
    const rules = this.rules.get(`${next.from}:${incoming.wayId}`) ?? [], matches = (rule: TurnRule) => rule.toWay === next.wayId && (!rule.uTurn || next.to === incoming.from);
    return !rules.some(rule => !rule.only && matches(rule)) && (!rules.some(rule => rule.only) || rules.some(rule => rule.only && matches(rule)));
  }
  private path(origin: number, target: number, previous: number | null, maximum: number): Path | null {
    const edges = this.graph.edges, heap = new Heap(), initial = previous === null ? -1 : previous, costs = new Map<number, number>([[initial, 0]]), parents = new Map<number, number>();
    const h = (node: number) => distanceMeters(this.graph.nodes[node].coordinate, this.graph.nodes[target].coordinate);
    heap.push([initial, h(origin)]); let final: number | null = null, iterations = 0;
    while (heap.values.length) {
      const [state, estimated] = heap.pop()!, incoming = state === -1 ? null : edges[state], node = state === initial ? origin : incoming!.to, cost = costs.get(state)!;
      if (estimated > cost + h(node) + .001) continue;
      if (node === target) { final = state; break; }
      if (++iterations > 100000) return null;
      if (cost + h(node) > maximum) continue;
      for (const index of this.outgoing[node]) {
        const edge = edges[index]; if (!this.turnAllowed(incoming, edge)) continue;
        const next = cost + edge.distance + (incoming && edge.to === incoming.from ? 150 : 0);
        if (next >= (costs.get(index) ?? Infinity) || next + h(edge.to) > maximum) continue;
        costs.set(index, next); parents.set(index, state); heap.push([index, next + h(edge.to)]);
      }
    }
    if (final === null) return null;
    const indexes: number[] = []; for (let state = final; state !== initial; state = parents.get(state)!) indexes.push(state); indexes.reverse();
    const coordinates = [this.graph.nodes[origin].coordinate, ...indexes.map(index => this.graph.nodes[edges[index].to].coordinate)];
    if (coordinates.length < 2) coordinates.push([...coordinates[0]]);
    return { edges: indexes, distance: indexes.reduce((sum, index) => sum + edges[index].distance, 0), last: indexes.at(-1) ?? previous, geometry: { type: 'LineString', coordinates } };
  }
  align(pattern: TransitPattern, stops: Map<string, TransitStop>, sourceId: string): { pattern: TransitPattern; usedEdges: number[] } {
    type Choice = { cost: number; snap: Snap; previous: number | null; paths: (Path | null)[]; choices: (Snap | null)[] };
    let states: Choice[] = [], consumed = 0; const breaks = new Set(pattern.breakAfterStopIndexes ?? []), unresolved: { afterStopIndex: number; reason: string }[] = [];
    const settled: (Path | null)[] = [], chosen: (Snap | null)[] = [];
    const settle = () => { if (states.length) { const best = states.sort((a, b) => a.cost - b.cost)[0]; settled.push(...best.paths); chosen.push(...best.choices); } states = []; };
    for (let index = 0; index < pattern.stopIds.length; index++) {
      const candidates = this.snaps.get(pattern.stopIds[index]) ?? [];
      if (!index) { states = candidates.map(snap => ({ cost: snap.distance * 4, snap, previous: null, paths: [], choices: [snap] })); if (!states.length) chosen.push(null); continue; }
      const a = stops.get(pattern.stopIds[index - 1])!.coordinate, b = stops.get(pattern.stopIds[index])!.coordinate, direct = distanceMeters(a, b), next: Choice[] = [];
      if (!breaks.has(index - 1)) for (const target of candidates) {
        let best: Choice | undefined;
        for (const current of states) {
          const path = this.path(current.snap.node, target.node, current.previous, Math.max(700, direct * 3.5 + 300)); if (!path) continue;
          const cost = current.cost + path.distance + target.distance * 4;
          if (!best || cost < best.cost) best = { cost, snap: target, previous: path.last, paths: [...current.paths, path], choices: [...current.choices, target] };
        }
        if (best) next.push(best);
      }
      if (next.length) states = next;
      else {
        settle();
        // Settle tracks a complete prefix. A missing stop/road leg is never a chord.
        while (settled.length < index - 1) settled.push(null);
        settled.push(null); while (chosen.length < index) chosen.push(null);
        unresolved.push({ afterStopIndex: index - 1, reason: breaks.has(index - 1) ? 'Documented source gap; no road path inferred.' : !candidates.length ? 'Source stop is not within 150 m of a supported bus road.' : 'No bounded, direction/access/turn-valid bus road connection was resolved.' });
        breaks.add(index - 1); states = candidates.map(snap => ({ cost: snap.distance * 4, snap, previous: null, paths: [], choices: [snap] })); if (!states.length) chosen.push(null);
      }
      consumed = index;
    }
    settle();
    while (settled.length < consumed) settled.push(null);
    while (chosen.length < pattern.stopIds.length) chosen.push(null);
    const roadSegments = settled.map(path => path?.geometry ?? null), groups: LineString[] = []; let current: number[][] = [];
    const flush = () => { if (current.length >= 2) groups.push({ type: 'LineString', coordinates: current }); current = []; };
    roadSegments.forEach(line => { if (!line) { flush(); return; } if (current.length && distanceMeters(current.at(-1)! as Coordinate, line.coordinates[0] as Coordinate) > .1) flush(); current.push(...(current.length ? line.coordinates.slice(1) : line.coordinates)); }); flush();
    const distances = [0]; settled.forEach(path => distances.push(distances.at(-1)! + (path?.distance ?? 0)));
    // The representative geometry is one connected section, never a join across gaps.
    const representative = groups[0] ?? { type: 'LineString' as const, coordinates: [stops.get(pattern.stopIds[0])!.coordinate, stops.get(pattern.stopIds[0])!.coordinate] };
    return { pattern: { ...pattern, geometryQuality: 'road-aligned-estimate', geometrySourceId: sourceId, geometry: representative, geometrySegments: groups, roadSegments, breakAfterStopIndexes: [...breaks].sort((a, b) => a - b), stopDistancesMeters: distances.map(value => Math.round(value * 100) / 100), roadAlignment: { method: 'ordered-bus-road-shortest-path', snapDistancesMeters: chosen.map(snap => snap ? Math.round(snap.distance * 100) / 100 : null), unresolved } }, usedEdges: settled.flatMap(path => path?.edges ?? []) };
  }
}
