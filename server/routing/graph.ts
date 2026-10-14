import type { Coordinate } from '../../shared/types';

export interface OsmElement {
  type: 'node' | 'way' | 'relation'; id: number;
  lat?: number; lon?: number; nodes?: number[];
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role: string }[];
}
export interface OsmDocument { elements: OsmElement[]; osm3s?: { timestamp_osm_base?: string; copyright?: string } }
export interface GraphNode { id: string; coordinate: Coordinate }
export interface GraphEdge { from: number; to: number; wayId: string; name: string; distance: number; seconds: number }
export interface TurnRule { via: number; fromWay: string; toWay: string; only: boolean; uTurn: boolean }
export interface RoutingGraph {
  version: string; importedAt: string; sourceTimestamp: string | null;
  bounds: [number, number, number, number]; attribution: string; source: string;
  nodes: GraphNode[]; edges: GraphEdge[]; restrictions: TurnRule[];
  importStats: { sourceWays: number; acceptedWays: number; excludedConditionalWays: number; unsupportedRestrictions: number; blockedViaWays: number };
}

export const DEFAULT_BOUNDS: RoutingGraph['bounds'] = [72.87, 33.53, 73.25, 33.80];
const SPEEDS: Record<string, number> = {
  motorway: 70, motorway_link: 35, trunk: 55, trunk_link: 30, primary: 42, primary_link: 28,
  secondary: 35, secondary_link: 25, tertiary: 30, tertiary_link: 22,
  unclassified: 25, residential: 22, service: 12, living_street: 10,
};
const DENIED = new Set(['no', 'private', 'destination', 'delivery', 'customers', 'permit', 'agricultural', 'forestry']);
const ACCESS_KEYS = ['motorcar', 'motor_vehicle', 'vehicle', 'access'];

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function allowedAccess(tags: Record<string, string>): boolean {
  for (const key of ACCESS_KEYS) {
    if (tags[key]) return !DENIED.has(tags[key].toLowerCase());
  }
  return true;
}
export function isDrivableWay(tags: Record<string, string>): boolean {
  const direction = tags['oneway:motorcar'] ?? tags['oneway:motor_vehicle'] ?? tags.oneway;
  return !!SPEEDS[tags.highway] && allowedAccess(tags)
    && !['construction', 'proposed', 'abandoned', 'razed'].includes(tags.highway)
    && !ACCESS_KEYS.some((key) => !!tags[`${key}:conditional`])
    && !['oneway:conditional', 'oneway:motorcar:conditional', 'oneway:motor_vehicle:conditional'].some((key) => !!tags[key])
    && (!direction || ['yes', 'true', '1', '-1', 'no', 'false', '0'].includes(direction))
    && tags.area !== 'yes';
}
function waySpeed(tags: Record<string, string>): number {
  let speed = SPEEDS[tags.highway];
  const posted = Number.parseFloat(tags.maxspeed ?? '');
  if (Number.isFinite(posted) && posted > 0) speed = Math.min(speed, posted * (/mph/i.test(tags.maxspeed) ? 1.609344 : 1));
  if (['unpaved', 'gravel', 'dirt', 'ground', 'sand', 'mud'].includes(tags.surface)) speed = Math.min(speed, 15);
  return Math.max(5, speed);
}
function nodeBlocked(tags: Record<string, string>): boolean {
  if (!allowedAccess(tags)) return true;
  if (!tags.barrier || ['no', 'entrance', 'toll_booth', 'cattle_grid'].includes(tags.barrier)) return false;
  return !ACCESS_KEYS.some((key) => ['yes', 'permissive', 'designated'].includes(tags[key]));
}

