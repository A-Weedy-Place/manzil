import { z } from 'zod';
import type { TransitDisruption, TransitDisruptionDraft, TransitDisruptionState } from './transit.js';
import type { Closure, ClosureAuthor, ClosureDraft, ClosureInput } from './types.js';

const optionalText = z.string().trim().max(160).nullable();
const instant = z.string().datetime({ offset: true }).nullable();
export const extractionSchema = z.object({
  summary: z.string().trim().min(1).max(500), summaryUrdu: z.string().trim().max(600),
  category: z.enum(['traffic', 'fuel', 'irrelevant', 'unclear']),
  irrelevantReason: z.enum(['missing_person', 'other']).nullable(),
  events: z.array(z.object({
    kind: z.enum(['road', 'transit']).optional(), restrictionType: z.enum(['road_closure', 'blockade']).nullable().optional(),
    transit: z.object({ service: optionalText, city: optionalText, direction: optionalText, fromStop: optionalText, toStop: optionalText, scope: z.enum(['whole_service', 'segment', 'unknown']) }).strict().nullable().optional(),
    action: z.enum(['closure', 'disruption', 'reopening']), title: z.string().trim().min(1).max(160),
    reason: z.enum(['vip', 'protest', 'accident', 'construction', 'other']),
    impact: z.enum(['closed', 'slow', 'unknown']),
    location: z.object({ city: optionalText, road: optionalText, from: optionalText, to: optionalText, point: optionalText }).strict(),
    startsAt: instant, endsAt: instant, timeBasis: z.enum(['explicit', 'publication_relative', 'unknown']),
    targetIncidentId: z.string().max(100).nullable(), confidence: z.number().min(0).max(1),
    quote: z.string().trim().min(1).max(700), imageIndex: z.number().int().min(0).max(1).nullable(),
    uncertainties: z.array(z.string().max(200)).max(6),
  }).strict()).max(3),
  fuel: z.array(z.object({ fuelType: z.enum(['petrol', 'diesel']), pricePerLitre: z.number().min(1).max(10000),
    effectiveAt: instant, quote: z.string().max(400) }).strict()).max(2),
  warnings: z.array(z.string().max(200)).max(8),
}).strict();
export type AgentExtraction = z.infer<typeof extractionSchema>;
export interface AgentResult {
  noticeId: string; noticeRevision: number; state: 'processing' | 'review' | 'applied' | 'dismissed' | 'failed';
  model: string; attempts: number; claimId: string; leaseUntil: number; retryAt: number;
  startedAt: string; finishedAt?: string; extraction?: AgentExtraction;
  issues: string[]; closureIds: string[]; errorCode?: string;
  usage?: { inputTokens: number; outputTokens: number }; imageCount?: number;
  proposals?: AgentProposal[]; transitIds?: string[];
}
/** Private review work, deliberately separate from routable closure records. */
export interface AgentProposal {
  index: number; version: string; state: 'pending' | 'approved' | 'rejected';
  kind?: 'road' | 'transit'; decisionMode?: 'automatic' | 'admin';
  transitDraft?: Partial<TransitDisruptionDraft>;
  action: AgentExtraction['events'][number]['action']; impact: AgentExtraction['events'][number]['impact'];
  draft: Partial<ClosureDraft>; mapping: 'road' | 'place' | 'existing' | 'unresolved';
  locationKey: string; issues: string[]; targetId: string; targetRevision: number | null;
  reviewedBy?: ClosureAuthor; reviewedAt?: string; closureId?: string;
  preparedAt?: string; mappingAttempts?: number; mappingRetryAt?: number;
  steps?: { tool: 'interpret_source' | 'resolve_road' | 'search_landmark' | 'match_incident' | 'validate_times' | 'prepare_draft' | 'resolve_service' | 'publication_policy';
    state: 'done' | 'blocked' | 'needs_review'; detail: string }[];
}
export const proposalFingerprint = (proposals: AgentProposal[] = []) => JSON.stringify(proposals.map(item => [item.index, item.version, item.state]));
export interface AgentProposalReview {
  noticeId: string; noticeRevision: number; index: number; version: string;
  decision: 'approve' | 'reject'; draft?: ClosureDraft; transitDraft?: TransitDisruptionDraft; reviewer: ClosureAuthor;
  confirmRestriction?: boolean; confirmUnknownEnd?: boolean;
}
export interface AgentProposalDecision { result: AgentResult; proposal: AgentProposal; closure?: Closure; transit?: TransitDisruption; transitState?: TransitDisruptionState }
export interface AgentUsage { requests: number; reservedMicros: number }
export interface AgentClaim { noticeId: string; revision: number; claimId: string; now: number; dailyLimit: number; budgetMicros: number; reservationMicros: number; model: string }
export interface AgentClosureChange { proposalIndex?: number; id: string; expectedRevision: number | null; draft: ClosureInput }
export interface AgentTransitChange { id: string; expectedRevision: number | null; draft: TransitDisruptionDraft; agent: NonNullable<Closure['agent']> }
export interface AgentCompletion { noticeId: string; revision: number; claimId: string; result: AgentResult; changes: AgentClosureChange[]; expectedEventRevision?: number; transitChanges?: AgentTransitChange[]; expectedTransitRevision?: number }
export const agentResultKey = (id: string) => `sourceAgentResult:${id}`;
export const agentDay = (now: number) => new Date(now + 5 * 3600_000).toISOString().slice(0, 10);
export const agentUsageKey = (now: number) => `sourceAgentUsage:${agentDay(now)}`;
