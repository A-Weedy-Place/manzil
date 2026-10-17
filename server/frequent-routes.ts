import { createHash } from 'node:crypto';
import type { Closure, Commute, Coordinate, FrequentRouteProposal, RecordedPoint, RouteConflict, Trip } from '../shared/types.js';
import { distanceMeters, summarizeTrace } from './geometry.js';
import type { Repository } from './repository.js';
import { closureSegmentFractions } from './routing/closure-segments.js';

const PKT = 5 * 3600_000;
interface Sample { origin: Coordinate; destination: Coordinate; minutes: number; day: number; date: string; startedAt: string; endedAt: string; points: RecordedPoint[] }
/** Internal server-only evidence. Never return this from /frequent-routes or send it to a planner. */
export interface ObservedJourney { proposal: FrequentRouteProposal; startedAt: string; points: RecordedPoint[] }
export interface ObservedConflict extends RouteConflict { uncertain: boolean }
export const departureDifference = (a: number, b: number) => Math.abs(((a - b + 2160) % 1440) - 720);
const wallMinutes = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute; };

function usableSample(trip: Trip): Sample | null {
  const started = Date.parse(trip.startedAt), ended = Date.parse(trip.endedAt), duration = ended - started;
  if (!Number.isFinite(duration) || duration < 120_000 || duration > 4 * 3600_000 || trip.points.length > 20_000) return null;
  const points = trip.points.filter(point => point.accuracy <= 50);
  if (points.length < 8 || points.length / trip.points.length < 0.8) return null;
  if (points.some(point => !Number.isFinite(Date.parse(point.timestamp)) || !point.coordinate.every(Number.isFinite))) return null;
  const first = points[0], last = points.at(-1)!;
  if (Date.parse(first.timestamp) - started > 120_000 || ended - Date.parse(last.timestamp) > 120_000) return null;
  const summary = summarizeTrace(points);
  if (summary.distanceMeters < 500 || summary.gaps / (points.length - 1) > 0.05 || distanceMeters(first.coordinate, last.coordinate) < 400) return null;
  for (let index = 1; index < points.length; index++) {
    const seconds = (Date.parse(points[index].timestamp) - Date.parse(points[index - 1].timestamp)) / 1000;
    if (seconds <= 0 || seconds > 120 || distanceMeters(points[index - 1].coordinate, points[index].coordinate) / seconds > 65) return null;
  }
  const local = new Date(started + PKT);
  return { origin: first.coordinate, destination: last.coordinate, minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    day: local.getUTCDay(), date: local.toISOString().slice(0, 10), startedAt: trip.startedAt, endedAt: trip.endedAt, points };
}
function sameJourney(a: Sample, b: Sample) {
  return distanceMeters(a.origin, b.origin) <= 250 && distanceMeters(a.destination, b.destination) <= 250 && departureDifference(a.minutes, b.minutes) <= 45;
}
function representative(samples: Sample[], key: 'origin' | 'destination'): Coordinate {
  const center: Coordinate = [samples.reduce((sum, sample) => sum + sample[key][0], 0) / samples.length,
    samples.reduce((sum, sample) => sum + sample[key][1], 0) / samples.length];
  return samples.reduce((best, sample) => distanceMeters(sample[key], center) < distanceMeters(best[key], center) ? sample : best)[key];
}

/** Consent-gated endpoint/time patterns, never inferred home/work labels or road edits. */
export async function observedJourneys(store: Repository, now = Date.now()): Promise<ObservedJourney[]> {
  const profile = await store.profile();
  if (!profile.collectTravelData || !profile.inferFrequentRoutes) return [];
  const samples: Sample[] = [];
  for (const trip of await store.recentInferenceTrips(now)) {
    const sample = usableSample(trip); if (sample) samples.push(sample);
  }
  samples.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const clusters: Sample[][] = [];
  for (const sample of samples) {
    const cluster = clusters.find(group => group.every(existing => sameJourney(existing, sample)));
    if (cluster) {
      // Reimporting one day's drive does not create independent evidence of a usual route.
      if (!cluster.some(existing => existing.date === sample.date)) cluster.push(sample);
    } else clusters.push([sample]);
  }
  const latest = await store.profile();
  if (!latest.collectTravelData || !latest.inferFrequentRoutes) return [];
  return clusters.filter(group => group.length >= 3).map(group => {
    const anchor = group[0];
    const orderedMinutes = group.map(sample => anchor.minutes + ((sample.minutes - anchor.minutes + 2160) % 1440) - 720).sort((a, b) => a - b);
    const median = orderedMinutes[Math.floor(orderedMinutes.length / 2)];
    const departureMinutes = ((Math.round(median / 5) * 5) % 1440 + 1440) % 1440;
    // The oldest retained independent observation anchors identity; adding later samples
    // does not rename a proposal or resend its alert merely because a centroid moved.
    const identity = [anchor.origin.map(value => value.toFixed(5)), anchor.destination.map(value => value.toFixed(5)), anchor.startedAt];
    const proposal: FrequentRouteProposal = { id: `usual-${createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 20)}`,
      origin: { name: 'Recorded start', coordinate: representative(group, 'origin') },
      destination: { name: 'Recorded destination', coordinate: representative(group, 'destination') },
      departureTime: `${Math.floor(departureMinutes / 60).toString().padStart(2, '0')}:${(departureMinutes % 60).toString().padStart(2, '0')}`,
      days: [...new Set(group.map(sample => sample.day))].sort(), sampleCount: group.length,
      lastObservedAt: group.reduce((latest, sample) => sample.endedAt > latest ? sample.endedAt : latest, anchor.endedAt),
    };
    // Choose one real observation near the usual departure, favouring the newest
    // equally representative sample. Do not connect different days into a new path.
    const observation = [...group].sort((a, b) => departureDifference(a.minutes, departureMinutes) - departureDifference(b.minutes, departureMinutes) || b.startedAt.localeCompare(a.startedAt))[0];
    return { proposal, startedAt: observation.startedAt, points: observation.points };
  }).sort((a, b) => b.proposal.sampleCount - a.proposal.sampleCount || b.proposal.lastObservedAt.localeCompare(a.proposal.lastObservedAt)).slice(0, 10);
}

