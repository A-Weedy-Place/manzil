import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FuelService, FUEL_SOURCE_URL, parsePsoArchive, travelStatistics, pktDay, nextPktDay, nextFuelCheck, fuelCheckDay, collectFuelPrices } from '../server/fuel';
import { Store } from '../server/store';
import { estimateRouteFuel } from '../shared/fuel';
import type { FuelPriceRecord, Trip, VehicleProfile } from '../shared/types';

const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const database = () => { const store = new Store(':memory:'); cleanup.push(() => store.close()); return store; };
const checked = '2026-10-17T05:00:00.000Z';
const record: FuelPriceRecord = { effectiveFrom: '2026-10-15T19:00:00.000Z', petrolPerLitre: 300, dieselPerLitre: 350,
  sourceUrl: FUEL_SOURCE_URL, sourceName: 'Offline fixture', retrievedAt: checked };
const vehicle: VehicleProfile = { kind: 'car', fuelType: 'petrol', kmPerLitre: 10 };
const table = (date = 'October 16, 2026', petrol = '390.23', diesel = '396.96') => `<li><a class="uk-accordion-title">Effective From: ${date}<img src="arrow.svg"></a><div><table><thead><tr><th>Product Name</th><th>Rs./Litre</th></tr></thead><tbody><tr><td>PREMIER EURO 5</td><td>Rs.${petrol}/Ltr</td></tr><tr><td>HI-CETANE DIESEL EURO 5</td><td>Rs.${diesel}/Ltr</td></tr><tr><td>E10</td><td>Rs.0.00/Ltr</td></tr><tr><td>SKO</td><td>Rs.100/Ltr</td></tr></tbody></table></div></li>`;
function trip(id: string, startedAt = '2026-10-17T04:00:00Z'): Trip {
  return { id, name: 'Offline test trip', startedAt, endedAt: new Date(Date.parse(startedAt) + 60_000).toISOString(),
    points: [], contributeToRoadDiscovery: false, createdAt: checked, distanceMeters: 10_000, durationSeconds: 60, gaps: 0 };
}
describe('PSO dated source parser and durable daily cache', () => {
  it('pairs exact petrol and HSD rows with their own effective date, excluding other products', () => {
    const records = parsePsoArchive(table() + table('October 15, 2026', '380.00', '390.00'), checked);
    expect(records).toHaveLength(2); expect(records[0]).toMatchObject({ effectiveFrom: '2026-10-15T19:00:00.000Z', petrolPerLitre: 390.23, dieselPerLitre: 396.96, sourceUrl: FUEL_SOURCE_URL });
    expect(records[1]).toMatchObject({ effectiveFrom: '2026-10-14T19:00:00.000Z', petrolPerLitre: 380 });
    expect(parsePsoArchive(table() + table(), checked)).toHaveLength(1);
  });
  it('rejects walls, impossible dates, conflicting revisions, wrong units and malformed prices', () => {
    for (const html of ['<html>Access denied</html>', table('February 30, 2026'), table('October 16, 2099'), table() + table('October 16, 2026', '400.00'),
      table().replace('HI-CETANE DIESEL EURO 5', 'LDO'), table().replace('Rs./Litre', 'Rs./MTon'), table('October 16, 2026', '0'),
      table('October 16, 2026', 'abc'), table('October 16, 2026', '39,,0')]) expect(() => parsePsoArchive(html, checked)).toThrow();
  });
  it('fetches only the fixed public HTML endpoint with bounded no-redirect request options', async () => {
    const fetcher = vi.fn(async () => new Response(table(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })); vi.stubGlobal('fetch', fetcher);
    expect(await collectFuelPrices()).toHaveLength(1);
    expect(fetcher.mock.calls[0]).toMatchObject([FUEL_SOURCE_URL, { redirect: 'error', headers: { Accept: 'text/html' } }]);
  });
  it('rejects source HTTP errors, unexpected content and oversized HTML without fallback rates', async () => {
    for (const response of [new Response('Forbidden', { status: 403 }), new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      new Response('large', { headers: { 'Content-Type': 'text/html', 'Content-Length': '1000001' } }),
      new Response('x'.repeat(1000001), { headers: { 'Content-Type': 'text/html' } })]) {
      vi.stubGlobal('fetch', vi.fn(async () => response)); await expect(collectFuelPrices()).rejects.toThrow();
    }
  });
  it('coalesces independent instances and persists one attempt per PKT day including failures', async () => {
    const store = database(), collector = vi.fn(async () => [record]); let now = Date.parse(checked);
    const a = new FuelService(store, collector, () => now), b = new FuelService(store, collector, () => now);
    expect((await a.status()).state).toBe('unavailable');
    await Promise.all([a.check(), a.check(), b.check()]); expect(collector).toHaveBeenCalledTimes(1);
    expect(await a.status()).toMatchObject({ state: 'fresh', lastCheckedAt: checked, lastSuccessAt: checked, nextCheckAt: '2026-10-17T20:00:00.000Z' });
    now = Date.parse('2026-10-17T19:30:00Z'); expect((await a.status()).state).toBe('fresh');
    expect(await b.due()).toBe(false); await b.check(); expect(collector).toHaveBeenCalledTimes(1);
    now = Date.parse('2026-10-17T20:00:00Z'); expect((await a.status()).state).toBe('stale');
    collector.mockRejectedValue(new Error('Offline fixture failure'));
    expect((await b.check()).state).toBe('error'); await a.check(); expect(collector).toHaveBeenCalledTimes(2);
    expect((await a.status()).records).toEqual([record]); expect((await a.status()).lastSuccessAt).toBe(checked);
  });
  it('does not pretend a failed first attempt has a valid rate and waits until the next PKT date', async () => {
    const store = database(), collector = vi.fn(async () => { throw new Error('Offline'); });
    const service = new FuelService(store, collector, () => Date.parse(checked));
    expect(await service.check()).toMatchObject({ state: 'error', records: [], lastSuccessAt: null });
    expect(await service.due()).toBe(false); await service.check(); expect(collector).toHaveBeenCalledTimes(1);
    expect(pktDay(Date.parse('2026-10-16T19:00:00Z'))).toBe('2026-10-17');
    expect(nextPktDay(Date.parse('2026-10-16T18:59:59Z'))).toBe('2026-10-16T19:00:00.000Z');
  });
  it('retains cache and daily attempt boundaries across SQLite restart', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'manzil-fuel-')); cleanup.push(() => rmSync(folder, { recursive: true, force: true }));
    const path = join(folder, 'test.sqlite'), first = new Store(path), collector = vi.fn(async () => [record]);
    await new FuelService(first, collector, () => Date.parse(checked)).check(); first.close();
    const next = new Store(path); cleanup.push(() => next.close());
    expect((await new FuelService(next, collector, () => Date.parse(checked)).check()).records).toEqual([record]);
    expect(collector).toHaveBeenCalledTimes(1);
  });
  it('uses the 01:00 PKT boundary so a midnight check cannot consume the coming scheduled check', async () => {
    let now = Date.parse('2026-10-17T19:30:00Z'); // October 18, 00:30 PKT.
    const store = database(), collector = vi.fn(async () => [record]);
    const service = new FuelService(store, collector, () => now);
    expect(fuelCheckDay(now)).toBe('2026-10-17');
    expect(nextFuelCheck(now)).toBe('2026-10-17T20:00:00.000Z');
    await service.check();
    now = Date.parse('2026-10-17T20:00:00Z');
    expect(fuelCheckDay(now)).toBe('2026-10-18');
    expect(await service.due()).toBe(true);
    await Promise.all([service.check(), new FuelService(store, collector, () => now).check()]);
    expect(collector).toHaveBeenCalledTimes(2);
    expect((await service.status()).nextCheckAt).toBe('2026-10-18T20:00:00.000Z');
  });
  it('normalizes a saved midnight refresh deadline to 01:00 without rewriting its rate history', async () => {
    const store = database();
    store.setMeta('fuel:status', { state: 'fresh', records: [record], lastCheckedAt: checked, lastSuccessAt: checked, nextCheckAt: '2026-10-17T19:00:00Z', message: 'Saved reference' });
    const service = new FuelService(store, vi.fn(), () => Date.parse('2026-10-17T19:30:00Z'));
    expect(await service.status()).toMatchObject({ state: 'fresh', records: [record], nextCheckAt: '2026-10-17T20:00:00.000Z' });
    expect(store.meta<{nextCheckAt: string}>('fuel:status')?.nextCheckAt).toBe('2026-10-17T19:00:00Z');
  });
  it('does not bridge an unobserved archive gap after a long offline period', async () => {
    const store = database();
    store.setMeta('fuel:status', { state: 'fresh', records: [{ ...record, effectiveFrom: '2026-09-01T19:00:00.000Z' }], lastCheckedAt: '2026-09-02T05:00:00Z', lastSuccessAt: '2026-09-02T05:00:00Z', nextCheckAt: '2026-09-02T19:00:00Z', message: 'Offline fixture' });
    const service = new FuelService(store, async () => [record], () => Date.parse(checked));
    const status = await service.check(); expect(status.records).toEqual([record]);
    expect(estimateRouteFuel(1000, '2026-09-20T05:00:00Z', vehicle, status.records)).toBeNull();
  });
  it('keeps the last usable cache when the source regresses to a disconnected old archive window', async () => {
    const store = database(); store.setMeta('fuel:status', { state: 'fresh', records: [record], lastCheckedAt: checked, lastSuccessAt: checked, nextCheckAt: checked, message: 'Offline fixture' });
    const service = new FuelService(store, async () => [{ ...record, effectiveFrom: '2026-09-01T19:00:00.000Z' }], () => Date.parse(checked));
    expect(await service.check()).toMatchObject({ state: 'error', records: [record] });
  });
});
describe('vehicle snapshot and retained-history statistics', () => {
  it('does not reset vehicle configuration time for ordinary profile saves, but updates it for real vehicle changes', () => {
    const store = database(); vi.useFakeTimers(); vi.setSystemTime('2026-10-17T00:00:00Z');
    const first = store.updateProfile({ vehicle }); vi.setSystemTime('2026-10-17T01:00:00Z');
    expect(store.updateProfile({ displayName: 'Changed', vehicle: { ...vehicle, label: '' } }).vehicleUpdatedAt).toBe(first.vehicleUpdatedAt);
    expect(store.updateProfile({ vehicle: { ...vehicle, kmPerLitre: 15 } }).vehicleUpdatedAt).toBe('2026-10-17T01:00:00.000Z'); vi.useRealTimers();
  });
  it('atomically drops stale vehicle estimates without altering prior saved trip snapshots', () => {
    const store = database(); store.updateProfile({ collectTravelData: true, vehicle });
    const profile = { ...store.profile(), vehicleUpdatedAt: '2026-10-16T00:00:00Z' }; store.setMeta('profile', profile);
    const original = { ...trip('old'), fuelEstimate: estimateRouteFuel(10_000, '2026-10-17T04:00:00Z', vehicle, [record])! };
    store.saveTripIfConsented(original); store.updateProfile({ vehicle: { ...vehicle, kmPerLitre: 20 } });
    store.saveTripIfConsented({ ...original, id: 'changed' });
    expect(store.get<Trip>('trip', 'old')?.fuelEstimate?.costPkr).toBe(300);
    expect(store.get<Trip>('trip', 'changed')?.fuelEstimate).toBeUndefined();
  });
  it('counts all retained summaries beyond display50, groups by PKT departure, and separates unknown cost', async () => {
    const store = database();
    for (let i = 0; i < 70; i++) store.put('trip', { ...trip(`priced-${i}`), fuelEstimate: estimateRouteFuel(10_000, checked, vehicle, [record])! });
    store.put('trip', trip('unknown', '2026-10-01T01:00:00Z'));
    store.put('trip', trip('prior-month', '2026-09-25T05:00:00Z')); store.put('trip', trip('future', '2026-10-18T05:00:00Z'));
    const stats = await travelStatistics(store, Date.parse(checked));
    expect(stats.week).toMatchObject({ tripCount: 70, costPkr: 21_000, pricedTripCount: 70, unpricedTripCount: 0, complete: true, from: '2026-10-11T19:00:00.000Z' });
    expect(stats.month).toMatchObject({ tripCount: 71, unpricedTripCount: 1, unpricedDistanceMeters: 10_000 });
    expect(stats.all).toMatchObject({ tripCount: 72, unpricedTripCount: 2, costPkr: 21_000 });
    expect(stats.week.daily).toHaveLength(6); expect(stats.month.daily).toHaveLength(17);
    expect(stats.week.daily?.at(-1)).toMatchObject({ date: '2026-10-17', tripCount: 70, distanceMeters: 700_000, pricedTripCount: 70, costPkr: 21_000, litres: 70 });
    expect(stats.month.daily?.[0]).toMatchObject({ date: '2026-10-01', tripCount: 1, unpricedTripCount: 1, costPkr: 0, litres: 0 });
    expect(stats.month.daily?.[1]).toMatchObject({ date: '2026-10-02', tripCount: 0, distanceMeters: 0, costPkr: 0 });
    expect(stats.month.daily?.reduce((total, day) => total + day.distanceMeters, 0)).toBe(stats.month.distanceMeters);
    expect(stats.all.daily).toBeUndefined();
  });
  it('groups graph buckets by PKT departure across midnight and excludes incomplete or future trips', async () => {
    const store = database();
    store.put('trip', trip('sunday', '2026-10-11T18:59:59Z'));
    store.put('trip', { ...trip('monday', '2026-10-11T19:00:00Z'), fuelEstimate: { ...estimateRouteFuel(10_000, checked, vehicle, [record])!, costPkr: 215, litres: .8 } });
    store.put('trip', trip('month-start', '2026-09-30T19:00:00Z'));
    store.put('trip', trip('prior-month', '2026-09-30T18:59:00Z'));
    store.put('trip', { ...trip('still-running', '2026-10-17T04:59:00Z'), endedAt: '2026-10-17T05:01:00Z' });
    store.put('trip', trip('future', '2026-10-18T00:00:00Z'));
    const summaries = vi.spyOn(store, 'listTripSummaries'), getTrip = vi.spyOn(store, 'get');
    const stats = await travelStatistics(store, Date.parse(checked));
    expect(summaries).toHaveBeenCalledWith(5001); expect(getTrip).not.toHaveBeenCalled();
    expect(stats.week.tripCount).toBe(1); expect(stats.month.tripCount).toBe(3);
    expect(stats.week.daily?.[0]).toMatchObject({ date: '2026-10-12', tripCount: 1, distanceMeters: 10_000, costPkr: 215, litres: .8 });
    expect(stats.month.daily?.find(day => day.date === '2026-10-11')).toMatchObject({ tripCount: 1, unpricedTripCount: 1, costPkr: 0 });
    expect(stats.month.daily?.[0]).toMatchObject({ date: '2026-10-01', tripCount: 1 });
    expect(stats.month.daily?.at(-1)).toMatchObject({ date: '2026-10-17', tripCount: 0 });
    expect(stats.month.daily?.reduce((sum, day) => sum + day.costPkr, 0)).toBe(stats.month.costPkr);
  });
  it('marks totals incomplete when the 5000-summary safety bound is exceeded', async () => {
    const store = database(); vi.spyOn(store, 'listTripSummaries').mockReturnValue(Array.from({ length: 5001 }, (_, i) => trip(`many-${i}`)));
    expect((await travelStatistics(store, Date.parse(checked))).all).toMatchObject({ tripCount: 5000, complete: false });
  });
});
