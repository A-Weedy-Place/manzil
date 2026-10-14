import { z } from 'zod';

export const coordinateSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
export const instantSchema = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString());
const webUrl = z.string().max(1500).url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), 'Use an HTTP or HTTPS URL.');
export const placeSchema = z.object({ id: z.string().max(200).optional(), name: z.string().trim().min(1).max(160), coordinate: coordinateSchema });
export const drawingSchema = z.object({
  kind: z.enum(['point', 'line', 'polygon']), coordinates: z.array(coordinateSchema).min(1).max(1000),
  widthMeters: z.number().finite().min(2).max(1000),
}).superRefine((value, ctx) => {
  const minimum = value.kind === 'point' ? 1 : value.kind === 'line' ? 2 : 3;
  if (value.coordinates.length < minimum || (value.kind === 'point' && value.coordinates.length !== 1))
    ctx.addIssue({ code: 'custom', message: `A ${value.kind} requires ${value.kind === 'point' ? 'exactly ' : 'at least '}${minimum} points.` });
});
function hasCrossing(ring: [number, number][]): boolean {
  const edges = ring.length - 1, epsilon = 1e-14;
  const orientation = (a: number[], b: number[], c: number[]) => {
    const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return Math.abs(value) < epsilon ? 0 : Math.sign(value);
  };
  for (let i = 0; i < edges; i++) {
    const a = ring[i], b = ring[i + 1];
    if (a[0] === b[0] && a[1] === b[1]) return true;
    for (let j = i + 1; j < edges; j++) {
      if (j === i + 1 || (i === 0 && j === edges - 1)) continue;
      const c = ring[j], d = ring[j + 1];
      if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
        Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
      if (orientation(a, b, c) * orientation(a, b, d) <= 0 && orientation(c, d, a) * orientation(c, d, b) <= 0) return true;
    }
  }
  return false;
}
export const polygonSchema = z.object({
  type: z.literal('Polygon'), coordinates: z.array(z.array(coordinateSchema).min(4).max(1001)).length(1, 'Draw one outer ring; holes are not supported in this editor.'),
}).superRefine((value, ctx) => {
  if (value.coordinates.reduce((n, ring) => n + ring.length, 0) > 4000) ctx.addIssue({ code: 'custom', message: 'Polygon is too complex.' });
  for (const ring of value.coordinates) {
    const a = ring[0], b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) ctx.addIssue({ code: 'custom', message: 'Polygon rings must be closed.' });
    if (new Set(ring.map(p => p.join(','))).size < 3) ctx.addIssue({ code: 'custom', message: 'Polygon requires three distinct vertices.' });
    const base = ring[0];
    const twiceArea = ring.slice(0, -1).reduce((area, p, index) => {
      const next = ring[index + 1];
      return area + (p[0] - base[0]) * (next[1] - base[1]) - (next[0] - base[0]) * (p[1] - base[1]);
    }, 0);
    if (Math.abs(twiceArea) < 1e-14) ctx.addIssue({ code: 'custom', message: 'Polygon must enclose a nonzero area.' });
    if (hasCrossing(ring)) ctx.addIssue({ code: 'custom', message: 'Polygon edges must not cross or touch nonadjacent edges.' });
  }
});
export const closureDraftSchema = z.object({
  title: z.string().trim().min(1).max(180), description: z.string().trim().max(4000),
  reason: z.enum(['protest', 'vip', 'construction', 'accident', 'other']),
  startsAt: instantSchema, endsAt: instantSchema.nullable(), status: z.enum(['published', 'draft', 'cancelled']),
  geometry: polygonSchema, drawing: drawingSchema.optional(), sourceUrl: webUrl.or(z.literal('')).optional(),
}).superRefine((value, ctx) => {
  if (value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End must be after start.' });
});
export const closureUpdateSchema = closureDraftSchema.and(z.object({ revision: z.number().int().positive() }));
export const planSchema = z.object({ origin: placeSchema, destination: placeSchema, departureAt: instantSchema, compareDepartures: z.boolean().optional() });
export const commuteSchema = z.object({
  name: z.string().trim().min(1).max(120), origin: placeSchema, destination: placeSchema,
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), days: z.array(z.number().int().min(0).max(6)).min(1).max(7), enabled: z.boolean(),
});
export const tripSchema = z.object({
  name: z.string().trim().min(1).max(120), startedAt: instantSchema, endedAt: instantSchema,
  points: z.array(z.object({ coordinate: coordinateSchema, timestamp: instantSchema, accuracy: z.number().finite().min(0).max(100_000) })).min(2).max(20_000),
  contributeToRoadDiscovery: z.boolean(),
}).superRefine((value, ctx) => {
  const start = Date.parse(value.startedAt), end = Date.parse(value.endedAt);
  if (end <= start || end - start > 24 * 3600_000) ctx.addIssue({ code: 'custom', message: 'Trip must last between zero and 24 hours.' });
  let last = start;
  for (const point of value.points) {
    const time = Date.parse(point.timestamp);
    if (time < last || time < start || time > end) { ctx.addIssue({ code: 'custom', message: 'GPS times must be ordered and inside the trip period.' }); break; }
    last = time;
  }
});
export const noticeSchema = z.object({ text: z.string().trim().min(1).max(20_000), url: webUrl.optional(), publishedAt: instantSchema.nullable().optional() });
export const profilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(60), theme: z.enum(['light', 'dark', 'system']),
  mapDetail: z.enum(['clean', 'standard']), browserNotifications: z.boolean(),
  inferFrequentRoutes: z.boolean(), transport: z.literal('car'),
}).partial().strict().refine(value => Object.keys(value).length > 0, 'Provide at least one profile preference.');
