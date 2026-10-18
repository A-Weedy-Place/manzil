// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TransitFareBadge, TransitFareDetails, TransitRideFare } from '../src/components/TransitFare';
import { setLanguage } from '../src/lib/language';
import { priceTransitJourney } from '../server/transit/fares';
import type { TransitJourney, TransitNetwork, TransitRideLeg } from '../shared/transit';
import { TRANSIT_AT, transitFixture } from './transit-fixture';

afterEach(() => { cleanup(); setLanguage('en'); });
function fareFixture() {
  const data = transitFixture(); data.routes[0] = { ...data.routes[0], shortName: 'RLRT01', agency: 'Punjab Masstransit Authority' };
  const ride: TransitRideLeg = { kind: 'ride', routeId: data.routes[0].id, patternId: 'p1', from: data.stops[0], to: data.stops[2], stops: data.stops, geometry: data.patterns[0].geometry, geometryQuality: 'provided-shape', distanceMeters: 4000, durationSeconds: 1200, departureAt: TRANSIT_AT, arrivalAt: '2026-10-18T03:20:00Z', availability: 'available' };
  const journey: TransitJourney = { id: 'x', departureAt: TRANSIT_AT, arrivalAt: null, durationSeconds: null, distanceMeters: 4000, walkingDistanceMeters: 0, transfers: 0, timing: 'unknown', warnings: [], legs: [ride] };
  const network: TransitNetwork = { ...data, importedAt: TRANSIT_AT, evaluatedAt: TRANSIT_AT, eventRevision: 0, disruptionRevision: 0, statuses: [], disruptions: [] };
  return { journey: priceTransitJourney(journey, data.routes), network };
}
it('shows a compact option estimate with source/date behind keyboard-accessible details', () => {
  const { journey, network } = fareFixture(); render(<TransitFareDetails journey={journey} network={network} />);
  expect(screen.getByText('Fare estimate')).toBeTruthy(); expect(screen.getAllByText('PKR 30')).toHaveLength(2);
  const summary = screen.getByText('Fare details'); fireEvent.click(summary);
  expect(summary.closest('details')?.open).toBe(true);
  expect(screen.getByRole('link', { name: 'PMA fare policy' }).getAttribute('href')).toBe('https://pma.punjab.gov.pk/index.php/fare-policy');
  expect(screen.getByText(/Checked 18 Oct 2026/)).toBeTruthy();
});
it('labels partial/unknown fare instead of a fake zero or a complete subtotal', () => {
  const { journey } = fareFixture(); render(<TransitFareBadge fare={{ ...journey.fare!, total: null, status: 'partial', unknownRides: 1 }} />);
  expect(screen.getByText('Fare incomplete')).toBeTruthy(); expect(screen.queryByText('PKR 30')).toBeNull();
});
it('localizes the visible reference label and supports responses without fare metadata', () => {
  setLanguage('ur'); const { journey } = fareFixture(); const element = render(<TransitFareBadge fare={journey.fare} />);
  expect(screen.getByText('تخمینی کرایہ')).toBeTruthy(); element.rerender(<TransitRideFare leg={{ ...(journey.legs[0] as TransitRideLeg), fare: undefined }} />);
  expect(screen.getByText('کرایہ دستیاب نہیں')).toBeTruthy();
});
