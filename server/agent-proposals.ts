import { createHash, randomUUID } from 'node:crypto';
import type { AgentExtraction, AgentProposal, AgentProposalDecision, AgentProposalReview, AgentResult } from '../shared/agent.js';
import type { Closure, Place, SourceNotice } from '../shared/types.js';
import { resolveAgentLocation, locationName, type ResolvedAgentLocation } from './agent-location.js';
import { distanceMeters, drawingToPolygon } from './geometry.js';
import { searchPlaces } from './routing/index.js';
import { isInPakistan } from './routing/pakistan.js';
import { sourceSupportsInstant } from './agent-time.js';
import { HttpError } from './errors.js';
import { closureDraftSchema } from './validation.js';

type Event = AgentExtraction['events'][number];
const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** A geocoded landmark is a review pin, never an invented road corridor. */
export async function resolveProposalPlace(event: Event, places: (query: string) => Promise<Place[]> = searchPlaces): Promise<ResolvedAgentLocation> {
  const { city, point } = event.location;
  if (!city || !point || /[,/]|\band\b/i.test(city)) throw new Error('A precise landmark and one city are needed to place a review pin.');
  const query = `${point}, ${city}, Pakistan`;
  if (query.length > 160) throw new Error('The location reference is too long to resolve.');
  const found = (await places(query)).filter(place => locationName(place.name.split(',')[0]) === locationName(point) &&
    place.name.split(',').slice(1).some(part => (` ${words(part)} `).includes(` ${words(city)} `)) && isInPakistan(place.coordinate));
  if (!found.length || found.some(place => distanceMeters(place.coordinate, found[0].coordinate) > 100))
    throw new Error('The named landmark could not be uniquely matched; select the affected road on the map.');
  const drawing = { kind: 'point' as const, coordinates: [found[0].coordinate], widthMeters: 14 };
  return { drawing, geometry: drawingToPolygon(drawing), key: `${locationName(city)}:${locationName(point)}` };
}

