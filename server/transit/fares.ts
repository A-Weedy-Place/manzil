import type { TransitJourney, TransitLeg, TransitRideLeg, TransitRoute } from '../../shared/transit.js';
import type { TransitFareReference, TransitJourneyFare, TransitLegFare } from '../../shared/transit-fares.js';

export const TRANSIT_FARES_CHECKED_ON = '2026-10-18';
export const transitFareReferences: Readonly<Record<string, TransitFareReference>> = {
  metro: {
    id: 'pma-pakistan-metro-policy-20261018', label: 'PMA fare policy',
    url: 'https://pma.punjab.gov.pk/index.php/fare-policy', checkedOn: TRANSIT_FARES_CHECKED_ON, evidence: 'operator-policy',
  },
  punjabElectric: {
    id: 'punjab-electric-policy-20261018', label: 'Punjab E-bus fare policy',
    url: 'https://punjab.gov.pk/index.php/e-buses', checkedOn: TRANSIT_FARES_CHECKED_ON, evidence: 'government-policy',
  },
  cda: {
    id: 'cda-reported-reference-20250615', label: 'APP · CDA fare rollback',
    url: 'https://www.app.com.pk/national/metro-bus-struggles-to-balance-cheaper-fares-with-reliable-service/',
    checkedOn: TRANSIT_FARES_CHECKED_ON, publishedOn: '2025-06-15', evidence: 'government-report',
  },
};

/** Deliberately scoped to imported, identified service families, not colour/name guesses. */
export function referenceFareForRide(route: TransitRoute | undefined, ride: TransitRideLeg, departureAt: string): TransitLegFare {
  const unknown = (reason: TransitLegFare['reason']): TransitLegFare => ({ currency: 'PKR', amount: null, status: 'unknown', reason });
  const departure = Date.parse(ride.departureAt ?? departureAt);
  // This reviewed snapshot cannot reconstruct temporary free-travel schemes or old tariffs.
  if (!Number.isFinite(departure) || new Date(departure + 5 * 3600_000).toISOString().slice(0, 10) < TRANSIT_FARES_CHECKED_ON) return unknown('historical-price-unavailable');
  if (!route) return unknown('unverified-route');
  let amount: number, reference: TransitFareReference;
  if (route.agency === 'Punjab Masstransit Authority' && ['RLRT01', 'RLRT03', 'RLRT04'].includes(route.shortName)) {
    // PMA requires exit within 75 minutes; an additional fare can apply after that.
    if (ride.durationSeconds !== null && ride.durationSeconds > 75 * 60) return unknown('additional-fare-possible');
    amount = 30; reference = transitFareReferences.metro;
  } else if (route.agency === 'Transport and Mass Transit Department, Punjab' && /^EV051(?:01|02|04|05|09|10|1A)$/.test(route.shortName)) {
    amount = 20; reference = transitFareReferences.punjabElectric;
  } else if (route.agency === 'Capital Development Authority' && (route.shortName === 'Orange' || /^FR-(?:01|03A|04|04A|06|07|08A|08B|08C|09|10|11|12|13|14|14A|15|17)$/.test(route.shortName) || ['FRB-1', 'FRG-1'].includes(route.shortName))) {
    amount = 50; reference = transitFareReferences.cda;
  } else return unknown('unverified-route');
  return { currency: 'PKR', amount, status: 'reference', reference: { ...reference } };
}

export function priceTransitJourney(journey: TransitJourney, routes: TransitRoute[]): TransitJourney {
  const byId = new Map(routes.map(route => [route.id, route]));
  const legs: TransitLeg[] = journey.legs.map(leg => leg.kind === 'ride' ? { ...leg, fare: referenceFareForRide(byId.get(leg.routeId), leg, journey.departureAt) } : leg);
  const rides = legs.filter((leg): leg is TransitRideLeg => leg.kind === 'ride');
  const knownSubtotal = rides.reduce((sum, leg) => sum + (leg.fare?.amount ?? 0), 0);
  const unknownRides = rides.filter(leg => leg.fare?.amount == null).length;
  const status: TransitJourneyFare['status'] = !rides.length || unknownRides === rides.length ? 'unknown' : unknownRides ? 'partial' : 'complete';
  return { ...journey, legs, fare: { currency: 'PKR', total: status === 'complete' ? knownSubtotal : null, knownSubtotal, status, unknownRides, checkedOn: TRANSIT_FARES_CHECKED_ON, basis: 'general-adult-single-boarding-reference' } };
}
