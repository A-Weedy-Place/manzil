import type { Coordinate, RoutePath } from '../../shared/types';
import type { GraphEdge, RoutingGraph } from './graph';

export interface Candidate { path: RoutePath; edges: { index: number; start: number; finish: number }[] }
export function segmentKey(edge: GraphEdge): string { return edge.from < edge.to ? `${edge.from}:${edge.to}` : `${edge.to}:${edge.from}`; }
export function segmentIndex(graph: RoutingGraph): Map<string, number[]> {
  const index = new Map<string, number[]>();
  graph.edges.forEach((edge, i) => { const key = segmentKey(edge), values = index.get(key) ?? []; values.push(i); index.set(key, values); });
  return index;
}

/** Search penalties select different paths; they must never enter displayed travel durations. */
export function alternativeConstraints(graph: RoutingGraph, segments: Map<string, number[]>, accepted: Candidate[], attempt: number): { excluded: Set<number>; penalties: Map<number, number> } {
  const excluded = new Set<number>(), penalties = new Map<number, number>();
  const penalize = (candidate: Candidate, extra: number) => {
    const padding = Math.min(120, candidate.path.distanceMeters * .08);
    let distance = 0;
    for (const entry of candidate.edges) {
      const edge = graph.edges[entry.index];
      const midpoint = distance + edge.distance / 2; distance += edge.distance;
      if (midpoint < padding || midpoint > candidate.path.distanceMeters - padding) continue;
      for (const index of segments.get(segmentKey(edge)) ?? []) penalties.set(index, Math.max(penalties.get(index) ?? 0, extra));
    }
  };
  const avoidWindow = (candidate: Candidate, start: number, end: number) => {
    let distance = 0;
    for (const entry of candidate.edges) {
      const edge = graph.edges[entry.index], midpoint = distance + edge.distance / 2;
      distance += edge.distance;
      if (midpoint < candidate.path.distanceMeters * start || midpoint > candidate.path.distanceMeters * end) continue;
      for (const index of segments.get(segmentKey(edge)) ?? []) excluded.add(index);
    }
  };
  if (attempt === 0 || attempt === 1 || attempt === 5 || attempt === 7) {
    const extra = attempt === 0 ? 1.8 : attempt === 1 ? 3 : attempt === 5 ? 7 : 12;
    accepted.forEach((candidate) => penalize(candidate, extra));
  } else {
    const windows = attempt === 2 ? [.3, .65] : attempt === 3 ? [.18, .42] : attempt === 4 ? [.58, .82] : [.25, .7];
    avoidWindow(attempt === 6 ? accepted[accepted.length - 1] : accepted[0], windows[0], windows[1]);
    if (attempt === 6) penalize(accepted[0], 3);
  }
  return { excluded, penalties };
}

function squaredPointSegmentDistance(p: Coordinate, a: number[], b: number[]): number {
  const xScale = 111320 * Math.cos(p[1] * Math.PI / 180), yScale = 111320;
  const ax = (a[0] - p[0]) * xScale, ay = (a[1] - p[1]) * yScale;
  const bx = (b[0] - p[0]) * xScale, by = (b[1] - p[1]) * yScale;
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
  return (ax + t * dx) ** 2 + (ay + t * dy) ** 2;
}

export function isDistinctUsefulCandidate(graph: RoutingGraph, candidate: Candidate, accepted: Candidate[], deadline = Infinity): boolean {
  const primary = accepted[0];
  if (!candidate.edges.length || candidate.path.durationSeconds > primary.path.durationSeconds * 1.5 + 60 || candidate.path.distanceMeters > primary.path.distanceMeters * 1.65 + 250) return false;
  // Reject loops within a leg. Ordered stops may legitimately require revisiting
  // a road/node on another leg (for example, collect someone then return home).
  // A global visited set incorrectly discarded every alternative for those trips.
  const visited = new Set<number>([graph.edges[candidate.edges[0].index].from]);
  const stops = candidate.path.snappedWaypoints ?? [];
  let stop = 0;
  const reached = (node: number) => {
    const coordinate = graph.nodes[node].coordinate;
    let advanced = false;
    while (stop < stops.length && coordinate[0] === stops[stop][0] && coordinate[1] === stops[stop][1]) { stop++; advanced = true; }
    if (advanced) { visited.clear(); visited.add(node); }
  };
  reached(graph.edges[candidate.edges[0].index].from);
  for (const entry of candidate.edges) { const node = graph.edges[entry.index].to; if (visited.has(node)) return false; visited.add(node); reached(node); }
  for (const reference of accepted) {
    const referenceSegments = new Set(reference.edges.map((entry) => segmentKey(graph.edges[entry.index])));
    const minimumLength = Math.min(reference.path.distanceMeters, candidate.path.distanceMeters);
    const shared = candidate.edges.reduce((sum, entry) => sum + (referenceSegments.has(segmentKey(graph.edges[entry.index])) ? graph.edges[entry.index].distance : 0), 0);
    if (shared > minimumLength * .82) return false;
    let farDistance = 0;
    const line = reference.path.geometry.coordinates;
    for (let i = 0; i < candidate.edges.length; i++) {
      if (i % 64 === 0 && performance.now() > deadline) return false;
      const edge = graph.edges[candidate.edges[i].index];
      const a = graph.nodes[edge.from].coordinate, b = graph.nodes[edge.to].coordinate;
      const midpoint: Coordinate = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let near = false;
      for (let j = 1; j < line.length; j++) if (squaredPointSegmentDistance(midpoint, line[j - 1], line[j]) < 80 ** 2) { near = true; break; }
      if (!near) farDistance += edge.distance;
    }
    // Require meaningful physical separation too: parallel carriageways and tiny local deviations are not distinct routes.
    if (farDistance < Math.max(120, minimumLength * .12)) return false;
  }
  return true;
}

export function alternativeLabel(graph: RoutingGraph, candidate: Candidate, primary: Candidate, number: number): string {
  const used = new Set(primary.edges.map((entry) => segmentKey(graph.edges[entry.index])));
  const names = new Map<string, number>();
  for (const entry of candidate.edges) {
    const edge = graph.edges[entry.index];
    if (!used.has(segmentKey(edge)) && !/^(residential|service|unclassified|living street|primary|secondary|tertiary) road$/i.test(edge.name)) names.set(edge.name, (names.get(edge.name) ?? 0) + edge.distance);
  }
  const name = [...names].sort((a, b) => b[1] - a[1])[0]?.[0];
  return name ? `Via ${name}` : `Alternative route ${number}`;
}
