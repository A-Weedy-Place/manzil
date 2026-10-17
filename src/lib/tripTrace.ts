import type { Coordinate, RecordedPoint } from '../../shared/types';

export const validTraceCoordinate = (point: number[]): point is Coordinate => point.length >= 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
export function usableTracePoints(points: RecordedPoint[]): RecordedPoint[] {
  return points.filter(point => validTraceCoordinate(point.coordinate) && Number.isFinite(point.accuracy) && point.accuracy <= 100 && Number.isFinite(Date.parse(point.timestamp)));
}

/** Preserve missing/bad/too-fast recording segments rather than inventing shortcuts. */
export function tripTraceSections(points: RecordedPoint[]): Coordinate[][] {
  const sections: Coordinate[][] = []; let section: Coordinate[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index], previous = points[index - 1];
    const valid = validTraceCoordinate(point.coordinate) && Number.isFinite(point.accuracy) && point.accuracy <= 100 && Number.isFinite(Date.parse(point.timestamp));
    let gap = !valid;
    if (previous) {
      const seconds = (Date.parse(point.timestamp) - Date.parse(previous.timestamp)) / 1000;
      const metres = Math.hypot((point.coordinate[0] - previous.coordinate[0]) * Math.cos(point.coordinate[1] * Math.PI / 180), point.coordinate[1] - previous.coordinate[1]) * Math.PI / 180 * 6371000;
      gap ||= !Number.isFinite(seconds) || seconds <= 0 || seconds > 60 || metres / seconds > 65 || previous.accuracy > 100 || !validTraceCoordinate(previous.coordinate);
    }
    if (gap && section.length) { if (section.length > 1) sections.push(section); section = []; }
    if (valid) section.push(point.coordinate);
  }
  if (section.length > 1) sections.push(section);
  return sections;
}

export function tripTraceBounds(points: RecordedPoint[]): [[number, number], [number, number]] {
  const valid = usableTracePoints(points);
  if (valid.length < 2) throw new Error('This trip’s saved trace is no longer available.');
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const { coordinate: [longitude, latitude] } of valid) {
    west = Math.min(west, longitude); east = Math.max(east, longitude); south = Math.min(south, latitude); north = Math.max(north, latitude);
  }
  return [[west, south], [east, north]];
}
