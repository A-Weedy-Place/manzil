import { afterEach, expect, it, vi } from 'vitest';
import { Store } from '../server/store';
import { AgentService } from '../server/agent';
import { agentConfig } from '../server/gemini';
import { currentProposalResult, prepareAgentProposals, resolveProposalPlace } from '../server/agent-proposals';
import { agentResultKey, proposalFingerprint, type AgentProposal, type AgentProposalReview } from '../shared/agent';
import type { ClosureDraft } from '../shared/types';
import { claimInput, extraction, finished, location, notice, now } from './agent-fixtures';

const stores: Store[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); vi.restoreAllMocks(); });
const prepare: typeof prepareAgentProposals = (post, value, incidents) => prepareAgentProposals(post, value, incidents, { resolve: async () => location(), now });
const reviewer = { uid: 'offline-admin', displayName: 'Offline admin', role: 'admin' as const };
async function setup(value = extraction()) {
  const store = new Store(':memory:'); stores.push(store);
  const { id, revision, status, receivedAt, ...input } = notice();
  const post = store.upsertNotice(input).notice, claim = store.claimAgentWork(claimInput(post))!;
  store.completeAgentWork({ noticeId: post.id, revision: post.revision, claimId: claim.claimId,
    result: { ...finished(claim), extraction: value }, changes: [] });
  const model = vi.fn(), service = new AgentService(store, agentConfig({}), model, undefined, prepare);
  const result = await service.prepareNotice(post.id, post.revision), proposal = result.proposals![0];
  const review = (patch: Partial<AgentProposalReview> = {}): AgentProposalReview => ({ noticeId: post.id, noticeRevision: post.revision,
    index: proposal.index, version: proposal.version, decision: 'approve', reviewer,
    draft: { ...proposal.draft, status: 'published' } as ClosureDraft, ...patch });
  return { store, service, post, result, proposal, review, model, input };
}

