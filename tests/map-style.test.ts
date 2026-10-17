import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FillLayerSpecification, StyleSpecification } from 'maplibre-gl';
import { loadMapStyle, MAP_STYLES, MAP_STYLE_URLS, normalizeMapStyleId, prepareMapStyle } from '../src/lib/mapStyle';

// Minimal regression fixture for Liberty's pattern-only fills, inspected from
// https://tiles.openfreemap.org/styles/liberty on 17 October 2026.
function patternedStyle(): StyleSpecification {
  return {
    version: 8,
    sources: { openmaptiles: { type: 'vector', tiles: ['https://example.test/{z}/{x}/{y}.pbf'] } },
    layers: [
      { id: 'landcover_wetland', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', minzoom: 12,
        paint: { 'fill-antialias': true, 'fill-opacity': .8, 'fill-pattern': 'wetland_bg_11', 'fill-translate-anchor': 'map' } },
      { id: 'road_area_pattern', type: 'fill', source: 'openmaptiles', 'source-layer': 'transportation',
        paint: { 'fill-pattern': 'pedestrian_polygon' } },
      { id: 'coloured_pattern', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
        paint: { 'fill-pattern': 'existing_pattern', 'fill-color': ['match', ['get', 'class'], 'special', '#c6ddd7', '#ecede8'] } },
    ],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('map styles', () => {
  it('offers the three distinct palettes and renders retired profile ids as Classic', () => {
    expect(MAP_STYLES.map(({ name }) => name)).toEqual(['Classic', 'Minimal', 'Night']);
    expect(MAP_STYLES.map(({ id }) => id)).toEqual(['outdoors', 'minimal', 'night']);
    expect(normalizeMapStyleId(undefined)).toBe('outdoors');
    for (const id of ['streets', 'contrast', 'outdoors'] as const) expect(normalizeMapStyleId(id)).toBe('outdoors');
    for (const id of ['minimal', 'night'] as const) expect(normalizeMapStyleId(id)).toBe(id);
    expect(MAP_STYLE_URLS.streets).toBe(MAP_STYLE_URLS.outdoors);
    expect(MAP_STYLE_URLS.contrast).toBe(MAP_STYLE_URLS.outdoors);
  });

  it('starts a missing preference in Classic without changing the supplied upstream style', () => {
    const original: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#fff' } }] };
    expect(prepareMapStyle(original, 'clean').layers[0]).toMatchObject({ paint: { 'background-color': '#f1f4e7' } });
    expect(original.layers[0]).toMatchObject({ paint: { 'background-color': '#fff' } });
  });

  it.each(['clean', 'standard'] as const)('keeps the earlier pale Positron Minimal palette in %s without recolouring upstream roads, labels or land', detail => {
    const original: StyleSpecification = { version: 8, sources: { openmaptiles: { type: 'vector', tiles: ['https://example.test/{z}/{x}/{y}.pbf'] } }, layers: [
      { id: 'highway_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 8,
        filter: ['==', ['get', 'class'], 'minor'], paint: { 'line-color': '#eee', 'line-opacity': .9, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 20, 20] } },
      { id: 'highway_major', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#fff' } },
      { id: 'highway_major_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#ddd' } },
      { id: 'highway_subtle', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': '#abc' } },
      { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': '#89b' } },
      { id: 'road_name', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 13, layout: { 'text-field': ['get', 'name'] }, paint: { 'text-color': '#aaa' } },
      { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#c4d9e4' } },
      { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', paint: { 'fill-color': '#e5eee5' } },
    ] };
    const before = structuredClone(original);
    const prepared = prepareMapStyle(original, detail, 'minimal');
    expect(prepared.layers.slice(0,5)).toEqual(before.layers.slice(0,5));
    expect(prepared.layers[5]).toMatchObject({ minzoom: 13, paint: { 'text-color': '#aaa' } });
    expect(prepared.layers.slice(6)).toEqual(before.layers.slice(6));
    expect(MAP_STYLES.find(style => style.id === 'minimal')).toMatchObject({ description: 'A quiet, pale backdrop', colours: ['#f2f3f0', '#d7dfd8', '#c4d9e4', '#ffffff'] });
    expect(prepared.layers).toHaveLength(before.layers.length);
    expect(original).toEqual(before);
  });

  it.each(['streets', 'contrast', 'outdoors', 'minimal', 'night'] as const)('gives pattern-only fills explicit non-black colours in %s Clean mode', id => {
    const original = patternedStyle(), before = structuredClone(original);
    const prepared = prepareMapStyle(original, 'clean', id);
    for (const layer of prepared.layers.slice(0, 2) as FillLayerSpecification[]) {
      expect(layer.paint?.['fill-pattern']).toBeUndefined();
      expect(layer.paint?.['fill-color']).toBeDefined();
      expect(layer.paint?.['fill-color']).not.toMatch(/^(#000(?:000)?|black)$/);
    }
    expect(prepared.layers[0]).toMatchObject({ minzoom: 12, paint: { 'fill-opacity': .8, 'fill-antialias': true } });
    expect(prepared.layers[2]).toMatchObject({ paint: { 'fill-color': before.layers[2].type === 'fill' ? before.layers[2].paint?.['fill-color'] : undefined } });
    expect(original).toEqual(before);
  });

  it('retains upstream patterns and expressions when switching back to Standard detail', () => {
    const original = patternedStyle();
    prepareMapStyle(original, 'clean', 'minimal');
    const standard = prepareMapStyle(original, 'standard', 'minimal');
    expect(standard.layers).toEqual(original.layers);
  });

  it('fetches legacy preferences through the same Classic provider without changing source attribution', async () => {
    const original = patternedStyle();
    original.sources.openmaptiles = { type: 'vector', tiles: ['https://example.test/{z}/{x}/{y}.pbf'], attribution: 'Test upstream attribution' };
    const fetchStyle = vi.fn().mockResolvedValue({ ok: true, json: async () => original });
    vi.stubGlobal('fetch', fetchStyle);
    const signal = new AbortController().signal;
    const result = await loadMapStyle('contrast', 'clean', signal);
    await loadMapStyle('streets', 'standard', signal);
    expect(fetchStyle).toHaveBeenCalledTimes(1);
    expect(fetchStyle).toHaveBeenCalledWith(MAP_STYLE_URLS.outdoors, { credentials: 'omit', signal });
    expect(result.sources).toEqual(original.sources);
  });
});
