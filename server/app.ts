import express, { type ErrorRequestHandler, type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z, ZodError } from 'zod';
import type { Alert, AppState, Closure, Commute, CommuteDraft, GraphStatus, Place, Trip } from '../shared/types.js';
import type { Repository } from './repository.js';
import { readConfig, type RuntimeConfig } from './config.js';
import { firebaseServices } from './firebase.js';
import { mountWorker } from './worker.js';
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
  config?: RuntimeConfig;
  verifyToken?: (token: string) => Promise<{ uid: string; admin?: boolean }>;
  speech?: SpeechService;
  source?: SourceService; planner?: Planner;
  graph?: () => GraphStatus; places?: (query: string) => Place[] | Promise<Place[]>;
  roadGraph?: () => RoutingGraph | null;
}
const id = (request: Request) => z.string().min(1).max(180).parse(request.params.id);
const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
function isLocalOrigin(value: string): boolean {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && localHosts.has(url.hostname); }
  catch { return false; }
}
async function getRecord<T>(store: Repository, kind: 'closure' | 'commute' | 'alert' | 'trip', recordId: string): Promise<T> {
  const value = await store.get<T>(kind, recordId);
  if (!value) throw new HttpError(404, 'Record not found.');
  return value;
}

/** Remove raw GPS after 30 days; retain only the already computed summary until day 90. */
export async function applyRetention(store: Repository, now = Date.now()) {
  if (((await store.meta<number>('nextRetentionAt')) ?? 0) > now) return;
  await store.retainTrips(now);
  await store.setMeta('nextRetentionAt', now + 60_000);
}