it('prepares complete evidence-backed fields and geometry without writing a routable closure', async () => {
  const { store, proposal, model, service, post } = await setup();
  expect(proposal).toMatchObject({ state: 'pending', mapping: 'road', draft: { title: 'Park Road closure', reason: 'other',
    startsAt: extraction().events[0].startsAt, endsAt: extraction().events[0].endsAt, sourceUrl: post.url, geometry: location().geometry } });
  expect(store.routingSnapshot().closures).toEqual([]); expect(store.eventRevision).toBe(0);
  expect((await service.prepareNotice(post.id, 1)).proposals![0].version).toBe(proposal.version);
  expect(model).not.toHaveBeenCalled();
});
it('keeps missing times and failed mapping empty while retaining every extracted event', async () => {
  const value = extraction(); value.events[0].startsAt = null; value.events[0].endsAt = null;
  value.events.push({ ...value.events[0], title: 'Second independent event' });
  const proposals = await prepareAgentProposals(notice(), value, [], { resolve: async () => { throw new Error('No unique road'); } });
  expect(proposals).toHaveLength(2); expect(proposals[0]).toMatchObject({ mapping: 'unresolved', draft: { endsAt: null } });
  expect(proposals[0].draft.startsAt).toBeUndefined(); expect(proposals[0].draft.geometry).toBeUndefined();
  expect(proposals[0].issues.join(' ')).toMatch(/No unique road.*Start time.*End time/);
  value.events[0].startsAt = '2026-10-18T17:00:00+05:00';
  expect((await prepare(notice(), value, []))[0].draft.startsAt).toBeUndefined();
});
it('resolves a unique named Pakistan landmark but rejects ambiguous cities, distant namesakes and city centroids', async () => {
  const event = extraction().events[0]; event.location = { city: 'Rawalpindi', road: null, point: 'Liaquat Bagh', from: null, to: null };
  const places = vi.fn(async () => [{ name: 'Liaquat Bagh, Metropolitan Corporation Rawalpindi, Punjab, Pakistan', coordinate: [73.065, 33.6] as [number,number] }]);
  expect((await resolveProposalPlace(event, places)).drawing.kind).toBe('point');
  expect(places).toHaveBeenCalledWith('Liaquat Bagh, Rawalpindi, Pakistan');
  await expect(resolveProposalPlace(event, async () => [{ name: 'Rawalpindi, Pakistan', coordinate: [73.065,33.6] }])).rejects.toThrow(/uniquely/);
  await expect(resolveProposalPlace(event, async () => [...await places(), { name: 'Liaquat Bagh, Rawalpindi, Pakistan', coordinate: [73.08,33.61] }])).rejects.toThrow(/uniquely/);
  event.location.city = 'Islamabad/Rawalpindi'; await expect(resolveProposalPlace(event, places)).rejects.toThrow(/one city/);
  event.location = { city: 'Kot', road: null, from: null, to: null, point: 'Fixture landmark' };
  await expect(resolveProposalPlace(event, async () => [{ name: 'Fixture landmark, Sialkot, Punjab, Pakistan', coordinate: [74.54,32.49] }])).rejects.toThrow(/uniquely/);
});
it('prefills same-publication-day AI time suggestions with an explicit verification warning', async () => {
  const value = extraction(); value.events[0].quote = 'Park Road closed, evening traffic affected.';
  const [proposal] = await prepare(notice(), value, []);
  expect(proposal.draft.startsAt).toBe(value.events[0].startsAt);
  expect(proposal.issues.join(' ')).toMatch(/AI-proposed time/);
  const [unknown] = await prepare(notice({ publishedAt: null }), value, []);
  expect(unknown.draft.startsAt).toBeUndefined();
});
it('preserves a known end time even when the start still needs administrator input', async () => {
  const value = extraction(); value.events[0].startsAt = null;
  const [proposal] = await prepare(notice(), value, []);
  expect(proposal.draft.startsAt).toBeUndefined(); expect(proposal.draft.endsAt).toBe(value.events[0].endsAt);
  expect(proposal.issues.join(' ')).not.toMatch(/End time is unknown/);
});
it('retains landmark pin limitations and congestion warnings without promoting them to closures', async () => {
  const value = extraction(), event = value.events[0]; event.action = 'disruption'; event.impact = 'slow'; event.endsAt = null;
  event.location.point = 'Fixture landmark'; event.imageIndex = 0;
  const proposals = await prepareAgentProposals(notice(), value, [], { resolve: async () => { throw new Error(); }, place: async () => location() });
  expect(proposals[0].mapping).toBe('place'); expect(proposals[0].issues.join(' ')).toMatch(/actual road restriction/);
  expect(proposals[0].issues.join(' ')).toMatch(/landmark pin/); expect(proposals[0].issues.join(' ')).toMatch(/image evidence/);
});
it('publishes only on explicit admin approval and retains provenance/decision history atomically', async () => {
  const { store, review, post, proposal } = await setup();
  const decision = store.reviewAgentProposal(review());
  expect(decision.proposal).toMatchObject({ state: 'approved', reviewedBy: reviewer, closureId: proposal.targetId });
  expect(store.routingSnapshot().closures).toHaveLength(1); expect(store.eventRevision).toBe(1);
  expect(decision.closure).toMatchObject({ status: 'published', moderation: 'approved', agent: { noticeId: post.id, sourceRevision: 1, overridden: false } });
  expect(store.meta(`sourceAgentVersion:${post.id}:1`)).toMatchObject({ proposals: [{ state: 'approved' }], closureIds: [proposal.targetId] });
  expect(() => store.reviewAgentProposal(review())).toThrow(/already been decided/); expect(store.eventRevision).toBe(1);
});
it('retains a rejected proposal across preparation retries without changing routes', async () => {
  const { store, service, post, review, proposal } = await setup();
  store.reviewAgentProposal(review({ decision: 'reject', draft: undefined }));
  expect((await service.prepareNotice(post.id, 1)).proposals![0]).toMatchObject({ version: proposal.version, state: 'rejected' });
  expect(store.routingSnapshot().closures).toEqual([]); expect(store.eventRevision).toBe(0);
  expect(() => store.reviewAgentProposal(review())).toThrow(/already been decided/);
});
it('rejects non-admins, stale source versions, archived evidence and map corrections', async () => {
  const { store, review, post, input } = await setup();
  expect(() => store.reviewAgentProposal(review({ reviewer: { ...reviewer, role: 'verified' } }))).toThrow(/Administrator/);
  store.setNoticeStatus(post.id, 'dismissed'); expect(() => store.reviewAgentProposal(review())).toThrow(/changed/);
  store.setNoticeStatus(post.id, 'reviewed'); store.upsertNotice({ ...input, contentHash: 'new-revision', text: 'Edited evidence' });
  expect(() => store.reviewAgentProposal(review())).toThrow(/changed/);
  const other = await setup();
  // A concurrent correction at this deterministic incident ID invalidates the proposal.
  const correction = { ...other.proposal.draft, status: 'cancelled' } as ClosureDraft;
  other.store.put('closure', { ...correction, id: other.proposal.targetId, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  expect(() => other.store.reviewAgentProposal(other.review())).toThrow(/map incident changed/);
  expect(other.store.routingSnapshot().closures).toEqual([]);
});
it('requires explicit acknowledgement for unbounded expiry and for disruptions', async () => {
  const value = extraction(); value.events[0].endsAt = null; value.events[0].action = 'disruption'; value.events[0].impact = 'slow';
  const { store, review } = await setup(value);
  expect(() => store.reviewAgentProposal(review())).toThrow(/actual road restriction/);
  expect(() => store.reviewAgentProposal(review({ confirmRestriction: true }))).toThrow(/until cancelled/);
  expect(store.reviewAgentProposal(review({ confirmRestriction: true, confirmUnknownEnd: true })).closure?.status).toBe('published');
});
it('prepares and cancels an existing incident only after approved reopening, never recreating a blockade', async () => {
  const initial = await setup(); const previous = initial.store.reviewAgentProposal(initial.review()).closure!;
  // Use an unchanged incident without an earlier manual override for this synthetic reopening.
  previous.agent!.overridden = false; initial.store.put('closure', previous);
  const value = extraction(); Object.assign(value.events[0], { action: 'reopening', targetIncidentId: previous.id, impact: 'unknown' });
  const proposals = await prepareAgentProposals(notice(), value, [previous], { now });
  const result = initial.store.meta<any>(agentResultKey(initial.post.id)); result.proposals = proposals;
  initial.store.setMeta(agentResultKey(initial.post.id), result);
  const decision = initial.store.reviewAgentProposal(initial.review({ version: proposals[0].version, draft: undefined }));
  expect(decision.closure).toMatchObject({ id: previous.id, status: 'cancelled', revision: 2 });
  expect(initial.store.routingSnapshot().closures).toEqual([]);
});
it('labels expired evidence without asking for a current publication decision', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const store = new Store(':memory:'); stores.push(store);
  const { id, revision, status, receivedAt, ...input } = notice(); store.upsertNotice(input);
  store.setMeta('sourceAgentSettings', { enabled: true, autoPublish: true });
  const model = vi.fn(async () => ({ extraction: extraction(), usage: { inputTokens: 100, outputTokens: 20 } }));
  const service = new AgentService(store, { ...agentConfig({}), enabled: true, autoPublish: true, apiKey: 'offline-fixture' }, model, undefined, prepare);
  await service.run(); expect(model).toHaveBeenCalledOnce(); expect(store.routingSnapshot().closures).toEqual([]);
  expect((await service.results())[0].proposals![0].state).toBe('expired'); expect((await service.status()).autoPublish).toBe(true);
  expect(() => currentProposalResult(undefined, undefined, 1)).toThrow(/not found/);
});

it('matches a unique existing incident for reopening without requiring the model to invent its ID', async () => {
  const initial = await setup(), incident = initial.store.reviewAgentProposal(initial.review()).closure!;
  const value = extraction(); value.events[0].action = 'reopening';
  const resolve = vi.fn(async () => location());
  const [proposal] = await prepareAgentProposals(notice(),value,[incident],{ resolve,now });
  expect(proposal).toMatchObject({ mapping: 'existing', targetId: incident.id, targetRevision: incident.revision });
  expect(resolve).not.toHaveBeenCalled();
  expect(proposal.steps).toContainEqual(expect.objectContaining({ tool: 'match_incident', state: 'done' }));
  const [ambiguous] = await prepareAgentProposals(notice(),value,[incident,{ ...incident,id: 'second' }],{ resolve,now });
  expect(ambiguous.targetRevision).toBeNull(); expect(ambiguous.issues.join(' ')).toMatch(/No existing agent incident/);
  const [overridden] = await prepareAgentProposals(notice(),value,[{ ...incident,agent: { ...incident.agent!,overridden: true } }],{ resolve,now });
  expect(overridden.targetRevision).toBeNull();
});
it('repairs failed mapping from saved extraction with a bounded cooldown and no further Gemini call', async () => {
  const { store,post,model,result } = await setup();
  const old = { ...result.proposals![0], mapping: 'unresolved' as const, mappingRetryAt: 0, draft: { title: 'Unplaced' } };
  store.saveAgentProposals(post.id,1,result.claimId,[old],proposalFingerprint(result.proposals));
  const mapper = vi.fn(prepare), service = new AgentService(store,agentConfig({}),model,undefined,mapper);
  const repaired = await service.refineNotice(post.id,1);
  expect(repaired.proposals![0]).toMatchObject({ mapping: 'road',mappingAttempts: 2 });
  expect(repaired.proposals![0].version).not.toBe(old.version); expect(mapper).toHaveBeenCalledOnce();
  await service.refineNotice(post.id,1); expect(mapper).toHaveBeenCalledOnce(); expect(model).not.toHaveBeenCalled();
  expect(store.eventRevision).toBe(0); expect(store.routingSnapshot().closures).toEqual([]);
  const capped = { ...old,mappingAttempts: 3 };
  store.saveAgentProposals(post.id,1,result.claimId,[capped],proposalFingerprint(repaired.proposals));
  await service.refineNotice(post.id,1); expect(mapper).toHaveBeenCalledOnce();
});
it('rejects stale refinement when an administrator decided the proposal while mapping ran', async () => {
  const { store,post,result,review } = await setup(), fingerprint = proposalFingerprint(result.proposals);
  store.reviewAgentProposal(review({ decision: 'reject',draft: undefined }));
  expect(() => store.saveAgentProposals(post.id,1,result.claimId,result.proposals!,fingerprint)).toThrow(/changed during refinement/);
  expect(store.meta<any>(agentResultKey(post.id)).proposals[0].state).toBe('rejected'); expect(store.eventRevision).toBe(0);
});
it('checks an idle queue without erasing the last completed analysis time', async () => {
  const { store,service,model } = await setup();
  const timestamp = new Date(now).toISOString(); store.setMeta('sourceAgentRuntime',{ lastFinishedAt: timestamp });
  const idle = new AgentService(store,{ ...service.config,enabled: true,apiKey: 'offline' },model,undefined,prepare);
  await idle.run();
  expect((await idle.status()).runtime).toMatchObject({ lastFinishedAt: timestamp,stage: 'idle',lastBatchProcessed: 0 });
  expect((await idle.status()).processing).toBe(false); expect(model).not.toHaveBeenCalled();
});
