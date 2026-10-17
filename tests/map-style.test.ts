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
    for (const id of [undefined, 'streets', 'contrast', 'outdoors'] as const) expect(normalizeMapStyleId(id)).toBe('outdoors');
    for (const id of ['minimal', 'night'] as const) expect(normalizeMapStyleId(id)).toBe(id);
    expect(MAP_STYLE_URLS.streets).toBe(MAP_STYLE_URLS.outdoors);
    expect(MAP_STYLE_URLS.contrast).toBe(MAP_STYLE_URLS.outdoors);
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
