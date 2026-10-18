import express, { type ErrorRequestHandler, type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z, ZodError } from 'zod';
import type { Alert, AppState, Closure, ClosureInput, Commute, CommuteDraft, GraphStatus, Place, Trip } from '../shared/types.js';
import type { Repository } from './repository.js';
import { isAllowedApplicationHost, readConfig, type RuntimeConfig } from './config.js';
import { firebaseServices } from './firebase.js';
import { mountWorker } from './worker.js';
import { HttpError } from './errors.js';
import { drawingToPolygon, summarizeTrace } from './geometry.js';
import { closureDraftSchema, closureUpdateSchema, commuteSchema, coordinateSchema, drawingSchema, instantSchema, noticeSchema, planSchema, polygonSchema, profilePatchSchema, tripSchema } from './validation.js';
import { SourceService, contentHash } from './source.js';
import { cloudMediaArchiver } from './source-archive.js';
import { SOURCE_INTERVAL_MINUTES } from '../shared/source.js';
import { AgentService } from './agent.js';
import { createAgentDispatch } from './agent-dispatch.js';
import { cloudAgentImages } from './agent-images.js';
import { getRoutingGraph, graphStatus, planJourney, searchPlaces } from './routing/index.js';
import { activeClosureRoads } from './routing/closure-segments.js';
import { demoCatalogue, toggleDemo } from './demos.js';
import { loadStreetRouteDemo, streetRouteDemo } from './street-demo.js';
import type { RoutingGraph } from './routing/graph.js';
import { checkCommute, checkEnabledCommutes, type Planner } from './commutes.js';
import { frequentRouteProposals } from './frequent-routes.js';
import { SpeechService, speechSchema } from './speech.js';
import { actorFor, assertEditClosure, canReadClosure, closureSummary, directoryEntry, isReviewer, membershipFor, setVerification, type TokenUser, type UserDirectory } from './community.js';
import { RoadSelectionError, selectRoadSection } from './routing/road-selection.js';
import { FuelService, travelStatistics, pktDay } from './fuel.js';
import { estimateTraceFuel } from '../shared/fuel.js';
import { WeatherService } from './weather.js';
import { TransitService, transitDisruptionSchema, transitDisruptionUpdateSchema, transitPlanSchema } from './transit/service.js';
import { sendTransitNetwork } from './transit/network-response.js';

