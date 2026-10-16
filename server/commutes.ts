import { createHash } from 'node:crypto';
import type { Closure, Commute, CommuteImpact, PlanRequest, PlanResponse } from '../shared/types.js';
import { planJourney } from './routing/index.js';
import type { Repository } from './repository.js';
import { HttpError } from './errors.js';
import { coveredBySavedCommute, frequentRouteProposals } from './frequent-routes.js';

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

export type Planner = (request: PlanRequest, closures: Closure[], eventRevision: number) => PlanResponse | Promise<PlanResponse>;

// Read through a function because adapter availability can change across awaits;
// TypeScript otherwise keeps narrowing the readonly contract property to open.
function isClosed(store: Repository): boolean { return store.isOpen === false; }
function ensureOpen(store: Repository) {
  if (isClosed(store)) throw new Error('The local store is closed.');
}
async function requireFrequentConsent(store: Repository, frequentRouteId?: string) {
  if (frequentRouteId && !(await store.profile()).inferFrequentRoutes) {
    throw new HttpError(409, 'Usual-journey notifications are disabled.');
  }
  ensureOpen(store);
}

export async function checkCommute(store: Repository, commute: Commute, planner: Planner = planJourney, now = Date.now(), frequentRouteId?: string, coveredConflictIds: Set<string> = new Set(), coveredEventRevision?: number): Promise<CommuteImpact> {
  const occurrenceAt = nextOccurrence(commute, now);
  const request: PlanRequest = { origin: commute.origin, destination: commute.destination, waypoints: commute.waypoints, departureAt: occurrenceAt,
    compareDepartures: true };
  let coveredRevision = coveredEventRevision;
  // Do not publish alerts against a snapshot replaced while online planning was in flight.
  for (let attempt = 0; attempt < 2; attempt++) {
    ensureOpen(store);
    const { closures, revision } = await store.routingSnapshot();
    ensureOpen(store);
    coveredRevision ??= revision;
    // Consent can change while a previous journey/provider request is awaited.
    // Do not submit another learned endpoint pair after the user opts out.
    await requireFrequentConsent(store, frequentRouteId);
    const plan = await planner(request, closures, revision);
    ensureOpen(store);
    if ((await store.routingSnapshot()).revision !== revision) continue;
    // A matching closure ID alone cannot suppress an updated restriction after a retry.
    const notifyConflicts = plan.conflicts.filter(conflict => revision !== coveredRevision || !coveredConflictIds.has(conflict.closureId));
    const signature = createHash('sha256').update(JSON.stringify(notifyConflicts.map(conflict => {
      const closure = closures.find(item => item.id === conflict.closureId);
      return [conflict.closureId, closure?.revision];
    }).sort())).digest('hex').slice(0, 20);
    const key = `${frequentRouteId ? 'frequent-route' : 'commute'}-check:${frequentRouteId ?? commute.id}:${occurrenceAt}`;
    const alertTarget = frequentRouteId ? { frequentRouteId } : { commuteId: commute.id };
    const previous = await store.meta<{ signature: string; hadConflicts: boolean }>(key);
    ensureOpen(store);
    await requireFrequentConsent(store, frequentRouteId);
    // Metadata is also remote with Firestore. Revalidate after that awaited read
    // before writing an alert derived from a now-obsolete restriction set.
    if ((await store.routingSnapshot()).revision !== revision) continue;
    ensureOpen(store);
    if (notifyConflicts.length && previous?.signature !== signature) {
      await store.addAlertOnce(`${key}:${signature}`, {
        title: `${commute.name}: route disruption`,
        message: `${notifyConflicts.length} published closure${notifyConflicts.length === 1 ? '' : 's'} affect your next planned journey. ${plan.options.length ? 'Open the journey planner to compare validated route and departure options.' : 'No validated alternative was found.'}`,
        createdAt: new Date(now).toISOString(), read: false, ...alertTarget, closureId: notifyConflicts[0]?.closureId,
      });
    } else if (previous?.hadConflicts && !plan.conflicts.length && plan.baseline && plan.options.length) {
      await store.addAlertOnce(`${key}:clear:${revision}`, { title: `${commute.name}: disruption cleared`,
        message: 'The current published closure set no longer conflicts with the next journey. Estimates exclude live traffic and unreported road conditions.',
        createdAt: new Date(now).toISOString(), read: false, ...alertTarget });
    }
    ensureOpen(store);
    await requireFrequentConsent(store, frequentRouteId);
    await store.setMeta(key, { signature, hadConflicts: Boolean(notifyConflicts.length), checkedAt: new Date(now).toISOString() });
    return { commuteId: commute.id, occurrenceAt, plan: { ...plan, eventRevision: revision } };
  }
  throw new HttpError(409, 'Closures changed while checking this journey. Check again for current advice.');
}

