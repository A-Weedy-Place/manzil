import type { AgentExtraction } from '../shared/agent.js';
import type { SourceNotice } from '../shared/types.js';
import { sourceSupportsInstant } from './agent-time.js';

export type TrafficEvent = AgentExtraction['events'][number];
export const PUBLICATION_POLICY_VERSION = 2;
export class ExpiredEvent extends Error {}
export const PROVISIONAL_MS = 2 * 86400_000;
const normal = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const sourceNames = (text: string, names: (string | null | undefined)[]) => names.every(name => !name || normal(text).includes(normal(name)));
export function actionEvidence(notice: SourceNotice, event: TrafficEvent, action: RegExp) {
  if (!notice.text.includes(event.quote)) return false;
  if (/\b(?:not|never)(?:\s+yet)?\s+(?:closed|blocked|reopened|open|restored|resumed|suspended)\b|\bno\s+(?:road\s+|service\s+)?(?:closures?|blockages?|suspensions?)\b|(?:بند|بحال|معطل|کھلی).{0,12}نہیں|نہیں.{0,12}(?:بند|بحال|معطل|کھلی)/i.test(event.quote)) return false;
  if (action.test(event.quote)) return true;
  // Support a closure heading followed by factual list entries, not unrelated
  // closure words elsewhere in a multi-event post.
  if (event.action === 'reopening' || /reopened|resumed|restored|now open|not closed|not blocked|بحال|کھول/i.test(event.quote)) return false;
  const prefix=notice.text.slice(Math.max(0,notice.text.indexOf(event.quote)-500),notice.text.indexOf(event.quote));
  return /(?:closed|blocked|closures|suspended|بند|معطل)[^.!?]*[:\n][\s\S]*$/i.test(prefix) && action.test(prefix);
}
// Unknown expiry is operationally bounded; uncertainty about location/access is not ignored.
export const materialUncertainties = (event: TrafficEvent) => event.uncertainties.filter(issue => {
  const expiry = /\b(?:end(?:ing)? (?:date|time)|reopening (?:date|time)|expiry|expiration|duration)\b/i.test(issue);
  const missing = /unknown|missing|unclear|not (?:provided|specified|stated|known|clear|established)|absent/i.test(issue);
  const core = /location|carriageway|direction|scope|road name|end point|endpoint|start|which (?:line|service)|whether|translation/i.test(issue);
  return !(expiry && missing && !core);
});
export function supportedInstant(text: string, at: string, publication: string) {
  if (sourceSupportsInstant(text, at, publication)) return true;
  // A clock without a date refers to the original publication's PKT day, never collection day.
  const day = (value: string) => new Date(Date.parse(value) + 5 * 3600_000).toISOString().slice(0,10);
  const dated = /\b(?:today|tomorrow|yesterday|january|february|march|april|may|june|july|august|september|october|november|december)\b|\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|آج|کل/i.test(text);
  return !dated && day(at) === day(publication) && sourceSupportsInstant(`Today ${text}`, at, publication);
}
export function eventWindow(notice: SourceNotice, event: TrafficEvent, now: number) {
  const publication = notice.publishedAt;
  if (!publication || !Number.isFinite(Date.parse(publication))) throw new Error('Original publication time is required.');
  const text = notice.text;
  let startsAt = event.startsAt;
  if (startsAt && supportedInstant(text, startsAt, publication)) { /* Explicit or dated source clock. */ }
  else {
    if (!startsAt && /\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m|p\.m)\b/i.test(event.quote)) throw new Error('The source clock needs interpretation before publication.');
    // Current statements may anchor to publication, including "closed" without a clock.
    // Future announcements still need an established start; never activate them early.
    if (/\b(?:will|shall|going to|tomorrow|shortly|soon|expected to)\b|ہوگی|ہوگا|کل/i.test(event.quote) ||
      !/\b(?:closed|blocked|sealed|diverted|suspended|halted|reopened|restored|resumed|cleared|now open)\b|بند|معطل|بحال|کھول/i.test(event.quote))
      throw new Error('The announced start/reopening time is unresolved.');
    if (startsAt && Math.abs(Date.parse(startsAt)-Date.parse(publication)) > 300_000)
      throw new Error('The proposed time is not supported by the source.');
    startsAt = publication;
  }
  if (Date.parse(publication) > now + 300_000 || Date.parse(startsAt) > now + 7*86400_000)
    throw new Error('Publication/start is outside the supported time range.');
  if(event.action === 'reopening') return {startsAt,endsAt:new Date(Date.parse(startsAt)+PROVISIONAL_MS).toISOString(),provisional:false};
  if(!event.endsAt && /\b(?:until|till|to)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m|p\.m)\b/i.test(text))
    throw new Error('The source includes an end clock but the interpretation omitted it; confirm that window.');
  const provisional = !event.endsAt;
  const endsAt = event.endsAt ?? new Date(Date.parse(startsAt)+PROVISIONAL_MS).toISOString();
  if (event.endsAt && !supportedInstant(text, event.endsAt, publication)) throw new Error('The announced end time is not supported by the source.');
  if(Date.parse(endsAt)<=now) throw new ExpiredEvent('The source-supported restriction has expired; old evidence was not made current.');
  if ((Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt)-Date.parse(startsAt)>7*86400_000))
    throw new Error('The closure window is expired or invalid; old evidence was not made current.');
  return { startsAt, endsAt, provisional };
}

/** Adapt saved service interpretations without fabricating road/line identities. */
export function normalizeTrafficEvent(event: TrafficEvent): TrafficEvent {
  const transit = event.transit ?? (event.service ? { service: event.service.route, city: event.location.city, direction: null,
    fromStop: event.service.from, toStop: event.service.to, scope: event.service.scope === 'route' ? 'whole_service' as const : event.service.scope } : null);
  return { ...event, ...(transit ? { kind: 'transit' as const, transit,
    action: event.action === 'disruption' && /suspended|closed|معطل|بند/i.test(event.quote) ? 'closure' as const : event.action,
    impact: /suspended|closed|معطل|بند/i.test(event.quote) ? 'closed' as const : event.impact } : {}),
    restrictionType: event.restrictionType ?? (event.location.from && event.location.to ? 'road_closure' : event.location.point ? 'blockade' : null) };
}
