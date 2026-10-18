import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../server/store';
import { AgentService } from '../server/agent';
import { agentConfig, GeminiError } from '../server/gemini';
import { agentResultKey, agentUsageKey, type AgentResult } from '../shared/agent';
import { claimInput, extraction, finished, location, notice } from './agent-fixtures';

const stores: Store[] = [];
const db = () => { const store = new Store(':memory:'); stores.push(store); return store; };
const input = () => { const { id: _id, revision: _revision, status: _status, receivedAt: _received, ...value } = notice(); return value; };
const draft = () => ({ title: 'Synthetic agent closure', description: 'Offline fixture only', reason: 'other' as const, status: 'published' as const,
  startsAt: '2026-10-17T12:00:00Z', endsAt: '2026-10-17T14:00:00Z', geometry: location().geometry,
  agent: { noticeId: 'fixture', sourceId: '123456789', sourceRevision: 1, evidenceAt: '2026-10-17T11:00:00Z', locationKey: location().key } });
afterEach(() => { stores.splice(0).forEach(store => store.close()); vi.restoreAllMocks(); });
describe('atomic agent queue and publication', () => {
  it('claims a revision once and reserves a PKT daily allowance atomically', () => {
    const store = db(), post = store.upsertNotice(input()).notice, claim = claimInput(post);
    expect(store.claimAgentWork(claim)).toMatchObject({ attempts: 1, state: 'processing' });
    expect(store.claimAgentWork({ ...claim, claimId: 'duplicate' })).toBeNull();
    expect(store.meta(agentUsageKey(claim.now))).toEqual({ requests: 1, reservedMicros: 20_000 });
    const other = store.upsertNotice({ ...input(), sourceId: 'other' }).notice;
    expect(store.claimAgentWork(claimInput(other, { dailyLimit: 1 }))).toBeNull();
    expect(store.claimAgentWork(claimInput(other, { budgetMicros: 39_999 }))).toBeNull();
  });
  it('commits closure, routing revision, result history and notice resolution together', () => {
    const store = db(), post = store.upsertNotice(input()).notice, claim = store.claimAgentWork(claimInput(post))!;
    const result = { ...finished(claim, 'applied'), closureIds: ['agent-fixture'] };
    const complete = { noticeId: post.id, revision: post.revision, claimId: claim.claimId, result, expectedEventRevision: store.eventRevision,
      changes: [{ id: 'agent-fixture', expectedRevision: null, draft: draft() }] };
    expect(store.completeAgentWork(complete)).toBe(true); expect(store.pendingAgentCount()).toBe(0); expect(store.eventRevision).toBe(1);
    expect(store.routingSnapshot().closures[0]).toMatchObject({ id: 'agent-fixture', revision: 1 });
    expect(store.meta(`sourceAgentVersion:${post.id}:1`)).toMatchObject({ state: 'applied', closureIds: ['agent-fixture'] });
    expect(store.completeAgentWork(complete)).toBe(false); expect(store.eventRevision).toBe(1);
  });
  it('rejects stale source edits and expired claims before publication', () => {
    const store = db(), post = store.upsertNotice(input()).notice, claim = store.claimAgentWork(claimInput(post))!;
    store.upsertNotice({ ...input(), text: 'Edited evidence', contentHash: 'edit' });
    expect(store.completeAgentWork({ noticeId: post.id, revision: 1, claimId: claim.claimId, result: finished(claim), changes: [] })).toBe(false);
    const fresh = store.getNotice(post.id)!, expired = store.claimAgentWork(claimInput(fresh, { now: Date.now() - 181_000 }))!;
    expect(store.completeAgentWork({ noticeId: post.id, revision: 2, claimId: expired.claimId, result: finished(expired), changes: [] })).toBe(false);
    expect(store.pendingAgentCount()).toBe(1);
  });
  it('withholds newly proposed incidents when an admin changes the map during generation', () => {
    const store = db(), post = store.upsertNotice(input()).notice, claim = store.claimAgentWork(claimInput(post))!, revision = store.eventRevision;
    const corrected = store.saveClosure({ ...draft(), status: 'cancelled', agent: { ...draft().agent, overridden: true } });
    expect(store.completeAgentWork({ noticeId: post.id, revision: 1, claimId: claim.claimId, result: { ...finished(claim, 'applied'), closureIds: ['new-agent-id'] },
      expectedEventRevision: revision, changes: [{ id: 'new-agent-id', expectedRevision: null, draft: draft() }] })).toBe(true);
    expect(store.get('closure', 'new-agent-id')).toBeUndefined(); expect(store.get('closure', corrected.id)).toMatchObject({ status: 'cancelled', agent: { overridden: true } });
    expect(store.meta<AgentResult>(agentResultKey(post.id))).toMatchObject({ state: 'review', closureIds: [] });
  });
  it('keeps failures pending, respects cooldown and stops after three attempts', () => {
    const store = db(), post = store.upsertNotice(input()).notice, start = Date.now();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const claim = store.claimAgentWork(claimInput(post, { now: start + attempt * 2000, claimId: String(attempt) }))!;
      expect(claim.attempts).toBe(attempt);
      store.completeAgentWork({ noticeId: post.id, revision: 1, claimId: claim.claimId,
        result: { ...finished(claim, 'failed'), retryAt: start + attempt * 2000 + 1000 }, changes: [] });
      expect(store.claimAgentWork(claimInput(post, { now: start + attempt * 2000 + 100 }))).toBeNull();
    }
    expect(store.claimAgentWork(claimInput(post, { now: start + 100_000 }))).toBeNull(); expect(store.pendingAgentCount()).toBe(1);
  });
});
describe('agent batch workflow without external calls', () => {
  const settings = () => ({ ...agentConfig({}), apiKey: 'offline-key', enabled: true });
  it('dismisses unrelated notices once and persists bilingual interpretation', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = db(), post = store.upsertNotice(input()).notice, value = extraction();
    value.category = 'irrelevant'; value.irrelevantReason = 'missing_person'; value.events = [];
    const model = vi.fn(async () => ({ extraction: value, usage: { inputTokens: 100, outputTokens: 40 } }));
    const service = new AgentService(store, settings(), model);
    await Promise.all([service.run(), service.run()]); await new AgentService(store, settings(), model).run();
    expect(model).toHaveBeenCalledTimes(1); expect(store.getNotice(post.id)?.status).toBe('dismissed');
    expect((await service.results())[0]).toMatchObject({ state: 'dismissed', extraction: { summaryUrdu: value.summaryUrdu } });
  });
  it('halts on quota/billing instead of switching to a paid backend or losing evidence', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = db(); store.upsertNotice(input()); store.upsertNotice({ ...input(), sourceId: 'second' });
    const model = vi.fn(async () => { throw new GeminiError('billing', 402, 'sensitive operator message'); });
    const service = new AgentService(store, settings(), model); await service.run(); await service.run();
    expect(model).toHaveBeenCalledTimes(1); expect(store.pendingAgentCount()).toBe(2);
    expect(JSON.stringify(await service.results())).not.toContain('sensitive');
    expect(await service.status()).toMatchObject({ runtime: { errorCode: 'billing' }, attemptedToday: 1 });
  });
  it('does not call the model when paused, disabled or lacking a key', async () => {
    const store = db(); store.upsertNotice(input()); const model = vi.fn();
    await new AgentService(store, { ...settings(), enabled: false }, model).run();
    await new AgentService(store, { ...settings(), apiKey: '' }, model).run();
    store.setMeta('sourceAgentSettings', { enabled: false }); await new AgentService(store, settings(), model).run();
    expect(model).not.toHaveBeenCalled();
  });
});
