import express, { type ErrorRequestHandler, type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { Alert, AppState, Closure, Commute, CommuteDraft, GraphStatus, Place, Trip } from '../shared/types.js';
import { Store } from './store.js';
import { HttpError } from './errors.js';
import { drawingToPolygon, summarizeTrace } from './geometry.js';
import { closureDraftSchema, closureUpdateSchema, commuteSchema, drawingSchema, instantSchema, noticeSchema, planSchema, polygonSchema, profilePatchSchema, tripSchema } from './validation.js';
import { SourceService, contentHash } from './source.js';
import { getRoutingGraph, graphStatus, planJourney, searchPlaces } from './routing/index.js';
import { activeClosureRoads } from './routing/closure-segments.js';
import { demoCatalogue, toggleDemo } from './demos.js';
import { loadStreetRouteDemo, streetRouteDemo } from './street-demo.js';
import type { RoutingGraph } from './routing/graph.js';
import { checkCommute, checkEnabledCommutes, type Planner } from './commutes.js';
import { frequentRouteProposals } from './frequent-routes.js';
import { SpeechService, speechSchema } from './speech.js';

interface AppOptions {
  speech?: SpeechService;
  source?: SourceService; planner?: Planner;
  graph?: () => GraphStatus; places?: (query: string) => Place[];
  roadGraph?: () => RoutingGraph | null;
}
const id = (request: Request) => z.string().min(1).max(180).parse(request.params.id);
const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
function isLocalOrigin(value: string): boolean {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && localHosts.has(url.hostname); }
  catch { return false; }
}
function getRecord<T>(store: Store, kind: 'closure' | 'commute' | 'alert' | 'trip', recordId: string): T {
  const value = store.get<T>(kind, recordId);
  if (!value) throw new HttpError(404, 'Record not found.');
  return value;
}

/** Remove raw GPS after 30 days; retain only the already computed summary until day 90. */
export function applyRetention(store: Store, now = Date.now()) {
  if ((store.meta<number>('nextRetentionAt') ?? 0) > now) return;
  store.retainTrips(now);
  // WAL may briefly retain deleted bytes until a checkpoint. This is not forensic erasure.
  store.db.exec('PRAGMA wal_checkpoint(PASSIVE)');
  store.setMeta('nextRetentionAt', now + 60_000);
}

