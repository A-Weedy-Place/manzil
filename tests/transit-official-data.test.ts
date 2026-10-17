import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import type { TransitDataset } from '../shared/transit';
import { validateTransitDataset } from '../server/transit/dataset';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../assets/transit/${name}`, import.meta.url), 'utf8'));
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const data = validateTransitDataset(JSON.parse(gunzipSync(readFileSync(new URL('../assets/transit/islamabad.json.gz', import.meta.url))).toString('utf8'))) as TransitDataset;
const manifest = read('official-review.json'), cda = read('cda-verification.json'), pma = read('pma-verification.json');

it('binds the shipped authority comparison to the exact imported evidence and public snapshot', () => {
  const provenance = read('provenance.json');
  expect(provenance.officialReviewSha256).toBe(digest(readFileSync(new URL('../assets/transit/official-review.json', import.meta.url))));
  expect(manifest.evidence.cdaSha256).toBe(digest(readFileSync(new URL('../assets/transit/cda-verification.json', import.meta.url))));
  expect(manifest.datasetVersion).toBe(cda.comparedDatasetVersion); expect(manifest.datasetVersion).toBe(pma.datasetVersion);
  expect(manifest.normalizedDatasetSha256).toBe(pma.normalizedDatasetSha256);
  expect(data.version).toBe(`${manifest.datasetVersion}-review-${provenance.officialReviewSha256.slice(0, 8)}`);
  expect(data.routes).toHaveLength(37); expect(data.patterns).toHaveLength(67); expect(data.stops).toHaveLength(1210);
  expect(data.routes.every(route => !!route.officialReview)).toBe(true);
  expect(data.routes.filter(route => route.officialReview?.status === 'consistent')).toHaveLength(10);
});

it('retains all 42 official CDA directional references without pretending their PDFs supply coordinates or current calendars', () => {
  expect(cda.portal.entries).toBe(22);
  const documents = cda.routes.flatMap((route: any) => route.directions.filter((direction: any) => direction.document).map((direction: any) => direction.document));
  expect(documents).toHaveLength(42);
  expect(documents.reduce((sum: number, document: any) => sum + document.pages, 0)).toBe(1244);
  expect(documents.reduce((sum: number, document: any) => sum + document.parsedTrips, 0)).toBe(2823);
  for (const document of documents) {
    expect(document.sha256).toMatch(/^[a-f0-9]{64}$/); expect(document.parsedTrips).toBe(document.declaredTrips);
    expect(document.stopSequences).toHaveLength(1); expect(document.stopSequences[0].length).toBeGreaterThan(1);
  }
  expect(cda.portal.coordinatesFound).toBe(false); expect(cda.aggregateOperationEvidence.doesNotEnumerateRouteCodes).toBe(true);
  const oldFR11 = cda.routes.find((route: any) => route.code === 'FR-11');
  expect(oldFR11.directions[0].document.stopSequences[0]).toHaveLength(10);
  expect(data.routes.find(route => route.shortName === 'FR-11')?.officialReview?.status).toBe('differences');
  expect(data.patterns.filter(pattern => pattern.routeId === oldFR11.committedRouteId).map(pattern => pattern.stopIds.length)).toEqual([20, 19]);
});

it('preserves official Punjab stop order agreement while rejecting the same invalid location found in its public source', () => {
  expect(pma.routes).toHaveLength(10);
  const directions = pma.routes.flatMap((route: any) => route.directions);
  expect(directions).toHaveLength(20); expect(directions.reduce((sum: number, direction: any) => sum + direction.sourceStopCount, 0)).toBe(313);
  const stops = new Map(data.stops.map(stop => [stop.id, stop]));
  for (const direction of directions) {
    const pattern = data.patterns.find(pattern => pattern.id === direction.patternId)!;
    expect(pattern).toBeTruthy();
    expect(digest(JSON.stringify(pattern.stopIds.map(id => stops.get(id)!.coordinate)))).toBe(direction.usableCoordinateSha256);
  }
  const broken = data.patterns.find(pattern => pattern.id === 'eqyn8')!;
  expect(broken.unplacedStops).toContain('Rahimabad'); expect(broken.breakAfterStopIndexes).toEqual([8]);
});

it('keeps contradictory partial Metro patterns unavailable and new historical references unmapped without altering the full Metro corridor', () => {
  for (const patternId of ['vtvpb', 'me5tv']) expect(data.patterns.find(pattern => pattern.id === patternId)?.routingUnavailableReason).toContain('IJP/Potohar');
  const full = data.routes.find(route => route.shortName === 'RLRT01')!;
  expect(data.patterns.filter(pattern => pattern.routeId === full.id).every(pattern => !pattern.routingUnavailableReason)).toBe(true);
  for (const code of ['FR-05', 'ST-01', 'FR-12']) {
    const route = data.routes.find(route => route.shortName === code)!;
    expect(route.coverage).toBe('catalogue-only'); expect(route.unplacedStopNames!.length).toBeGreaterThan(10);
    expect(data.patterns.some(pattern => pattern.routeId === route.id)).toBe(false);
  }
  expect(data.routes.find(route => route.shortName === 'FR-05')?.officialReview?.summary).toContain('both PDFs list NUST Metro–D-12');
});
