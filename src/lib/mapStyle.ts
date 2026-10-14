import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { MapStyleId } from '../../shared/types';

export type MapTheme = 'light' | 'dark';
export type MapDetail = 'clean' | 'standard';
export const MAP_STYLE_URLS: Record<MapStyleId, string> = {
  streets: 'https://tiles.openfreemap.org/styles/liberty',
  outdoors: 'https://tiles.openfreemap.org/styles/bright',
  contrast: 'https://tiles.openfreemap.org/styles/liberty',
  minimal: 'https://tiles.openfreemap.org/styles/positron',
  night: 'https://tiles.openfreemap.org/styles/dark',
};
export const MAP_STYLES: { id: MapStyleId; name: string; description: string; colours: [string, string, string, string] }[] = [
  { id: 'streets', name: 'Streets', description: 'Green parks, blue water, warm roads', colours: ['#faf6ed', '#b9dba2', '#98d2ed', '#efbd67'] },
  { id: 'outdoors', name: 'Outdoors', description: 'Richer greens and natural colour', colours: ['#f1f4e7', '#92c584', '#7bc4df', '#e5ba77'] },
  { id: 'contrast', name: 'High contrast', description: 'Bold roads and stronger labels', colours: ['#fffaf0', '#aed083', '#65b8df', '#edac39'] },
  { id: 'minimal', name: 'Minimal', description: 'A quiet, pale backdrop', colours: ['#f2f3f0', '#d7dfd8', '#c4d9e4', '#ffffff'] },
  { id: 'night', name: 'Night', description: 'Deep blue with clear road outlines', colours: ['#15232c', '#1d3832', '#17394b', '#6a8192'] },
];
export const MAP_ATTRIBUTION = '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
const originals = new Map<string, StyleSpecification>();

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
export function prepareMapStyle(original: StyleSpecification, detail: MapDetail, mapStyle: MapStyleId = 'streets'): StyleSpecification {
  const style = structuredClone(original);
  delete style.terrain;
  style.layers = style.layers.map(layer => simplifyLayer(layer, detail)).filter((layer): layer is LayerSpecification => layer !== null);
  if (detail === 'clean') for (const layer of style.layers) if (layer.type === 'fill' && layer.paint) delete layer.paint['fill-pattern'];
  if (mapStyle === 'streets' || mapStyle === 'outdoors' || mapStyle === 'contrast') for (const layer of style.layers) {
    const name = `${layer.id} ${'source-layer' in layer ? layer['source-layer'] : ''}`.toLowerCase();
    const nature = mapStyle === 'outdoors', contrast = mapStyle === 'contrast';
    if (layer.type === 'background') layer.paint = { ...layer.paint, 'background-color': nature ? '#f1f4e7' : contrast ? '#fffaf0' : '#faf6ed' };
    if (layer.type === 'fill' && /water/.test(name)) layer.paint = { ...layer.paint, 'fill-color': nature ? '#7bc4df' : contrast ? '#65b8df' : '#98d2ed', 'fill-opacity': 1 };
    if (layer.type === 'line' && /waterway/.test(name)) layer.paint = { ...layer.paint, 'line-color': nature ? '#62aeca' : '#70b9dc' };
    if (layer.type === 'fill' && /park|wood|forest|grass|cemetery|pitch/.test(name)) layer.paint = { ...layer.paint, 'fill-color': nature ? /wood|forest/.test(name) ? '#92c584' : '#c1dfa7' : contrast ? '#aed083' : /wood|forest/.test(name) ? '#b9dba2' : '#d3e7b9', 'fill-opacity': nature ? .8 : .75 };
    if (layer.type === 'fill' && /sand/.test(name)) layer.paint = { ...layer.paint, 'fill-color': '#f3e2b2' };
    if (layer.type === 'fill' && /residential|suburb/.test(name)) layer.paint = { ...layer.paint, 'fill-color': nature ? '#f4eddd' : '#f2e8d7', 'fill-opacity': .5 };
    if (layer.type === 'line' && /motorway|trunk|primary|secondary/.test(name) && !/casing|outline|rail|label/.test(name)) layer.paint = { ...layer.paint, 'line-color': contrast ? '#edac39' : nature ? '#e5ba77' : '#efbd67' };
    if (contrast && layer.type === 'line' && /casing|outline/.test(name) && /road|highway|transportation/.test(name)) layer.paint = { ...layer.paint, 'line-color': '#a5885d' };
    if (layer.type === 'symbol' && layer.layout?.['text-field']) layer.paint = { ...layer.paint, 'text-color': contrast ? '#152832' : '#35423a', 'text-halo-color': '#fffdf7', 'text-halo-width': contrast ? 1.6 : 1.1 };
  }
  if (mapStyle === 'night') for (const layer of style.layers) {
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

export async function loadMapStyle(mapStyle: MapStyleId, detail: MapDetail, signal: AbortSignal): Promise<StyleSpecification> {
  const url = MAP_STYLE_URLS[mapStyle];
  let original = originals.get(url);
  if (!original) {
    const response = await fetch(url, { signal, credentials: 'omit' });
    if (!response.ok) throw new Error('The map style service is unavailable.');
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 8 || !('layers' in value) || !Array.isArray(value.layers)) throw new Error('The map style service returned an unsupported style.');
    original = value as StyleSpecification;
    originals.set(url, original);
  }
  return prepareMapStyle(original, detail, mapStyle);
}
