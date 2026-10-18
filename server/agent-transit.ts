export { isTransitEvent } from './agent-transit-review.js';
import { createHash, randomUUID } from 'node:crypto';
import type { AgentExtraction, AgentProposal, AgentTransitChange } from '../shared/agent.js';
import type { SourceNotice } from '../shared/types.js';
import type { TransitDataset, TransitDisruption, TransitDisruptionDraft, TransitDisruptionState } from '../shared/transit.js';
import { loadTransitDataset } from './transit/dataset.js';
import { ExpiredEvent, actionEvidence, eventWindow, materialUncertainties, normalizeTrafficEvent, sourceNames } from './agent-evidence.js';
import { isTransitEvent } from './agent-transit-review.js';

const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const contains = (text: string, name: string) => !!normal(name) && normal(text).includes(normal(name));
const suspended = /\b(?:suspended|suspension|closed|halted|stopped)\b|بند|معطل/i;
const resumed = /\b(?:resumed|restored|reopened|now operating)\b|بحال/i;
type Event = AgentExtraction['events'][number];
export const transitLocationKey = (draft: Partial<TransitDisruptionDraft>) => ['transit', ...(draft.routeIds ?? (draft.routeId ? [draft.routeId] : [])).slice().sort(), draft.directionId ?? '*', draft.fromStopId ?? '*', draft.toStopId ?? '*'].join(':');

/** Only documented service aliases. Generic "Metro" cannot identify a service. */
export function resolveTransitNotice(event: Event, data: TransitDataset | null, source = event.quote): Partial<TransitDisruptionDraft> {
  if (!data || !event.transit?.service) throw new Error('Select the Metro/bus service; generic Metro is ambiguous.');
  const input = event.transit, service = normal(input.service!);
  if (!contains(source, input.service!)) throw new Error('Service name must occur in the original source quote.');
  if (!input.city || !contains(event.quote, input.city) || !/islamabad|rawalpindi|اسلامآباد|راولپنڈی/.test(normal(input.city))) throw new Error('Confirm the service city against the original source.');
  let routes = data.routes.filter(route => [route.name, route.shortName].some(name => normal(name) === service));
  const red = ['redline', 'redlinemetro', 'rawalpindiislamabadmetro', 'ریڈلائن', 'راولپنڈیاسلامآبادمیٹرو'];
  if (red.includes(service)) routes = data.routes.filter(route => ['RLRT01','RLRT03','RLRT04'].includes(route.shortName));
  if (['blueline','بلیولائن'].includes(service)) routes = data.routes.filter(route => route.shortName === 'FRB-1');
  if (['greenline','گرینلائن'].includes(service)) routes = data.routes.filter(route => route.shortName === 'FRG-1');
  // Orange main/airport services have different coverage; require a precise catalogue name.
  if (!routes.length || routes.length > 1 && !red.includes(service)) throw new Error('The announced service does not uniquely match the loaded local network.');
  if (input.scope === 'unknown') throw new Error('Confirm whether the whole service or a stop segment is suspended.');
  if (input.scope === 'whole_service' && /\b(?:between(?!\s*\d)|towards?|direction|stations?|stops?)\b|اسٹیشن|اسٹاپ|کی طرف/i.test(event.quote))
    throw new Error('The quote contains stop/direction qualifiers; confirm the affected segment instead of suspending the whole service.');
  if (input.scope === 'whole_service' && (input.fromStop || input.toStop) || input.scope === 'segment' && (!input.fromStop || !input.toStop)) throw new Error('The announced extent needs review; do not suspend a whole line for an unclear segment.');
  if (routes.length > 1 && (input.direction || input.scope !== 'whole_service')) throw new Error('Select an exact Red Line route/direction for a partial suspension.');
  const route = routes.find(item => item.shortName === 'RLRT01') ?? routes[0];
  let patterns = data.patterns.filter(pattern => pattern.routeId === route.id);
  const draft: Partial<TransitDisruptionDraft> = { routeId: route.id, ...(routes.length > 1 ? { routeIds: routes.map(item => item.id) } : {}) };
  if (input.direction) {
    if (!contains(event.quote, input.direction)) throw new Error('The direction is not supported by the source.');
    patterns = patterns.filter(pattern => normal(pattern.headsign) === normal(input.direction!) || normal(pattern.directionId) === normal(input.direction!));
    const directions = [...new Set(patterns.map(pattern => pattern.directionId))];
    if (directions.length !== 1) throw new Error('The direction could not be uniquely resolved.');
    draft.directionId = directions[0];
  }
  if (input.scope === 'segment') {
    const stop = (name: string) => {
      if (!contains(event.quote, name)) throw new Error('Stop names must appear in the source.');
      const found = data.stops.filter(stop => normal(stop.name) === normal(name) && patterns.some(pattern => pattern.stopIds.includes(stop.id)));
      if (found.length !== 1) throw new Error('The announced stop could not be uniquely resolved.');
      return found[0].id;
    };
    draft.fromStopId = stop(input.fromStop!); draft.toStopId = stop(input.toStop!);
    if (!patterns.some(pattern => pattern.stopIds.indexOf(draft.fromStopId!) >= 0 && pattern.stopIds.indexOf(draft.toStopId!) > pattern.stopIds.indexOf(draft.fromStopId!))) throw new Error('Stop order does not match the announced service direction.');
  }
  return draft;
}

