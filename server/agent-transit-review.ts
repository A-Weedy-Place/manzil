import { createHash, randomUUID } from 'node:crypto';
import type { AgentExtraction, AgentProposal, AgentProposalDecision, AgentProposalReview, AgentResult } from '../shared/agent.js';
import type { SourceNotice } from '../shared/types.js';
import type { TransitDataset, TransitDisruption, TransitDisruptionState } from '../shared/transit.js';
import { sourceSupportsInstant } from './agent-time.js';
import { loadTransitDataset } from './transit/dataset.js';
import { assertTransitDisruptionScope, transitDisruptionSchema } from './transit/disruptions.js';
import { HttpError } from './errors.js';

type Event = AgentExtraction['events'][number];
const normalized = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const compact = (value: string) => normalized(value).replaceAll(' ', '');
const contains = (text: string, value: string) => (` ${normalized(text)} `).includes(` ${normalized(value)} `);
const aliases: Record<string, string[]> = {
  rqq4r: ['Red Line', 'Red Line Metro', 'Pakistan Metrobus', 'ریڈ لائن', 'ریڈ لائن میٹرو'],
  ammha: ['Blue Line', 'بلیو لائن'], px6f2: ['Green Line', 'گرین لائن'],
  'osm-orange-brt': ['Orange Line', 'اورنج لائن'],
  'osm-orange-airport': ['Orange airport corridor', 'Airport Metro', 'ائرپورٹ میٹرو'],
};
const twinCities = /\b(?:islamabad|rawalpindi|taxila|fateh\s*jang|wah|humak|rawat|bhara?\s*kahu)\b|اسلام آباد|راولپنڈی|ٹیکسلا|فتح جنگ|روات|بھارہ کہو/i;

/** Explicit service extraction wins. Older saved interpretations are classified
 * narrowly so a road near a metro station is not turned into a service notice. */
export function isTransitEvent(event: Event) {
  if(event.kind === 'transit' || event.transit) return true;
  if (event.service == null && event.action === 'closure' && event.location.road &&
    /\b(?:road|highway|motorway|avenue|street)\s+(?:(?:is|are|was|will|be|has|been|remain|remains|now|temporarily|completely|currently)\s+){0,4}(?:closed|blocked|sealed|diverted)\b|(?:سڑک|شاہراہ|روڈ)\s+(?:(?:پر|کی|ہے|کو|مکمل|طور|سے|عارضی)\s+){0,5}(?:بند|مسدود)/i.test(event.quote)) return false;
  return !!event.service || /\b(?:bus|metro|train|public transport)\s+(?:bus\s+)?(?:services?|operations?)\b|\b(?:metro|[a-z]+\s+line)\s+(?:is\s+|are\s+)?(?:closed|suspended|resumed|reopened)\b|(?:میٹرو|بس).{0,20}(?:سروس|سروسز).{0,30}(?:بند|معطل|بحال)/i.test(event.quote);
}

