import type { FeatureCollection, Polygon } from 'geojson';
import type { Coordinate } from '../../shared/types';

/** Display only: the browser's reported uncertainty never becomes a road or route. */
export function locationAccuracyArea(center?: Coordinate | null, accuracy?: number | null): FeatureCollection<Polygon> {
  if (!center || center.length !== 2 || !center.every(Number.isFinite) || Math.abs(center[0]) > 180 || Math.abs(center[1]) > 90 || accuracy == null || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 100000) return { type: 'FeatureCollection', features: [] };
  const radius = accuracy / 6371000, lat = center[1] * Math.PI / 180, lon = center[0] * Math.PI / 180;
  const ring = Array.from({ length: 65 }, (_, index) => {
    const bearing = (index % 64) / 64 * 2 * Math.PI;
    const latitude = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat) * Math.cos(radius) + Math.cos(lat) * Math.sin(radius) * Math.cos(bearing))));
    const longitude = lon + Math.atan2(Math.sin(bearing) * Math.sin(radius) * Math.cos(lat), Math.cos(radius) - Math.sin(lat) * Math.sin(latitude));
    return [longitude * 180 / Math.PI, latitude * 180 / Math.PI];
  });
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { accuracyMeters: accuracy }, geometry: { type: 'Polygon', coordinates: [ring] } }] };
}
