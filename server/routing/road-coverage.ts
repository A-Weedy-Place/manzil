import type { Coordinate } from '../../shared/types';
import { buildGraph, distanceMeters, type OsmDocument, type RoutingGraph } from './graph';
import { RoadSelectionError } from './road-selection';

const ENDPOINTS = ['https://overpass.private.coffee/api/interpreter'];
const MAP_API_BASE = 'https://api.openstreetmap.org/api/0.6';
const MAX_MAP_AREA = .0025, MAP_MIN_INTERVAL = 1000;
const MAX_BYTES = 4 * 1024 * 1024, MAX_ELEMENTS = 60_000, MAX_REFERENCES = 150_000;
const MAX_POINTS = 400, MAX_EXTENT = 6000, CACHE_TTL = 20 * 60_000, MAX_CACHE = 12;
const MAX_CACHED_UNITS = 300_000, MAX_IN_FLIGHT = 2;
type Bounds = RoutingGraph['bounds'];
interface Area { key: string; boxes: Bounds[]; graphBounds: Bounds }
interface Cached { area: Area; graph: RoutingGraph; expires: number; units: number }

export interface RoadCoverageOptions {
  fetch?: typeof globalThis.fetch;
  /** Server-owned HTTPS endpoints only; never obtained from a client request. */
  endpoints?: string[];
  /** The bounded map API is a small editor fallback, not a bulk download path.
   * Custom Overpass endpoints disable it unless explicitly supplied here. */
  mapApiBaseUrl?: string | null;
  now?: () => number;
  /** Test injection; production requests have an 18 s total deadline. */
  timeoutMs?: number;
  attemptTimeoutMs?: number;
}

function validPoints(points: Coordinate[]): void {
  if (!Array.isArray(points) || !points.length || points.length > MAX_POINTS || points.some(point =>
    !Array.isArray(point) || point.length !== 2 || point.some(value => typeof value !== 'number' || !Number.isFinite(value)) ||
    Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)) {
    throw new RoadSelectionError('Choose valid road coordinates.');
  }
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (distanceMeters(points[i], points[j]) > MAX_EXTENT) throw new RoadSelectionError('Select a road section no longer than 6 kilometres.');
  }
}
function contains(bounds: Bounds, point: Coordinate): boolean {
  return point[0] >= bounds[0] && point[0] <= bounds[2] && point[1] >= bounds[1] && point[1] <= bounds[3];
}
function covers(area: Area, points: Coordinate[]): boolean {
  return points.every(point => area.boxes.some(box => contains(box, point)));
}

/** Quantize outward, preserving a small reusable neighbourhood around each pick.
 * A dateline neighbourhood uses two small Overpass boxes, never a world-wide query. */
function requestArea(points: Coordinate[]): Area {
  const latitudes = points.map(point => point[1]), lat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const latitudeStep = .005, latitudePadding = 500 / 111_320;
  const south = Math.max(-90, Math.floor((Math.min(...latitudes) - latitudePadding) / latitudeStep) * latitudeStep);
  const north = Math.min(90, Math.ceil((Math.max(...latitudes) + latitudePadding) / latitudeStep) * latitudeStep);
  const scale = Math.max(.000001, Math.cos(lat * Math.PI / 180));
  // Keep the grid fixed across neighbouring latitudes; the metric padding still
  // grows towards the poles, while repeated nearby picks share stable keys.
  const longitudeStep = .005, padding = 500 / (111_320 * scale);
  const longitudes = points.map(point => point[0]).sort((a, b) => a - b);
  // Remove the largest circular gap to find the shortest longitude envelope.
  let gapIndex = longitudes.length - 1, largest = longitudes[0] + 360 - longitudes.at(-1)!;
  for (let i = 0; i < longitudes.length - 1; i++) {
    const gap = longitudes[i + 1] - longitudes[i];
    if (gap > largest) { largest = gap; gapIndex = i; }
  }
  const start = longitudes[(gapIndex + 1) % longitudes.length];
  let end = longitudes[gapIndex]; if (end < start) end += 360;
  let west = Math.floor((start - padding) / longitudeStep) * longitudeStep;
  let east = Math.ceil((end + padding) / longitudeStep) * longitudeStep;
  let boxes: Bounds[];
  if (east - west >= 360) boxes = [[-180, south, 180, north]];
  else {
    while (west < -180) { west += 360; east += 360; }
    while (west >= 180) { west -= 360; east -= 360; }
    boxes = east <= 180 ? [[west, south, east, north]] : [[west, south, 180, north], [-180, south, east - 360, north]];
  }
  boxes = boxes.map(box => box.map(value => Number(value.toFixed(7))) as Bounds);
  const graphBounds: Bounds = [Math.min(...boxes.map(box => box[0])), south, Math.max(...boxes.map(box => box[2])), north];
  return { boxes, graphBounds, key: boxes.map(box => box.join(',')).join('|') };
}