export function createApp(store: Store, options: AppOptions = {}) {
  const app = express();
  const source = options.source ?? new SourceService(store);
  const speech = options.speech ?? new SpeechService(store);
  const planner = options.planner ?? planJourney;
  const currentGraph = options.graph ?? graphStatus;
  const places = options.places ?? searchPlaces;
  const roadGraph = options.roadGraph ?? getRoutingGraph;
  const requireRoadGraph = () => { const graph = roadGraph(); if (!graph) throw new HttpError(503, 'The local road graph is unavailable.'); return graph; };
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Binding loopback alone does not prevent DNS rebinding or a hostile site's browser request.
    const host = request.headers.host;
    try {
      if (!host || !localHosts.has(new URL(`http://${host}`).hostname)) throw new Error();
    } catch { next(new HttpError(403, 'Only a local host is allowed.')); return; }
    const origin = request.headers.origin;
    if (origin && !isLocalOrigin(origin)) { next(new HttpError(403, 'Only a local application origin is allowed.')); return; }
    if (request.headers['sec-fetch-site'] === 'cross-site') { next(new HttpError(403, 'Cross-site requests are not allowed.')); return; }
    if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type'); response.sendStatus(204); return;
    }
    if (['POST', 'PUT', 'PATCH'].includes(request.method) && !request.is('application/json')) {
      next(new HttpError(415, 'Send an application/json request body.')); return;
    }
    next();
  });
  app.use(express.json({ limit: '4mb', strict: true }));
  const recheck = () => setImmediate(() => checkEnabledCommutes(store, planner));
  const routes = express.Router();
  routes.get('/speech/status', (_request, response) => response.json(speech.status()));
  routes.post('/speech', async (request, response) => {
    const body = speechSchema.parse(request.body);
    const audio = await speech.audio(body.language, body.prompt);
    response.type('audio/mpeg').send(audio);
  });
  routes.get('/health', (_request, response) => response.json({ ok: true, storage: 'sqlite', graphReady: currentGraph().ready,
    pendingAgentNotices: store.pendingAgentCount(), sourceCoverage: 'partial' }));
  routes.get('/state', (_request, response) => {
    applyRetention(store);
    const state: AppState = { closures: store.list('closure', 2000), commutes: store.list('commute', 100),
      alerts: store.list('alert', 200), trips: store.listTripSummaries(), notices: store.listNotices(),
      graph: currentGraph(), eventRevision: store.eventRevision, sourceStatus: store.sourceStatus(), profile: store.profile() };
    response.json(state);
  });
  routes.get('/profile', (_request, response) => response.json(store.profile()));
  routes.patch('/profile', (request, response) => {
    const patch = profilePatchSchema.parse(request.body);
    const profile = store.updateProfile(patch);
    if (patch.inferFrequentRoutes !== undefined) recheck();
    response.json(profile);
  });
  routes.get('/frequent-routes', (_request, response) => {
    applyRetention(store); response.json(frequentRouteProposals(store));
  });
  routes.get('/places', (request, response) => {
    const query = z.string().max(160).parse(request.query.q ?? ''); response.json(places(query));
  });
  routes.post('/geometry', (request, response) => response.json(polygonSchema.parse(drawingToPolygon(drawingSchema.parse(request.body)))));
  routes.post('/plan', (request, response, next) => {
    const body = planSchema.parse(request.body);
    try { response.json(planner(body, store.routingClosures(), store.eventRevision)); }
    catch (error) { next(new HttpError(400, error instanceof HttpError ? error.message : 'This journey could not be calculated. Check the endpoints and departure time.')); }
  });
  routes.post('/closures', (request, response) => {
    const closure = store.saveClosure(closureDraftSchema.parse(request.body)); recheck(); response.status(201).json(closure);
  });
  routes.get('/closures/roads', (request, response) => {
    const at = instantSchema.parse(request.query.at ?? new Date().toISOString());
    response.json(activeClosureRoads(requireRoadGraph(), store.routingClosures(), at));
  });
  routes.get('/demos', (request, response) => {
    const at = instantSchema.parse(request.query.at ?? new Date().toISOString());
    response.json(demoCatalogue(store, requireRoadGraph(), at));
  });
  routes.get('/demos/street-route', (request, response) => {
    const at = instantSchema.parse(request.query.at ?? new Date().toISOString());
    response.json(streetRouteDemo(requireRoadGraph(), at));
  });
  routes.post('/demos/street-route', (request, response) => {
    const { at } = z.object({ at: instantSchema }).strict().parse(request.body);
    const result = loadStreetRouteDemo(store, requireRoadGraph(), at); recheck(); response.json(result);
  });
  routes.post('/demos', (request, response) => {
    const body = z.object({ scenario: z.string().min(1).max(80), at: instantSchema, enabled: z.boolean() }).strict().parse(request.body);
    const result = toggleDemo(store, requireRoadGraph(), body.scenario, body.at, body.enabled); recheck(); response.json(result);
  });
  routes.put('/closures/:id', (request, response) => {
    const { revision, ...draft } = closureUpdateSchema.parse(request.body);
    const closure = store.saveClosure(draft, id(request), revision); recheck(); response.json(closure);
  });
  routes.delete('/closures/:id', (request, response) => {
    const previous = getRecord<Closure>(store, 'closure', id(request));
    const closure = store.saveClosure({ ...previous, status: 'cancelled' }, previous.id, previous.revision); recheck(); response.json(closure);
  });
  routes.get('/commutes', (_request, response) => response.json(store.list('commute', 100)));
  routes.post('/commutes', (request, response) => {
    if (store.list('commute', 101).length >= 100) throw new HttpError(409, 'This local prototype supports up to 100 saved commutes.');
    const draft: CommuteDraft = commuteSchema.parse(request.body), now = new Date().toISOString();
    const commute: Commute = { ...draft, days: [...new Set(draft.days)], id: randomUUID(), createdAt: now, updatedAt: now };
    store.put('commute', commute); recheck(); response.status(201).json(commute);
  });
  routes.put('/commutes/:id', (request, response) => {
    const previous = getRecord<Commute>(store, 'commute', id(request));
    const draft = commuteSchema.parse(request.body);
    const commute: Commute = { ...draft, days: [...new Set(draft.days)], id: previous.id, createdAt: previous.createdAt, updatedAt: new Date().toISOString() };
    store.put('commute', commute); recheck(); response.json(commute);
  });
  routes.delete('/commutes/:id', (request, response) => {
    const commute = getRecord<Commute>(store, 'commute', id(request)); store.delete('commute', commute.id); response.json(commute);
  });
  routes.post('/commutes/:id/check', (request, response) => response.json(checkCommute(store, getRecord(store, 'commute', id(request)), planner)));
  routes.patch('/alerts/:id', (request, response) => {
    const body = z.object({ read: z.boolean() }).parse(request.body);
    const alert = { ...getRecord<Alert>(store, 'alert', id(request)), read: body.read };
    store.put('alert', alert); response.json(alert);
  });
  routes.get('/trips', (_request, response) => { applyRetention(store); response.json(store.listTripSummaries()); });
  routes.get('/trips/:id', (request, response) => { applyRetention(store); response.json(getRecord<Trip>(store, 'trip', id(request))); });
  routes.post('/trips', (request, response) => {
    const draft = tripSchema.parse(request.body);
    const trip: Trip = { ...draft, id: randomUUID(), createdAt: new Date().toISOString(), ...summarizeTrace(draft.points),
      durationSeconds: Math.round((Date.parse(draft.endedAt) - Date.parse(draft.startedAt)) / 1000) };
    store.put('trip', trip); applyRetention(store); recheck(); response.status(201).json(store.get('trip', trip.id) ?? trip);
  });
  routes.patch('/trips/:id', (request, response) => {
    const body = z.object({ name: z.string().trim().min(1).max(120).optional(), contributeToRoadDiscovery: z.boolean().optional() }).strict().parse(request.body);
    const trip: Trip = { ...getRecord<Trip>(store, 'trip', id(request)), ...body };
    store.put('trip', trip); response.json(trip);
  });
  routes.delete('/trips/:id', (request, response) => {
    const trip = getRecord<Trip>(store, 'trip', id(request)); store.delete('trip', trip.id); recheck(); response.json(trip);
  });
  routes.get('/notices', (_request, response) => response.json(store.listNotices()));
  routes.post('/notices', (request, response) => {
    const draft = noticeSchema.parse(request.body);
    const input = { source: 'manual' as const, sourceId: draft.url || contentHash({ text: draft.text, publishedAt: draft.publishedAt ?? null }),
      url: draft.url ?? '', text: draft.text, publishedAt: draft.publishedAt ?? null, mediaUrls: [], contentState: 'text' as const };
    response.status(201).json(store.upsertNotice({ ...input, contentHash: contentHash(input) }).notice);
  });
  routes.patch('/notices/:id', (request, response) => {
    const body = z.object({ status: z.enum(['pending_agent', 'reviewed', 'dismissed']) }).parse(request.body);
    response.json(store.setNoticeStatus(id(request), body.status));
  });
  routes.get('/agent/outbox', (_request, response) => response.json(store.pendingAgentNotices()));
  routes.get('/source/status', (_request, response) => response.json(store.sourceStatus()));
  routes.post('/source/check', async (_request, response) => response.json(await source.check()));
  routes.patch('/source/settings', (request, response) => {
    const settings = z.object({ enabled: z.boolean(), intervalMinutes: z.literal(15).optional() }).strict().parse(request.body);
    response.json(source.settings(settings.enabled));
  });
  app.use('/api', routes);
  app.use((_request, _response, next) => next(new HttpError(404, 'Endpoint not found.')));
  const errors: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof ZodError) { response.status(400).json({ error: 'Invalid request.', details: error.issues.slice(0, 5).map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ') }); return; }
    if (error instanceof HttpError) { response.status(error.status).json({ error: error.message }); return; }
    if (error?.type === 'entity.too.large') { response.status(413).json({ error: 'Request body exceeds 4 MB.' }); return; }
    if (error?.type === 'entity.parse.failed') { response.status(400).json({ error: 'Malformed JSON body.' }); return; }
    // Never return stack traces, browser state, filesystem paths, or raw source content.
    console.error('API operation failed:', error instanceof Error ? error.name : 'UnknownError');
    response.status(500).json({ error: 'The local operation failed. Existing saved data is retained.' });
  };
  app.use(errors);
  return { app, source };
}
