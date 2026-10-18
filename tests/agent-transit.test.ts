import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Store } from '../server/store';
import { AgentService } from '../server/agent';
import { agentConfig } from '../server/gemini';
import { prepareAgentProposals } from '../server/agent-proposals';
import { isTransitEvent } from '../server/agent-transit';
import { TransitService } from '../server/transit/service';
import { loadTransitDataset } from '../server/transit/dataset';
import { agentResultKey, extractionSchema, type AgentProposalReview, type AgentResult } from '../shared/agent';
import type { TransitDisruptionDraft, TransitDisruptionState } from '../shared/transit';
import { claimInput, extraction, finished, notice, now } from './agent-fixtures';

const stores: Store[] = [], data = loadTransitDataset()!;
const reviewer = { uid: 'test-admin', displayName: 'Test administrator', role: 'admin' as const };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); });
afterEach(() => { stores.splice(0).forEach(store => store.close()); vi.useRealTimers(); });
function serviceInput(route = 'Green Line') {
  const value = extraction(), text = `Today ${route} bus service in Islamabad is suspended from 5 pm to 7 pm.`;
  value.events[0] = { ...value.events[0], action: 'disruption', impact: 'unknown', title: `${route} suspended`, quote: text,
    location: { city: 'Islamabad', road: null, from: null, to: null, point: null }, service: { route, from: null, to: null, scope: 'route' } };
  return { value, post: notice({ text }) };
}
async function setup(input = serviceInput()) {
  const store = new Store(':memory:'); stores.push(store);
  const { id: _id, revision: _revision, status: _status, receivedAt: _received, ...source } = input.post;
  const post = store.upsertNotice(source).notice, claim = store.claimAgentWork(claimInput(post))!;
  store.completeAgentWork({ noticeId: post.id, revision: post.revision, claimId: claim.claimId, result: { ...finished(claim), extraction: input.value }, changes: [] });
  const service = new AgentService(store, agentConfig({}));
  const result = await service.prepareNotice(post.id, post.revision), proposal = result.proposals![0];
  const review = (patch: Partial<AgentProposalReview> = {}): AgentProposalReview => ({ noticeId: post.id, noticeRevision: post.revision,
    index: 0, version: proposal.version, decision: 'approve', reviewer, confirmTransitScope: true,
    transitDraft: proposal.transitDraft as TransitDisruptionDraft, ...patch });
  return { store, post, service, proposal, review, result };
}
it('classifies a literal service suspension as a private bus proposal without invoking road resolution', async () => {
  const { value, post } = serviceInput(), road = vi.fn();
  const [proposal] = await prepareAgentProposals(post, value, [], { resolve: road, now });
  expect(proposal).toMatchObject({ kind: 'transit', mapping: 'transit', draft: {}, transitDraft: { routeId: 'px6f2', status: 'published',
    startsAt: value.events[0].startsAt, endsAt: value.events[0].endsAt } });
  expect(road).not.toHaveBeenCalled();
  expect(extractionSchema.parse(value).events[0].service?.route).toBe('Green Line');
});
it('supports narrow older saved metro service interpretations but keeps a road beside a metro station a road', async () => {
  const { value, post } = serviceInput(); delete value.events[0].service; value.events[0].location.road = 'Green Line';
  expect((await prepareAgentProposals(post, value, []))[0].kind).toBe('transit');
  expect(isTransitEvent({ ...value.events[0], quote: 'The road next to Metro Station is closed.' })).toBe(false);
  expect(isTransitEvent({ ...value.events[0], action: 'closure', service: null, location: { ...value.events[0].location, road: 'Park Road' },
    quote: 'Metro bus service is suspended and Park Road is closed.' })).toBe(false);
  expect(isTransitEvent({ ...value.events[0], action: 'closure', service: null, location: { ...value.events[0].location, road: 'Park Road' },
    quote: 'Park Road remains open. Metro bus service is closed.' })).toBe(true);
});
it('does not map a generic metro report, an invented line, an unsupported city or unevidenced route name', async () => {
  for (const kind of ['generic', 'city', 'invented', 'mismatch'] as const) {
    const { value, post } = serviceInput();
    if (kind === 'generic') { value.events[0].service!.route = null; }
    if (kind === 'city') { value.events[0].location.city = 'Karachi'; }
    if (kind === 'invented') { value.events[0].service!.route = 'Imaginary Express'; }
    if (kind === 'mismatch') { value.events[0].service!.route = 'Blue Line'; }
    const [proposal] = await prepareAgentProposals(post, value, []);
    expect(proposal).toMatchObject({ kind: 'transit', mapping: 'unresolved', draft: {} });
    expect(proposal.transitDraft?.routeId).toBeUndefined();
  }
});
it('resolves only exact ordered stop scope and never widens unresolved endpoints silently', async () => {
  const pattern = data.patterns.find(item => item.routeId === 'px6f2')!, a = data.stops.find(stop => stop.id === pattern.stopIds[0])!, b = data.stops.find(stop => stop.id === pattern.stopIds[2])!;
  const { value, post } = serviceInput(); value.events[0].service = { route: 'Green Line', from: a.name, to: b.name, scope: 'segment' };
  let [proposal] = await prepareAgentProposals(post, value, []);
  expect(proposal.transitDraft).toMatchObject({ fromStopId: a.id, toStopId: b.id });
  value.events[0].service.from = 'Unmapped imaginary platform';
  [proposal] = await prepareAgentProposals(post, value, []);
  expect(proposal.mapping).toBe('unresolved'); expect(proposal.transitDraft?.fromStopId).toBeUndefined();
  expect(proposal.issues.join(' ')).toMatch(/section is unresolved/);
});
it('does not invent publication-relative or missing times for a service proposal', async () => {
  const { value, post } = serviceInput(); post.publishedAt = null;
  const [proposal] = await prepareAgentProposals(post, value, []);
  expect(proposal.transitDraft?.startsAt).toBeUndefined(); expect(proposal.transitDraft?.endsAt).toBeUndefined();
  expect(proposal.issues.join(' ')).toMatch(/confirmed start.*confirmed expiry/);
});
it('atomically approves once into service metadata, greys only that line, and creates no road closure', async () => {
  const { store, review, proposal, post } = await setup();
  expect(store.meta('transit:disruptions')).toBeUndefined();
  const decision = store.reviewAgentProposal(review());
  expect(decision.closure).toBeUndefined(); expect(decision.transitDisruption).toMatchObject({ routeId: 'px6f2', status: 'published', reviewedBy: reviewer,
    agent: { noticeId: post.id, sourceRevision: 1 } });
  expect(decision.result.transitDisruptionIds).toEqual([proposal.targetId]); expect(decision.result.state).toBe('applied');
  expect(store.routingSnapshot().closures).toEqual([]); expect(store.eventRevision).toBe(0);
  expect(store.meta<TransitDisruptionState>('transit:disruptions')?.revision).toBe(1);
  const network = await new TransitService(store).network('2026-10-17T17:45:00+05:00');
  expect(network.statuses.filter(item => data.patterns.find(pattern => pattern.id === item.patternId)?.routeId === 'px6f2').every(item => item.availability === 'suspended')).toBe(true);
  expect(network.statuses.find(item => data.patterns.find(pattern => pattern.id === item.patternId)?.routeId === 'ammha')?.availability).not.toBe('suspended');
  expect(() => store.reviewAgentProposal(review())).toThrow(/already been decided/);
  expect(store.meta<TransitDisruptionState>('transit:disruptions')?.revision).toBe(1);
});
it('rejects without public service changes and preserves the saved decision', async () => {
  const { store, review, service, post } = await setup();
  const decision = store.reviewAgentProposal(review({ decision: 'reject', transitDraft: undefined }));
  expect(decision.proposal.state).toBe('rejected'); expect(store.meta('transit:disruptions')).toBeUndefined();
  expect((await service.prepareNotice(post.id, 1)).proposals![0].state).toBe('rejected');
});
it('requires admin authority, explicit scope confirmation, known route, ordered stops and a current window', async () => {
  const { store, review, proposal } = await setup();
  expect(() => store.reviewAgentProposal(review({ reviewer: { ...reviewer, role: 'verified' } }))).toThrow(/Administrator/);
  expect(() => store.reviewAgentProposal(review({ confirmTransitScope: false }))).toThrow(/Confirm the bus line/);
  expect(() => store.reviewAgentProposal(review({ transitDraft: { ...proposal.transitDraft, routeId: 'missing' } as TransitDisruptionDraft }))).toThrow(/known bus route/);
  expect(() => store.reviewAgentProposal(review({ transitDraft: { ...proposal.transitDraft, fromStopId: 'missing', toStopId: 'also-missing' } as TransitDisruptionDraft }))).toThrow(/ordered stops/);
  vi.setSystemTime(now + 86400_000);
  expect(() => store.reviewAgentProposal(review())).toThrow(/period has ended/);
  expect(store.meta('transit:disruptions')).toBeUndefined();
});
it('rechecks source revision/archive before making a bus map change', async () => {
  const { store, review, post } = await setup(); store.setNoticeStatus(post.id, 'dismissed');
  expect(() => store.reviewAgentProposal(review())).toThrow(/changed/);
  expect(store.meta('transit:disruptions')).toBeUndefined();
});
it('protects manual corrections and stale service revisions from later agent replacement', async () => {
  const { store, review, result, proposal } = await setup();
  const initial = store.reviewAgentProposal(review()).transitDisruption!;
  const next = { ...result, proposals: [{ ...proposal, version: crypto.randomUUID(), targetRevision: initial.revision }] };
  store.setMeta(agentResultKey(result.noticeId), next);
  const updated = await new TransitService(store).save({ ...proposal.transitDraft, title: 'Corrected by contributor' } as TransitDisruptionDraft,
    { uid: 'different-verified-user', displayName: 'Reviewer', role: 'verified' }, initial.id, initial.revision);
  expect(updated.agent?.overridden).toBe(true);
  expect(() => store.reviewAgentProposal(review({ version: next.proposals[0].version }))).toThrow(/changed/);
  expect(store.meta<TransitDisruptionState>('transit:disruptions')?.records[0].title).toBe('Corrected by contributor');
});
it('resumes only the unique unchanged service notice and retains its original scope/window', async () => {
  const { store, review } = await setup(), previous = store.reviewAgentProposal(review()).transitDisruption!;
  const input = serviceInput(); input.value.events[0].action = 'reopening'; input.value.events[0].startsAt = '2026-10-17T17:45:00+05:00';
  input.value.events[0].endsAt = null; input.post.publishedAt = '2026-10-17T17:45:00+05:00';
  input.post.sourceId = 'service-resumption'; input.post.contentHash = 'service-resumed';
  input.post.text = input.value.events[0].quote = 'Today Green Line bus service in Islamabad resumed at 5:45 pm.';
  vi.setSystemTime(Date.parse(input.post.publishedAt));
  const { id: _id, revision: _revision, status: _status, receivedAt: _received, ...source } = input.post;
  const post = store.upsertNotice(source).notice, claim = store.claimAgentWork(claimInput(post))!;
  store.completeAgentWork({ noticeId: post.id, revision: 1, claimId: claim.claimId, result: { ...finished(claim), extraction: input.value }, changes: [] });
  const service = new AgentService(store, agentConfig({})), result = await service.prepareNotice(post.id, 1), proposal = result.proposals![0];
  expect(proposal.targetId).toBe(previous.id);
  const decision = store.reviewAgentProposal({ noticeId: post.id, noticeRevision: 1, index: 0, version: proposal.version,
    decision: 'approve', reviewer, confirmTransitScope: true });
  expect(decision.transitDisruption).toMatchObject({ id: previous.id, status: 'cancelled', revision: 2, routeId: previous.routeId,
    startsAt: previous.startsAt, endsAt: previous.endsAt, agent: { overridden: true } });
  expect(decision.result.closureIds).toEqual([]); expect(store.routingSnapshot().closures).toEqual([]);
});
it('does not replace a current service notice with the same or older evidence', async () => {
  const { store, review, result, proposal } = await setup(), previous = store.reviewAgentProposal(review()).transitDisruption!;
  const pending = { ...proposal, version: crypto.randomUUID(), targetRevision: previous.revision };
  store.setMeta(agentResultKey(result.noticeId), { ...result, proposals: [pending] });
  expect(() => store.reviewAgentProposal(review({ version: pending.version }))).toThrow(/newer source evidence/);
  expect(store.meta<TransitDisruptionState>('transit:disruptions')?.records[0].revision).toBe(1);
});
it('upgrades only pending legacy service drafts without changing approved/rejected history', async () => {
  const { store, result, proposal, service, post } = await setup();
  const legacy: AgentResult = { ...result, proposals: [{ ...proposal, kind: undefined, transitDraft: undefined, mapping: 'road', draft: extraction().events[0] as never }] };
  store.setMeta(agentResultKey(post.id), legacy);
  expect(() => store.reviewAgentProposal({ noticeId: post.id, noticeRevision: 1, index: 0, version: proposal.version, decision: 'approve', reviewer })).toThrow(/Prepare.*again/);
  const repaired = await service.prepareNotice(post.id, 1); expect(repaired.proposals![0].kind).toBe('transit');
  expect(repaired.proposals![0].version).not.toBe(proposal.version); expect(store.routingSnapshot().closures).toEqual([]);
});