/** Public proposals deliberately contain no trace samples or historical trip identifiers. */
export async function frequentRouteProposals(store: Repository, now = Date.now()): Promise<FrequentRouteProposal[]> {
  return (await observedJourneys(store, now)).map(journey => journey.proposal);
}

/** Forecast a historical passage, not a claim that this trace is legal/routable today. */
export function observedJourneyConflicts(journey: ObservedJourney, closures: Closure[], departureAt: string): ObservedConflict[] {
  const departure = Date.parse(departureAt), recordedStart = Date.parse(journey.startedAt), margin = 60_000;
  const conflicts: ObservedConflict[] = [];
  if (journey.points.length < 2) return conflicts;
  const bounds = (coordinates: number[][]) => coordinates.reduce((box, point) => [Math.min(box[0], point[0]), Math.min(box[1], point[1]), Math.max(box[2], point[0]), Math.max(box[3], point[1])], [Infinity,Infinity,-Infinity,-Infinity]);
  const overlaps = (a: number[], b: number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  const traceBounds = bounds(journey.points.map(point => point.coordinate));
  const traceStart = departure + Date.parse(journey.points[0].timestamp) - recordedStart;
  const traceEnd = departure + Date.parse(journey.points.at(-1)!.timestamp) - recordedStart;
  for (const closure of closures) {
    if (closure.status !== 'published' || closure.moderation && closure.moderation !== 'approved') continue;
    const start = Date.parse(closure.startsAt), end = closure.endsAt ? Date.parse(closure.endsAt) : Infinity;
    if (!Number.isFinite(start) || !(end > start)) continue;
    if (traceEnd + margin < start || traceStart - margin >= end) continue;
    const closureBounds = bounds(closure.geometry.coordinates.flat());
    if (!overlaps(traceBounds, closureBounds)) continue;
    let first = Infinity, last = -Infinity, uncertain = false;
    for (let index = 1; index < journey.points.length; index++) {
      const a = journey.points[index - 1], b = journey.points[index];
      const entry = departure + Date.parse(a.timestamp) - recordedStart, exit = departure + Date.parse(b.timestamp) - recordedStart;
      if (exit + margin < start || entry - margin >= end) continue;
      if (!overlaps(bounds([a.coordinate,b.coordinate]), closureBounds)) continue;
      const length = distanceMeters(a.coordinate, b.coordinate);
      for (const [from, to] of closureSegmentFractions(a.coordinate, b.coordinate, closure.geometry)) {
        const at = entry + (exit - entry) * from, until = entry + (exit - entry) * to;
        if (until + margin < start || at - margin >= end) continue;
        first = Math.min(first, at); last = Math.max(last, until);
        if (exit - entry > 60_000 || length > 300) uncertain = true;
      }
    }
    if (Number.isFinite(first)) conflicts.push({ closureId: closure.id, title: closure.title, entryAt: new Date(first).toISOString(), exitAt: new Date(last).toISOString(), uncertain });
  }
  return conflicts;
}

export function coveredBySavedCommute(proposal: FrequentRouteProposal, commute: Commute) {
  return commute.enabled && distanceMeters(proposal.origin.coordinate, commute.origin.coordinate) <= 250 &&
    distanceMeters(proposal.destination.coordinate, commute.destination.coordinate) <= 250 &&
    departureDifference(wallMinutes(proposal.departureTime), wallMinutes(commute.departureTime)) <= 45 && proposal.days.every(day => commute.days.includes(day));
}
