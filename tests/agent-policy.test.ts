import { describe, expect, it, vi } from 'vitest';
import { planAgentActions } from '../server/agent-policy';
import { resolveAgentLocation } from '../server/agent-location';
import { sourceSupportsInstant } from '../server/agent-time';
import { buildGraph } from '../server/routing/graph';
import type { Closure } from '../shared/types';
import { extraction, location, notice, now } from './agent-fixtures';

const plan = (value = extraction(), posts = notice(), incidents: Closure[] = []) => planAgentActions(posts, value, incidents, { autoPublish: true, imageCount: 0, now, resolve: async () => location() });
const incident = async () => { const change = (await plan()).changes[0]; return { ...change.draft, id: change.id, revision: 1,
  createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() } as Closure; };
describe('evidence-constrained agent actions', () => {
  it('publishes a precisely mapped, explicitly timed closure with source provenance', async () => {
    const result = await plan(); expect(result.issues).toEqual([]); expect(result.changes).toHaveLength(1);
    expect(result.changes[0].draft).toMatchObject({ status: 'published', moderation: 'approved', startsAt: '2026-10-17T12:00:00.000Z',
      agent: { sourceId: '123456789', sourceRevision: 1, locationKey: location().key } });
  });
  it.each(['missing_time','unknown_publication','image','slow','metro','warning','uncertain','truncated','false_quote','invented_clock','invented_day'])(
    'withholds uncertain or unsupported geometry/time evidence: %s', async kind => {
      const value = extraction(), post = notice(), event = value.events[0];
      if (kind === 'missing_time') event.endsAt = null;
      if (kind === 'unknown_publication') post.publishedAt = null;
      if (kind === 'image') event.imageIndex = 0;
      if (kind === 'slow') { event.action = 'disruption'; event.impact = 'slow'; }
      if (kind === 'metro') { post.text = event.quote = 'Today Metro bus service closed from 5 pm to 7 pm.'; }
      if (kind === 'warning') value.warnings.push('Ambiguous translation');
      if (kind === 'uncertain') event.uncertainties.push('Road name ambiguous');
      if (kind === 'truncated') post.contentState = 'possibly_truncated';
      if (kind === 'false_quote') event.quote = 'An invented closed road statement';
      if (kind === 'invented_clock') event.endsAt = '2026-10-17T20:00:00+05:00';
      if (kind === 'invented_day') { event.startsAt = '2026-10-18T17:00:00+05:00'; event.endsAt = '2026-10-18T19:00:00+05:00'; }
      const result = await plan(value, post); expect(result.changes).toEqual([]); expect(result.issues.length).toBeGreaterThan(0);
    });
  it('dismisses missing-person notices and retains fuel announcements for reference verification', async () => {
    const value = extraction(); value.category = 'irrelevant'; value.irrelevantReason = 'missing_person'; value.events = [];
    expect(await plan(value)).toMatchObject({ dismissed: true, changes: [] });
    value.category = 'fuel'; value.fuel = [{ fuelType: 'petrol', pricePerLitre: 300, effectiveAt: null, quote: 'petrol 300' }];
    expect(await plan(value)).toMatchObject({ dismissed: false, changes: [], issues: [expect.stringContaining('PSO')] });
  });
  it('retains interpreted events in review mode without publishing', async () => {
    expect((await planAgentActions(notice(), extraction(), [], { autoPublish: false, imageCount: 0, now })).changes).toEqual([]);
  });
  it('cancels only a matched agent incident on newer, explicit current reopening evidence', async () => {
    const old = await incident(), value = extraction(), post = notice({ publishedAt: '2026-10-17T12:20:00Z', text: 'Park Road is now open; traffic resumed.' });
    Object.assign(value.events[0], { action: 'reopening', impact: 'unknown', startsAt: post.publishedAt, targetIncidentId: old.id, quote: post.text });
    const result = await plan(value, post, [old]); expect(result.changes[0].draft.status).toBe('cancelled');
    value.events[0].startsAt = '2026-10-17T13:00:00Z'; expect((await plan(value, post, [old])).changes).toEqual([]);
    value.events[0].startsAt = post.publishedAt; value.events[0].targetIncidentId = 'unrelated'; expect((await plan(value, post, [old])).changes).toEqual([]);
    value.events[0].targetIncidentId = old.id; old.startsAt = '2026-10-18T12:00:00Z'; expect((await plan(value, post, [old])).changes).toEqual([]);
  });
  it('preserves admin corrections across edited notices and duplicate sources', async () => {
    const old = await incident(); old.agent!.overridden = true; old.status = 'cancelled';
    expect((await plan(extraction(), notice({ revision: 2, sourceTimestamp: { at: '2026-10-17T12:25:00Z', kind: 'edited' } }), [old])).changes).toEqual([]);
    expect((await plan(extraction(), notice({ sourceId: 'other-source', publishedAt: '2026-10-17T12:25:00Z' }), [old])).changes).toEqual([]);
  });
  it('matches source dates and PKT clocks without treating collection time as publication', () => {
    expect(sourceSupportsInstant('Tomorrow 5 pm to 7 pm', '2026-10-18T17:00:00+05:00', notice().publishedAt!)).toBe(true);
    expect(sourceSupportsInstant('2026-10-17 17:00', '2026-10-17T17:00:00+05:00', notice().publishedAt!)).toBe(true);
    expect(sourceSupportsInstant('آج ۱۷:۰۰', '2026-10-17T17:00:00+05:00', notice().publishedAt!)).toBe(true);
    expect(sourceSupportsInstant('5 pm to 7 pm', '2026-10-17T17:00:00+05:00', notice().publishedAt!)).toBe(false);
    expect(sourceSupportsInstant('17 October 2025 5 pm', '2026-10-17T17:00:00+05:00', notice().publishedAt!)).toBe(false);
  });
});
describe('source location resolution against actual roads', () => {
  const graph = () => buildGraph({ elements: [
    ...[[73,33.7],[73.001,33.7],[73.002,33.7],[73.001,33.701],[73.002,33.701]].map((p,i) => ({ type: 'node' as const, id: i + 1, lon: p[0], lat: p[1] })),
    { type: 'way', id: 10, nodes: [1,2,3], tags: { highway: 'residential', name: 'Park Road' } },
    { type: 'way', id: 11, nodes: [2,4], tags: { highway: 'residential', name: 'First Road' } },
    { type: 'way', id: 12, nodes: [3,5], tags: { highway: 'residential', name: 'Second Road' } },
  ] }, [72.99,33.69,73.01,33.71]);
  it('maps named intersections to a connected section without external lookup', async () => {
    const lookup = vi.fn(); const resolved = await resolveAgentLocation(extraction().events[0], graph(), lookup);
    expect(resolved.drawing.kind).toBe('line'); expect(resolved.drawing.coordinates[0]).toEqual([73.001,33.7]);
    expect(lookup).not.toHaveBeenCalled();
  });
  it('holds unknown roads, unsupported cities and ambiguous places for review', async () => {
    const event = extraction().events[0]; event.location.city = 'Lahore';
    await expect(resolveAgentLocation(event, graph(), vi.fn())).rejects.toThrow(/Islamabad/);
    event.location.city = 'Islamabad'; event.location.road = 'Invented Road';
    await expect(resolveAgentLocation(event, graph(), vi.fn())).rejects.toThrow(/matched/);
    event.location.road = 'Park Road'; event.location.from = 'Unknown Place';
    await expect(resolveAgentLocation(event, graph(), async () => [])).rejects.toThrow(/ambiguous/);
  });
});
