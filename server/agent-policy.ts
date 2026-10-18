import { createHash } from 'node:crypto';
import type { AgentClosureChange, AgentExtraction } from '../shared/agent.js';
import type { Closure, SourceNotice } from '../shared/types.js';
import { closureDraftSchema } from './validation.js';
import { resolveAgentLocation, type ResolvedAgentLocation } from './agent-location.js';
import { ExpiredEvent, actionEvidence, eventWindow, materialUncertainties, normalizeTrafficEvent, sourceNames } from './agent-evidence.js';
import { isTransitEvent } from './agent-transit-review.js';

const blockage = /\b(?:closed|blocked|closure|diverted|sealed|shut)\b|(?:سڑک|راست|ٹریفک|روڈ).{0,30}بند|بند.{0,30}(?:سڑک|راست|ٹریفک|روڈ)/i;
const reopening = /\b(?:reopened|reopening|restored|now open|traffic resumed|cleared)\b|کھول|بحال/i;
export async function planAgentActions(notice: SourceNotice, extraction: AgentExtraction, incidents: Closure[], options: {
  autoPublish: boolean; imageCount: number; now?: number; resolve?: (event: AgentExtraction['events'][number], index?: number) => Promise<ResolvedAgentLocation>;
}) {
  const changes: AgentClosureChange[] = [], issues: string[] = [], expired: number[] = [];
  const now = options.now ?? Date.now(), evidenceTime = notice.sourceTimestamp?.kind === 'edited' ? notice.sourceTimestamp.at : notice.publishedAt;
  if (extraction.category === 'irrelevant') return { changes, issues, expired, dismissed: true };
  if (extraction.fuel.length) issues.push('Fuel announcements await the authoritative dated PSO check; announcement prices were not applied.');
  for (const [index, saved] of extraction.events.entries()) {
    const event = normalizeTrafficEvent(saved);
    if (isTransitEvent(event)) continue;
    try {
      if (!options.autoPublish) throw new Error('Automatic publication is disabled; review this interpretation.');
      if (extraction.category !== 'traffic' || extraction.warnings.length || notice.contentState === 'possibly_truncated') throw new Error('Source/category warnings require review before changing routes.');
      if (event.action === 'disruption' || event.impact !== 'closed' && event.action !== 'reopening') throw new Error('Disruption/congestion is not a confirmed road closure.');
      if (/\b(?:may|might|possibly|not closed|not blocked|not suspended)\b|متوقع|امکان/i.test(event.quote)) throw new Error('Tentative or negated restrictions need review.');
      if (event.confidence < .85 || materialUncertainties(event).length) throw new Error('Extraction is uncertain; review before changing routes.');
      if (!actionEvidence(notice,event,event.action === 'reopening' ? reopening : blockage) ||
        /metro|bus service|train service|میٹرو/i.test(event.quote)) throw new Error('The source quote does not clearly establish the proposed road action.');
      if (!notice.publishedAt || !evidenceTime) throw new Error('Original publication/event timing is unknown.');
      if (!event.restrictionType && event.action !== 'reopening') throw new Error('The restriction type needs review.');
      const supported = (value: string | null) => sourceNames(notice.text,[value]);
      if (!(event.action === 'reopening' ? [event.location.road] : [event.location.city, event.location.road, event.location.from, event.location.to, event.location.point]).every(supported)) throw new Error('Location names must be supported by the saved source.');
      const { startsAt, endsAt, provisional } = eventWindow(notice,event,now);
      const location = await (options.resolve ? options.resolve(event,index) : resolveAgentLocation(event));
      const candidates = incidents.filter(closure => closure.agent?.locationKey === location.key && closure.status === 'published');
      const target = event.targetIncidentId ? incidents.find(closure => closure.id === event.targetIncidentId) : event.action === 'reopening' && candidates.length === 1 ? candidates[0] : undefined;
      if (event.targetIncidentId && (!target?.agent || target.agent.locationKey !== location.key)) throw new Error('The proposed update does not match an existing agent incident at this location.');
      if (target?.agent && (target.agent.overridden || target.status === 'cancelled' || Date.parse(evidenceTime) <= Date.parse(target.agent.evidenceAt))) throw new Error('An admin correction or newer incident evidence takes precedence.');
      if (event.action === 'reopening') {
        if (!target) throw new Error('No unique existing agent incident was identified for reopening.');
        if (!startsAt || Date.parse(startsAt) > now || Date.parse(startsAt) < Date.parse(target.agent!.evidenceAt))
          throw new Error('Reopening is future-dated or predates the incident evidence; no current closure was cancelled.');
        if (Date.parse(target.startsAt) > Date.parse(startsAt))
          throw new Error('The reopening does not fall within the target incident window.');
        changes.push({ proposalIndex: index, id: target.id, expectedRevision: target.revision, draft: { ...target, status: 'cancelled',
          agent: { ...target.agent!, noticeId: notice.id, sourceId: notice.sourceId, sourceRevision: notice.revision, evidenceAt: evidenceTime },
          description: `${target.description}\nReopening evidence: ${notice.url}`.slice(0, 4000) } }); continue;
      }
      if (incidents.some(closure => closure.agent?.overridden && (closure.agent.sourceId === notice.sourceId || closure.agent.locationKey === location.key &&
        Date.parse(closure.startsAt) < Date.parse(endsAt!) && (!closure.endsAt || Date.parse(closure.endsAt) > Date.parse(startsAt!)))))
        throw new Error('An administrator corrected this source/location and time window; automatic republication was withheld.');
      const matches = incidents.filter(closure => closure.agent?.locationKey === location.key && closure.status !== 'cancelled' && !closure.agent.overridden &&
        Date.parse(closure.startsAt) < Date.parse(endsAt!) && (!closure.endsAt || Date.parse(closure.endsAt) > Date.parse(startsAt!)));
      if (matches.length > 1) throw new Error('Multiple incidents match; review the update.');
      const existing = target ?? matches[0];
      if (existing?.agent && Date.parse(evidenceTime) <= Date.parse(existing.agent.evidenceAt)) throw new Error('An existing incident already has this or newer evidence.');
      const draft = closureDraftSchema.parse({ title: event.title, description: `${extraction.summary}\nAI interpretation of ${notice.url}; original evidence retained.${provisional ? '\nProvisional: two-day application expiry; source reopening time unknown.' : ''}`,
        reason: event.reason, startsAt, endsAt, restrictionType: event.restrictionType ?? undefined, status: 'published', geometry: location.geometry, drawing: location.drawing, sourceUrl: notice.url });
      const id = existing?.id ?? `agent-${createHash('sha256').update(`${notice.id}:${index}`).digest('hex').slice(0, 32)}`;
      changes.push({ proposalIndex: index, id, expectedRevision: existing?.revision ?? null, draft: { ...draft, moderation: 'approved',
        author: { uid: 'system:gemini', displayName: notice.source === 'x' ? 'Gemini · Champ Alerts' : 'Gemini · Manual notice', role: 'verified' },
        agent: { noticeId: notice.id, sourceId: notice.sourceId, sourceRevision: notice.revision, evidenceAt: evidenceTime, locationKey: location.key, expiryBasis: provisional ? 'provisional' : 'source' } } });
    } catch (error) { if(error instanceof ExpiredEvent) expired.push(index); issues.push(`${event.title}: ${error instanceof Error ? error.message : 'Review required.'}`.slice(0, 500)); }
  }
  if (new Set(changes.map(change => change.id)).size !== changes.length || new Set(changes.map(change => change.draft.agent?.locationKey)).size !== changes.length) return { changes: [], expired, issues: [...issues, 'Conflicting proposed actions target the same incident.'], dismissed: false };
  if (!extraction.events.length && !extraction.fuel.length) issues.push('No actionable road/fuel evidence was extracted.');
  return { changes, issues, expired, dismissed: false };
}
