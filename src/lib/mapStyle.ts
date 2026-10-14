import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export type MapTheme = 'light' | 'dark';
export type MapDetail = 'clean' | 'standard';
export const MAP_STYLE_URLS: Record<MapTheme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
export const MAP_ATTRIBUTION = '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
const originals = new Map<MapTheme, StyleSpecification>();

/** A plain backdrop keeps local route/editor overlays usable during tile failure. */
export function emptyMapStyle(theme: MapTheme): StyleSpecification {
  return { version: 8, name: 'Manzil — basemap unavailable', sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': theme === 'dark' ? '#17212b' : '#eef0ed' } }] };
}

function simplifyLayer(layer: LayerSpecification, detail: MapDetail): LayerSpecification | null {
  if (layer.type === 'fill-extrusion') return null;
  if (detail === 'standard') return layer;
  const sourceLayer = 'source-layer' in layer ? layer['source-layer'] ?? '' : '';
  const name = `${layer.id} ${sourceLayer}`.toLowerCase();
  if (layer.type === 'hillshade' || /building|housenumber|house_number|\bpoi\b|poi[_-]|[_-]poi|oneway|one_way|road[_-]shield/.test(name)) return null;
  if (layer.type === 'symbol') {
    if (!/transportation_name|road|highway|place|water|boundary|country|state/.test(name)) return null;
    const smallRoad = /minor|residential|service|path|pedestrian/.test(name);
    return { ...layer, minzoom: Math.max(layer.minzoom ?? 0, smallRoad ? 15 : /road|highway|transportation_name/.test(name) ? 13 : 0), layout: { ...layer.layout, 'text-allow-overlap': false, 'icon-allow-overlap': false } };
  }
  return layer;
}

/** Copy first, so switching detail restores upstream layers and attribution. */
export function prepareMapStyle(original: StyleSpecification, detail: MapDetail, theme: MapTheme = 'light'): StyleSpecification {
  const style = structuredClone(original);
  delete style.terrain;
  style.layers = style.layers.map(layer => simplifyLayer(layer, detail)).filter((layer): layer is LayerSpecification => layer !== null);
  if (detail === 'clean') for (const layer of style.layers) if (layer.type === 'fill' && layer.paint) delete layer.paint['fill-pattern'];
  if (theme === 'dark') for (const layer of style.layers) {
    const name = `${layer.id} ${'source-layer' in layer ? layer['source-layer'] : ''}`.toLowerCase();
    if (layer.type === 'background') layer.paint = { ...layer.paint, 'background-color': '#15232c' };
    if (layer.type === 'fill' && /water/.test(name)) layer.paint = { ...layer.paint, 'fill-color': '#17394b' };
    if (layer.type === 'fill' && /park|wood|forest/.test(name)) layer.paint = { ...layer.paint, 'fill-color': '#1d3832' };
    if (layer.type === 'line' && /transportation|road|highway/.test(name) && !/rail|ferry/.test(name)) layer.paint = { ...layer.paint, 'line-color': /casing|outline/.test(name) ? '#192a35' : /motorway|trunk|primary/.test(name) ? '#6a8192' : '#425966' };
    if (layer.type === 'symbol' && layer.layout?.['text-field']) layer.paint = { ...layer.paint, 'text-color': '#d3dfe6', 'text-halo-color': '#15232c' };
  }
  style.transition = { duration: 0, delay: 0 };
  return style;
}

export async function loadMapStyle(theme: MapTheme, detail: MapDetail, signal: AbortSignal): Promise<StyleSpecification> {
  let original = originals.get(theme);
  if (!original) {
    const response = await fetch(MAP_STYLE_URLS[theme], { signal, credentials: 'omit' });
    if (!response.ok) throw new Error('The map style service is unavailable.');
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 8 || !('layers' in value) || !Array.isArray(value.layers)) throw new Error('The map style service returned an unsupported style.');
    original = value as StyleSpecification;
    originals.set(theme, original);
  }
  return prepareMapStyle(original, detail, theme);
}
