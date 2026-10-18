// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TransitOfficialReview as Review } from '../shared/transit';
import { validateTransitDataset } from '../server/transit/dataset';
import TransitOfficialReview from '../src/components/TransitOfficialReview';
import { setLanguage } from '../src/lib/language';
import { TRANSIT_AT, transitFixture } from './transit-fixture';

function comparison(status: Review['status'] = 'consistent'): Review {
  return { checkedAt: '2026-10-18T03:00:00.000Z', status, summary: 'The published stop order was compared for this route direction only. Coordinates and operation were not certified.', references: [{ label: 'CDA published route reference', url: 'https://lists.cda.gov.pk/Assets/metro_transit_route/FR-12_Forward.pdf' }, { label: 'PMA service reference', url: 'https://pma.punjab.gov.pk/rawalpindi' }] };
}
let fetcher: ReturnType<typeof vi.fn>, location: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setLanguage('en'); fetcher = vi.fn(); location = vi.fn(); vi.stubGlobal('fetch', fetcher);
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: location, watchPosition: location } });
});
afterEach(() => { cleanup(); setLanguage('en'); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('does not invent a review, request GPS or fetch a source when no comparison is attached', () => {
  const { container } = render(<TransitOfficialReview />);
  expect(container.textContent).toBe(''); expect(container.querySelector('details')).toBeNull();
  expect(fetcher).not.toHaveBeenCalled(); expect(location).not.toHaveBeenCalled();
});

it.each([
  ['consistent', 'Stops compared'], ['differences', 'Differences noted'], ['reference-only', 'Reference only'], ['not-established', 'No route-level confirmation'],
] as const)('presents %s as a dated, scoped disclosure rather than a verified-service badge', (status, label) => {
  const review = comparison(status), original = structuredClone(review);
  const { container } = render(<TransitOfficialReview review={review} />);
  const details = container.querySelector('details')!;
  expect(details.open).toBe(false); expect(details.querySelector('summary')?.textContent).toBe(`Official references · ${label}`);
  fireEvent.click(details.querySelector('summary')!); expect(details.open).toBe(true);
  expect(screen.getByText(review.summary)).toBeTruthy();
  expect(screen.getByText(/^Checked /).textContent).toMatch(/18.*Oct|Oct.*18/);
  expect(screen.getByText('This comparison does not certify map coordinates or live service.')).toBeTruthy();
  expect(container.querySelector('[role="status"], [role="alert"]')).toBeNull();
  expect(container.textContent).not.toMatch(/fully verified|officially verified|government approved|guaranteed live|all routes verified/i);
  const links = screen.getAllByRole('link'); expect(links).toHaveLength(review.references.length);
  for (let index = 0; index < links.length; index++) { expect(links[index].getAttribute('href')).toBe(review.references[index].url); expect(links[index].getAttribute('target')).toBe('_blank'); expect(links[index].getAttribute('rel')).toContain('noreferrer'); }
  expect(review).toEqual(original); expect(fetcher).not.toHaveBeenCalled(); expect(location).not.toHaveBeenCalled();
});

it('translates the disclosure scope and caution without changing the original source summary or links', () => {
  setLanguage('ur'); const review = comparison('differences'); const { container } = render(<TransitOfficialReview review={review} />);
  expect(container.querySelector('summary')?.textContent).toBe('سرکاری حوالہ جات · اختلافات ملے');
  expect(screen.getByText(review.summary)).toBeTruthy();
  expect(screen.getByText('یہ موازنہ نقشے کے نقاط یا موجودہ سروس کی تصدیق نہیں کرتا۔')).toBeTruthy();
  expect(container.querySelector('a')?.getAttribute('href')).toBe(review.references[0].url);
});

it.each([
  'https://cda.gov.pk/route', 'https://www.cda.gov.pk/route', 'https://lists.cda.gov.pk/Assets/metro_transit_route/FR-12_Forward.pdf',
  'https://pma.punjab.gov.pk/rawalpindi', 'https://etransit.punjab.gov.pk/', 'https://transport.punjab.gov.pk/', 'https://punjab.gov.pk/', 'https://cmta.pk/',
])('accepts an exact HTTPS authority reference without altering coordinates, shapes or timetable values: %s', url => {
  const data = transitFixture(); data.routes[0].officialReview = { ...comparison(), references: [{ label: 'Scoped authority reference', url }] };
  const before = structuredClone(data); const validated = validateTransitDataset(data);
  expect(validated).toEqual(before); expect(validated.stops).toEqual(before.stops); expect(validated.patterns).toEqual(before.patterns); expect(validated.trips).toEqual(before.trips);
  expect(fetcher).not.toHaveBeenCalled(); expect(location).not.toHaveBeenCalled();
});

it.each([
  'http://cda.gov.pk/route', 'https://user:password@cda.gov.pk/route', 'https://user@lists.cda.gov.pk/route',
  'https://cda.gov.pk.evil.example/route', 'https://lists.cda.gov.pk.evil.example/route', 'https://fake-cda.gov.pk/route',
  'https://cda.gov.pk@evil.example/route', 'https://pma.punjab.gov.pk@evil.example/route', 'https://cda.gov.pk:8443/route',
  'https://cda-gov.pk/route', 'https://сda.gov.pk/route', 'javascript:alert(1)', '//lists.cda.gov.pk/route', 'data:text/plain,reference',
])('rejects unsafe or lookalike official-reference URLs: %s', url => {
  const data = transitFixture(); data.routes[0].officialReview = { ...comparison(), references: [{ label: 'Reference', url }] };
  expect(() => validateTransitDataset(data)).toThrow(); expect(fetcher).not.toHaveBeenCalled(); expect(location).not.toHaveBeenCalled();
});

it('rejects a non-string official URL instead of accepting URL-constructor array coercion', () => {
  const data = transitFixture(); data.routes[0].officialReview = comparison();
  (data.routes[0].officialReview.references[0] as unknown as { url: unknown }).url = ['https://cda.gov.pk/route'];
  expect(() => validateTransitDataset(data)).toThrow();
});

it.each([
  { checkedAt: 'not-a-date' }, { status: 'verified' }, { summary: '' }, { references: [] },
])('rejects an invalid official comparison envelope: %o', patch => {
  const data = transitFixture(); data.routes[0].officialReview = { ...comparison(), ...patch } as Review;
  expect(() => validateTransitDataset(data)).toThrow();
  expect(data.importedAt).toBe(TRANSIT_AT);
});
