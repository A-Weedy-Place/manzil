import type { LineString, Polygon } from 'geojson';

/** All coordinates use GeoJSON order: [longitude, latitude]. */
export type Coordinate = [number, number];
export interface Place { id?: string; name: string; coordinate: Coordinate }
export interface Drawing { kind: 'point' | 'line' | 'polygon'; coordinates: Coordinate[]; widthMeters: number }
export type ClosureReason = 'protest' | 'vip' | 'construction' | 'accident' | 'other';
export interface ClosureDraft {
  title: string; description: string; reason: ClosureReason;
  startsAt: string; endsAt: string | null;
  status: 'published' | 'draft' | 'cancelled';
  geometry: Polygon; drawing?: Drawing; sourceUrl?: string;
}
export interface Closure extends ClosureDraft { id: string; revision: number; createdAt: string; updatedAt: string }
export interface RouteStep { instruction: string; roadName: string; distanceMeters: number; durationSeconds: number }
export interface RoutePath {
  geometry: LineString; distanceMeters: number; durationSeconds: number;
  departureAt: string; arrivalAt: string; steps: RouteStep[];
  snappedOrigin: Coordinate; snappedDestination: Coordinate;
}
export interface RouteOption extends RoutePath {
  id: string; kind: 'direct' | 'detour' | 'alternative' | 'leave_earlier' | 'leave_later';
  label: string; validation: 'clear'; warnings: string[];
}
export interface RouteConflict { closureId: string; title: string; entryAt: string; exitAt: string }
export interface PlanRequest { origin: Place; destination: Place; departureAt: string; compareDepartures?: boolean }
export interface PlanResponse {
  options: RouteOption[]; baseline: RoutePath | null; conflicts: RouteConflict[];
  warnings: string[]; unavailableReason?: string; evaluatedAt: string;
  graphVersion: string; eventRevision: number; source: 'local-osm';
}
export interface GraphStatus {
  ready: boolean; source: string; version: string;
  nodeCount: number; edgeCount: number; importedAt: string | null;
  bounds: [number, number, number, number]; limitations: string[];
}
export interface CommuteDraft {
  name: string; origin: Place; destination: Place;
  departureTime: string; days: number[]; enabled: boolean;
}
export interface Commute extends CommuteDraft { id: string; createdAt: string; updatedAt: string }
export interface CommuteImpact { commuteId: string; occurrenceAt: string; plan: PlanResponse }
export interface Alert {
  id: string; title: string; message: string; createdAt: string; read: boolean;
  commuteId?: string; frequentRouteId?: string; closureId?: string;
}
export interface SourceNotice {
  id: string; source: 'x' | 'manual'; sourceId: string; url: string;
  text: string; publishedAt: string | null; receivedAt: string;
  status: 'pending_agent' | 'reviewed' | 'dismissed';
  revision: number; mediaUrls: string[]; contentHash: string;
  contentState?: 'text' | 'media_only' | 'possibly_truncated';
}
export interface SourceStatus {
  enabled: boolean; intervalMinutes: number; profileUrl: string;
  lastAttemptAt: string | null; lastSuccessAt: string | null; nextCheckAt: string | null;
  state: 'idle' | 'checking' | 'healthy' | 'partial' | 'blocked' | 'error' | 'disabled';
  message: string; noticesCollected: number; coverage: 'partial';
}
export interface RecordedPoint { coordinate: Coordinate; timestamp: string; accuracy: number }
export interface TripDraft {
  name: string; startedAt: string; endedAt: string; points: RecordedPoint[];
  contributeToRoadDiscovery: boolean;
}
export interface Trip extends TripDraft { id: string; distanceMeters: number; durationSeconds: number; createdAt: string; gaps: number; pointCount?: number }
export interface LocalProfile {
  id: 'local'; displayName: string; theme: 'light' | 'dark' | 'system';
  mapDetail: 'clean' | 'standard'; browserNotifications: boolean;
  inferFrequentRoutes: boolean; transport: 'car'; createdAt: string; updatedAt: string;
}
export interface FrequentRouteProposal {
  id: string; origin: Place; destination: Place; departureTime: string;
  days: number[]; sampleCount: number; lastObservedAt: string;
}
export interface AppState {
  closures: Closure[]; commutes: Commute[]; alerts: Alert[];
  notices: SourceNotice[]; trips: Trip[];
  sourceStatus: SourceStatus; graph: GraphStatus;
  eventRevision: number; profile: LocalProfile;
}
export type ApiError = { error: string; details?: string };
export type MapMode = 'browse' | 'origin' | 'destination' | 'point' | 'line' | 'polygon';
export interface MapFocus { coordinates: Coordinate[]; token: number }
