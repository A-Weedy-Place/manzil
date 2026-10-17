import { describe, expect, it } from 'vitest';
import { estimateRouteFuel, estimateTraceFuel } from '../shared/fuel';
import type { FuelPriceRecord, RecordedPoint, VehicleProfile } from '../shared/types';

const car: VehicleProfile = { kind: 'car', label: 'Fixture car', fuelType: 'petrol', kmPerLitre: 10 };
const rate = (at = '2026-10-15T19:00:00.000Z', petrol = 300): FuelPriceRecord => ({ effectiveFrom: at, petrolPerLitre: petrol,
  dieselPerLitre: 350, sourceUrl: 'https://psopk.com/fuel-prices/pol/archives', sourceName: 'Offline fixture', retrievedAt: '2026-10-17T05:00:00Z' });
const point = (longitude: number, timestamp: string, accuracy = 8): RecordedPoint => ({ coordinate: [longitude, 33.7], timestamp, accuracy });

describe('dated fuel reference estimates', () => {
  it('calculates route fuel in km/L and PKR using the applicable dated petrol or diesel price', () => {
    const estimate = estimateRouteFuel(10_000, '2026-10-16T10:00:00Z', car, [rate()]);
    expect(estimate).toMatchObject({ costPkr: 300, litres: 1, distanceMeters: 10_000, vehicle: car });
    expect(estimateRouteFuel(10_000, '2026-10-16T10:00:00Z', { ...car, fuelType: 'diesel' }, [rate()])?.costPkr).toBe(350);
    expect(estimateRouteFuel(10_000, '2026-10-16T10:00:00Z', { ...car, kind: 'motorcycle', kmPerLitre: 40 }, [rate()])?.costPkr).toBe(75);
  });
  it('never invents a price or economy and rejects malformed distances', () => {
    for (const distance of [-1, NaN, Infinity]) expect(estimateRouteFuel(distance, '2026-10-16T10:00:00Z', car, [rate()])).toBeNull();
    for (const kmPerLitre of [null, 0, 0.5, 201, NaN]) expect(estimateRouteFuel(1000, '2026-10-16T10:00:00Z', { ...car, kmPerLitre }, [rate()])).toBeNull();
    expect(estimateRouteFuel(1000, '2026-10-16T10:00:00Z', undefined, [rate()])).toBeNull();
    expect(estimateRouteFuel(1000, '2026-10-16T10:00:00Z', car, [])).toBeNull();
    expect(estimateRouteFuel(1000, 'invalid', car, [rate()])).toBeNull();
    expect(estimateRouteFuel(1000, '2026-10-15T18:59:59Z', car, [rate()])).toBeNull();
  });
  it('treats future selected dates as estimates at the most recent known reference, never a forecast price', () => {
    const future = estimateRouteFuel(10_000, '2027-01-01T00:00:00Z', car, [rate(), rate('2026-10-16T19:00:00.000Z', 320)]);
    expect(future).toMatchObject({ costPkr: 320, rates: [{ effectiveFrom: '2026-10-16T19:00:00.000Z' }] });
  });
  it('splits a GPS segment at a PKT effective date and retains both dated amounts', () => {
    const points = [point(73.04, '2026-10-16T18:59:40Z'), point(73.044, '2026-10-16T19:00:20Z')];
    const estimate = estimateTraceFuel(points, car, [rate(), rate('2026-10-16T19:00:00.000Z', 500)])!;
    expect(estimate.rates).toHaveLength(2);
    expect(estimate.rates[0].distanceMeters).toBeCloseTo(estimate.distanceMeters / 2);
    expect(estimate.rates[1].distanceMeters).toBeCloseTo(estimate.distanceMeters / 2);
    expect(estimate.costPkr).toBeCloseTo(estimate.litres * 400);
  });
  it('uses effective rates across gaps in publication dates instead of requiring a daily price row', () => {
    const estimate = estimateTraceFuel([point(73.04, '2026-10-18T05:00:00Z'), point(73.041, '2026-10-18T05:00:30Z')], car, [rate()]);
    expect(estimate?.rates[0].effectiveFrom).toBe(rate().effectiveFrom);
  });
  it('does not price a partially unknown historical trace or rejected GPS gaps', () => {
    const points = [point(73.04, '2026-10-15T18:59:40Z'), point(73.044, '2026-10-15T19:00:20Z')];
    expect(estimateTraceFuel(points, car, [rate()])).toBeNull();
    expect(estimateTraceFuel([point(73.04, '2026-10-16T05:00:00Z'), point(73.044, '2026-10-16T05:02:00Z')], car, [rate()])).toBeNull();
    expect(estimateTraceFuel([point(73.04, '2026-10-16T05:00:00Z', 200), point(73.044, '2026-10-16T05:00:30Z')], car, [rate()])).toBeNull();
    expect(estimateTraceFuel([point(73.04, '2026-10-16T05:00:00Z'), point(74.044, '2026-10-16T05:00:30Z')], car, [rate()])).toBeNull();
  });
});