interface AppOptions {
  config?: RuntimeConfig;
  verifyToken?: (token: string) => Promise<TokenUser>;
  userDirectory?: UserDirectory;
  speech?: SpeechService;
  fuel?: FuelService;
  weather?: WeatherService;
  transit?: TransitService;
  source?: SourceService; planner?: Planner;
  agent?: AgentService;
  dispatchAgent?: () => Promise<unknown>;
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
  const source = options.source ?? new SourceService(rootStore, undefined,
    config.sourceMediaBucket ? cloudMediaArchiver(rootStore, config.projectId, config.sourceMediaBucket) : undefined);
  const imageReader = config.sourceMediaBucket || config.sourceMediaReadBucket
    ? cloudAgentImages(rootStore, config.projectId, (config.sourceMediaBucket ?? config.sourceMediaReadBucket)!) : undefined;
  const agent = options.agent ?? new AgentService(rootStore, undefined, undefined, imageReader);
  const dispatchAgent = options.dispatchAgent ?? (config.agentWorkerUrl ? createAgentDispatch(config.agentWorkerUrl) : undefined);
  const speech = options.speech ?? new SpeechService(rootStore);
  const fuel = options.fuel ?? new FuelService(rootStore);
  const weather = options.weather ?? new WeatherService(rootStore, undefined, undefined, process.env.NODE_ENV !== 'test', config.mode === 'production');
  const transit = options.transit ?? new TransitService(rootStore);
  const verifyToken = options.verifyToken ?? (async token => { const decoded = await firebaseServices(config.projectId).auth.verifyIdToken(token, true); return { uid: decoded.uid, admin: decoded.admin === true, name: typeof decoded.name === 'string' ? decoded.name : undefined }; });
  const directory = () => options.userDirectory ?? firebaseServices(config.projectId).auth;
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
      if (!host || !isAllowedApplicationHost(config, new URL(`http://${host}`).hostname)) throw new Error();
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
  mountWorker(app, config, rootStore, source, fuel, agent);
  // Finish writes/checks before responding in cloud mode; no untracked work after HTTP success.
  // Capture the actual scope, not the proxy's process-wide object identity.
  const recheck = () => checkEnabledCommutes(context.getStore() ?? rootStore, planner, Date.now(), true);
  const routes = express.Router();
  routes.use(async (request, response, next) => {
    if (config.role === 'worker') throw new HttpError(404, 'API is unavailable on the worker service.');
    let user: TokenUser | null = null;
    if (config.mode !== 'local' && request.headers.authorization) {
      const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization);
      if (!match) throw new HttpError(401, 'Invalid authorization header.');
      try { user = await verifyToken(match[1]); } catch { throw new HttpError(401, 'Sign in again. Your session could not be verified.'); }
    }
    if (config.mode !== 'local') {
      // Express defaults to case-insensitive paths and optional trailing slashes.
      // Apply the same normalization before classifying authorization needs.
      const path = request.path.toLowerCase().replace(/\/+$/, '') || '/', write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
      const admin = path.startsWith('/admin') || path.startsWith('/notices') || path.startsWith('/agent/') || path.startsWith('/source/') && path !== '/source/status' || write && (path.startsWith('/demos') || path.startsWith('/fuel'));
      const personal = /^\/(commutes|trips|alerts|frequent-routes)(\/|$)/.test(path) || path === '/profile' && write;
      if ((admin || personal || write && path.startsWith('/closures') || path === '/speech' && !config.speechPublic) && !user) throw new HttpError(401, 'Sign in to use this feature.');
      if (admin && !user?.admin) throw new HttpError(403, 'Administrator access is required for shared closure/source changes.');
    }
    response.locals.user = user;
    response.locals.membership = await membershipFor(rootStore, user, config.mode === 'local');
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
    const member = response.locals.membership;
    const admin = member?.role === 'admin';
    if (personal) await applyRetention(store);
    const snapshot = await store.routingSnapshot(!!member);
    const state: AppState = { closures: snapshot.closures.filter(closure => canReadClosure(closure, member)).map(closureSummary), commutes: personal ? await store.list('commute', 100) : [],
      alerts: personal ? await store.list('alert', 200) : [], trips: personal ? await store.listTripSummaries() : [], notices: admin ? await store.listNotices() : [],
      graph: currentGraph(), eventRevision: snapshot.revision, sourceStatus: await store.sourceStatus(), profile: await store.profile(), membership: member, fuel: await fuel.status() };
    response.json(state);
  });
  routes.get('/profile', async (_request, response) => response.json(await store.profile()));
  routes.get('/weather', async (request, response) => {
    const query = z.object({ at: instantSchema.optional() }).strict().parse(request.query);
    const at = new Date(query.at ?? Date.now()).toISOString();
    response.json(await weather.get(at));
  });
  routes.get('/transit/network', async (request,response) => {
    const query=z.object({at:instantSchema.optional()}).strict().parse(request.query);
    await sendTransitNetwork(request,response,await transit.network(query.at??new Date().toISOString()));
  });
  routes.get('/transit/revision', async (request,response) => { z.object({}).strict().parse(request.query);response.json(await transit.revision()); });
  routes.post('/transit/plan', async (request,response) => response.json(await transit.plan(transitPlanSchema.parse(request.body))));
  routes.get('/transit/disruptions', async (request,response) => { z.object({}).strict().parse(request.query); const state=await transit.disruptions();response.json({...state,records:isReviewer(response.locals.membership)?state.records:state.records.filter(record=>record.status==='published')}); });
  routes.post('/transit/disruptions', async (request,response) => {
    if(!isReviewer(response.locals.membership))throw new HttpError(response.locals.membership?403:401,'A verified contributor or administrator must publish bus service notices.');
    const draft=transitDisruptionSchema.parse(request.body),author=await actorFor(store,response.locals.membership,response.locals.user);
    response.status(201).json(await transit.save(draft,author));
  });
  routes.put('/transit/disruptions/:id', async (request,response) => {
    if(!isReviewer(response.locals.membership))throw new HttpError(response.locals.membership?403:401,'A verified contributor or administrator must edit bus service notices.');
    const {revision,...draft}=transitDisruptionUpdateSchema.parse(request.body),author=await actorFor(store,response.locals.membership,response.locals.user);
    response.json(await transit.save(draft,author,id(request),revision));
  });
  routes.get('/fuel/prices', async (_request, response) => response.json(await fuel.status()));
  routes.post('/fuel/check', async (request, response) => {
    z.object({}).strict().parse(request.body); response.json(await fuel.check());
  });
  routes.get('/admin/users', async (request, response) => {
    if (config.mode === 'local' && !options.userDirectory) {
      response.json({ users: [{ uid: 'local-admin', displayName: 'Local developer', disabled: false, role: 'admin', verified: true }] }); return;
    }
    const pageToken = z.string().max(2000).optional().parse(request.query.pageToken);
    let result;
    try { result = await directory().listUsers(50, pageToken); }
    catch (error) {
      if ((error as { code?: string })?.code === 'auth/invalid-page-token') throw new HttpError(400, 'The user-list page expired. Reload the directory.');
      throw new HttpError(503, 'The account directory is unavailable. Check Firebase Auth service permissions.');
    }
    const users = await Promise.all(result.users.map(user => directoryEntry(rootStore, user)));
    response.json({ users, ...(result.pageToken ? { nextPageToken: result.pageToken } : {}) });
  });
  routes.patch('/admin/users/:id', async (request, response) => {
    const { verified } = z.object({ verified: z.boolean() }).strict().parse(request.body);
    const uid = id(request);
    if (config.mode === 'local' && !options.userDirectory) throw new HttpError(409, 'User verification requires Firebase accounts. Standalone mode is a single trusted local user.');
    let user;
    try { user = await directory().getUser(uid); }
    catch (error) {
      if ((error as { code?: string })?.code === 'auth/user-not-found') throw new HttpError(404, 'Account not found.');
      throw new HttpError(503, 'The account directory is unavailable. Check Firebase Auth service permissions.');
    }
    if (user.customClaims?.admin === true) throw new HttpError(409, 'Administrator access is managed separately; it cannot be changed here.');
    await setVerification(rootStore, uid, verified, response.locals.membership.uid);
    response.json({ uid, verified, role: verified ? 'verified' : 'user' });
  });
  routes.patch('/profile', async (request, response) => {
    const patch = profilePatchSchema.parse(request.body);
    if (patch.collectTravelData === false) patch.inferFrequentRoutes = false;
    if (patch.inferFrequentRoutes && !(patch.collectTravelData ?? (await store.profile()).collectTravelData)) throw new HttpError(400, 'Allow travel data collection before learning frequent routes.');
    const profile = await store.updateProfile(patch);
    if (patch.inferFrequentRoutes !== undefined || patch.collectTravelData !== undefined) await recheck();
    response.json(profile);
  });
  routes.get('/frequent-routes', async (_request, response) => {
    await applyRetention(store); response.json(await frequentRouteProposals(store));
  });
  routes.get('/places', async (request, response) => {
    const query = z.string().max(160).parse(request.query.q ?? ''); response.json(await places(query));
  });
  routes.post('/geometry', (request, response) => response.json(polygonSchema.parse(drawingToPolygon(drawingSchema.parse(request.body)))));
  routes.post('/roads/section', (request, response) => {
    const { from, to } = z.object({ from: coordinateSchema, to: coordinateSchema }).strict().parse(request.body);
    try { response.json(selectRoadSection(roadGraph(), from, to)); }
    catch (error) { if (error instanceof RoadSelectionError) throw new HttpError(error.status, error.message); throw error; }
  });
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
    const member = response.locals.membership!;
    const body = closureDraftSchema.parse(request.body), actor = await actorFor(store, member, response.locals.user);
    const draft: ClosureInput = { ...body, author: actor, moderation: isReviewer(member) ? 'approved' : 'pending',
      status: isReviewer(member) ? body.status : 'draft', photoCount: body.photos?.length ?? 0 };
    const closure = await store.saveClosure(draft); if (config.mode === 'local') await recheck(); response.status(201).json(closure);
  });
  routes.get('/closures/roads', async (request, response) => {
    const at = instantSchema.parse(request.query.at ?? new Date().toISOString());
    const includeUpcoming = z.enum(['true', 'false']).optional().parse(request.query.includeUpcoming) === 'true';
    response.json(activeClosureRoads(requireRoadGraph(), (await store.routingSnapshot()).closures, at, includeUpcoming));
  });
  routes.get('/closures/:id', async (request, response) => {
    const closure = await getRecord<Closure>(store, 'closure', id(request));
    if (!canReadClosure(closure, response.locals.membership)) throw new HttpError(404, 'Closure not found.');
    response.json({ ...closure, photoCount: closure.photos?.length ?? closure.photoCount ?? 0 });
  });
  routes.post('/closures/:id/review', async (request, response) => {
    const member = response.locals.membership;
    if (!isReviewer(member)) throw new HttpError(403, 'Verified contributor or administrator access is required.');
    const body = z.object({ revision: z.number().int().positive(), decision: z.enum(['approve', 'reject']) }).strict().parse(request.body);
    const previous = await getRecord<Closure>(store, 'closure', id(request));
    if (previous.moderation !== 'pending' || previous.status !== 'draft') throw new HttpError(409, 'This report is no longer awaiting review.');
    const reviewer = await actorFor(store, member, response.locals.user);
    const closure = await store.saveClosure({ ...previous, status: body.decision === 'approve' ? 'published' : 'draft',
      moderation: body.decision === 'approve' ? 'approved' : 'rejected', reviewedBy: reviewer, reviewedAt: new Date().toISOString() }, previous.id, body.revision);
    if (config.mode === 'local') await recheck(); response.json(closure);
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
    const { revision, ...body } = closureUpdateSchema.parse(request.body);
    const previous = await getRecord<Closure>(store, 'closure', id(request)), member = response.locals.membership!;
    assertEditClosure(previous, member);
    const draft: ClosureInput = { ...body, ...(previous.author ? { author: previous.author } : {}),
      moderation: isReviewer(member) ? 'approved' : 'pending', status: isReviewer(member) ? body.status : 'draft',
      photos: body.photos ?? previous.photos ?? [], photoCount: (body.photos ?? previous.photos)?.length ?? 0,
      ...(previous.reviewedBy ? { reviewedBy: previous.reviewedBy, reviewedAt: previous.reviewedAt } : {}),
      ...(previous.agent ? { agent: { ...previous.agent, overridden: true } } : {}) };
    const closure = await store.saveClosure(draft, previous.id, revision); if (config.mode === 'local') await recheck(); response.json(closure);
  });
  routes.delete('/closures/:id', async (request, response) => {
    const previous = await getRecord<Closure>(store, 'closure', id(request));
    assertEditClosure(previous, response.locals.membership);
    const closure = await store.saveClosure({ ...previous, status: 'cancelled', ...(previous.agent ? { agent: { ...previous.agent, overridden: true } } : {}) }, previous.id, previous.revision); if (config.mode === 'local') await recheck(); response.json(closure);
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
  routes.get('/trips/statistics', async (_request, response) => { await applyRetention(store); response.json(await travelStatistics(store)); });
  routes.get('/trips/:id', async (request, response) => { await applyRetention(store); response.json(await getRecord<Trip>(store, 'trip', id(request))); });
  routes.post('/trips', async (request, response) => {
    const profile = await store.profile();
    if (!profile.collectTravelData) throw new HttpError(403, 'Allow travel data collection in Profile before saving a trip.');
    const draft = tripSchema.parse(request.body);
    const trip: Trip = { ...draft, id: randomUUID(), createdAt: new Date().toISOString(), ...summarizeTrace(draft.points),
      durationSeconds: Math.round((Date.parse(draft.endedAt) - Date.parse(draft.startedAt)) / 1000) };
    if (profile.vehicleUpdatedAt && Date.parse(draft.startedAt) >= Date.parse(profile.vehicleUpdatedAt)) {
      const prices = await fuel.status();
      // A cached quote is useful for route planning, but it cannot establish a
      // new day's actual historical reference after that day's check failed.
      if (prices.lastSuccessAt && pktDay(Date.parse(draft.endedAt)) <= pktDay(Date.parse(prices.lastSuccessAt)) && Date.parse(draft.endedAt) <= Date.parse(trip.createdAt)) {
        const estimate = estimateTraceFuel(draft.points, profile.vehicle, prices.records, trip.createdAt);
        if (estimate) trip.fuelEstimate = estimate;
      }
    }
    const tripWeather = await weather.snapshot(draft.startedAt, draft.points[0].coordinate);
    if (tripWeather) trip.weather = tripWeather;
    // saveTripIfConsented still rechecks the owning profile atomically after all
    // awaits. The city forecast is cache-only and never waits for a provider.
    await store.saveTripIfConsented(trip); await applyRetention(store); await recheck(); response.status(201).json(await store.get('trip', trip.id) ?? trip);
  });
  routes.patch('/trips/:id', async (request, response) => {
    const body = z.object({ name: z.string().trim().min(1).max(120).optional(), contributeToRoadDiscovery: z.boolean().optional() }).strict().parse(request.body);
    const trip: Trip = { ...await getRecord<Trip>(store, 'trip', id(request)), ...body };
    if (trip.demoData && trip.contributeToRoadDiscovery) throw new HttpError(400, 'Simulated trips cannot contribute to road discovery.');
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
  routes.get('/agent/status', async (_request, response) => response.json({ ...await agent.status(),
    canRunHere: config.mode === 'production' ? !!dispatchAgent : agent.config.enabled && !!agent.config.apiKey,
    execution: config.mode === 'production' ? dispatchAgent ? 'private_worker' : 'scheduled_only' : 'local' }));
  routes.get('/agent/results', async (_request, response) => response.json(await agent.results()));
  routes.post('/agent/notices/:id/prepare', async (request, response) => {
    const body = z.object({ revision: z.number().int().positive() }).strict().parse(request.body);
    response.json(await agent.prepareNotice(id(request), body.revision));
  });
  routes.post('/agent/notices/:id/review', async (request, response) => {
    const body = z.object({ noticeRevision: z.number().int().positive(), index: z.number().int().min(0).max(2),
      version: z.string().uuid(), decision: z.enum(['approve', 'reject']), draft: closureDraftSchema.optional(),
      confirmRestriction: z.boolean().optional(), confirmUnknownEnd: z.boolean().optional() }).strict().parse(request.body);
    const reviewer = await actorFor(store, response.locals.membership!, response.locals.user);
    const decision = await rootStore.reviewAgentProposal({ ...body, noticeId: id(request), reviewer });
    if (decision.closure && config.mode === 'local') await recheck(); response.json(decision);
  });
  routes.post('/agent/run', async (_request, response) => {
    z.object({}).strict().parse(_request.body);
    if (config.mode === 'production') {
      if (!dispatchAgent) throw new HttpError(409, 'Manual analysis is not configured. The private scheduled worker still processes saved posts.');
      response.json(await dispatchAgent()); return;
    }
    response.json(await agent.run());
  });
  routes.post('/agent/notices/:id/refine', async (request, response) => {
    const body = z.object({ revision: z.number().int().positive() }).strict().parse(request.body);
    response.json(await agent.refineNotice(id(request), body.revision));
  });
  routes.patch('/agent/settings', async (request, response) => {
    const settings = z.object({ enabled: z.boolean(), autoPublish: z.boolean() }).strict().parse(request.body);
    if (settings.autoPublish) throw new HttpError(409, 'Administrator approval is required for agent map changes.');
    await rootStore.setMeta('sourceAgentSettings', settings); response.json(await agent.status());
  });
  routes.get('/source/media/:id', async (request, response) => {
    if (!imageReader) throw new HttpError(503, 'Private source image access is not configured.');
    const notice = await store.getNotice(id(request));
    if (!notice) throw new HttpError(404, 'Source notice not found.');
    response.json({ images: (await imageReader(notice)).map(image => ({ mimeType: image.mimeType, data: image.bytes.toString('base64'), kind: image.kind })) });
  });
  routes.get('/source/status', async (_request, response) => response.json(await store.sourceStatus()));
  routes.post('/source/check', async (_request, response) => response.json(await source.check()));
  routes.patch('/source/settings', async (request, response) => {
    const settings = z.object({ enabled: z.boolean(), intervalMinutes: z.literal(SOURCE_INTERVAL_MINUTES).optional() }).strict().parse(request.body);
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
  return { app, source, fuel, weather };
}
