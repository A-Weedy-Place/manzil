import { createHash } from 'node:crypto';
import type { AgentClosureChange, AgentExtraction } from '../shared/agent.js';
import type { Closure, SourceNotice } from '../shared/types.js';
import { closureDraftSchema } from './validation.js';
import { resolveAgentLocation, type ResolvedAgentLocation } from './agent-location.js';
import { sourceSupportsInstant } from './agent-time.js';

const blockage = /\b(?:closed|blocked|closure|diverted|sealed|shut)\b|(?:سڑک|راست|ٹریفک|روڈ).{0,30}بند|بند.{0,30}(?:سڑک|راست|ٹریفک|روڈ)/i;
const reopening = /\b(?:reopened|reopening|restored|now open|traffic resumed|cleared)\b|کھول|بحال/i;
export async function planAgentActions(notice: SourceNotice, extraction: AgentExtraction, incidents: Closure[], options: {
  autoPublish: boolean; imageCount: number; now?: number; resolve?: (event: AgentExtraction['events'][number]) => Promise<ResolvedAgentLocation>;
}) {
  const changes: AgentClosureChange[] = [], issues: string[] = [];
  const now = options.now ?? Date.now(), evidenceTime = notice.sourceTimestamp?.kind === 'edited' ? notice.sourceTimestamp.at : notice.publishedAt;
  if (extraction.category === 'irrelevant') return { changes, issues, dismissed: true };
  if (extraction.fuel.length) issues.push('Fuel announcements await the authoritative dated PSO check; announcement prices were not applied.');
  for (const [index, event] of extraction.events.entries()) {
    try {
      if (!options.autoPublish) throw new Error('Automatic publication is disabled; review this interpretation.');
      if (extraction.category !== 'traffic' || extraction.warnings.length || notice.contentState === 'possibly_truncated') throw new Error('Source/category warnings require review before changing routes.');
      if (event.action === 'disruption' || event.impact !== 'closed' && event.action !== 'reopening') throw new Error('Disruption/congestion is not a confirmed road closure.');
      if (event.confidence < .9 || event.uncertainties.length) throw new Error('Extraction is uncertain; review before changing routes.');
      if (event.imageIndex !== null) throw new Error('Image evidence needs review before changing routes.');
      if (!notice.text.includes(event.quote) || !(event.action === 'reopening' ? reopening : blockage).test(event.quote) ||
        /metro|bus service|train service|میٹرو/i.test(event.quote)) throw new Error('The source quote does not clearly establish the proposed road action.');
      if (!notice.publishedAt || !evidenceTime || event.timeBasis === 'unknown') throw new Error('Original publication/event timing is unknown.');
      const location = await (options.resolve ?? resolveAgentLocation)(event);
      const target = event.targetIncidentId ? incidents.find(closure => closure.id === event.targetIncidentId) : undefined;
      if (event.targetIncidentId && (!target?.agent || target.agent.locationKey !== location.key)) throw new Error('The proposed update does not match an existing agent incident at this location.');
      if (target?.agent && (target.agent.overridden || target.status === 'cancelled' || Date.parse(evidenceTime) <= Date.parse(target.agent.evidenceAt))) throw new Error('An admin correction or newer incident evidence takes precedence.');
      let startsAt = event.startsAt, endsAt = event.endsAt;
      if (event.action === 'reopening') {
        if (!target) throw new Error('No unique existing agent incident was identified for reopening.');
        if (!event.startsAt || Date.parse(event.startsAt) > now || Date.parse(event.startsAt) < Date.parse(target.agent!.evidenceAt))
          throw new Error('Reopening is future-dated or predates the incident evidence; no current closure was cancelled.');
        if (Date.parse(target.startsAt) > Date.parse(event.startsAt) || target.endsAt && Date.parse(target.endsAt) <= Date.parse(event.startsAt))
          throw new Error('The reopening does not fall within the target incident window.');
        if (!sourceSupportsInstant(event.quote, event.startsAt, notice.publishedAt) &&
          !(/\bnow\b|اب|بحال|کھول/i.test(event.quote) && Math.abs(Date.parse(event.startsAt) - Date.parse(notice.publishedAt)) < 300_000))
          throw new Error('Reopening time could not be tied to the original source evidence.');
        changes.push({ id: target.id, expectedRevision: target.revision, draft: { ...target, status: 'cancelled',
          agent: { ...target.agent!, noticeId: notice.id, sourceId: notice.sourceId, sourceRevision: notice.revision, evidenceAt: evidenceTime },
          description: `${target.description}\nReopening evidence: ${notice.url}`.slice(0, 4000) } }); continue;
      }
      if (!startsAt || !endsAt || Date.parse(endsAt) <= now || Date.parse(endsAt) <= Date.parse(startsAt) ||
        Date.parse(endsAt) - Date.parse(startsAt) > 24 * 3600_000 || Date.parse(startsAt) > now + 7 * 86400_000 || Date.parse(startsAt) < now - 86400_000)
        throw new Error('A bounded, current or upcoming start/end window is required; unknown expiry was not invented.');
      if (!sourceSupportsInstant(event.quote, startsAt, notice.publishedAt) || !sourceSupportsInstant(event.quote, endsAt, notice.publishedAt))
        throw new Error('The proposed dates and clock times could not both be matched to the source; review the time window.');
      if (incidents.some(closure => closure.agent?.overridden && (closure.agent.sourceId === notice.sourceId || closure.agent.locationKey === location.key &&
        Date.parse(closure.startsAt) < Date.parse(endsAt!) && (!closure.endsAt || Date.parse(closure.endsAt) > Date.parse(startsAt!)))))
        throw new Error('An administrator corrected this source/location and time window; automatic republication was withheld.');
      const existing = target ?? incidents.find(closure => closure.agent?.locationKey === location.key && closure.status !== 'cancelled' && !closure.agent.overridden &&
        Date.parse(closure.startsAt) < Date.parse(endsAt!) && (!closure.endsAt || Date.parse(closure.endsAt) > Date.parse(startsAt!)));
      if (existing?.agent && Date.parse(evidenceTime) <= Date.parse(existing.agent.evidenceAt)) throw new Error('An existing incident already has this or newer evidence.');
      const draft = closureDraftSchema.parse({ title: event.title, description: `${extraction.summary}\nAI interpretation of ${notice.url}; original evidence retained.`,
        reason: event.reason, startsAt, endsAt, status: 'published', geometry: location.geometry, drawing: location.drawing, sourceUrl: notice.url });
      const id = existing?.id ?? `agent-${createHash('sha256').update(`${notice.id}:${index}`).digest('hex').slice(0, 32)}`;
      changes.push({ id, expectedRevision: existing?.revision ?? null, draft: { ...draft, moderation: 'approved',
        author: { uid: 'system:gemini', displayName: notice.source === 'x' ? 'Gemini · Champ Alerts' : 'Gemini · Manual notice', role: 'verified' },
        agent: { noticeId: notice.id, sourceId: notice.sourceId, sourceRevision: notice.revision, evidenceAt: evidenceTime, locationKey: location.key } } });
    } catch (error) { issues.push(`${event.title}: ${error instanceof Error ? error.message : 'Review required.'}`.slice(0, 500)); }
  }
  if (new Set(changes.map(change => change.id)).size !== changes.length) return { changes: [], issues: [...issues, 'Conflicting proposed actions target the same incident.'], dismissed: false };
  if (!extraction.events.length && !extraction.fuel.length) issues.push('No actionable road/fuel evidence was extracted.');
  return { changes, issues, dismissed: false };
}
