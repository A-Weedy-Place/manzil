import type { AgentClaim, AgentCompletion, AgentResult, AgentUsage } from '../shared/agent.js';
import type { Closure, SourceNotice } from '../shared/types.js';

export function claimAgent(input: AgentClaim, notice: SourceNotice | undefined, previous: AgentResult | undefined, usage: AgentUsage): AgentResult | null {
  if (!notice || notice.revision !== input.revision || notice.status !== 'pending_agent' ||
    usage.requests >= input.dailyLimit || usage.reservedMicros + input.reservationMicros > input.budgetMicros) return null;
  if (previous?.noticeRevision === input.revision && (previous.state !== 'failed' && previous.state !== 'processing' ||
    previous.leaseUntil > input.now || previous.retryAt > input.now || previous.attempts >= 3)) return null;
  return { noticeId: input.noticeId, noticeRevision: input.revision, state: 'processing', model: input.model,
    attempts: previous?.noticeRevision === input.revision ? previous.attempts + 1 : 1, claimId: input.claimId,
    leaseUntil: input.now + 180_000, retryAt: 0, startedAt: new Date(input.now).toISOString(), issues: [], closureIds: [] };
}
export function canFinishAgent(input: AgentCompletion, notice?: SourceNotice, claim?: AgentResult) {
  return !!notice && notice.status === 'pending_agent' && notice.revision === input.revision && claim?.claimId === input.claimId &&
    claim.noticeRevision === input.revision && claim.state === 'processing' && claim.leaseUntil >= Date.now();
}
export function checkedCompletion(input: AgentCompletion, previous: (Closure | undefined)[], eventRevision: number): AgentCompletion {
  const conflict = input.changes.length > 0 && input.expectedEventRevision !== eventRevision || input.changes.length > 3 || new Set(input.changes.map(change => change.id)).size !== input.changes.length || input.changes.some((change, index) => {
    const old = previous[index];
    return old ? old.revision !== change.expectedRevision || !old.agent || old.agent.overridden || old.status === 'cancelled' : change.expectedRevision !== null;
  });
  return conflict ? { ...input, changes: [], result: { ...input.result, state: 'review', closureIds: [],
    issues: [...input.result.issues, 'The incident changed or was corrected by an administrator. Automatic changes were withheld.'] } } : input;
}
