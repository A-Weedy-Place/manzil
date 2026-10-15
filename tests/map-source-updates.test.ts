import { describe, expect, it, vi } from 'vitest';
import type { FeatureCollection } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';
import { preserveMapOverlays, updateSourceIfChanged } from '../src/lib/mapSourceUpdates';

const route: FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { selected: true }, geometry: { type: 'LineString', coordinates: [[73, 33.7], [73.001, 33.701]] } }] };
describe('local map source updates', () => {
  it('does not re-index identical geometry from unrelated React renders', () => {
    const source = { setData: vi.fn() }, failed = vi.fn();
    expect(updateSourceIfChanged(source, route, failed)).toBe(true);
    expect(updateSourceIfChanged(source, structuredClone(route), failed)).toBe(false);
    expect(source.setData).toHaveBeenCalledTimes(1);
    const alternative = structuredClone(route); alternative.features[0].properties!.selected = false;
    expect(updateSourceIfChanged(source, alternative, failed)).toBe(true);
    expect(source.setData).toHaveBeenCalledTimes(2);
  });
  it('sends changed geometry and clear requests, and starts fresh for a replacement source', () => {
    const source = { setData: vi.fn() }, failed = vi.fn(), empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
    updateSourceIfChanged(source, route, failed);
    const edited = structuredClone(route); (edited.features[0].geometry as GeoJSON.LineString).coordinates[1][0] += .001;
    expect(updateSourceIfChanged(source, edited, failed)).toBe(true);
    expect(updateSourceIfChanged(source, empty, failed)).toBe(true);
    expect(updateSourceIfChanged(source, empty, failed)).toBe(false);
    const replacement = { setData: vi.fn() };
    expect(updateSourceIfChanged(replacement, empty, failed)).toBe(true);
  });
  it('retries rejected or synchronously failed updates', async () => {
    const failed = vi.fn(), source = { setData: vi.fn().mockRejectedValueOnce(new Error('worker restart')).mockResolvedValue(undefined) };
    updateSourceIfChanged(source, route, failed); await Promise.resolve();
    expect(failed).toHaveBeenCalledOnce();
    expect(updateSourceIfChanged(source, route, failed)).toBe(true);
    expect(source.setData).toHaveBeenCalledTimes(2);
    const broken = { setData: () => { throw new Error('style reset'); } };
    expect(updateSourceIfChanged(broken, route, failed)).toBe(true);
    expect(updateSourceIfChanged(broken, route, failed)).toBe(true);
  });
  it('an earlier rejected update cannot clear a newer successful geometry signature', async () => {
    let reject: (reason: Error) => void = () => {};
    const source = { setData: vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValue(undefined) };
    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
    updateSourceIfChanged(source, route, () => {});
    updateSourceIfChanged(source, empty, () => {});
    reject(new Error('old request')); await Promise.resolve();
    expect(updateSourceIfChanged(source, empty, () => {})).toBe(false);
  });
});

describe('basemap style swaps', () => {
  it('preserves only local overlay sources/layers, retaining the new basemap underneath', () => {
    const previous: StyleSpecification = { version: 8, sources: { old: { type: 'geojson', data: route }, 'manzil-routes': { type: 'geojson', data: route } }, layers: [{ id: 'old-road', type: 'line', source: 'old' }, { id: 'manzil-route-line', type: 'line', source: 'manzil-routes' }] };
    const next: StyleSpecification = { version: 8, sources: { new: { type: 'geojson', data: route } }, layers: [{ id: 'new-road', type: 'line', source: 'new' }] };
    const result = preserveMapOverlays(previous, next);
    expect(Object.keys(result.sources)).toEqual(['new', 'manzil-routes']);
    expect(result.layers.map(layer => layer.id)).toEqual(['new-road', 'manzil-route-line']);
    expect(next.layers).toHaveLength(1);
    expect(preserveMapOverlays(undefined, next)).toBe(next);
  });
});
