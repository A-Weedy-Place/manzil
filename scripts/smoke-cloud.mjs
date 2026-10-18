// Read-only deployment checks. Rejected write requests must never create records.
const base = new URL(process.argv[2] ?? 'https://manzil-app-v1.web.app');
const expectedProject = process.argv[3] ?? 'manzil-app-v1';
const national = process.argv.slice(4).includes('--national');
const collectionEnabled = process.argv.slice(4).includes('--collection-enabled');
const gemini = process.argv.slice(4).includes('--gemini');
const publicSpeech = process.argv.includes('--public-speech');
if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password)
  throw new Error('Provide an HTTPS origin without a path, query or credentials.');
const websiteOrigin = `https://${expectedProject}.web.app`;
let checks = 0;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function request(path, { status = 200, body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(new URL(path, base), {
    method, headers: { Origin: websiteOrigin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000),
  });
  assert(response.status === status, `${method} ${path}: expected ${status}, received ${response.status}`);
  assert(response.headers.get('cache-control')?.includes('no-store'), `${path}: API response must not be cached`);
  checks++;
  return response.json();
}
const health = await request('/api/health');
assert(health.ok && health.storage === 'firestore' && health.graphReady, 'Cloud storage/road graph is not ready');
const runtime = await request('/api/runtime');
assert(runtime.mode === 'production' && runtime.projectId === expectedProject && runtime.auth === 'firebase', 'Wrong deployed environment');
const state = await request('/api/state');
for (const key of ['commutes', 'alerts', 'trips', 'notices']) assert(Array.isArray(state[key]) && state[key].length === 0, `Guest state exposes ${key}`);
assert(state.sourceStatus.enabled === collectionEnabled, 'Source collection does not match the expected deployment state');
if (collectionEnabled) assert(state.sourceStatus.intervalMinutes === 5, 'Expected five-minute collection interval');
const speech = await request('/api/speech/status');
const expectCloudSpeech = process.argv.includes('--speech-enabled');
assert(speech.enabled === expectCloudSpeech, `Cloud speech enabled must be ${expectCloudSpeech}; use --speech-enabled for the voice-enabled release`);
const plan = await request('/api/plan', { body: {
  origin: { name: 'Faisal Mosque approach (deployment smoke)', coordinate: [73.0376503, 33.7314163] },
  destination: { name: 'Centaurus road approach (deployment smoke)', coordinate: [73.0492744, 33.7081776] },
  departureAt: new Date().toISOString(), compareDepartures: false,
} });
assert(plan.source === 'local-osm' && plan.options?.length > 0, 'Real-road routing did not return a usable option');
assert(plan.options.every(option => option.validation === 'clear' && option.geometry?.coordinates?.length > 2), 'An invalid route was offered');
await request('/api/commutes', { status: 401 });
await request('/api/trips', { status: 401 });
await request('/api/closures', { body: {}, status: 401 });
await request('/api/source/check', { body: {}, status: 401 });
await request('/api/COMMUTES/', { status: 401 });
// For the guest-enabled voice release, reject malformed input without synthesizing.
await request('/api/SpEeCh/', { body: publicSpeech ? { language: 'en', text: 'unsupported free text' } : { language: 'en', prompt: { kind: 'test' } }, status: publicSpeech ? 400 : 401 });
await request('/api/PrOfIlE/', { method: 'PATCH', body: { displayName: 'Rejected smoke request' }, status: 401 });
await request('/api/CLOSURES/', { body: {}, status: 401 });
await request('/api/NoTiCeS/', { status: 401 });
await request('/api/runtime', { status: 401, headers: { Authorization: 'Bearer deployment-invalid-token' } });
await request('/api/runtime', { status: 403, headers: { Origin: 'https://example.invalid' } });
if (gemini) {
  await request('/api/agent/status', { status: 401 });
  await request('/api/agent/results', { status: 401 });
  await request('/api/agent/run', { body: {}, status: 401 });
  await request('/api/agent/notices/smoke/refine', { body: { revision: 1 }, status: 401 });
  await request('/api/agent/settings', { method: 'PATCH', body: { enabled: true, autoPublish: true }, status: 401 });
  await request('/api/source/media/deployment-readonly-probe', { status: 401 });
  await request('/api/agent/notices/deployment-readonly-probe/prepare', { body: { revision: 1 }, status: 401 });
  await request('/api/agent/notices/deployment-readonly-probe/review', { body: {}, status: 401 });
}
let nationalResult;
if (national) {
  const places = await request('/api/places?q=Lahore');
  assert(Array.isArray(places) && places.length > 0, 'Pakistan place search returned no Lahore results');
  const nationalPlan = await request('/api/plan', { body: {
    origin: { name: 'Badshahi Mosque road approach (deployment smoke)', coordinate: [74.3095, 31.588] },
    destination: { name: 'Lahore Museum road approach (deployment smoke)', coordinate: [74.3099, 31.5682] },
    departureAt: new Date().toISOString(), compareDepartures: false,
  } });
  assert(nationalPlan.source === 'osrm' && nationalPlan.options?.length > 0, `National routing unavailable: ${nationalPlan.unavailableReason ?? 'no clear options'}`);
  assert(nationalPlan.options.every(option => option.validation === 'clear' && option.geometry?.coordinates?.length > 2), 'An invalid national route was offered');
  const foreign = await request('/api/plan', { body: {
    origin: { name: 'Foreign coverage test', coordinate: [77.209, 28.6139] },
    destination: { name: 'Lahore road approach', coordinate: [74.3099, 31.5682] }, departureAt: new Date().toISOString(),
  } });
  assert(foreign.options?.length === 0 && /within Pakistan/.test(foreign.unavailableReason), 'Foreign endpoint was not rejected');
  nationalResult = { places: places.length, routeOptions: nationalPlan.options.length,
    distanceMeters: nationalPlan.options[0].distanceMeters, durationSeconds: nationalPlan.options[0].durationSeconds, foreignEndpointRejected: true };
}
let mergedFeatures;
if (process.argv.includes('--transit-weather')) {
  const at = new Date().toISOString(), weather = await request('/api/weather?at=' + encodeURIComponent(at));
  assert(weather.location === 'Islamabad' && ['fresh', 'stale', 'unavailable'].includes(weather.state), 'Invalid weather state');
  if (weather.reading) assert(weather.reading.coordinate?.[0] === 73.0479 && weather.reading.coordinate?.[1] === 33.6844, 'Unexpected weather location');
  const network = await request('/api/transit/network?at=' + encodeURIComponent(at));
  assert(network.routes?.length > 0 && network.stops?.length > 0 && network.patterns?.length > 0 && !network.unavailableReason, 'Bundled transit network unavailable');
  await request('/api/transit/revision');
  const disruptions = await request('/api/transit/disruptions');
  assert(Array.isArray(disruptions.records) && disruptions.records.every(item => item.status === 'published'), 'Guest transit notices expose private records');
  await request('/api/transit/disruptions', { body: {}, status: 401 });
  await request('/api/transit/disruptions/smoke', { body: {}, method: 'PUT', status: 401 });
  const pattern = network.patterns.find(item => item.stopIds?.length > 1), stops = pattern.stopIds.map(id => network.stops.find(stop => stop.id === id)).filter(Boolean);
  assert(stops.length > 1, 'Transit stops do not match the network');
  const plan = await request('/api/transit/plan', { body: { origin: { name: stops[0].name, coordinate: stops[0].coordinate },
    destination: { name: stops.at(-1).name, coordinate: stops.at(-1).coordinate }, departureAt: at } });
  assert(Array.isArray(plan.options) && plan.datasetVersion === network.version && (plan.options.length > 0 || !!plan.unavailableReason), 'Transit planner did not return an explicit result');
  mergedFeatures = { weatherState: weather.state, transitRoutes: network.routes.length, transitStops: network.stops.length, transitOptions: plan.options.length, guestTransitWritesDenied: true };
}
console.log(JSON.stringify({ origin: base.origin, checks, graphReady: true, storage: 'firestore', project: expectedProject, mergedFeatures,
  routeOptions: plan.options.length, personalAccessDenied: true, guestWritesDenied: true, cloudSpeechEnabled: speech.enabled,
  automaticCollectionEnabled: state.sourceStatus.enabled, geminiEndpointsGuestDenied: gemini || undefined, national: nationalResult }, null, 2));
