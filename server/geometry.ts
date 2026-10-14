import buffer from '@turf/buffer';
import { lineString, point } from '@turf/helpers';
import type { Polygon } from 'geojson';
import type { Coordinate, Drawing, RecordedPoint } from '../shared/types.js';
import { HttpError } from './errors.js';

export function drawingToPolygon(drawing: Drawing): Polygon {
  if (drawing.kind === 'polygon') {
    const coordinates = drawing.coordinates.map(p => [...p] as Coordinate);
    const first = coordinates[0], last = coordinates[coordinates.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push([...first]);
    if (new Set(coordinates.map(p => p.join(','))).size < 3) throw new HttpError(400, 'Draw three distinct polygon vertices.');
    return { type: 'Polygon', coordinates: [coordinates] };
  }
  const feature = drawing.kind === 'point' ? point(drawing.coordinates[0]) : lineString(drawing.coordinates);
  // widthMeters is the full diameter/corridor width, not a radius.
  const shape = buffer(feature, drawing.widthMeters / 2, { units: 'meters', steps: 12 });
  if (!shape || shape.geometry.type !== 'Polygon') throw new HttpError(400, 'This drawing did not produce one valid area. Simplify it.');
  return shape.geometry;
}
export function distanceMeters(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180, lat = (a[1] + b[1]) * rad / 2;
  return Math.hypot((b[0] - a[0]) * Math.cos(lat), b[1] - a[1]) * rad * 6_371_000;
}
export function summarizeTrace(points: RecordedPoint[]) {
  let distance = 0, gaps = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], seconds = (Date.parse(b.timestamp) - Date.parse(a.timestamp)) / 1000;
    const length = distanceMeters(a.coordinate, b.coordinate);
    if (seconds <= 0 || seconds > 60 || a.accuracy > 100 || b.accuracy > 100 || length / seconds > 65) gaps++;
    else distance += length;
  }
  return { distanceMeters: Math.round(distance), gaps };
}