interface PendingCheck { promise: Promise<void>; refresh: boolean; active: boolean; now: number }
const pendingChecks = new WeakMap<Repository, PendingCheck>();

/** Only runs while this local process is running; it does not send external push messages. */
export function checkEnabledCommutes(store: Repository, planner: Planner = planJourney, now = Date.now(), refresh = false): Promise<void> {
  const pending = pendingChecks.get(store);
  if (pending?.active) {
    // A mutation may have added/edited a record after this sweep read its list.
    // Many concurrent mutations request one trailing batch; ordinary polling
    // and timer checks only join, so they cannot keep the batch alive forever.
    if (refresh) { pending.refresh = true; pending.now = Math.max(pending.now, now); }
    return pending.promise;
  }
  const check: PendingCheck = { promise: Promise.resolve(), refresh: false, active: true, now };
  // Register before any work starts so simultaneous rechecks share the complete sweep.
  check.promise = Promise.resolve().then(async () => {
    try {
      do {
        check.refresh = false;
        await runEnabledCommutes(store, planner, check.now);
      } while (check.refresh && !isClosed(store));
    } finally {
      // Close admission before promise cleanup so a late mutation starts a new
      // sweep instead of setting a flag after the last loop condition ran.
      check.active = false;
    }
  }).catch(error => {
    // A standalone caller can close SQLite while an awaited provider/storage
    // operation settles. Stop that sweep instead of touching its next record.
    if (!isClosed(store)) throw error;
  }).finally(() => {
    if (pendingChecks.get(store) === check) pendingChecks.delete(store);
  });
  pendingChecks.set(store, check);
  return check.promise;
}

async function runEnabledCommutes(store: Repository, planner: Planner, now: number): Promise<void> {
  if (isClosed(store)) return;
  const saved = (await store.list<Commute>('commute', 100)).filter(item => item.enabled);
  const savedImpacts = new Map<string, CommuteImpact>();
  const savedRevisions = new Map<string, number>();
  for (const commute of saved) {
    if (isClosed(store)) return;
    try {
      const impact = await checkCommute(store, commute, planner, now);
      savedImpacts.set(commute.id, impact);
      savedRevisions.set(commute.id, impact.plan.eventRevision);
    }
    catch { /* One unavailable or invalid saved route must not stop checks for the others. */ }
  }
  if (isClosed(store)) return;
  for (const proposal of await frequentRouteProposals(store, now)) {
    if (isClosed(store)) return;
    const { revision } = await store.routingSnapshot();
    // Nearby endpoints and similar times are only a dedupe hint, not proof that
    // both plans encounter the same scheduled restriction. Validate both paths.
    const covered = new Set(saved.filter(commute => savedRevisions.get(commute.id) === revision && coveredBySavedCommute(proposal, commute))
      .flatMap(commute => savedImpacts.get(commute.id)?.plan.conflicts.map(conflict => conflict.closureId) ?? []));
    const commute: Commute = { ...proposal, name: 'Your usual journey', enabled: true, createdAt: proposal.lastObservedAt, updatedAt: proposal.lastObservedAt };
    try { await checkCommute(store, commute, planner, now, proposal.id, covered, revision); }
    catch { /* One unavailable learned route must not stop checks for the others. */ }
  }
}
