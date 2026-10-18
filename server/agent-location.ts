import { drawingToPolygon, distanceMeters } from './geometry.js';
import { getRoutingGraph, searchPlaces } from './routing/index.js';
import { selectRoadBlockade, selectRoadPoint, selectRoadSection } from './routing/road-selection.js';
import { RoadCoverageProvider } from './routing/road-coverage.js';
import type { RoutingGraph } from './routing/graph.js';
import type { AgentExtraction } from '../shared/agent.js';
import type { Coordinate, Drawing, Place } from '../shared/types.js';
import { isInPakistan } from './routing/pakistan.js';

export const locationName = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export interface ResolvedAgentLocation { drawing: Drawing; geometry: ReturnType<typeof drawingToPolygon>; key: string; restrictionType?: 'road_closure' | 'blockade' }
const roadCoverage = new RoadCoverageProvider(getRoutingGraph);
/** Gemini supplies names, never trusted coordinates. Resolve against real mapped public roads. */
export async function resolveAgentLocation(event: AgentExtraction['events'][number], suppliedGraph?: RoutingGraph | null,
  places: (query: string) => Promise<Place[]> = searchPlaces,
  graphFor: (points: Coordinate[]) => Promise<RoutingGraph> = points => roadCoverage.graphFor(points)): Promise<ResolvedAgentLocation> {
  const { city, road, from, to, point } = event.location;
  if (!city || !road || /[,/]|\band\b/i.test(city)) throw new Error('Precise road mapping needs one city and a named road.');
  if (!(from && to) && !point) throw new Error('The notice needs two named road endpoints or a precise named blockade point.');
  const references = from && to ? [from, to] : [point!], located = new Map<string, Coordinate>();
  const lookup = async (name: string, requireCity: boolean): Promise<Coordinate> => {
    const query = `${name}, ${road}, ${city}, Pakistan`;
    if (query.length > 160) throw new Error('The location reference is too long to resolve.');
    const found = (await places(query)).filter(place => locationName(place.name.split(',')[0]).includes(locationName(name)) &&
      (!requireCity || place.name.split(',').slice(1).some(part => locationName(part).includes(locationName(city)))) && isInPakistan(place.coordinate));
    if (!found.length || found.some(place => distanceMeters(place.coordinate, found[0].coordinate) > 100)) throw new Error('Place lookup was unavailable or ambiguous; no road was guessed.');
    return found[0].coordinate;
  };
  // A supplied graph is an explicit already-scoped dependency (including tests).
  // Production names must first resolve within their stated city. Matching a
  // common road name against the bundled graph alone could select another city.
  let graph = suppliedGraph;
  if (!graph) {
    for (const name of references) located.set(name, await lookup(name, true));
    graph = await graphFor(references.map(name => located.get(name)!));
  }
  const roadKey = locationName(road), roadEdges = graph.edges.filter(edge => locationName(edge.name) === roadKey);
  if (!roadEdges.length) throw new Error('The source road could not be matched to mapped public roads.');
  const roadNodes = new Set(roadEdges.flatMap(edge => [edge.from, edge.to]));
  async function reference(name: string): Promise<Coordinate> {
    const cross = graph!.edges.filter(edge => locationName(edge.name) === locationName(name));
    const nodes = [...new Set(cross.flatMap(edge => [edge.from, edge.to]))].filter(node => roadNodes.has(node));
    const candidates: Coordinate[] = [];
    for (const node of nodes) {
      const coordinate = graph!.nodes[node].coordinate;
      if (!candidates.some(existing => distanceMeters(existing, coordinate) < 45)) candidates.push(coordinate);
    }
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) throw new Error('More than one intersection matches the source reference.');
    const coordinate = located.get(name) ?? await lookup(name, false), [lon, lat] = coordinate, bounds = graph!.bounds;
    if (lon < bounds[0] || lon > bounds[2] || lat < bounds[1] || lat > bounds[3]) throw new Error('The named place is outside the resolved road area; no road was guessed.');
    return coordinate;
  }
  let drawing: Drawing;
  if (event.restrictionType === 'blockade' && from && to || event.restrictionType === 'road_closure' && !(from && to)) throw new Error('Restriction type and source extent disagree; review the road extent.');
  if (from && to) {
    const section = selectRoadSection(graph, await reference(from), await reference(to));
    if (!section.roadNames.some(name => locationName(name) === roadKey)) throw new Error('Resolved endpoints do not identify the announced road.');
    drawing = section.drawing;
  } else if (point) {
    const coordinate = await reference(point);
    // Require a real nearby node of this named road, not a guessed latitude/longitude.
    const closest = [...roadNodes].map(node => graph!.nodes[node].coordinate).sort((a, b) => distanceMeters(a, coordinate) - distanceMeters(b, coordinate))[0];
    if (!closest || distanceMeters(closest, coordinate) > 45) throw new Error('The announced point is not close enough to a supported road node.');
    drawing = event.restrictionType === 'blockade' ? agentBlockade(graph, coordinate, roadKey) : { kind: 'point', coordinates: [closest], widthMeters: 14 };
  } else throw new Error('The notice needs two named road endpoints or a precise named blockade point.');
  const key = [locationName(city), roadKey, ...(from && to ? [locationName(from), locationName(to)].sort() : [locationName(point!)])].join(':');
  return { drawing, geometry: drawingToPolygon(drawing), key, ...(event.restrictionType ? { restrictionType: event.restrictionType } : {}) };
}

/** Derive a small transverse barrier only on a single, unambiguous carriageway.
 * Junctions/parallel carriageways need an administrator to choose the extent. */
export function agentBlockade(graph: RoutingGraph, point: Coordinate, roadKey: string): Drawing {
  const section = selectRoadPoint(graph, point), coords = section.drawing.coordinates;
  if (section.distanceMeters < 19 || section.roadNames.length !== 1 || locationName(section.roadNames[0]) !== roadKey) throw new Error('Blockade is too close to a junction or an ambiguous road.');
  const a = coords[0], b = coords.at(-1)!, scale = Math.cos(point[1] * Math.PI / 180);
  const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1], length = Math.hypot(dx, dy);
  if (!length) throw new Error('A unique road orientation is required.');
  const centre: Coordinate = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], half = 7 / 111320;
  const from: Coordinate = [centre[0] - dy / length * half / scale, centre[1] + dx / length * half];
  const to: Coordinate = [centre[0] + dy / length * half / scale, centre[1] - dx / length * half];
  const barrier = selectRoadBlockade(graph, from, to);
  if (barrier.roadNames.length !== 1 || locationName(barrier.roadNames[0]) !== roadKey) throw new Error('Barrier crosses multiple roads; select the affected carriageway.');
  // A nearby second carriageway/branch cannot silently be treated as blocked too.
  const nearby = graph.edges.filter(edge => {
    const start = graph.nodes[edge.from].coordinate, end = graph.nodes[edge.to].coordinate;
    const x = (end[0]-start[0])*scale, y=end[1]-start[1], denominator=x*x+y*y;
    const t=denominator?Math.max(0,Math.min(1,((centre[0]-start[0])*scale*x+(centre[1]-start[1])*y)/denominator)):0;
    const projected:Coordinate=[start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t];
    return distanceMeters(centre,projected)<18;
  });
  if (nearby.some(edge => locationName(edge.name) !== roadKey || !graph.edges.some(reverse => reverse.from === edge.to && reverse.to === edge.from && reverse.wayId === edge.wayId))) throw new Error('A junction or separate carriageway needs an explicit blockade review.');
  return barrier.drawing;
}