export function planTransitNotices(notice: SourceNotice, extraction: AgentExtraction, state: TransitDisruptionState, options: {
  autoPublish: boolean; now?: number; data?: TransitDataset | null;
}): { proposals: AgentProposal[]; changes: AgentTransitChange[] } {
  const proposals: AgentProposal[] = [], changes: AgentTransitChange[] = [], now = options.now ?? Date.now();
  for (const [index, saved] of extraction.events.entries()) {
    const event = normalizeTrafficEvent(saved);
    if (!isTransitEvent(event)) continue;
    const issues: string[] = [...extraction.warnings, ...materialUncertainties(event)];
    let mapped: Partial<TransitDisruptionDraft> = {};
    try { mapped = resolveTransitNotice(event, options.data === undefined ? loadTransitDataset() : options.data,notice.text); }
    catch (error) { issues.push(error instanceof Error ? error.message : 'Service needs review.'); }
    let expired=false;
    let window: ReturnType<typeof eventWindow> | undefined;
    try { window=eventWindow(notice,event,now); } catch(error) { expired=error instanceof ExpiredEvent; issues.push(error instanceof Error ? error.message : 'Time needs review.'); }
    const key = transitLocationKey(mapped), evidenceAt = notice.sourceTimestamp?.kind === 'edited' ? notice.sourceTimestamp.at : notice.publishedAt;
    const candidates = state.records.filter(record => record.agent?.locationKey === key && record.status === 'published' &&
      (event.action === 'reopening' || window && Date.parse(record.startsAt) < Date.parse(window.endsAt) && Date.parse(record.endsAt) > Date.parse(window.startsAt)));
    const explicit = event.targetIncidentId ? state.records.find(record => record.id === event.targetIncidentId) : undefined;
    const target = explicit ?? (candidates.length === 1 ? candidates[0] : undefined);
    const targetId = target?.id ?? `agent-transit-${createHash('sha256').update(`${notice.id}:${index}`).digest('hex').slice(0,32)}`;
    const previous = state.records.find(record => record.id === targetId);
    const draft: Partial<TransitDisruptionDraft> = { ...mapped, title: event.title, description: `${window?.provisional ? 'Provisional: two-day application expiry; source reopening time unknown.\n' : ''}${extraction.summary}\n${notice.text}`.slice(0,1000),
      ...(window ? { startsAt: window.startsAt, endsAt: window.endsAt } : {}), status: 'published', ...(notice.url ? { sourceUrl: notice.url } : {}) };
    if (!options.autoPublish) issues.push('Automatic publication is disabled.');
    if (extraction.category !== 'traffic' || notice.contentState === 'possibly_truncated' || !notice.text.includes(event.quote) || !notice.publishedAt || !evidenceAt) issues.push('Complete text evidence and original publication time are required.');
    if (/\b(?:may|might|possibly|not closed|not suspended)\b|متوقع|امکان/i.test(event.quote)) issues.push('Tentative or negated suspension needs review.');
    if (event.confidence < .85 || event.impact !== 'closed' && event.action !== 'reopening') issues.push('A clear, high-confidence service suspension/restoration is required.');
    if (!actionEvidence(notice,event,event.action === 'reopening' ? resumed : suspended)) issues.push('The source must explicitly suspend or restore the service.');
    if (candidates.length > 1 || explicit && explicit.agent?.locationKey !== key) issues.push('Multiple or mismatched service notices require review.');
    if (previous && (!previous.agent || previous.agent.overridden || previous.status === 'cancelled' || !evidenceAt || Date.parse(evidenceAt) <= Date.parse(previous.agent.evidenceAt))) issues.push('An administrator correction or existing/newer evidence takes precedence.');
    if (state.records.some(record => record.agent?.overridden && (record.agent.sourceId === notice.sourceId || record.agent.locationKey === key && window && Date.parse(record.startsAt) < Date.parse(window.endsAt) && Date.parse(record.endsAt) > Date.parse(window.startsAt)))) issues.push('Administrator suppression prevents automatic recreation.');
    if (event.action === 'reopening' && (!target?.agent || !window || Date.parse(window.startsAt)>now || Date.parse(window.startsAt)<Date.parse(target.agent.evidenceAt) || Date.parse(window.startsAt)<Date.parse(target.startsAt))) issues.push('Restoration needs a unique unchanged incident and a source-supported reopening time.');
    if (state.records.length >= 100 && !previous) issues.push('The service-notice store is full; archive old records first.');
    const uniqueIssues = [...new Set(issues)], automatic = !uniqueIssues.length;
    if (automatic) changes.push({ id: targetId, expectedRevision: previous?.revision ?? null,
      draft: event.action === 'reopening' ? { ...target!, status: 'cancelled' } : draft as TransitDisruptionDraft,
      agent: { noticeId: notice.id, sourceId: notice.sourceId, sourceRevision: notice.revision, evidenceAt: evidenceAt!, locationKey: key, expiryBasis: window?.provisional ? 'provisional' : 'source' } });
    proposals.push({ index, version: randomUUID(), kind: 'transit', state: expired ? 'expired' : automatic ? 'approved' : 'pending', ...(automatic ? { decisionMode: 'automatic', closureId: targetId } : {}),
      action: event.action, impact: event.impact, mapping: mapped.routeId ? 'transit' : 'unresolved', locationKey: key, targetId, targetRevision: previous?.revision ?? null,
      draft: {}, transitScope: event.transit?.scope === 'whole_service' ? 'route' : event.transit?.scope, transitCandidates: (options.data === undefined ? loadTransitDataset() : options.data)?.routes.map(({id,shortName,name})=>({id,shortName,name})), transitDraft: event.action === 'reopening' && target ? { ...target, startsAt: window?.startsAt, status: 'cancelled' } : draft, issues: uniqueIssues,
      steps: [{ tool: 'resolve_service', state: mapped.routeId ? 'done' : 'blocked', detail: mapped.routeId ? 'Matched a service in the local network.' : 'Service needs administrator selection.' },
        { tool: 'publication_policy', state: automatic ? 'done' : 'needs_review', detail: automatic ? 'Source, service and time checks passed; automatic publication.' : 'Review the listed uncertainties before publishing.' }] });
  }
  if (new Set(changes.map(change => change.id)).size !== changes.length) {
    return { changes: [], proposals: proposals.map(proposal => ({ ...proposal, state: 'pending', decisionMode: undefined, closureId: undefined, issues: [...proposal.issues,'Conflicting service actions require review.'] })) };
  }
  return { proposals, changes };
}

export function applyTransitChanges(current: TransitDisruptionState, changes: AgentTransitChange[], now = new Date().toISOString()): TransitDisruptionState {
  if (!changes.length) return current;
  const records = current.records.slice();
  for (const change of changes) {
    const index = records.findIndex(record => record.id === change.id), old = records[index];
    const record: TransitDisruption = { ...change.draft, id: change.id, revision: (old?.revision ?? 0)+1, agent: change.agent,
      author: old?.author ?? { uid:'system:gemini',displayName:'Gemini · Champ Alerts',role:'verified' }, createdAt:old?.createdAt ?? now,updatedAt:now };
    if (index < 0) records.push(record); else records[index] = record;
  }
  return { revision: current.revision+1, records };
}
