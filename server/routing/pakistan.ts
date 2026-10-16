import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Coordinate } from '../../shared/types';

// OSM-derived Pakistan ADM0, geoBoundaries gbOpen PAK-ADM0-80972501.
// Server-only coverage guard; this small boundary is not a routable road database.
const document = JSON.parse(gunzipSync(readFileSync(new URL('../../assets/routing/pakistan-boundary.geojson.gz', import.meta.url))).toString());
const polygons: number[][][][] = document.features.flatMap((feature: { geometry: { type: string; coordinates: number[][][][] } }) => {
  if (feature.geometry.type !== 'MultiPolygon') throw new Error('Invalid Pakistan coverage boundary.');
  return feature.geometry.coordinates;
});
const bounds = polygons.map(polygon => {
  const points = polygon[0];
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
});
function inRing([x, y]: Coordinate, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const cross = (x - a[0]) * dy - (y - a[1]) * dx;
    if (Math.abs(cross) < 1e-12 && x >= Math.min(a[0], b[0]) - 1e-10 && x <= Math.max(a[0], b[0]) + 1e-10 && y >= Math.min(a[1], b[1]) - 1e-10 && y <= Math.max(a[1], b[1]) + 1e-10) return true;
    if ((a[1] > y) !== (b[1] > y) && x < a[0] + (y - a[1]) * dx / dy) inside = !inside;
  }
  return inside;
}
export function isInPakistan(coordinate: Coordinate): boolean {
  const [x, y] = coordinate;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) return false;
  return polygons.some((polygon, index) => {
    const [west, south, east, north] = bounds[index];
    return x >= west && x <= east && y >= south && y <= north && inRing(coordinate, polygon[0]) && !polygon.slice(1).some(ring => inRing(coordinate, ring));
  });
}
