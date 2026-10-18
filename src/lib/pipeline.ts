import type { AgentResult } from '../../shared/agent';
import type { SourceNotice } from '../../shared/types';
export interface AgentStatus {
  enabled: boolean; configured: boolean; model: string; autoPublish: boolean; canRunHere: boolean;
  dailyLimit: number; dailyLimitReached?: boolean; attemptedToday: number; pending: number; processing?: boolean; backoffUntil?: number;
  execution?: 'private_worker' | 'scheduled_only' | 'local';
  runtime: { state?: string; stage?: string; progressAt?: string; lastFinishedAt?: string; lastTickAt?: string; lastNoticeId?: string; errorCode?: string } | null;
}
export type PipelineStage = 'waiting' | 'processing' | 'failed' | 'review' | 'applied' | 'dismissed' | 'handled' | 'rejected';
export function pipelineStage(notice: SourceNotice, result?: AgentResult): PipelineStage {
  if (notice.status === 'dismissed') return 'dismissed';
  if (result?.noticeRevision === notice.revision) {
    if (result.proposals?.some(proposal => proposal.state === 'pending')) return 'review';
    if (result.proposals?.length && result.proposals.every(proposal => proposal.state === 'rejected')) return 'rejected';
    if (!(notice.status === 'reviewed' && ['failed','processing'].includes(result.state))) return result.state;
  }
  return notice.status === 'pending_agent' ? 'waiting' : 'handled';
}
export function pipelineRows(notices: SourceNotice[], results: AgentResult[]) {
  return notices.map(notice => { const result = results.find(item => item.noticeId === notice.id); return { notice, result, state: pipelineStage(notice,result) }; });
}
export function pipelineCounts(notices: SourceNotice[], results: AgentResult[]) {
  const rows = pipelineRows(notices, results), current = rows.filter(row => row.result?.noticeRevision === row.notice.revision && row.notice.status !== 'dismissed');
  const proposals = current.flatMap(row => row.result!.proposals ?? []).filter(proposal => proposal.state === 'pending');
  return { collected: notices.length, waiting: rows.filter(row => row.state === 'waiting').length,
    processing: rows.filter(row => row.state === 'processing').length, review: rows.filter(row => row.state === 'review').length,
    failed: rows.filter(row => row.state === 'failed').length, drafts: proposals.length,
    mapped: proposals.filter(proposal => proposal.mapping !== 'unresolved').length,
    changed: current.filter(row => !!row.result!.closureIds?.length || !!row.result!.transitDisruptionIds?.length).length };
}
