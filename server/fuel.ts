import type { FuelPriceRecord, FuelPriceStatus, LocalProfile, TravelStatistics, Trip, TripStatistics, TripStatisticsDay } from '../shared/types.js';
import { sameVehicle } from '../shared/fuel.js';
import type { Repository } from './repository.js';

export const FUEL_SOURCE_URL = 'https://psopk.com/fuel-prices/pol/archives';
export const FUEL_SOURCE_NAME = 'PSO reference prices (excluding outlet freight)';
const DAY = 86400_000, PKT = 5 * 3600_000;
const CHECK_HOUR = 3600_000; // Daily refresh boundary: 01:00 Asia/Karachi.
export const pktDay = (now: number) => new Date(now + PKT).toISOString().slice(0, 10);
export const nextPktDay = (now: number) => new Date(Date.parse(`${pktDay(now)}T00:00:00+05:00`) + DAY).toISOString();
export const fuelCheckDay = (now: number) => pktDay(now - CHECK_HOUR);
export function nextFuelCheck(now: number): string {
  const today = Date.parse(`${pktDay(now)}T01:00:00+05:00`);
  return new Date(now < today ? today : today + DAY).toISOString();
}
export const emptyFuelStatus = (): FuelPriceStatus => ({ state: 'unavailable', lastCheckedAt: null, lastSuccessAt: null, nextCheckAt: null,
  message: 'Fuel prices have not been checked. Estimates require a vehicle economy and a dated reference price.', records: [] });
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function effectiveDate(value: string): string {
  const match = /^([a-z]+)\s+(\d{1,2}),?\s+(20\d{2})$/i.exec(value.trim());
  if (!match || !months.includes(match[1].toLowerCase())) throw new Error('Invalid effective date');
  const month = months.indexOf(match[1].toLowerCase()) + 1, day = Number(match[2]);
  const date = `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const at = Date.parse(`${date}T00:00:00+05:00`);
  if (new Date(at + PKT).toISOString().slice(0, 10) !== date) throw new Error('Invalid effective date');
  return new Date(at).toISOString();
}
/** Exact POL products only: never consume LPG, Octane+, aviation or per-tonne quotations. */
export function parsePsoArchive(html: string, retrievedAt = new Date().toISOString()): FuelPriceRecord[] {
  if (html.length > 1_000_000 || !Number.isFinite(Date.parse(retrievedAt))) throw new Error('Invalid source response');
  const sections = html.split(/Effective\s+From\s*:\s*/i).slice(1);
  const records = new Map<string, FuelPriceRecord>();
  for (const section of sections) {
    const rawDate = text(section.slice(0, section.indexOf('</a>') >= 0 ? section.indexOf('</a>') : 100));
    const date = rawDate.match(/^([a-z]+\s+\d{1,2},?\s+20\d{2})/i)?.[1];
    if (!date) throw new Error('Missing source date');
    const table = section.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
    if (!table || !/Rs\.\s*\/\s*Litre/i.test(text(table))) throw new Error('Missing litre price table');
    let petrol: number | undefined, diesel: number | undefined;
    for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => text(cell[1]));
      if (!['PREMIER EURO 5', 'HI-CETANE DIESEL EURO 5'].includes(cells[0])) continue;
      const price = /^Rs\.\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*\/\s*Ltr\.?$/i.exec(cells[1] ?? '');
      if (!price) throw new Error('Invalid litre price');
      const value = Number(price[1].replace(/,/g, ''));
      if (!Number.isFinite(value) || value < 1 || value > 10_000) throw new Error('Implausible litre price');
      if (cells[0] === 'PREMIER EURO 5') { if (petrol !== undefined && petrol !== value) throw new Error('Conflicting petrol prices'); petrol = value; }
      else { if (diesel !== undefined && diesel !== value) throw new Error('Conflicting diesel prices'); diesel = value; }
    }
    if (petrol === undefined || diesel === undefined) throw new Error('Missing petrol or diesel price');
    const effectiveFrom = effectiveDate(date), previous = records.get(effectiveFrom);
    if (Date.parse(effectiveFrom) > Date.parse(retrievedAt) + DAY) throw new Error('Implausible future source date');
    if (previous && (previous.petrolPerLitre !== petrol || previous.dieselPerLitre !== diesel)) throw new Error('Conflicting dated prices');
    records.set(effectiveFrom, { effectiveFrom, petrolPerLitre: petrol, dieselPerLitre: diesel,
      sourceUrl: FUEL_SOURCE_URL, sourceName: FUEL_SOURCE_NAME, retrievedAt });
  }
  if (!records.size || records.size > 50) throw new Error('No bounded dated prices');
  return [...records.values()].sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom));
}
export async function collectFuelPrices(): Promise<FuelPriceRecord[]> {
  const response = await fetch(FUEL_SOURCE_URL, { signal: AbortSignal.timeout(10_000), redirect: 'error',
    headers: { 'User-Agent': 'Manzil/0.1 (daily public Pakistan fuel-reference check)', Accept: 'text/html' } });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || !response.body) { await response.body?.cancel(); throw new Error('Fuel source unavailable'); }
  if (Number(response.headers.get('content-length')) > 1_000_000) { await response.body.cancel(); throw new Error('Fuel source too large'); }
  const reader = response.body.getReader(), decoder = new TextDecoder(); let html = '', bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 1_000_000) throw new Error('Fuel source too large'); html += decoder.decode(part.value, { stream: true }); }
    html += decoder.decode(); return parsePsoArchive(html);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
type Collector = () => Promise<FuelPriceRecord[]>;
/** One persisted attempt per 01:00 PKT cycle across instances. Never fetches during a route request. */
export class FuelService {
  private running?: Promise<FuelPriceStatus>;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private store: Repository, private collector: Collector = collectFuelPrices, private clock: () => number = Date.now) {}
  async status(): Promise<FuelPriceStatus> {
    const stored = await this.store.meta<FuelPriceStatus>('fuel:status') ?? emptyFuelStatus();
    const lastChecked = Date.parse(stored.lastCheckedAt ?? '');
    // Normalize older midnight deadlines without changing saved rates/history.
    const status = Number.isFinite(lastChecked) ? { ...stored, nextCheckAt: nextFuelCheck(lastChecked) } : stored;
    return status.state === 'fresh' && !!status.nextCheckAt && Date.parse(status.nextCheckAt) <= this.clock()
      ? { ...status, state: 'stale', message: 'The daily check is due. Estimates use the last retrieved reference prices.' } : status;
  }
  check(): Promise<FuelPriceStatus> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => { this.running = undefined; }); return this.running;
  }
  async due() { return await this.store.meta<string>('fuel:checkedDay') !== fuelCheckDay(this.clock()); }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.check().catch(() => {}); }, 60_000); this.timer.unref();
    setImmediate(() => { void this.check().catch(() => {}); });
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  private async run(): Promise<FuelPriceStatus> {
    const now = this.clock();
    if (!await this.store.claimFuelCheck(fuelCheckDay(now))) return this.status();
    const previous = await this.status(), checkedAt = new Date(now).toISOString();
    const pending: FuelPriceStatus = { ...previous, lastCheckedAt: checkedAt, nextCheckAt: nextFuelCheck(now),
      state: previous.records.length ? 'stale' : 'unavailable', message: 'Checking the daily PSO reference. Outlet freight is excluded.' };
    await this.store.setMeta('fuel:status', pending);
    let status: FuelPriceStatus;
    try {
      const incoming = await this.collector();
      if (!incoming.length || incoming.length > 50 || incoming.some(record => !Number.isFinite(Date.parse(record.effectiveFrom)) || !Number.isFinite(Date.parse(record.retrievedAt)) || !Number.isFinite(record.petrolPerLitre) || !Number.isFinite(record.dieselPerLitre) || record.petrolPerLitre < 1 || record.dieselPerLitre < 1 || record.petrolPerLitre > 10_000 || record.dieselPerLitre > 10_000 || record.sourceUrl !== FUEL_SOURCE_URL)) throw new Error('Invalid reference prices');
      const incomingOldest = Math.min(...incoming.map(record => Date.parse(record.effectiveFrom)));
      const incomingLatest = Math.max(...incoming.map(record => Date.parse(record.effectiveFrom)));
      const previousLatest = Math.max(...previous.records.map(record => Date.parse(record.effectiveFrom)));
      const previousOldest = Math.min(...previous.records.map(record => Date.parse(record.effectiveFrom)));
      // A sleeping/offline instance can miss more than the first archive page.
      // Never bridge that unobserved history using an obsolete carried price.
      if (previous.records.length && incomingLatest < previousOldest) throw new Error('Regressing archive window');
      const connected = incomingOldest <= previousLatest && incomingLatest >= previousOldest;
      const byDate = new Map((connected ? previous.records : []).map(record => [record.effectiveFrom, record]));
      incoming.forEach(record => byDate.set(record.effectiveFrom, record));
      const records = [...byDate.values()].sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom)).slice(0, 400);
      status = { ...pending, state: 'fresh', lastSuccessAt: checkedAt, records,
        message: 'PSO dated reference prices checked. Estimates exclude outlet freight; future prices may change.' };
    } catch {
      status = { ...pending, state: 'error', message: previous.records.length
        ? 'The daily PSO check failed. Last retrieved reference prices remain available; outlet prices may differ.'
        : 'The daily PSO check failed. Fuel estimates are unavailable until a dated price is retrieved.' };
    }
    await this.store.setMeta('fuel:status', status); return status;
  }
}

/** Profile edits during an awaited save cannot attach another vehicle's estimate to a trip. */
export function tripWithCurrentVehicle(trip: Trip, profile: LocalProfile): Trip {
  if (trip.fuelEstimate && (!sameVehicle(trip.fuelEstimate.vehicle, profile.vehicle) || !profile.vehicleUpdatedAt || Date.parse(trip.startedAt) < Date.parse(profile.vehicleUpdatedAt))) {
    const { fuelEstimate: _estimate, ...unpriced } = trip; return unpriced;
  }
  return trip;
}
export async function travelStatistics(store: Repository, now = Date.now()): Promise<TravelStatistics> {
  const found = await store.listTripSummaries(5001), complete = found.length <= 5000;
  const trips = found.slice(0, 5000).filter(trip => Date.parse(trip.startedAt) <= now && Date.parse(trip.endedAt) <= now);
  const local = new Date(now + PKT), today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - PKT;
  const week = today - ((local.getUTCDay() + 6) % 7) * DAY, month = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - PKT;
  const summarize = (period: TripStatistics['period'], from: number | null): TripStatistics => {
    const selected = trips.filter(trip => from === null || Date.parse(trip.startedAt) >= from), priced = selected.filter(trip => !!trip.fuelEstimate);
    // The complete week/month calendar includes quiet days. Cost and litres come only
    // from immutable saved estimates; never reprice history using today's profile/rate.
    const daily: TripStatisticsDay[] | undefined = from === null ? undefined : [];
    if (daily && from !== null) {
      const buckets = new Map<string, TripStatisticsDay>();
      for (let at = from; at <= today; at += DAY) {
        const date = pktDay(at), bucket = { date, tripCount: 0, distanceMeters: 0, durationSeconds: 0, pricedTripCount: 0, unpricedTripCount: 0, costPkr: 0, litres: 0 };
        buckets.set(date, bucket); daily.push(bucket);
      }
      for (const trip of selected) {
        const bucket = buckets.get(pktDay(Date.parse(trip.startedAt)));
        if (!bucket) continue;
        bucket.tripCount++; bucket.distanceMeters += trip.distanceMeters; bucket.durationSeconds += trip.durationSeconds;
        if (trip.fuelEstimate) {
          bucket.pricedTripCount++; bucket.costPkr += trip.fuelEstimate.costPkr; bucket.litres += trip.fuelEstimate.litres;
        } else bucket.unpricedTripCount++;
      }
    }
    return { period, from: from === null ? null : new Date(from).toISOString(), until: new Date(now).toISOString(), complete,
      tripCount: selected.length, distanceMeters: selected.reduce((sum, trip) => sum + trip.distanceMeters, 0), durationSeconds: selected.reduce((sum, trip) => sum + trip.durationSeconds, 0),
      pricedTripCount: priced.length, unpricedTripCount: selected.length - priced.length,
      unpricedDistanceMeters: selected.filter(trip => !trip.fuelEstimate).reduce((sum, trip) => sum + trip.distanceMeters, 0),
      costPkr: priced.reduce((sum, trip) => sum + trip.fuelEstimate!.costPkr, 0), litres: priced.reduce((sum, trip) => sum + trip.fuelEstimate!.litres, 0),
      ...(daily ? { daily } : {}) };
  };
  return { week: summarize('week', week), month: summarize('month', month), all: summarize('all', null) };
}
