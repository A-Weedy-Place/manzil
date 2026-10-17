import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import type { TransitDataset } from '../../shared/transit.js';

let cached: TransitDataset | null | undefined;
/** Bundled public normalized data only. Missing/corrupt files never trigger scraping or invented fixtures. */
export function loadTransitDataset(): TransitDataset | null {
  if (cached !== undefined) return cached;
  try { cached = validateTransitDataset(JSON.parse(gunzipSync(readFileSync(resolve('assets/transit/islamabad.json.gz'))).toString('utf8'))); }
  catch { cached = null; }
  return cached;
}
export function validateTransitDataset(value: unknown): TransitDataset {
  const data = value as TransitDataset;
  if (!data || !data.version || !Array.isArray(data.sources) || !Array.isArray(data.routes) || !Array.isArray(data.stops) || !Array.isArray(data.patterns) || !Array.isArray(data.calendars) || !Array.isArray(data.trips) || !Array.isArray(data.limitations)) throw new Error('Invalid transit dataset.');
  const unique = (items: {id:string}[]) => { const ids = new Set(items.map(item => item.id)); if (ids.size !== items.length || items.some(item => !item.id)) throw new Error('Duplicate transit IDs.'); return ids; };
  const routes = unique(data.routes), stops = unique(data.stops), patterns = unique(data.patterns), calendars = unique(data.calendars); unique(data.trips);
  if (data.routes.length > 1000 || data.stops.length > 10000 || data.patterns.length > 5000 || data.trips.length > 100000) throw new Error('Transit dataset too large.');
  const coordinate=(point:number[])=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&point[0]>=70&&point[0]<=75&&point[1]>=32&&point[1]<=35;
  const date=(value:string)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
  const shape=(geometry:TransitDataset['patterns'][number]['geometry'])=>geometry?.type==='LineString'&&Array.isArray(geometry.coordinates)&&geometry.coordinates.length>=2&&geometry.coordinates.every(coordinate);
  const sources=unique(data.sources);
  if(!Number.isFinite(Date.parse(data.importedAt)))throw new Error('Invalid transit import date.');
  for (const stop of data.stops) if (!stop.name||!coordinate(stop.coordinate)) throw new Error('Invalid twin-city stop.');
  for (const route of data.routes) {
    if (!/^#[0-9a-f]{6}$/i.test(route.color)) throw new Error('Invalid transit color.');
    const [red,green,blue]=[1,3,5].map(index=>Number.parseInt(route.color.slice(index,index+2),16));
    if(red>150&&green<115&&blue<115&&red>green*1.4&&red>blue*1.4)throw new Error('Red is reserved for road closures.');
    if(!sources.has(route.sourceId)||!route.name||!route.shortName||!['stops-and-shape','stops-only','catalogue-only'].includes(route.coverage))throw new Error('Invalid transit route source.');
  }
  for (const pattern of data.patterns) {
    if (!routes.has(pattern.routeId) || pattern.stopIds.some(id => !stops.has(id)) || pattern.stopIds.length < 2 || !shape(pattern.geometry)||pattern.geometrySegments?.some(line=>!shape(line))||!['provided-shape','mapped-corridor','stops-only'].includes(pattern.geometryQuality)) throw new Error('Invalid transit pattern.');
    if (pattern.breakAfterStopIndexes?.some(index => !Number.isInteger(index) || index < 0 || index >= pattern.stopIds.length - 1)) throw new Error('Invalid transit gap.');
  }
  for(const calendar of data.calendars)if(!date(calendar.startDate)||!date(calendar.endDate)||calendar.startDate>calendar.endDate||!Array.isArray(calendar.weekdays)||calendar.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)||!Array.isArray(calendar.exceptions)||calendar.exceptions.some(exception=>!date(exception.date)||typeof exception.added!=='boolean'))throw new Error('Invalid transit calendar.');
  const patternById = new Map(data.patterns.map(pattern => [pattern.id,pattern]));
  for (const trip of data.trips) {
    const pattern = patternById.get(trip.patternId);
    if (!pattern || !patterns.has(trip.patternId) || !calendars.has(trip.serviceId) || trip.times.length !== pattern.stopIds.length) throw new Error('Invalid transit trip.');
    let previous = -1;
    for (const [arrival,departure] of trip.times) { if (![arrival,departure].every(time => Number.isInteger(time) && time >= 0 && time <= 172800) || arrival < previous || departure < arrival) throw new Error('Invalid service-day times.'); previous = departure; }
    for (const key of ['pickupAllowed','dropOffAllowed','timepoint'] as const) if (trip[key] && (trip[key]!.length !== trip.times.length || trip[key]!.some(value => typeof value !== 'boolean'))) throw new Error('Invalid boarding constraints.');
  }
  return data;
}