/** Preparation runs independently of publication policy, including saved interpretations. */
export async function prepareAgentProposals(notice: SourceNotice, extraction: AgentExtraction, incidents: Closure[], options: {
  resolve?: (event: Event) => Promise<ResolvedAgentLocation>; place?: (event: Event) => Promise<ResolvedAgentLocation>; now?: number;
} = {}): Promise<AgentProposal[]> {
  if (extraction.category !== 'traffic') return [];
  const proposals: AgentProposal[] = [];
  for (const [index, event] of extraction.events.entries()) {
    const steps: NonNullable<AgentProposal['steps']> = [{ tool: 'interpret_source', state: 'done', detail: 'Gemini interpretation is available.' }];
    const issues = [...extraction.warnings, ...event.uncertainties];
    if (event.action === 'disruption' || event.impact !== 'closed') issues.push('This reports disruption or uncertain road access. Confirm an actual road restriction before approving.');
    if (event.imageIndex !== null) issues.push('Check the original image evidence.');
    if (!notice.text.includes(event.quote)) issues.push('The quoted evidence could not be matched to the saved post.');
    if (notice.contentState === 'possibly_truncated') issues.push('The collected post may be incomplete.');
    let target = event.targetIncidentId ? incidents.find(closure => closure.id === event.targetIncidentId && closure.agent) : undefined;
    const active = incidents.filter(closure => closure.agent && closure.status === 'published' && !closure.agent.overridden);
    if (!target && event.action === 'reopening' && event.location.city && event.location.road) {
      const prefix = `${locationName(event.location.city)}:${locationName(event.location.road)}:`;
      const candidates = active.filter(closure => closure.agent!.locationKey.startsWith(prefix));
      if (candidates.length === 1) target = candidates[0];
    }
    let mapping: AgentProposal['mapping'] = 'unresolved', resolved: ResolvedAgentLocation | undefined;
    if (event.action === 'reopening' && target) {
      resolved = { drawing: target.drawing ?? { kind: 'polygon', coordinates: target.geometry.coordinates[0].slice(0, -1) as [number, number][], widthMeters: 14 },
        geometry: target.geometry, key: target.agent!.locationKey }; mapping = 'existing';
      issues.push('Approve only after confirming this is the same incident and the road has reopened.');
    } else {
      try { resolved = await (options.resolve ?? resolveAgentLocation)(event); mapping = 'road'; steps.push({ tool: 'resolve_road', state: 'done', detail: 'Mapped a supported road section or road point.' }); }
      catch (error) {
        steps.push({ tool: 'resolve_road', state: 'blocked', detail: 'The source did not resolve to a unique supported road section.' });
        if (event.location.point && event.location.city) {
          try { resolved = await (options.place ?? resolveProposalPlace)(event); mapping = 'place';
            steps.push({ tool: 'search_landmark', state: 'done', detail: 'Found a unique named landmark; exact road extent needs review.' });
            issues.push('A landmark pin was found. Confirm the exact affected road and width; the full road section is not established.'); }
          catch (failure) { steps.push({ tool: 'search_landmark', state: 'blocked', detail: 'No unique landmark match was available.' }); issues.push(failure instanceof Error ? failure.message : 'Map location needs review.'); }
        } else issues.push(error instanceof Error ? error.message : 'Map location needs review.');
      }
    }
    if (!target && resolved) {
      const matches = active.filter(closure => closure.agent!.locationKey === resolved!.key && (event.action === 'reopening' ||
        event.startsAt && Date.parse(closure.startsAt) <= Date.parse(event.endsAt ?? event.startsAt) && (!closure.endsAt || Date.parse(closure.endsAt) > Date.parse(event.startsAt))));
      if (matches.length === 1) target = matches[0];
      else if (matches.length > 1) issues.push('Multiple existing incidents match. Choose the correct incident before applying an update.');
      if (target && event.action === 'reopening') { resolved = { drawing: target.drawing ?? { kind: 'polygon', coordinates: target.geometry.coordinates[0].slice(0, -1) as [number, number][], widthMeters: 14 }, geometry: target.geometry, key: target.agent!.locationKey }; mapping = 'existing'; }
    }
    steps.push({ tool: 'match_incident', state: target ? 'done' : event.action === 'reopening' ? 'blocked' : 'done',
      detail: target ? 'Matched an existing incident for an update or reopening.' : event.action === 'reopening' ? 'No unique current incident was found for reopening.' : 'Prepared a new incident proposal.' });
    if (event.action === 'reopening' && !target) issues.push('No existing agent incident was identified. This reopening cannot be approved yet.');
    const exact = (instant: string | null) => !!(instant && notice.publishedAt && sourceSupportsInstant(event.quote, instant, notice.publishedAt));
    const pktDay = (instant: string) => new Date(Date.parse(instant) + 5 * 3600_000).toISOString().slice(0, 10);
    const supported = (instant: string | null) => instant && event.timeBasis !== 'unknown' && notice.publishedAt &&
      (exact(instant) || pktDay(instant) === pktDay(notice.publishedAt));
    // A saved model time anchored to the known publication day is a labelled suggestion,
    // not an assertion that an independent clock/date check passed.
    const startsAt = supported(event.startsAt) ? event.startsAt! : undefined;
    const endsAt = supported(event.endsAt) && (!startsAt || Date.parse(event.endsAt!) > Date.parse(startsAt)) ? event.endsAt : null;
    if (startsAt && !exact(startsAt) || endsAt && !exact(endsAt)) issues.push('AI-proposed time on the original publication date. Confirm the date and clock against the source before approving.');
    if (!startsAt) issues.push('Start time is not established by the source. Enter it before approving.');
    if (!endsAt && event.action !== 'reopening') issues.push('End time is unknown. Set an expiry or explicitly keep active until cancelled.');
    if (endsAt && Date.parse(endsAt) <= (options.now ?? Date.now())) issues.push('The reported period has ended. Do not apply it as a current closure.');
    steps.push({ tool: 'validate_times', state: startsAt && endsAt && exact(startsAt) && exact(endsAt) ? 'done' : 'needs_review', detail: startsAt ? endsAt ? 'Check the proposed period against the source.' : 'Start supplied; expiry needs administrator confirmation.' : 'A confirmed start time is still needed.' });
    const targetId = target?.id ?? `agent-${createHash('sha256').update(`${notice.id}:${index}`).digest('hex').slice(0, 32)}`;
    const existing = incidents.find(closure => closure.id === targetId);
    if (existing?.agent?.overridden || existing?.status === 'cancelled') issues.push('An administrator previously corrected or cancelled this incident. Review that decision before replacing it.');
    proposals.push({ index, version: randomUUID(), state: 'pending', action: event.action, impact: event.impact,
      mapping, locationKey: resolved?.key ?? '', targetId, targetRevision: existing?.revision ?? null,
      preparedAt: new Date(options.now ?? Date.now()).toISOString(), mappingAttempts: 1, mappingRetryAt: (options.now ?? Date.now()) + 15 * 60_000,
      steps: [...steps, { tool: 'prepare_draft', state: 'done', detail: 'Saved a private proposal. Administrator approval is required for map changes.' }],
      draft: { title: event.title, description: `${extraction.summary}\n\n${notice.text}`.slice(0, 4000), reason: event.reason,
        ...(startsAt ? { startsAt } : {}), endsAt, status: 'draft', ...(notice.url ? { sourceUrl: notice.url } : {}),
        ...(resolved ? { geometry: resolved.geometry, drawing: resolved.drawing } : {}) }, issues: [...new Set(issues)] });
  }
  return proposals;
}

