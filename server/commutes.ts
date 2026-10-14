import { createHash } from 'node:crypto';
import type { Commute, CommuteImpact, PlanResponse } from '../shared/types.js';
import { planJourney } from './routing/index.js';
import { Store } from './store.js';

const KARACHI_OFFSET_MS = 5 * 3600_000;
/** Pakistan Standard Time currently has a fixed UTC+05:00 offset. Weekdays are local. */
export function nextOccurrence(commute: Commute, now = Date.now()): string {
  const local = new Date(now + KARACHI_OFFSET_MS);
  const [hour, minute] = commute.departureTime.split(':').map(Number);
  for (let days = 0; days < 8; days++) {
    const candidateLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, hour, minute);
    const candidate = candidateLocal - KARACHI_OFFSET_MS;
    if (candidate >= now && commute.days.includes(new Date(candidateLocal).getUTCDay())) return new Date(candidate).toISOString();
  }
  throw new Error('No upcoming commute day.');
}

export type Planner = typeof planJourney;
export function checkCommute(store: Store, commute: Commute, planner: Planner = planJourney, now = Date.now()): CommuteImpact {
  const occurrenceAt = nextOccurrence(commute, now);
  const closures = store.routingClosures();
  const plan: PlanResponse = planner({ origin: commute.origin, destination: commute.destination, departureAt: occurrenceAt,
    compareDepartures: true }, closures, store.eventRevision);
  const signature = createHash('sha256').update(JSON.stringify(plan.conflicts.map(conflict => {
    const closure = closures.find(item => item.id === conflict.closureId);
    return [conflict.closureId, closure?.revision];
  }).sort())).digest('hex').slice(0, 20);
  const key = `commute-check:${commute.id}:${occurrenceAt}`;
  const previous = store.meta<{ signature: string; hadConflicts: boolean }>(key);
  if (plan.conflicts.length && previous?.signature !== signature) {
    store.addAlertOnce(`${key}:${signature}`, {
      title: `${commute.name}: route disruption`,
      message: `${plan.conflicts.length} published closure${plan.conflicts.length === 1 ? '' : 's'} affect your next planned journey. ${plan.options.length ? 'Open the journey planner to compare validated route and departure options.' : 'No validated alternative was found in the local road graph.'}`,
      createdAt: new Date(now).toISOString(), read: false, commuteId: commute.id, closureId: plan.conflicts[0]?.closureId,
    });
  } else if (previous?.hadConflicts && !plan.conflicts.length && plan.baseline && plan.options.length) {
    store.addAlertOnce(`${key}:clear:${store.eventRevision}`, { title: `${commute.name}: disruption cleared`,
      message: 'The current published closure set no longer conflicts with the next journey. Estimates exclude live traffic and unreported road conditions.',
      createdAt: new Date(now).toISOString(), read: false, commuteId: commute.id });
  }
  store.setMeta(key, { signature, hadConflicts: Boolean(plan.conflicts.length), checkedAt: new Date(now).toISOString() });
  return { commuteId: commute.id, occurrenceAt, plan };
}

/** Only runs while this local process is running; it does not send external push messages. */
export function checkEnabledCommutes(store: Store, planner: Planner = planJourney) {
  for (const commute of store.list<Commute>('commute', 100).filter(item => item.enabled)) {
    try { checkCommute(store, commute, planner); }
    catch { /* One unavailable or invalid saved route must not stop checks for the others. */ }
  }
}
