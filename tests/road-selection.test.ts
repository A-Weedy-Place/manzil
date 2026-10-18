import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../shared/types';
import { buildGraph, type OsmDocument } from '../server/routing/graph';
import { RoadSelectionError, selectRoadBlockade, selectRoadPoint, selectRoadSection } from '../server/routing/road-selection';
import { drawingSchema } from '../server/validation';
import { getRoutingGraph } from '../server/routing';
import { drawingToPolygon } from '../server/geometry';
import { polygonSchema } from '../server/validation';

function fixture() {
  const points: Coordinate[] = [[73, 33.7], [73.001, 33.7], [73.001, 33.701], [73.002, 33.701], [73.0015, 33.6995], [73.0015, 33.7015], [73.003, 33.7], [73.004, 33.7]];
  const osm: OsmDocument = { elements: points.map((coordinate, index) => ({ type: 'node', id: index + 1, lon: coordinate[0], lat: coordinate[1] })) };
  osm.elements.push(
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential', name: 'Bent Road', oneway: 'yes' } },
    { type: 'way', id: 11, nodes: [3, 4], tags: { highway: 'residential', name: 'Bent Road' } },
    { type: 'way', id: 12, nodes: [5, 6], tags: { highway: 'primary', name: 'Crossing Road' } },
    { type: 'way', id: 13, nodes: [7, 8], tags: { highway: 'residential', name: 'Bent Road' } },
    { type: 'way', id: 14, nodes: [1, 4], tags: { highway: 'service', name: 'Private Shortcut', access: 'private' } },
  );
  return buildGraph(osm, [72.99, 33.69, 73.01, 33.71]);
}