export function currentProposalResult(notice: SourceNotice | undefined, result: AgentResult | undefined, revision: number): AgentResult {
  if (!notice || !result) throw new HttpError(404, 'Saved Gemini interpretation not found.');
  if (notice.revision !== revision || result.noticeRevision !== revision || notice.status === 'dismissed' ||
    !result.extraction || ['processing', 'failed', 'dismissed'].includes(result.state))
    throw new HttpError(409, 'This source or interpretation changed. Refresh the Pipeline before reviewing.');
  return result;
}

/** Called inside each adapter's transaction; approval and decision history commit together. */
export function decideAgentProposal(input: AgentProposalReview, notice: SourceNotice | undefined, stored: AgentResult | undefined, previous: Closure | undefined): AgentProposalDecision {
  if (input.reviewer.role !== 'admin') throw new HttpError(403, 'Administrator access is required.');
  const result = currentProposalResult(notice, stored, input.noticeRevision);
  const original = result.proposals?.find(proposal => proposal.index === input.index);
  if (!original || original.version !== input.version || original.state !== 'pending') throw new HttpError(409, 'This proposal changed or has already been decided. Refresh the Pipeline.');
  const now = new Date().toISOString();
  let closure: Closure | undefined;
  if (input.decision === 'approve') {
    if ((previous?.revision ?? null) !== original.targetRevision) throw new HttpError(409, 'The map incident changed after this proposal was prepared. Review the current incident in Blockades.');
    if (original.action === 'reopening') {
      if (original.draft.startsAt && Date.parse(original.draft.startsAt) > Date.now()) throw new HttpError(400, 'This reopening is in the future. Keep the existing restriction until it is confirmed open.');
      if (!previous?.agent || previous.status !== 'published' || previous.agent.overridden || original.mapping !== 'existing')
        throw new HttpError(409, 'A current, unchanged agent incident is required for reopening.');
      closure = { ...previous, status: 'cancelled', agent: { ...previous.agent, noticeId: notice!.id, sourceId: notice!.sourceId,
        sourceRevision: notice!.revision, evidenceAt: notice!.sourceTimestamp?.at ?? notice!.publishedAt ?? now,
        evidenceBasis: notice!.sourceTimestamp?.at || notice!.publishedAt ? 'source' : 'admin_review', overridden: true },
        reviewedBy: input.reviewer, reviewedAt: now, revision: previous.revision + 1, updatedAt: now };
    } else {
      if (!input.draft) throw new HttpError(400, 'Complete the map proposal before approving.');
      const draft = closureDraftSchema.parse(input.draft);
      if ((original.action === 'disruption' || original.impact !== 'closed') && !input.confirmRestriction)
        throw new HttpError(400, 'Confirm an actual road restriction before approving a disruption.');
      if (draft.endsAt === null && !input.confirmUnknownEnd) throw new HttpError(400, 'Explicitly confirm keeping this restriction active until cancelled.');
      if (draft.status !== 'published') throw new HttpError(400, 'Approval must explicitly apply the restriction to route planning.');
      closure = { ...draft, id: original.targetId, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now,
        moderation: 'approved', author: { uid: 'system:gemini', displayName: 'Gemini · reviewed proposal', role: 'verified' },
        reviewedBy: input.reviewer, reviewedAt: now,
        agent: { noticeId: notice!.id, sourceId: notice!.sourceId, sourceRevision: notice!.revision,
          evidenceAt: notice!.sourceTimestamp?.at ?? notice!.publishedAt ?? now,
          evidenceBasis: notice!.sourceTimestamp?.at || notice!.publishedAt ? 'source' : 'admin_review', locationKey: original.locationKey || `admin:${original.targetId}`,
          overridden: previous?.agent?.overridden ?? false } };
    }
  }
  const proposal: AgentProposal = { ...original, state: input.decision === 'approve' ? 'approved' : 'rejected',
    ...(input.draft && closure ? { draft: { ...input.draft, status: closure.status } } : {}),
    reviewedBy: input.reviewer, reviewedAt: now, ...(closure ? { closureId: closure.id } : {}) };
  const proposals = result.proposals!.map(item => item.index === proposal.index ? proposal : item);
  const closureIds = [...new Set([...result.closureIds, ...(closure ? [closure.id] : [])])];
  return { result: { ...result, proposals, closureIds, state: proposals.some(item => item.state === 'pending') ? 'review' : closureIds.length ? 'applied' : 'review' }, proposal, ...(closure ? { closure } : {}) };
}
