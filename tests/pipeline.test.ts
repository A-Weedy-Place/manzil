import { expect, it } from 'vitest';
import { pipelineCounts, pipelineStage } from '../src/lib/pipeline';
import type { AgentResult, AgentProposal } from '../shared/agent';
import { notice } from './agent-fixtures';

const proposal = (index = 0): AgentProposal => ({ index, version: `v${index}`, state: 'pending', action: 'closure', impact: 'closed',
  mapping: 'road', locationKey: 'fixture', targetId: `target${index}`, targetRevision: null, draft: {}, issues: [] });
const result = (patch: Partial<AgentResult> = {}): AgentResult => ({ noticeId: notice().id, noticeRevision: 1, state: 'review',
  claimId: 'fixture', model: 'fixture', attempts: 1, startedAt: '', leaseUntil: 0, retryAt: 0, issues: [], closureIds: [], proposals: [proposal(),proposal(1)], ...patch });
it('counts posts awaiting review separately from event drafts and excludes stale or archived evidence', () => {
  const post = notice({ status: 'reviewed' }), value = result();
  expect(pipelineCounts([post],[value])).toMatchObject({ review: 1, drafts: 2, mapped: 2, waiting: 0 });
  expect(pipelineCounts([notice({ revision: 2 })],[value])).toMatchObject({ review: 0, drafts: 0, waiting: 1 });
  expect(pipelineCounts([notice({ status: 'dismissed' })],[value])).toMatchObject({ review: 0, drafts: 0 });
});
it('shows rejected, failed and applied outcomes without counting them as pending approval', () => {
  const rejected = result({ proposals: [ { ...proposal(), state: 'rejected' } ] });
  expect(pipelineStage(notice(),rejected)).toBe('rejected');
  expect(pipelineCounts([notice()],[rejected]).review).toBe(0);
  expect(pipelineCounts([notice()],[result({ state: 'failed', proposals: undefined })])).toMatchObject({ review: 0, failed: 1 });
  expect(pipelineCounts([notice()],[result({ state: 'applied', closureIds: ['target0'], proposals: [{ ...proposal(),state: 'approved' }] })])).toMatchObject({ review: 0, changed: 1 });
});