function query(area: Area): string {
  const ways = area.boxes.map(([west, south, east, north]) => `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street)(_link)?$"](${south},${west},${north},${east});`).join('');
  // Include parent turn restrictions and their referenced ways/nodes. buildGraph
  // retains access, barriers, one-way direction and topology, including via ways.
  return `[out:json][timeout:7][maxsize:33554432];(${ways})->.roads;(relation(bw.roads)[type=restriction];.roads;);(._;>>;);out body;`;
}

/** Abort is also a hard promise deadline, even for a test adapter or transport
 * which fails to reject its own pending fetch/read when the signal changes. */
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(value => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) reject(signal.reason); else resolve(value);
    }, error => { signal.removeEventListener('abort', onAbort); reject(error); });
  });
}

async function readDocument(response: Response, signal: AbortSignal): Promise<OsmDocument> {
  if (!response.ok || !response.body) { void response.body?.cancel().catch(() => undefined); throw new Error('Road source unavailable.'); }
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    void response.body.cancel().catch(() => undefined); throw new Error('Road source response exceeds the size limit.');
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  const aborted = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', aborted, { once: true });
  try {
    while (true) {
      signal.throwIfAborted(); const { value, done } = await reader.read(); signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Road source response exceeds the size limit.');
      chunks.push(value);
    }
  } catch (error) { void reader.cancel().catch(() => undefined); throw error; }
  finally { signal.removeEventListener('abort', aborted); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!value || typeof value !== 'object' || !Array.isArray((value as OsmDocument).elements) || 'remark' in value) throw new Error('Incomplete road source response.');
  const document = value as OsmDocument;
  if (document.osm3s !== undefined && (!document.osm3s || typeof document.osm3s !== 'object' ||
    (document.osm3s.timestamp_osm_base !== undefined && (typeof document.osm3s.timestamp_osm_base !== 'string' ||
      document.osm3s.timestamp_osm_base.length > 64 || !Number.isFinite(Date.parse(document.osm3s.timestamp_osm_base)))))) throw new Error('Invalid road source timestamp.');
  if (document.elements.length > MAX_ELEMENTS) throw new Error('Road source response has too many elements.');
  let references = 0;
  const seen = new Set<string>();
  for (const element of document.elements) {
    if (!element || typeof element !== 'object' || !['node', 'way', 'relation'].includes(element.type) ||
      !Number.isSafeInteger(element.id) || element.id <= 0 || seen.has(`${element.type}:${element.id}`)) throw new Error('Invalid road source element.');
    seen.add(`${element.type}:${element.id}`);
    if (element.type === 'node' && (!Number.isFinite(element.lat) || !Number.isFinite(element.lon) || Math.abs(element.lat!) > 90 || Math.abs(element.lon!) > 180)) throw new Error('Invalid road source coordinate.');
    if (element.tags !== undefined && (!element.tags || typeof element.tags !== 'object' || Array.isArray(element.tags) || Object.values(element.tags).some(tag => typeof tag !== 'string'))) throw new Error('Invalid road source tags.');
    if (element.type === 'way') {
      if (!Array.isArray(element.nodes) || element.nodes.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid road source way.');
      references += element.nodes.length;
    }
    if (element.type === 'relation') {
      if (!Array.isArray(element.members) || element.members.some(member => !member || typeof member !== 'object' ||
        !['node', 'way', 'relation'].includes(member.type) || !Number.isSafeInteger(member.ref) || member.ref <= 0 || typeof member.role !== 'string')) throw new Error('Invalid road source relation.');
      references += element.members.length;
    }
    if (references > MAX_REFERENCES) throw new Error('Road source response has too many references.');
  }
  // Never connect a way over a missing node or claim a clipped source is complete.
  const nodes = new Set(document.elements.filter(element => element.type === 'node').map(element => element.id));
  if (document.elements.some(element => element.type === 'way' && element.nodes!.some(id => !nodes.has(id)))) throw new Error('Incomplete road source topology.');
  return document;
}

/** Lazy public road coverage for closure editing, independent of city/country.
 * This bounded cache is not a global offline routing dataset or a traffic feed. */
export class RoadCoverageProvider {
  private readonly cache = new Map<string, Cached>();
  private readonly pending = new Map<string, Promise<RoutingGraph>>();
  private readonly fetcher: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly endpoints: string[];
  private readonly timeout: number;
  private readonly attemptTimeout: number;
  private readonly cooldown = new Map<string, number>();
  private readonly mapApiBase: string | null;
  private mapInFlight = false;
  private lastMapStart = -Infinity;

  constructor(private readonly localGraph: () => RoutingGraph | null, options: RoadCoverageOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch; this.now = options.now ?? Date.now;
    this.timeout = Math.min(18_000, Math.max(1, options.timeoutMs ?? 18_000));
    this.attemptTimeout = Math.min(8_000, Math.max(1, options.attemptTimeoutMs ?? 8_000));
    this.endpoints = [...(options.endpoints ?? ENDPOINTS)];
    this.mapApiBase = options.mapApiBaseUrl === undefined ? (options.endpoints ? null : MAP_API_BASE) : options.mapApiBaseUrl?.replace(/\/+$/, '') ?? null;
    if (!this.endpoints.length || this.endpoints.length > 2 || this.endpoints.some(endpoint => {
      try { const url = new URL(endpoint); return url.protocol !== 'https:' || !!url.username || !!url.password || !!url.search || !!url.hash; }
      catch { return true; }
    })) throw new Error('Road coverage requires one or two server-owned HTTPS endpoints.');
    if (this.mapApiBase) {
      try { const url = new URL(this.mapApiBase); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(); }
      catch { throw new Error('Road map fallback requires a server-owned HTTPS base URL.'); }
    }
  }

  async graphFor(points: Coordinate[]): Promise<RoutingGraph> {
    validPoints(points);
    const local = this.localGraph();
    if (local && points.every(point => contains(local.bounds, point))) return local;
    for (const [key, cached] of this.cache) {
      if (cached.expires <= this.now()) { this.cache.delete(key); continue; }
      if (covers(cached.area, points)) { this.cache.delete(key); this.cache.set(key, cached); return cached.graph; }
    }
    const area = requestArea(points), existing = this.pending.get(area.key);
    if (existing) return existing;
    if (this.pending.size >= MAX_IN_FLIGHT) throw new RoadSelectionError('Road data service is busy. Try again shortly.', 503);
    const work = this.load(area);
    this.pending.set(area.key, work);
    try { return await work; }
    finally { this.pending.delete(area.key); }
  }

  private async load(area: Area): Promise<RoutingGraph> {
    const deadline = AbortSignal.timeout(this.timeout);
    for (const endpoint of this.endpoints) {
      if ((this.cooldown.get(endpoint) ?? 0) > this.now()) continue;
      try {
        const signal = AbortSignal.any([deadline, AbortSignal.timeout(this.attemptTimeout)]);
        return await this.fetchGraph(area, endpoint, {
          method: 'POST', body: new URLSearchParams({ data: query(area) }), signal, redirect: 'error',
          headers: { 'User-Agent': 'Manzil road coverage prototype (https://github.com/A-Weedy-Place/manzil)', 'Accept': 'application/json' },
        }, false);
      } catch (error) {
        if (error instanceof RoadSelectionError) throw error;
        if ((this.cooldown.get(endpoint) ?? 0) <= this.now()) this.cooldown.set(endpoint, this.now() + 5000);
        if (deadline.aborted) break;
      }
    }
    const map = this.mapApiBase;
    const box = area.boxes.length === 1 ? area.boxes[0] : null;
    if (map && box && (box[2] - box[0]) * (box[3] - box[1]) <= MAX_MAP_AREA &&
      !this.mapInFlight && (this.cooldown.get(map) ?? 0) <= this.now() && !deadline.aborted) {
      this.mapInFlight = true;
      try {
        const wait = Math.max(0, this.lastMapStart + MAP_MIN_INTERVAL - this.now());
        if (wait) await abortable(new Promise<void>(resolve => setTimeout(resolve, wait)), deadline);
        deadline.throwIfAborted(); this.lastMapStart = this.now();
        const signal = AbortSignal.any([deadline, AbortSignal.timeout(this.attemptTimeout)]);
        const url = `${map}/map.json?${new URLSearchParams({ bbox: box.join(',') })}`;
        return await this.fetchGraph(area, url, { method: 'GET', signal, redirect: 'error',
          headers: { 'User-Agent': 'Manzil road coverage prototype (https://github.com/A-Weedy-Place/manzil)', 'Accept': 'application/json' },
        }, true, map);
      } catch (error) {
        if (error instanceof RoadSelectionError) throw error;
        if ((this.cooldown.get(map) ?? 0) <= this.now()) this.cooldown.set(map, this.now() + 5000);
      } finally { this.mapInFlight = false; }
    }
    throw new RoadSelectionError('Road data is temporarily unavailable for this area. Try again.', 503);
  }

  private async fetchGraph(area: Area, url: string, init: RequestInit & { signal: AbortSignal }, mapApi: boolean, cooldownKey = url): Promise<RoutingGraph> {
    const signal = init.signal;
    const response = await abortable(this.fetcher(url, init).then(value => {
      if (signal.aborted) { void value.body?.cancel().catch(() => undefined); signal.throwIfAborted(); }
      return value;
    }), signal);
    if (response.status === 429 || response.status === 406) this.cooldown.set(cooldownKey, this.now() + 30_000);
    const document = await abortable(readDocument(response, signal), signal);
    signal.throwIfAborted();
    const graph = buildGraph(document, area.graphBounds);
    if (!graph.edges.length) throw new RoadSelectionError('No supported public car roads were found here.');
    if (graph.nodes.length > MAX_ELEMENTS || graph.edges.length > 200_000) throw new Error('Road graph exceeds the processing limit.');
    if (mapApi) graph.sourceTimestamp = null;
    graph.version = `osm-area-${mapApi ? 'map-' : ''}${area.key}-${graph.sourceTimestamp ?? graph.importedAt}-v1`;
    graph.source = mapApi ? 'OpenStreetMap map API; on-demand directed public car road graph; source snapshot time unavailable'
      : 'OpenStreetMap via Overpass; on-demand directed public car road graph';
    const cached: Cached = { area, graph, expires: this.now() + CACHE_TTL, units: graph.nodes.length + graph.edges.length };
    this.cache.set(area.key, cached);
    let units = [...this.cache.values()].reduce((total, entry) => total + entry.units, 0);
    while (this.cache.size > MAX_CACHE || units > MAX_CACHED_UNITS) {
      const first = this.cache.keys().next().value as string;
      units -= this.cache.get(first)!.units; this.cache.delete(first);
    }
    return graph;
  }
}
