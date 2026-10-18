import type { LineString } from 'geojson';
import type { ClosureAuthor, Coordinate, Place } from './types.js';
import type { TransitJourneyFare, TransitLegFare } from './transit-fares.js';

export interface TransitSource { id: string; name: string; url: string; license: string; retrievedAt: string; limitations: string[] }
export interface TransitOfficialReview { checkedAt: string; status: 'consistent' | 'differences' | 'reference-only' | 'not-established'; summary: string; references: { label: string; url: string }[] }
export interface TransitRoute { id: string; shortName: string; name: string; agency: string; color: string; sourceId: string; coverage: 'stops-and-shape' | 'stops-only' | 'catalogue-only'; unplacedStopNames?: string[]; officialReview?: TransitOfficialReview }
export interface TransitStop { id: string; name: string; coordinate: Coordinate }
export interface TransitPattern { id: string; routeId: string; directionId: string; headsign: string; stopIds: string[]; geometry: LineString; geometryQuality: 'provided-shape' | 'mapped-corridor' | 'road-aligned-estimate' | 'stops-only'; geometrySegments?: LineString[]; /** Precomputed road paths between consecutive source stops; null is an explicit unresolved gap. */ roadSegments?: (LineString | null)[]; geometrySourceId?: string; roadAlignment?: { method: 'ordered-bus-road-shortest-path'; snapDistancesMeters: (number | null)[]; unresolved: { afterStopIndex: number; reason: string }[] }; breakAfterStopIndexes?: number[]; unplacedStops?: string[]; restrictedAccess?: boolean; /** A documented source conflict can leave a pattern visible without making it routable. */ routingUnavailableReason?: string; /** Cumulative distance on supplied/aligned geometry, metres; unresolved gaps add no invented distance. Backend importer convenience. */ stopDistancesMeters?: number[] }
export interface TransitCalendar { id: string; startDate: string; endDate: string; weekdays: number[]; exceptions: { date: string; added: boolean }[] }
/** GTFS service-day seconds, including times greater than 24:00. */
export interface TransitTrip { id: string; patternId: string; serviceId: string; times: [number, number][]; pickupAllowed?: boolean[]; dropOffAllowed?: boolean[]; timepoint?: boolean[] }
export interface TransitDataset { version: string; importedAt: string; sources: TransitSource[]; routes: TransitRoute[]; stops: TransitStop[]; patterns: TransitPattern[]; calendars: TransitCalendar[]; trips: TransitTrip[]; limitations: string[] }

export interface TransitDisruptionDraft { routeId: string; directionId?: string; fromStopId?: string; toStopId?: string; title: string; description: string; startsAt: string; endsAt: string; status: 'published' | 'cancelled'; sourceUrl?: string }
export interface TransitDisruption extends TransitDisruptionDraft { id: string; revision: number; author: ClosureAuthor; createdAt: string; updatedAt: string;
  agent?: { noticeId: string; sourceId: string; sourceRevision: number; evidenceAt: string; overridden?: boolean };
  reviewedBy?: ClosureAuthor; reviewedAt?: string }
export interface TransitDisruptionState { revision: number; records: TransitDisruption[] }
export type TransitAvailability = 'available' | 'uncertain' | 'suspended';
export interface TransitPatternStatus { patternId: string; availability: TransitAvailability; closureIds: string[]; disruptionIds: string[]; closureAssessment: 'provided-shape' | 'mapped-corridor' | 'road-aligned-estimate' | 'unavailable' }
export interface TransitNetwork { version: string; importedAt: string | null; evaluatedAt: string; eventRevision: number; disruptionRevision: number; sources: TransitSource[]; routes: TransitRoute[]; stops: TransitStop[]; patterns: TransitPattern[]; statuses: TransitPatternStatus[]; disruptions: TransitDisruption[]; limitations: string[]; unavailableReason?: string }
export interface TransitPlanRequest { origin: Place; destination: Place; departureAt: string }
export interface TransitWalkLeg { kind: 'walk'; from: Place; to: Place; geometry: LineString; distanceMeters: number; durationSeconds: number; departureAt: string | null; arrivalAt: string | null; /** Straight-line estimate, not validated pedestrian navigation. */ estimated: true }
export interface TransitRideLeg { kind: 'ride'; routeId: string; patternId: string; tripId?: string; from: TransitStop; to: TransitStop; stops: TransitStop[]; geometry: LineString; distanceMeters: number; departureAt: string | null; arrivalAt: string | null; durationSeconds: number | null; availability: TransitAvailability; geometryQuality: TransitPattern['geometryQuality']; fare?: TransitLegFare }
export type TransitLeg = TransitWalkLeg | TransitRideLeg;
export interface TransitJourney { id: string; legs: TransitLeg[]; departureAt: string; arrivalAt: string | null; durationSeconds: number | null; walkingDistanceMeters: number; distanceMeters: number; transfers: number; timing: 'scheduled' | 'unknown'; warnings: string[]; fare?: TransitJourneyFare }
export interface TransitPlanResponse { options: TransitJourney[]; evaluatedAt: string; departureAt: string; eventRevision: number; disruptionRevision: number; datasetVersion: string; warnings: string[]; unavailableReason?: string }