describe('map road-section selection', () => {
  it('preserves a short physical barrier across the road as exactly two endpoints, not a whole road interval', () => {
    const from: Coordinate = [73.0005, 33.6999], to: Coordinate = [73.0005, 33.7001];
    const selected = selectRoadBlockade(fixture(), from, to);
    expect(selected.roadNames).toEqual(['Bent Road']);
    expect(selected.drawing).toEqual({ kind: 'line', coordinates: [from, to], widthMeters: 4 });
    expect(selected.distanceMeters).toBeGreaterThan(22); expect(selected.distanceMeters).toBeLessThan(23);
    expect(selectRoadBlockade(fixture(), to, from).drawing.coordinates).toEqual([to, from]);
    expect(drawingSchema.safeParse(selected.drawing).success).toBe(true);
    expect(polygonSchema.safeParse(drawingToPolygon(selected.drawing)).success).toBe(true);
  });
  it('requires a local cross-road intersection and rejects longitudinal, distant and oversized barriers', () => {
    expect(() => selectRoadBlockade(fixture(), [73.0002, 33.7], [73.0007, 33.7])).toThrow(/across a supported public road/);
    expect(() => selectRoadBlockade(fixture(), [73.0005, 33.702], [73.0005, 33.7021])).toThrow(/across a supported public road/);
    expect(() => selectRoadBlockade(fixture(), [73.0005, 33.69999], [73.0005, 33.7])).toThrow(/at least 2 metres/);
    expect(() => selectRoadBlockade(fixture(), [73.0005, 33.6995], [73.0005, 33.7005])).toThrow(/no longer than 80 metres/);
    expect(() => selectRoadBlockade(fixture(), [73.0005, 33.6993], [73.0005, 33.70001])).toThrow(/across a supported public road/);
  });
  it('does not validate physical barriers using a private road or unknown imported coverage', () => {
    const graph = buildGraph({ elements: [
      { type: 'node', id: 1, lon: 73, lat: 33.7 }, { type: 'node', id: 2, lon: 73.001, lat: 33.7 },
      { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'service', access: 'private' } },
    ] }, [72.99, 33.69, 73.01, 33.71]);
    expect(() => selectRoadBlockade(graph, [73.0005, 33.6999], [73.0005, 33.7001])).toThrow(/supported public road/);
    for (const candidate of [fixture(), null]) {
      try { selectRoadBlockade(candidate, [74, 34], [74, 34.0001]); throw new Error('Expected unavailable'); }
      catch (error) { expect(error).toBeInstanceOf(RoadSelectionError); expect((error as RoadSelectionError).status).toBe(503); }
    }
  });
  it('snaps one pick onto a short exact road interval instead of a circular/off-road restriction', () => {
    const selected = selectRoadPoint(fixture(), [73.0005, 33.70002]);
    expect(selected.roadNames).toEqual(['Bent Road']);
    expect(selected.drawing.kind).toBe('line');
    expect(selected.drawing.coordinates).toHaveLength(3);
    expect(selected.drawing.coordinates.every(coordinate => coordinate[1] === 33.7)).toBe(true);
    expect(selected.drawing.coordinates[1]).toEqual([73.0005, 33.7]);
    expect(selected.distanceMeters).toBeCloseTo(20, 6);
    expect(drawingSchema.safeParse(selected.drawing).success).toBe(true);
    expect(polygonSchema.safeParse(drawingToPolygon(selected.drawing)).success).toBe(true);
  });
  it('follows a degree-two road bend but never cuts across it', () => {
    const selected = selectRoadPoint(fixture(), [73.00099, 33.7]);
    expect(selected.drawing.coordinates).toContainEqual([73.001, 33.7]);
    expect(selected.drawing.coordinates[0][1]).toBe(33.7);
    expect(selected.drawing.coordinates.at(-1)![0]).toBe(73.001);
    expect(selected.drawing.coordinates.at(-1)![1]).toBeGreaterThan(33.7);
    expect(selected.distanceMeters).toBeCloseTo(20, 6);
  });
  it('stops a point restriction at an actual connected intersection', () => {
    const points: Coordinate[] = [[73, 33.7], [73.001, 33.7], [73.002, 33.7], [73.001, 33.699]];
    const graph = buildGraph({ elements: [
      ...points.map((coordinate, index) => ({ type: 'node' as const, id: index + 1, lon: coordinate[0], lat: coordinate[1] })),
      { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential', name: 'Through Road' } },
      { type: 'way', id: 11, nodes: [2, 4], tags: { highway: 'residential', name: 'Side Street' } },
    ] }, [72.99, 33.69, 73.01, 33.71]);
    const selected = selectRoadPoint(graph, [73.00099, 33.7]);
    expect(selected.drawing.coordinates.at(-1)).toEqual([73.001, 33.7]);
    expect(selected.drawing.coordinates.every(coordinate => coordinate[1] === 33.7 && coordinate[0] <= 73.001)).toBe(true);
    expect(selected.distanceMeters).toBeGreaterThan(10);
    expect(selected.distanceMeters).toBeLessThan(12);
  });
  it('keeps point selection access-filtered and unavailable outside imported coverage or far from a road', () => {
    expect(selectRoadPoint(fixture(), [73.0005, 33.7]).roadNames).not.toContain('Private Shortcut');
    expect(() => selectRoadPoint(fixture(), [73.008, 33.708])).toThrow(/within 45 metres/);
    for (const graph of [fixture(), null]) {
      try { selectRoadPoint(graph, [74, 34]); throw new Error('Expected unavailable'); }
      catch (error) { expect(error).toBeInstanceOf(RoadSelectionError); expect((error as RoadSelectionError).status).toBe(503); }
    }
  });
  it('follows bends and split OSM ways rather than connecting the clicks directly', () => {
    const selected = selectRoadSection(fixture(), [73.0002, 33.70001], [73.0018, 33.70101]);
    expect(selected.roadNames).toEqual(['Bent Road']);
    expect(selected.drawing.kind).toBe('line');
    expect(selected.drawing.coordinates).toContainEqual([73.001, 33.7]);
    expect(selected.drawing.coordinates).toContainEqual([73.001, 33.701]);
    expect(selected.drawing.coordinates[0][0]).toBeCloseTo(73.0002, 6);
    expect(selected.drawing.coordinates.at(-1)![0]).toBeCloseTo(73.0018, 6);
    expect(selected.distanceMeters).toBeGreaterThan(240);
    expect(drawingSchema.safeParse(selected.drawing).success).toBe(true);
  });
  it('selects either direction of a road because the restriction itself is not directional', () => {
    const forward = selectRoadSection(fixture(), [73.0002, 33.7], [73.0018, 33.701]);
    const reverse = selectRoadSection(fixture(), [73.0018, 33.701], [73.0002, 33.7]);
    expect(reverse.distanceMeters).toBeCloseTo(forward.distanceMeters, 5);
    expect(reverse.drawing.coordinates).toEqual([...forward.drawing.coordinates].reverse());
  });
  it('projects exact endpoints within one segment instead of blocking the whole way', () => {
    const selected = selectRoadSection(fixture(), [73.0002, 33.7], [73.0008, 33.7]);
    expect(selected.drawing.coordinates).toEqual([[73.0002, 33.7], [73.0008, 33.7]]);
  });
  it('rejects different roads and does not connect disconnected same-name sections', () => {
    expect(() => selectRoadSection(fixture(), [73, 33.7], [73.0015, 33.6995])).toThrow(/same road/);
    expect(() => selectRoadSection(fixture(), [73, 33.7], [73.004, 33.7])).toThrow(/No connected section/);
  });
  it('does not snap distant clicks or use private links', () => {
    expect(() => selectRoadSection(fixture(), [73.008, 33.708], [73.001, 33.7])).toThrow(/within 45 metres/);
    const graph = fixture();
    expect(graph.edges.every(edge => edge.name !== 'Private Shortcut')).toBe(true);
    expect(selectRoadSection(graph, [73, 33.7], [73.002, 33.701]).drawing.coordinates).toContainEqual([73.001, 33.7]);
  });
  it('returns an explicit unavailable error outside the local graph or without data', () => {
    for (const graph of [fixture(), null]) {
      try { selectRoadSection(graph, [74, 34], [74.001, 34]); throw new Error('Expected unavailable'); }
      catch (error) { expect(error).toBeInstanceOf(RoadSelectionError); expect((error as RoadSelectionError).status).toBe(503); }
    }
    expect(() => selectRoadSection(fixture(), [73, 33.7], [73.000001, 33.7])).toThrow(/at least 3 metres/);
  });
  it('selects the real Park Road fixture with a publishable road-following area', () => {
    const selected = selectRoadSection(getRoutingGraph(), [73.0396635, 33.7145674], [73.0299184, 33.709286]);
    expect(selected.roadNames).toEqual(['Park Road']);
    expect(selected.drawing.coordinates.length).toBeGreaterThan(2);
    expect(selected.distanceMeters).toBeGreaterThan(1000);
    expect(selected.distanceMeters).toBeLessThan(1200);
    expect(drawingSchema.safeParse(selected.drawing).success).toBe(true);
    expect(polygonSchema.safeParse(drawingToPolygon(selected.drawing)).success).toBe(true);
  });
});