export function createApp(rootStore: Repository, options: AppOptions = {}) {
  const config = options.config ?? readConfig();
  const context = new AsyncLocalStorage<Repository>();
  // Reuse a bounded set of personal scopes so overlapping checks for one UID
  // coalesce without ever sharing a sweep with another UID. Tokens and claims
  // are still verified on every request; no authorization is cached here.
  const scopes = new Map<string | null, Repository>();
  const scopeFor = (uid: string | null) => {
    const scoped = scopes.get(uid) ?? rootStore.forUser(uid);
    scopes.delete(uid); scopes.set(uid, scoped);
    if (scopes.size > 256) scopes.delete(scopes.keys().next().value!);
    return scoped;
  };
  // Each async request sees only its own repository scope. The worker/source/speech
  // services deliberately use the root repository and never acquire personal scope.
  const store = new Proxy(rootStore, { get(_target, key) { const scoped = context.getStore() ?? rootStore; const value = Reflect.get(scoped, key); return typeof value === 'function' ? value.bind(scoped) : value; } });
  const app = express();
  const source = options.source ?? new SourceService(rootStore);
  const speech = options.speech ?? new SpeechService(rootStore);
  const verifyToken = options.verifyToken ?? (async token => { const decoded = await firebaseServices(config.projectId).auth.verifyIdToken(token, true); return { uid: decoded.uid, admin: decoded.admin === true }; });
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
      if (!host || !config.allowedHosts.has(new URL(`http://${host}`).hostname)) throw new Error();
    } catch { next(new HttpError(403, 'Application host is not allowed.')); return; }
    const origin = request.headers.origin;
    if (origin && !(config.mode === 'production' ? config.allowedOrigins.has(origin) : isLocalOrigin(origin))) { next(new HttpError(403, 'Application origin is not allowed.')); return; }
    if (request.headers['sec-fetch-site'] === 'cross-site' && !origin) { next(new HttpError(403, 'Cross-site requests are not allowed.')); return; }
    if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); response.sendStatus(204); return;
    }
    if (['POST', 'PUT', 'PATCH'].includes(request.method) && !request.is('application/json')) {
      next(new HttpError(415, 'Send an application/json request body.')); return;
    }
    next();
  });
  app.use(express.json({ limit: '4mb', strict: true }));
  mountWorker(app, config, rootStore, source);
  // Finish writes/checks before responding in cloud mode; no untracked work after HTTP success.
  // Capture the actual scope, not the proxy's process-wide object identity.
  const recheck = () => checkEnabledCommutes(context.getStore() ?? rootStore, planner, Date.now(), true);
  const routes = express.Router();
  routes.use(async (request, response, next) => {
    if (config.role === 'worker') throw new HttpError(404, 'API is unavailable on the worker service.');
    let user: { uid: string; admin?: boolean } | null = null;
    if (config.mode !== 'local' && request.headers.authorization) {
      const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization);
      if (!match) throw new HttpError(401, 'Invalid authorization header.');
      try { user = await verifyToken(match[1]); } catch { throw new HttpError(401, 'Sign in again. Your session could not be verified.'); }
    }
    if (config.mode !== 'local') {
      // Express defaults to case-insensitive paths and optional trailing slashes.
      // Apply the same normalization before classifying authorization needs.
      const path = request.path.toLowerCase().replace(/\/+$/, '') || '/', write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
      const admin = path.startsWith('/notices') || path.startsWith('/agent/') || path.startsWith('/source/') && path !== '/source/status' || write && (path.startsWith('/closures') || path.startsWith('/demos'));
      const personal = /^\/(commutes|trips|alerts|frequent-routes)(\/|$)/.test(path) || path === '/profile' && write;
      if ((admin || personal || path === '/speech' && !config.speechPublic) && !user) throw new HttpError(401, 'Sign in to use this feature.');
      if (admin && !user?.admin) throw new HttpError(403, 'Administrator access is required for shared closure/source changes.');
    }
    response.locals.user = user;
    context.run(scopeFor(user?.uid ?? null), next);
  });
  routes.get('/speech/status', async (_request, response) => response.json(await speech.status()));
  routes.post('/speech', async (request, response) => {
    const body = speechSchema.parse(request.body);
    const audio = await speech.audio(body.language, body.prompt);
    response.type('audio/mpeg').send(audio);
  });
  routes.get('/health', (_request, response) => response.json({ ok: true, storage: store.backend, graphReady: currentGraph().ready, sourceCoverage: 'partial' }));
  routes.get('/runtime', (_request, response) => response.json({ mode: config.mode, projectId: config.projectId, auth: config.mode === 'local' ? 'development' : 'firebase', storage: store.backend, scheduledWork: config.mode === 'production' ? 'external-worker' : 'local' }));
  routes.get('/state', async (_request, response) => {
    const personal = config.mode === 'local' || !!response.locals.user;
    const admin = config.mode === 'local' || response.locals.user?.admin;
    if (personal) await applyRetention(store);
    const snapshot = await store.routingSnapshot(!!admin);
    const state: AppState = { closures: snapshot.closures, commutes: personal ? await store.list('commute', 100) : [],
      alerts: personal ? await store.list('alert', 200) : [], trips: personal ? await store.listTripSummaries() : [], notices: admin ? await store.listNotices() : [],
      graph: currentGraph(), eventRevision: snapshot.revision, sourceStatus: await store.sourceStatus(), profile: await store.profile() };
    response.json(state);
  });
  routes.get('/profile', async (_request, response) => response.json(await store.profile()));
  routes.patch('/profile', async (request, response) => {
    const patch = profilePatchSchema.parse(request.body);
    const profile = await store.updateProfile(patch);
    if (patch.inferFrequentRoutes !== undefined) await recheck();
    response.json(profile);
  });
  routes.get('/frequent-routes', async (_request, response) => {
    await applyRetention(store); response.json(await frequentRouteProposals(store));
  });
  routes.get('/places', async (request, response) => {
    const query = z.string().max(160).parse(request.query.q ?? ''); response.json(await places(query));
  });
  routes.post('/geometry', (request, response) => response.json(polygonSchema.parse(drawingToPolygon(drawingSchema.parse(request.body)))));
  routes.post('/plan', async (request, response, next) => {
    const body = planSchema.parse(request.body);
    try {
      // Online planning can await a remote provider. Never return its advice
      // against restrictions replaced in the meantime (including Firestore).
      for (let attempt = 0; attempt < 2; attempt++) {
        const snapshot = await store.routingSnapshot();
        const plan = await planner(body, snapshot.closures, snapshot.revision);
        if ((await store.routingSnapshot()).revision === snapshot.revision) {
          response.json({ ...plan, eventRevision: snapshot.revision }); return;
        }
      }
      throw new HttpError(409, 'Restrictions changed while planning. Find routes again.');
    }
    catch (error) { next(error instanceof HttpError ? error : new HttpError(400, 'This journey could not be calculated. Check the endpoints and departure time.')); }
  });
  routes.post('/closures', async (request, response) => {
    const closure = await store.saveClosure(closureDraftSchema.parse(request.body)); if (config.mode === 'local') await recheck(); response.status(201).json(closure);
  });
  routes.get('/closures/roads', async (request, response) => {
    const at = instantSchema.parse(request.query.at ?? new Date().toISOString());
    response.json(activeClosureRoads(requireRoadGraph(), (await store.routingSnapshot()).closures, at));
  });
  routes.get('/demos', async (request, response) => {
    const at = instantSchema.parse(request.query.at ?? new Date().toISOString());
    response.json(await demoCatalogue(store, requireRoadGraph(), at));
  });
  routes.get('/demos/street-route', (request, response) => {
    const at = instantSchema.parse(request.query.at ?? new Date().toISOString());
    response.json(streetRouteDemo(requireRoadGraph(), at));
  });
  routes.post('/demos/street-route', async (request, response) => {
    const { at } = z.object({ at: instantSchema }).strict().parse(request.body);
    const result = await loadStreetRouteDemo(store, requireRoadGraph(), at); if (config.mode === 'local') await recheck(); response.json(result);
  });
  routes.post('/demos', async (request, response) => {
    const body = z.object({ scenario: z.string().min(1).max(80), at: instantSchema, enabled: z.boolean() }).strict().parse(request.body);
    const result = await toggleDemo(store, requireRoadGraph(), body.scenario, body.at, body.enabled); if (config.mode === 'local') await recheck(); response.json(result);
  });
  routes.put('/closures/:id', async (request, response) => {
    const { revision, ...draft } = closureUpdateSchema.parse(request.body);
    const closure = await store.saveClosure(draft, id(request), revision); if (config.mode === 'local') await recheck(); response.json(closure);
  });
  routes.delete('/closures/:id', async (request, response) => {
    const previous = await getRecord<Closure>(store, 'closure', id(request));
    const closure = await store.saveClosure({ ...previous, status: 'cancelled' }, previous.id, previous.revision); if (config.mode === 'local') await recheck(); response.json(closure);
  });
  routes.get('/commutes', async (_request, response) => response.json(await store.list('commute', 100)));
  routes.post('/commutes', async (request, response) => {
    if ((await store.list('commute', 101)).length >= 100) throw new HttpError(409, 'This prototype supports up to 100 saved commutes per user.');
    const draft: CommuteDraft = commuteSchema.parse(request.body), now = new Date().toISOString();
    const commute: Commute = { ...draft, days: [...new Set(draft.days)], id: randomUUID(), createdAt: now, updatedAt: now };
    await store.put('commute', commute); await recheck(); response.status(201).json(commute);
  });
  routes.put('/commutes/:id', async (request, response) => {
    const previous = await getRecord<Commute>(store, 'commute', id(request));
    const draft = commuteSchema.parse(request.body);
    const commute: Commute = { ...draft, days: [...new Set(draft.days)], id: previous.id, createdAt: previous.createdAt, updatedAt: new Date().toISOString() };
    await store.put('commute', commute); await recheck(); response.json(commute);
  });
  routes.delete('/commutes/:id', async (request, response) => {
    const commute = await getRecord<Commute>(store, 'commute', id(request)); await store.delete('commute', commute.id); response.json(commute);
  });
  routes.post('/commutes/:id/check', async (request, response) => response.json(await checkCommute(store, await getRecord(store, 'commute', id(request)), planner)));
  routes.patch('/alerts/:id', async (request, response) => {
    const body = z.object({ read: z.boolean() }).parse(request.body);
    const alert = { ...await getRecord<Alert>(store, 'alert', id(request)), read: body.read };
    await store.put('alert', alert); response.json(alert);
  });
  routes.get('/trips', async (_request, response) => { await applyRetention(store); response.json(await store.listTripSummaries()); });
  routes.get('/trips/:id', async (request, response) => { await applyRetention(store); response.json(await getRecord<Trip>(store, 'trip', id(request))); });
  routes.post('/trips', async (request, response) => {
    const draft = tripSchema.parse(request.body);
    const trip: Trip = { ...draft, id: randomUUID(), createdAt: new Date().toISOString(), ...summarizeTrace(draft.points),
      durationSeconds: Math.round((Date.parse(draft.endedAt) - Date.parse(draft.startedAt)) / 1000) };
    await store.put('trip', trip); await applyRetention(store); await recheck(); response.status(201).json(await store.get('trip', trip.id) ?? trip);
  });
  routes.patch('/trips/:id', async (request, response) => {
    const body = z.object({ name: z.string().trim().min(1).max(120).optional(), contributeToRoadDiscovery: z.boolean().optional() }).strict().parse(request.body);
    const trip: Trip = { ...await getRecord<Trip>(store, 'trip', id(request)), ...body };
    await store.put('trip', trip); response.json(trip);
  });
  routes.delete('/trips/:id', async (request, response) => {
    const trip = await getRecord<Trip>(store, 'trip', id(request)); await store.delete('trip', trip.id); await recheck(); response.json(trip);
  });
  routes.get('/notices', async (_request, response) => response.json(await store.listNotices()));
  routes.post('/notices', async (request, response) => {
    const draft = noticeSchema.parse(request.body);
    const input = { source: 'manual' as const, sourceId: draft.url || contentHash({ text: draft.text, publishedAt: draft.publishedAt ?? null }),
      url: draft.url ?? '', text: draft.text, publishedAt: draft.publishedAt ?? null, mediaUrls: [], contentState: 'text' as const };
    response.status(201).json((await store.upsertNotice({ ...input, contentHash: contentHash(input) })).notice);
  });
  routes.patch('/notices/:id', async (request, response) => {
    const body = z.object({ status: z.enum(['pending_agent', 'reviewed', 'dismissed']) }).parse(request.body);
    response.json(await store.setNoticeStatus(id(request), body.status));
  });
  routes.get('/agent/outbox', async (_request, response) => response.json(await store.pendingAgentNotices()));
  routes.get('/source/status', async (_request, response) => response.json(await store.sourceStatus()));
  routes.post('/source/check', async (_request, response) => response.json(await source.check()));
  routes.patch('/source/settings', async (request, response) => {
    const settings = z.object({ enabled: z.boolean(), intervalMinutes: z.literal(15).optional() }).strict().parse(request.body);
    response.json(await source.settings(settings.enabled));
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
