import type { TransitDisruptionState } from '../shared/transit.js';
import { planAgentActions } from './agent-policy.js';
import { planTransitNotices } from './agent-transit.js';
import { loadTransitDataset } from './transit/dataset.js';
import { randomUUID } from 'node:crypto';
import { agentResultKey, agentUsageKey, proposalFingerprint, type AgentResult, type AgentUsage } from '../shared/agent.js';
import type { Repository } from './repository.js';
import { agentConfig, GeminiClient, GeminiError, type AgentConfig, type GeminiInput, type GeminiOutput } from './gemini.js';
import type { AgentImageReader } from './agent-images.js';
import { currentProposalResult, prepareAgentProposals } from './agent-proposals.js';

export class AgentService {
  private running?: Promise<unknown>;
  constructor(private store: Repository, readonly config = agentConfig(),
    private model: (input: GeminiInput) => Promise<GeminiOutput> = input => new GeminiClient(config).extract(input),
    private images: AgentImageReader = async () => [],
    private prepare = prepareAgentProposals) {}
  async prepareNotice(noticeId: string, revision: number) {
    const notice = await this.store.getNotice(noticeId);
    const result = currentProposalResult(notice, await this.store.meta<AgentResult>(agentResultKey(noticeId)), revision);
    if (result.proposals) return result;
    const proposals = [...await this.prepare(notice!, result.extraction!, (await this.store.routingSnapshot(true)).closures), ...planTransitNotices(notice!,result.extraction!,await this.store.meta<TransitDisruptionState>('transit:disruptions') ?? {revision:0,records:[]},{autoPublish:false}).proposals].sort((a,b)=>a.index-b.index);
    return this.store.saveAgentProposals(noticeId, revision, result.claimId, proposals);
  }
  async refineNotice(noticeId: string, revision: number) {
    const notice = await this.store.getNotice(noticeId);
    const result = currentProposalResult(notice, await this.store.meta<AgentResult>(agentResultKey(noticeId)), revision);
    if (!result.proposals) return this.prepareNotice(noticeId, revision);
    const eligible = result.proposals.filter(proposal => {
      const location = result.extraction!.events[proposal.index]?.location;
      return proposal.kind !== 'transit' && proposal.state === 'pending' && proposal.mapping === 'unresolved' && (proposal.mappingAttempts ?? 1) < 3 &&
        (proposal.mappingRetryAt ?? 0) <= Date.now() && location && (location.point || location.road && location.from && location.to);
    });
    if (!eligible.length) return result;
    const next = await this.prepare(notice!, result.extraction!, (await this.store.routingSnapshot(true)).closures);
    const proposals = result.proposals.map(old => {
      if (!eligible.some(item => item.index === old.index)) return old;
      const found = next.find(item => item.index === old.index);
      const attempts = (old.mappingAttempts ?? 1) + 1;
      return { ...(found && found.mapping !== 'unresolved' ? found : { ...old, version: randomUUID() }), mappingAttempts: attempts, mappingRetryAt: Date.now() + 15 * 60_000 };
    });
    return this.store.saveAgentProposals(noticeId, revision, result.claimId, proposals, proposalFingerprint(result.proposals));
  }
  private async repairSaved() {
    const nextSweep = await this.store.meta<number>('sourceAgentRepairSweepAt') ?? 0;
    if (nextSweep > Date.now()) return 0;
    await this.store.setMeta('sourceAgentRepairSweepAt', Date.now() + 15 * 60_000);
    for (const notice of await this.store.listNotices(30)) {
      const result = await this.store.meta<AgentResult>(agentResultKey(notice.id));
      if (!result?.extraction || result.noticeRevision !== notice.revision || result.state !== 'review' || notice.status === 'dismissed') continue;
      if (!result.proposals) { await this.prepareNotice(notice.id, notice.revision); return 1; }
      if (result.proposals.some(proposal => { const location = result.extraction!.events[proposal.index]?.location;
        return proposal.kind !== 'transit' && proposal.state === 'pending' && proposal.mapping === 'unresolved' && (proposal.mappingAttempts ?? 1) < 3 &&
          (proposal.mappingRetryAt ?? 0) <= Date.now() && location && (location.point || location.road && location.from && location.to);
      })) { await this.refineNotice(notice.id, notice.revision); return 1; }
    }
    return 0;
  }
  async status() {
    const runtime = await this.store.meta<Record<string, unknown>>('sourceAgentRuntime');
    const settings = await this.store.meta<{ enabled?: boolean; autoPublish?: boolean }>('sourceAgentSettings');
    const usage = await this.store.meta<AgentUsage>(agentUsageKey(Date.now())) ?? { requests: 0, reservedMicros: 0 };
    const dailyLimit = Number(runtime?.dailyLimit ?? this.config.dailyLimit);
    const budgetMicros = Number(runtime?.budgetMicros ?? this.config.budgetMicros);
    return { enabled: settings?.enabled !== false && (runtime?.enabled === true || this.config.enabled),
      configured: runtime?.configured === true || !!this.config.apiKey, model: this.config.model,
      autoPublish: settings?.autoPublish ?? (runtime?.autoPublish === true || this.config.autoPublish), dailyLimit,
      dailyLimitReached: usage.requests >= dailyLimit || usage.reservedMicros + 20_000 > budgetMicros,
      attemptedToday: usage.requests, reservedAllowanceUsd: usage.reservedMicros / 1_000_000,
      pending: await this.store.pendingAgentCount(),
      processing: runtime?.state === 'working' && Date.now() - Date.parse(String(runtime.progressAt ?? '')) < 180_000,
      backoffUntil: await this.store.meta<number>('sourceAgentBackoffUntil') ?? 0, runtime: runtime ?? null };
  }
  async results() {
    const notices = await this.store.listNotices(150);
    const results = await Promise.all(notices.map(notice => this.store.meta<AgentResult>(agentResultKey(notice.id))));
    return results.filter((result): result is AgentResult => !!result);
  }
  run(): Promise<unknown> {
    return this.running ??= this.batch().finally(() => { this.running = undefined; });
  }
  private async batch() {
    const settings = await this.store.meta<{ enabled?: boolean; autoPublish?: boolean }>('sourceAgentSettings');
    if (!this.config.enabled || settings?.enabled === false) return { processed: 0, status: await this.status() };
    const previousRuntime = await this.store.meta<Record<string, unknown>>('sourceAgentRuntime');
    const runtime = { ...previousRuntime, enabled: true, configured: !!this.config.apiKey, model: this.config.model, errorCode: undefined,
      autoPublish: settings?.autoPublish ?? this.config.autoPublish, dailyLimit: this.config.dailyLimit, budgetMicros: this.config.budgetMicros, lastAttemptAt: new Date().toISOString() };
    if (!this.config.apiKey) { await this.store.setMeta('sourceAgentRuntime', { ...runtime, state: 'error', errorCode: 'authentication' }); return { processed: 0 }; }
    const pausedUntil = await this.store.meta<number>('sourceAgentBackoffUntil') ?? 0;
    if (pausedUntil > Date.now()) return { processed: 0, backoffUntil: new Date(pausedUntil).toISOString() };
    await this.store.setMeta('sourceAgentRuntime', { ...runtime, state: 'working', stage: 'checking_queue', progressAt: new Date().toISOString(), lastTickAt: new Date().toISOString() });
    const started = Date.now(); let processed = 0, superseded = 0;
    for (const notice of await this.store.pendingAgentNotices()) {
      if (processed >= 2 || Date.now() - started > 65_000) break;
      const claim = await this.store.claimAgentWork({ noticeId: notice.id, revision: notice.revision, claimId: randomUUID(), now: Date.now(),
        dailyLimit: this.config.dailyLimit, budgetMicros: this.config.budgetMicros, reservationMicros: 20_000, model: this.config.model });
      if (!claim) continue;
      let result: AgentResult, expectedEventRevision: number | undefined, expectedTransitRevision: number | undefined, transitChanges: NonNullable<Parameters<Repository['completeAgentWork']>[0]['transitChanges']> = [], changes: Parameters<Repository['completeAgentWork']>[0]['changes'] = [];
      let stop = false;
      try {
        await this.store.setMeta('sourceAgentRuntime', { ...runtime, state: 'working', stage: 'reading_evidence', progressAt: new Date().toISOString(), lastNoticeId: notice.id });
        const snapshot = await this.store.routingSnapshot(true), incidents = snapshot.closures;
        expectedEventRevision = snapshot.revision;
        const transit = await this.store.meta<TransitDisruptionState>('transit:disruptions') ?? {revision:0,records:[]};
        expectedTransitRevision = transit.revision;
        const images = await this.images(notice);
        await this.store.setMeta('sourceAgentRuntime', { ...runtime, state: 'working', stage: 'interpreting', progressAt: new Date().toISOString(), lastNoticeId: notice.id });
        const output = await this.model({ notice, images, incidents, transitRoutes: loadTransitDataset()?.routes, transitIncidents: transit.records });
        await this.store.setMeta('sourceAgentRuntime', { ...runtime, state: 'working', stage: 'mapping', progressAt: new Date().toISOString(), lastNoticeId: notice.id });
        const roadProposals = await this.prepare(notice, output.extraction, incidents);
        const plan = await planAgentActions(notice, output.extraction, incidents, { autoPublish: runtime.autoPublish, imageCount: images.length,
          resolve: async event => {
            const proposal = roadProposals.find(item => item.index === output.extraction.events.indexOf(event));
            if (!proposal || !['road','existing'].includes(proposal.mapping) || !proposal.draft.geometry || !proposal.draft.drawing) throw new Error('A unique validated road geometry is required.');
            return { key: proposal.locationKey, geometry: proposal.draft.geometry, drawing: proposal.draft.drawing, restrictionType: proposal.draft.restrictionType };
          } });
        changes = plan.changes;
        const transitPlan = planTransitNotices(notice,output.extraction,transit,{autoPublish:runtime.autoPublish});
        transitChanges = transitPlan.changes;
        const proposals = [...roadProposals.map(proposal => {
          const event = output.extraction.events[proposal.index];
          const change = changes.find(item => item.proposalIndex === proposal.index);
          const issues = plan.issues.filter(issue => issue.startsWith(event.title+':'));
          return change ? { ...proposal, state: 'approved' as const, decisionMode: 'automatic' as const, targetId: change.id, targetRevision: change.expectedRevision, closureId: change.id, issues: [],
            steps: [...(proposal.steps ?? []),{tool:'publication_policy' as const,state:'done' as const,detail:'Source, road and time checks passed; automatic publication.'}] } : { ...proposal, issues: [...new Set([...proposal.issues,...issues])],
            steps: [...(proposal.steps ?? []),{tool:'publication_policy' as const,state:'needs_review' as const,detail:'Review the listed uncertainties before publishing.'}] };
        }),...transitPlan.proposals].sort((a,b)=>a.index-b.index);
        const issues = [...plan.issues,...transitPlan.proposals.filter(proposal=>proposal.state==='pending').flatMap(proposal=>proposal.issues)];
        result = { ...claim, state: plan.dismissed ? 'dismissed' : proposals.some(proposal=>proposal.state==='pending') || !changes.length && !transitChanges.length ? 'review' : 'applied',
          finishedAt: new Date().toISOString(), leaseUntil: 0, extraction: output.extraction, usage: output.usage,
          imageCount: images.length, proposals, issues, closureIds: changes.map(change=>change.id), transitIds: transitChanges.map(change=>change.id) };
      } catch (error) {
        const code = error instanceof GeminiError ? error.code : 'processing_failed';
        result = { ...claim, state: 'failed', leaseUntil: 0, finishedAt: new Date().toISOString(), errorCode: code,
          retryAt: Date.now() + 15 * 60_000 * claim.attempts, issues: [`Gemini processing failed (${code}); evidence retained.`] };
        if (['quota', 'authentication', 'billing'].includes(code)) {
          await this.store.setMeta('sourceAgentBackoffUntil', Date.now() + 15 * 60_000); stop = true;
        }
      }
      const committed = await this.store.completeAgentWork({ noticeId: notice.id, revision: notice.revision, claimId: claim.claimId, result, changes, expectedEventRevision, transitChanges, expectedTransitRevision });
      if (!committed) superseded++;
      const saved = committed ? await this.store.meta<AgentResult>(agentResultKey(notice.id)) : undefined;
      processed++;
      await this.store.setMeta('sourceAgentRuntime', { ...runtime, state: result.state === 'failed' ? 'error' : 'ready',
        lastFinishedAt: result.finishedAt, lastNoticeId: notice.id, ...(result.errorCode ? { errorCode: result.errorCode } : {}) });
      console.log(JSON.stringify({ event: 'gemini_processing', noticeId: notice.id, revision: notice.revision, state: saved?.state ?? 'superseded',
        imageCount: result.imageCount ?? 0, changedClosures: saved?.closureIds.length ?? 0, errorCode: result.errorCode }));
      if (stop) break;
    }
    let repaired = 0;
    if (!processed) { try { repaired = await this.repairSaved(); } catch { /* Leave stale/failed repairs for the next bounded sweep. */ } }
    const latest = await this.store.meta<Record<string, unknown>>('sourceAgentRuntime');
    await this.store.setMeta('sourceAgentRuntime', { ...runtime, ...latest, state: latest?.state === 'error' ? 'error' : 'ready', stage: 'idle',
      lastTickAt: new Date().toISOString(), progressAt: new Date().toISOString(), lastBatchProcessed: processed, lastBatchRepaired: repaired });
    return { processed, superseded, repaired, status: await this.status() };
  }
}
