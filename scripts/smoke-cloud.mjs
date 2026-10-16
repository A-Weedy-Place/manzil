// Read-only deployment checks. Rejected write requests must never create records.
const base = new URL(process.argv[2] ?? 'https://manzil-app-v1.web.app');
const expectedProject = process.argv[3] ?? 'manzil-app-v1';
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
assert(!state.sourceStatus.enabled, 'Automatic collection must stay disabled for the first deployment');
const speech = await request('/api/speech/status');
assert(speech.enabled === false, 'Cloud speech must stay disabled for the first deployment');
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
await request('/api/runtime', { status: 401, headers: { Authorization: 'Bearer deployment-invalid-token' } });
await request('/api/runtime', { status: 403, headers: { Origin: 'https://example.invalid' } });
console.log(JSON.stringify({ origin: base.origin, checks, graphReady: true, storage: 'firestore', project: expectedProject,
  routeOptions: plan.options.length, personalAccessDenied: true, guestWritesDenied: true, cloudSpeechEnabled: false,
  automaticCollectionEnabled: false }, null, 2));
