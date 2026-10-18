import { describe, expect, it } from 'vitest';
import type { TransitJourney, TransitRideLeg, TransitRoute } from '../shared/transit';
import { priceTransitJourney, referenceFareForRide, transitFareReferences } from '../server/transit/fares';
import { planTransit } from '../server/transit/planner';
import { loadTransitDataset } from '../server/transit/dataset';
import { TRANSIT_AT, transitFixture } from './transit-fixture';

const fixture = transitFixture();
const metro: TransitRoute = { ...fixture.routes[0], id: 'metro', shortName: 'RLRT01', agency: 'Punjab Masstransit Authority' };
const electric: TransitRoute = { ...fixture.routes[0], id: 'electric', shortName: 'EV05101', agency: 'Transport and Mass Transit Department, Punjab' };
const feeder: TransitRoute = { ...fixture.routes[0], id: 'cda', shortName: 'FR-06', agency: 'Capital Development Authority' };
const ride = (routeId: string): TransitRideLeg => ({ kind: 'ride', routeId, patternId: routeId, from: fixture.stops[0], to: fixture.stops[2], stops: fixture.stops, geometry: fixture.patterns[0].geometry, geometryQuality: 'provided-shape', distanceMeters: 4000, departureAt: TRANSIT_AT, arrivalAt: '2026-10-18T03:20:00Z', durationSeconds: 1200, availability: 'available' });
const journey = (rides: TransitRideLeg[]): TransitJourney => ({ id: 'fare-test', departureAt: TRANSIT_AT, arrivalAt: null, durationSeconds: null, distanceMeters: 4000 * rides.length, walkingDistanceMeters: 0, transfers: Math.max(0, rides.length - 1), timing: 'unknown', warnings: [], legs: rides });

describe('scoped general-adult bus fare reference estimates', () => {
  it('keeps PMA metro, Punjab electric and reported CDA estimates separate with provenance', () => {
    expect(referenceFareForRide(metro, ride(metro.id), TRANSIT_AT)).toMatchObject({ currency: 'PKR', amount: 30, status: 'reference', reference: { evidence: 'operator-policy', checkedOn: '2026-10-18' } });
    expect(referenceFareForRide(electric, ride(electric.id), TRANSIT_AT)).toMatchObject({ amount: 20, reference: { evidence: 'government-policy', url: 'https://punjab.gov.pk/index.php/e-buses' } });
    expect(referenceFareForRide(feeder, ride(feeder.id), TRANSIT_AT)).toMatchObject({ amount: 50, reference: { evidence: 'government-report', publishedOn: '2025-06-15' } });
    expect(transitFareReferences.cda.url).toContain('app.com.pk');
  });

  it('adds a separate base reference for every boarding without guessing integrated discounts', () => {
    const result = priceTransitJourney(journey([ride(electric.id), ride(metro.id), ride(feeder.id)]), [metro, electric, feeder]);
    expect(result.fare).toMatchObject({ total: 100, knownSubtotal: 100, status: 'complete', unknownRides: 0, basis: 'general-adult-single-boarding-reference' });
    expect(result.legs.filter(leg => leg.kind === 'ride').map(leg => leg.fare?.amount)).toEqual([20, 30, 50]);
  });

  it('never presents a partial subtotal or an unsupported family as a complete/free fare', () => {
    const airport = { ...feeder, id: 'airport', shortName: 'Airport' };
    const partial = priceTransitJourney(journey([ride(metro.id), ride(airport.id)]), [metro, airport]);
    expect(partial.fare).toMatchObject({ total: null, knownSubtotal: 30, status: 'partial', unknownRides: 1 });
    expect(priceTransitJourney(journey([ride(airport.id)]), [airport]).fare).toMatchObject({ total: null, knownSubtotal: 0, status: 'unknown', unknownRides: 1 });
    expect(priceTransitJourney(journey([]), []).fare?.total).toBeNull();
    for (const shortName of ['ST-01', 'ST-02', 'EX-16', 'FR-04B', 'FR-999']) expect(referenceFareForRide({ ...feeder, shortName }, ride(feeder.id), TRANSIT_AT).amount).toBeNull();
  });

  it('requires the identified operator as well as route family, not a suggestive display name', () => {
    expect(referenceFareForRide({ ...metro, agency: 'Other operator' }, ride(metro.id), TRANSIT_AT).amount).toBeNull();
    expect(referenceFareForRide({ ...electric, shortName: 'EV-1' }, ride(electric.id), TRANSIT_AT).amount).toBeNull();
    expect(referenceFareForRide(undefined, ride('missing'), TRANSIT_AT).amount).toBeNull();
  });

  it('does not reconstruct historical fares, temporary concessions or additional long-metro charges', () => {
    expect(referenceFareForRide(metro, { ...ride(metro.id), departureAt: '2026-04-10T03:00:00Z' }, TRANSIT_AT)).toMatchObject({ amount: null, reason: 'historical-price-unavailable' });
    expect(referenceFareForRide(metro, { ...ride(metro.id), durationSeconds: 4501 }, TRANSIT_AT)).toMatchObject({ amount: null, reason: 'additional-fare-possible' });
    expect(referenceFareForRide(metro, { ...ride(metro.id), durationSeconds: 4500 }, TRANSIT_AT).amount).toBe(30);
    expect(referenceFareForRide(electric, { ...ride(electric.id), departureAt: null, durationSeconds: null }, '2026-10-17T19:00:00Z').amount).toBe(20); // 18 October PKT.
  });

  it('decorates real imported options after eligibility without inventing missing timetables', () => {
    const data = loadTransitDataset()!, pattern = data.patterns.find(pattern => pattern.routeId === data.routes.find(route => route.shortName === 'Orange')!.id)!;
    const stops = new Map(data.stops.map(stop => [stop.id, stop]));
    const result = planTransit(data, { origin: stops.get(pattern.stopIds[0])!, destination: stops.get(pattern.stopIds[4])!, departureAt: TRANSIT_AT }, [], [], 0, 0);
    const option = result.options.find(option => option.legs.some(leg => leg.kind === 'ride' && leg.routeId === pattern.routeId))!;
    expect(option).toBeTruthy(); expect(option.timing).toBe('unknown'); expect(option.arrivalAt).toBeNull();
    expect(option.fare?.status).toBe('complete'); expect(option.fare?.total).toBeGreaterThanOrEqual(50);
    expect(option.legs.find(leg => leg.kind === 'ride' && leg.routeId === pattern.routeId)).toMatchObject({ fare: { amount: 50 } });
  });
});