function routeMatch(event: Event, notice: SourceNotice, data: TransitDataset | null) {
  if (!data) return undefined;
  const name = event.service?.route ?? event.location.road;
  if (!name) return undefined;
  // Islamabad's Green/Orange names also exist elsewhere. A named colour alone
  // does not establish this dataset's city, even when the model guesses a city.
  if (!twinCities.test(event.location.city ?? '') || !twinCities.test(notice.text)) return undefined;
  const matches = data.routes.filter(route => {
    const names = [route.shortName, route.name, ...(aliases[route.id] ?? [])];
    return names.some(alias => compact(alias) === compact(name) && contains(event.quote, alias));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function prepareTransitProposal(notice: SourceNotice, extraction: AgentExtraction, event: Event, index: number,
  options: { data?: TransitDataset | null; transitState?: TransitDisruptionState; now?: number } = {}): AgentProposal {
  const data = options.data === undefined ? loadTransitDataset() : options.data, now = options.now ?? Date.now();
  const issues = [...extraction.warnings, ...event.uncertainties];
  if (!notice.text.includes(event.quote)) issues.push('Check the original evidence: the quote was not found in the saved text.');
  if (event.imageIndex !== null) issues.push('Check the original image before confirming the affected bus line.');
  if (notice.contentState === 'possibly_truncated') issues.push('The collected post may be incomplete.');
  const route = routeMatch(event, notice, data);
  if (!route) issues.push('Choose the affected bus line. A generic metro announcement does not identify every service.');
  const service = event.service, fromName = service?.from ?? event.location.from, toName = service?.to ?? event.location.to;
  // An older interpretation with no explicit full-line scope stays for manual
  // confirmation. Never silently widen an unresolved section to an entire line.
  const segment = service?.scope === 'segment' || !!fromName || !!toName;
  let fromStopId: string | undefined, toStopId: string | undefined;
  if (route && segment && fromName && toName && data) {
    const pairs = data.patterns.filter(pattern => pattern.routeId === route.id).flatMap(pattern => {
      const from = pattern.stopIds.filter(id => compact(data.stops.find(stop => stop.id === id)?.name ?? '') === compact(fromName));
      const to = pattern.stopIds.filter(id => compact(data.stops.find(stop => stop.id === id)?.name ?? '') === compact(toName));
      return from.flatMap(a => to.filter(b => pattern.stopIds.indexOf(b) > pattern.stopIds.indexOf(a)).map(b => [a, b] as const));
    });
    const unique = [...new Map(pairs.map(pair => [pair.join(':'), pair])).values()];
    if (unique.length === 1) [fromStopId, toStopId] = unique[0];
  }
  if (segment && (!fromStopId || !toStopId)) issues.push('The reported section is unresolved. Select both ordered stops or explicitly confirm a whole-line suspension.');
  if (!service || service.scope === 'unknown') issues.push('Confirm whether the report suspends the whole line or a specific section.');
  const exact = (instant: string | null) => !!(instant && notice.publishedAt && sourceSupportsInstant(event.quote, instant, notice.publishedAt));
  const pktDay = (instant: string) => new Date(Date.parse(instant) + 5 * 3600_000).toISOString().slice(0, 10);
  const supported = (instant: string | null) => instant && event.timeBasis !== 'unknown' && notice.publishedAt && (exact(instant) || pktDay(instant) === pktDay(notice.publishedAt));
  const startsAt = supported(event.startsAt) ? event.startsAt! : undefined;
  const endsAt = supported(event.endsAt) && (!startsAt || Date.parse(event.endsAt!) > Date.parse(startsAt)) ? event.endsAt! : undefined;
  if (!startsAt) issues.push('Enter a confirmed start time.');
  if (!endsAt && event.action !== 'reopening') issues.push('Enter a confirmed expiry. No bus suspension expiry was invented.');
  if (startsAt && !exact(startsAt) || endsAt && !exact(endsAt)) issues.push('AI-proposed time on the publication date: confirm it against the source.');
  const key = route ? `transit:${route.id}:${fromStopId ?? 'all'}:${toStopId ?? 'all'}` : '';
  const existing = (options.transitState?.records ?? []).filter(record => record.agent && !record.agent.overridden && record.status === 'published' &&
    record.routeId === route?.id && (record.fromStopId ?? 'all') === (fromStopId ?? 'all') && (record.toStopId ?? 'all') === (toStopId ?? 'all') &&
    (event.action === 'reopening' || startsAt && Date.parse(record.startsAt) < Date.parse(endsAt ?? startsAt) && Date.parse(record.endsAt) > Date.parse(startsAt)));
  const target = existing.length === 1 ? existing[0] : undefined;
  if (existing.length > 1) issues.push('Multiple service notices match; inspect the current notices before making a new decision.');
  if (event.action === 'reopening' && !target) issues.push('No unique current agent service suspension was found to reopen.');
  const targetId = target?.id ?? `agent-transit-${createHash('sha256').update(`${notice.id}:${index}`).digest('hex').slice(0, 28)}`;
  const collision = options.transitState?.records.find(record => record.id === targetId);
  return { index, version: randomUUID(), state: 'pending', kind: 'transit', action: event.action, impact: event.impact, draft: {},
    transitScope: segment ? 'segment' : service?.scope ?? 'unknown',
    mapping: route && (!segment || fromStopId && toStopId) ? 'transit' : 'unresolved', locationKey: key, targetId,
    targetRevision: target?.revision ?? collision?.revision ?? null, preparedAt: new Date(now).toISOString(),
    transitCandidates: (data?.routes ?? []).map(({ id, shortName, name }) => ({ id, shortName, name })),
    transitDraft: { ...(route ? { routeId: route.id } : {}), ...(fromStopId && toStopId ? { fromStopId, toStopId } : {}),
      title: event.title, description: `${extraction.summary}\n\n${event.quote}`.slice(0, 1000), ...(startsAt ? { startsAt } : {}), ...(endsAt ? { endsAt } : {}),
      status: event.action === 'reopening' ? 'cancelled' : 'published', ...(notice.url ? { sourceUrl: notice.url } : {}) },
    issues: [...new Set(issues)], steps: [
      { tool: 'interpret_source', state: 'done', detail: 'This is a bus service report, not evidence that private-car roads are closed.' },
      { tool: 'match_incident', state: route ? 'done' : 'blocked', detail: route ? `Matched ${route.shortName}; the administrator must confirm service scope.` : 'No unique evidenced line was identified.' },
      { tool: 'validate_times', state: startsAt && endsAt ? 'needs_review' : 'blocked', detail: 'A dated service window requires administrator confirmation.' },
      { tool: 'prepare_draft', state: 'done', detail: 'Private bus service proposal only; Local changes after administrator approval.' },
    ] };
}

/** Runs inside the same repository transaction as the saved proposal decision. */
export function decideTransitProposal(input: AgentProposalReview, notice: SourceNotice, result: AgentResult, original: AgentProposal,
  state: TransitDisruptionState, data: TransitDataset | null = loadTransitDataset()): AgentProposalDecision {
  const now = new Date().toISOString(), previous = state.records.find(record => record.id === original.targetId);
  let transitDisruption: TransitDisruption | undefined;
  if (input.decision === 'approve') {
    if (input.draft) throw new HttpError(400, 'A bus service report cannot publish a private-car road closure.');
    if (!input.confirmTransitScope) throw new HttpError(400, 'Confirm the bus line, direction and affected stops against the source.');
    if ((previous?.revision ?? null) !== original.targetRevision) throw new HttpError(409, 'The bus service notice changed after this proposal was prepared.');
    if (previous && (!previous.agent || previous.agent.overridden || previous.status === 'cancelled')) throw new HttpError(409, 'A corrected or cancelled service notice cannot be replaced by this proposal.');
    const evidenceAt = notice.sourceTimestamp?.at ?? notice.publishedAt;
    if (previous?.agent && (!evidenceAt || Date.parse(evidenceAt) <= Date.parse(previous.agent.evidenceAt)))
      throw new HttpError(409, 'The current service notice has this or newer source evidence.');
    let draft;
    if (original.action === 'reopening') {
      if(input.transitDraft?.startsAt && Date.parse(input.transitDraft.startsAt)>Date.now()) throw new HttpError(409,'A future restoration cannot reopen a service now.');
      if (!previous || !original.transitDraft?.startsAt || Date.parse(original.transitDraft.startsAt) > Date.now() ||
        Date.parse(original.transitDraft.startsAt) < Date.parse(previous.startsAt) || Date.parse(original.transitDraft.startsAt) >= Date.parse(previous.endsAt))
        throw new HttpError(409, 'A current, unchanged suspension and confirmed reopening time are required; future times cannot reopen a current service.');
      if (input.transitDraft && (input.transitDraft.routeId!==previous.routeId || JSON.stringify(input.transitDraft.routeIds??[])!==JSON.stringify(previous.routeIds??[]) || input.transitDraft.directionId!==previous.directionId || input.transitDraft.fromStopId!==previous.fromStopId || input.transitDraft.toStopId!==previous.toStopId)) throw new HttpError(409,'Restoration must retain the unchanged service.');
      draft = { routeId: previous.routeId, ...(previous.routeIds ? {routeIds:previous.routeIds} : {}), ...(previous.directionId !== undefined ? { directionId: previous.directionId } : {}),
        ...(previous.fromStopId ? { fromStopId: previous.fromStopId, toStopId: previous.toStopId } : {}),
        title: previous.title, description: previous.description, startsAt: previous.startsAt, endsAt: previous.endsAt,
        status: 'cancelled' as const, sourceUrl: notice.url || previous.sourceUrl };
    } else {
      if (!input.transitDraft) throw new HttpError(400, 'Complete the bus service proposal before approving.');
      draft = transitDisruptionSchema.parse(input.transitDraft);
      if (draft.status !== 'published') throw new HttpError(400, 'A suspension approval must publish a bus service notice.');
      if (Date.parse(draft.endsAt) <= Date.now()) throw new HttpError(400, 'This service period has ended. Enter a current or upcoming confirmed window.');
    }
    assertTransitDisruptionScope(data, draft);
    if (!previous && state.records.length >= 100) throw new HttpError(409, 'The bus-notice store has reached its 100-record limit.');
    transitDisruption = { ...draft, id: original.targetId, revision: (previous?.revision ?? 0) + 1,
      author: { uid: 'system:gemini', displayName: 'Gemini · reviewed service notice', role: 'verified' },
      createdAt: previous?.createdAt ?? now, updatedAt: now, reviewedBy: input.reviewer, reviewedAt: now,
      agent: { noticeId: notice.id, sourceId: notice.sourceId, sourceRevision: notice.revision,
        evidenceAt: notice.sourceTimestamp?.at ?? notice.publishedAt ?? now, locationKey: original.locationKey, ...(original.action === 'reopening' ? { overridden: true } : {}) } };
  }
  const proposal: AgentProposal = { ...original, state: input.decision === 'approve' ? 'approved' : 'rejected', decisionMode: 'admin', reviewedBy: input.reviewer, reviewedAt: now,
    ...(transitDisruption ? { transitDisruptionId: transitDisruption.id } : {}) };
  // Reopening retains the existing complete scope/window, rather than reparsing a
  // partial source suggestion. Server-owned provenance never enters the draft.
  if (transitDisruption) { const { id: _id, revision: _rev, author: _author, createdAt: _created, updatedAt: _updated, agent: _agent, reviewedBy: _reviewer, reviewedAt: _reviewed, ...draft } = transitDisruption; proposal.transitDraft = draft; }
  const proposals = result.proposals!.map(item => item.index === proposal.index ? proposal : item);
  const transitDisruptionIds = [...new Set([...(result.transitDisruptionIds ?? result.transitIds ?? []), ...(transitDisruption ? [transitDisruption.id] : [])])];
  return { result: { ...result, proposals, transitDisruptionIds, transitIds: transitDisruptionIds, state: proposals.some(item => item.state === 'pending') ? 'review' : transitDisruptionIds.length || result.closureIds.length ? 'applied' : 'review' },
    proposal, ...(transitDisruption ? { transitDisruption } : {}) };
}
