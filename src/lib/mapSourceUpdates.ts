import type { FeatureCollection } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';

interface Source { setData(data: FeatureCollection): unknown }
const submitted = new WeakMap<Source, string>();

/** Avoid asking MapLibre's workers to re-index exactly the same local geometry. */
export function updateSourceIfChanged(source: Source, data: FeatureCollection, failed: () => void): boolean {
  const signature = JSON.stringify(data);
  if (submitted.get(source) === signature) return false;
  submitted.set(source, signature);
  const reject = () => { if (submitted.get(source) === signature) submitted.delete(source); failed(); };
  try { void Promise.resolve(source.setData(data)).catch(reject); }
  catch { reject(); }
  return true;
}

/** Basemap changes should not discard already visible local road/route data. */
export function preserveMapOverlays(previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  if (!previous) return next;
  const sources = Object.fromEntries(Object.entries(previous.sources).filter(([id]) => id.startsWith('manzil-')));
  const layers = previous.layers.filter(layer => layer.id.startsWith('manzil-'));
  return { ...next, sources: { ...next.sources, ...sources }, layers: [...next.layers.filter(layer => !layer.id.startsWith('manzil-')), ...layers] };
}
