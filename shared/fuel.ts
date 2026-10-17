import type { FuelEstimate, FuelPriceRecord, RecordedPoint, VehicleProfile } from './types.js';

export function sameVehicle(a: VehicleProfile | undefined, b: VehicleProfile | undefined): boolean {
  return a?.kind === b?.kind && a?.fuelType === b?.fuelType && a?.kmPerLitre === b?.kmPerLitre && (a?.label?.trim() || '') === (b?.label?.trim() || '');
}

/** Quotes are estimates using the latest known effective rate, including for future departures. */
export function applicableFuelRate(at: string | number, records: FuelPriceRecord[]): FuelPriceRecord | null {
  const time = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(time)) return null;
  return records.filter(record => Number.isFinite(Date.parse(record.effectiveFrom)) && Date.parse(record.effectiveFrom) <= time)
    .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0] ?? null;
}
function economy(vehicle?: VehicleProfile): vehicle is VehicleProfile & { kmPerLitre: number } {
  return !!vehicle && Number.isFinite(vehicle.kmPerLitre) && vehicle.kmPerLitre! >= 1 && vehicle.kmPerLitre! <= 200;
}
function item(distance: number, vehicle: VehicleProfile & { kmPerLitre: number }, record: FuelPriceRecord) {
  const price = vehicle.fuelType === 'diesel' ? record.dieselPerLitre : record.petrolPerLitre;
  if (!Number.isFinite(price) || price <= 0) return null;
  const litres = distance / 1000 / vehicle.kmPerLitre;
  return { pricePerLitre: price, effectiveFrom: record.effectiveFrom, sourceUrl: record.sourceUrl, retrievedAt: record.retrievedAt,
    distanceMeters: distance, litres, costPkr: litres * price };
}
export function estimateRouteFuel(distanceMeters: number, at: string, vehicle: VehicleProfile | undefined, records: FuelPriceRecord[], now = new Date().toISOString()): FuelEstimate | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || !economy(vehicle)) return null;
  const record = applicableFuelRate(at, records);
  if (!record) return null;
  const rate = item(distanceMeters, vehicle, record);
  return rate ? { costPkr: rate.costPkr, litres: rate.litres, distanceMeters, vehicle: { ...vehicle }, calculatedAt: now, rates: [rate] } : null;
}
function distance(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  return Math.hypot((b[0] - a[0]) * Math.cos((a[1] + b[1]) * rad / 2), b[1] - a[1]) * rad * 6_371_000;
}
/** Same quality filter as the recorded-distance summary. Unknown historical intervals fail closed. */
export function estimateTraceFuel(points: RecordedPoint[], vehicle: VehicleProfile | undefined, records: FuelPriceRecord[], now = new Date().toISOString()): FuelEstimate | null {
  if (!economy(vehicle) || points.length < 2) return null;
  const rates: FuelEstimate['rates'] = [];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index], start = Date.parse(a.timestamp), end = Date.parse(b.timestamp);
    const seconds = (end - start) / 1000, length = distance(a.coordinate, b.coordinate);
    if (seconds <= 0 || seconds > 60 || a.accuracy > 100 || b.accuracy > 100 || length / seconds > 65) continue;
    const cuts = [start, ...records.map(record => Date.parse(record.effectiveFrom)).filter(time => time > start && time < end), end].sort((x, y) => x - y);
    for (let cut = 1; cut < cuts.length; cut++) {
      const record = applicableFuelRate(cuts[cut - 1], records);
      if (!record) return null;
      const part = item(length * (cuts[cut] - cuts[cut - 1]) / (end - start), vehicle, record);
      if (!part) return null;
      const previous = rates.find(rate => rate.effectiveFrom === part.effectiveFrom && rate.pricePerLitre === part.pricePerLitre && rate.sourceUrl === part.sourceUrl);
      if (previous) { previous.distanceMeters += part.distanceMeters; previous.litres += part.litres; previous.costPkr += part.costPkr; }
      else rates.push(part);
    }
  }
  if (!rates.length) return null;
  // Match the integer metre distance stored in the trip summary, without accumulating per-segment rounding errors.
  const rawDistance = rates.reduce((sum, rate) => sum + rate.distanceMeters, 0), roundedDistance = Math.round(rawDistance);
  const scale = rawDistance ? roundedDistance / rawDistance : 1;
  for (const rate of rates) { rate.distanceMeters *= scale; rate.litres *= scale; rate.costPkr *= scale; }
  return { costPkr: rates.reduce((sum, rate) => sum + rate.costPkr, 0), litres: rates.reduce((sum, rate) => sum + rate.litres, 0),
    distanceMeters: roundedDistance, vehicle: { ...vehicle }, calculatedAt: now, rates };
}