/** Build a connected topology from original OSM node references, never geometric crossings. */
export function buildGraph(osm: OsmDocument, bounds = DEFAULT_BOUNDS): RoutingGraph {
  const sourceNodes = new Map(osm.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
  const sourceWays = osm.elements.filter((e) => e.type === 'way');
  const sourceRestrictions = osm.elements.filter((e) => e.type === 'relation' && e.tags?.type === 'restriction');
  const blockedWays = new Set<number>();
  let unsupportedRestrictions = 0;
  const rawRules: { via: number; fromWay: string; toWay: string; only: boolean; uTurn: boolean }[] = [];
  for (const relation of sourceRestrictions) {
    const tags = relation.tags ?? {};
    if ((tags.except ?? '').split(/[;,]/).some((x) => ['motorcar', 'motor_vehicle', 'vehicle'].includes(x.trim()))) continue;
    const rule = tags['restriction:motorcar'] ?? tags['restriction:motor_vehicle'] ?? tags.restriction ?? tags['restriction:conditional']?.split('@')[0].trim();
    const from = relation.members?.filter((m) => m.role === 'from' && m.type === 'way') ?? [];
    const to = relation.members?.filter((m) => m.role === 'to' && m.type === 'way') ?? [];
    const via = relation.members?.filter((m) => m.role === 'via') ?? [];
    if (!rule || !/^(no_|only_)/.test(rule)) continue;
    if (via.length !== 1 || via[0].type !== 'node' || !from.length || !to.length) {
      unsupportedRestrictions++;
      // Conservative: exclude via ways, rather than silently permit a prohibited turn sequence.
      for (const member of via) if (member.type === 'way') blockedWays.add(member.ref);
      continue;
    }
    for (const a of from) for (const b of to) rawRules.push({ via: via[0].ref, fromWay: String(a.ref), toWay: String(b.ref), only: rule.startsWith('only_'), uTurn: rule.endsWith('u_turn') });
  }
  const nodes: GraphNode[] = [], edges: GraphEdge[] = [];
  const nodeIndex = new Map<number, number>();
  const addNode = (id: number): number | null => {
    if (nodeIndex.has(id)) return nodeIndex.get(id)!;
    const n = sourceNodes.get(id);
    if (!n || !Number.isFinite(n.lon) || !Number.isFinite(n.lat)) return null;
    const index = nodes.length;
    nodeIndex.set(id, index);
    nodes.push({ id: String(id), coordinate: [n.lon!, n.lat!] });
    return index;
  };
  let acceptedWays = 0, excludedConditionalWays = 0;
  for (const way of sourceWays) {
    const tags = way.tags ?? {};
    if (ACCESS_KEYS.some((key) => !!tags[`${key}:conditional`]) || tags['oneway:conditional']) excludedConditionalWays++;
    if (!isDrivableWay(tags) || blockedWays.has(way.id) || !way.nodes) continue;
    acceptedWays++;
    const direction = tags['oneway:motorcar'] ?? tags['oneway:motor_vehicle'] ?? tags.oneway;
    const reverseOnly = direction === '-1';
    const oneWay = reverseOnly || ['yes', 'true', '1'].includes(direction) || (!['no', 'false', '0'].includes(direction) && (['roundabout', 'circular'].includes(tags.junction) || tags.highway === 'motorway'));
    const name = tags['name:en'] || tags.name || tags.ref || `${tags.highway.replaceAll('_', ' ')} road`;
    for (let i = 1; i < way.nodes.length; i++) {
      const first = sourceNodes.get(way.nodes[i - 1]), second = sourceNodes.get(way.nodes[i]);
      if (!first || !second || nodeBlocked(first.tags ?? {}) || nodeBlocked(second.tags ?? {})) continue;
      const a = addNode(first.id), b = addNode(second.id);
      if (a === null || b === null || a === b) continue;
      const distance = distanceMeters(nodes[a].coordinate, nodes[b].coordinate);
      if (distance < .05) continue;
      const edge = { from: a, to: b, wayId: String(way.id), name, distance, seconds: Math.max(.1, distance / (waySpeed(tags) / 3.6)) };
      if (!reverseOnly) edges.push(edge);
      if (!oneWay || reverseOnly) edges.push({ ...edge, from: b, to: a });
    }
  }
  const restrictions = rawRules.flatMap((r) => nodeIndex.has(r.via) ? [{ ...r, via: nodeIndex.get(r.via)! }] : []);
  const importedAt = new Date().toISOString();
  return {
    version: `osm-islamabad-${osm.osm3s?.timestamp_osm_base ?? importedAt}-v1`, importedAt,
    sourceTimestamp: osm.osm3s?.timestamp_osm_base ?? null, bounds,
    source: 'OpenStreetMap via Overpass; locally imported directed car graph',
    attribution: '© OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright',
    nodes, edges, restrictions,
    importStats: { sourceWays: sourceWays.length, acceptedWays, excludedConditionalWays, unsupportedRestrictions, blockedViaWays: blockedWays.size },
  };
}
