import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { Store } from '../server/store';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { FuelService, FUEL_SOURCE_URL } from '../server/fuel';
import type { FuelPriceRecord, GraphStatus, Trip, VehicleProfile } from '../shared/types';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const graph: GraphStatus = { ready: false, source: 'fixture', version: 'fixture', nodeCount: 0, edgeCount: 0, importedAt: null, bounds: [72,33,74,35], limitations: [] };
const vehicle: VehicleProfile = { kind: 'motorcycle', label: 'Test motorcycle', fuelType: 'petrol', kmPerLitre: 40 };
async function setup() {
  const store = new Store(':memory:'); cleanup.push(() => store.close());
  const record: FuelPriceRecord = { effectiveFrom: new Date(Date.now() - 3 * 86400_000).toISOString(), petrolPerLitre: 300, dieselPerLitre: 350,
    sourceUrl: FUEL_SOURCE_URL, sourceName: 'Offline API fixture', retrievedAt: new Date().toISOString() };
  const collector = vi.fn(async () => [record]), fuel = new FuelService(store, collector);
  const { app } = createApp(store, { fuel, graph: () => graph,
    config: readConfig({ MANZIL_MODE:'emulator', FIREBASE_PROJECT_ID:'demo-fuel-test', FIRESTORE_EMULATOR_HOST:'127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9199' }),
    verifyToken: async token => ({ uid: token, admin: token === 'admin' }) });
  const server = await new Promise<Server>(resolve => { const result = app.listen(0, '127.0.0.1', () => resolve(result)); });
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const request = (path: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { store, record, collector, fuel, request };
}
function draft() {
  const start = Date.now() - 60000;
  return { name: 'Private test trip', startedAt: new Date(start).toISOString(), endedAt: new Date(start + 30000).toISOString(), contributeToRoadDiscovery: false,
    points: [{ coordinate: [73.04,33.7], timestamp: new Date(start).toISOString(), accuracy: 8 }, { coordinate: [73.041,33.7], timestamp: new Date(start + 30000).toISOString(), accuracy: 8 }] };
}
describe('fuel and vehicle API permissions and snapshots', () => {
  it('serves public cached rates without a fetch and restricts bounded refresh to admins including path variants', async () => {
    const { request, collector } = await setup();
    expect((await (await request('/fuel/prices')).json()).state).toBe('unavailable');
    expect((await (await request('/state')).json()).fuel.state).toBe('unavailable'); expect(collector).not.toHaveBeenCalled();
    for (const path of ['/fuel/check', '/FuEl/CHECK/']) {
      expect((await request(path, undefined, {})).status).toBe(401);
      expect((await request(path, 'user', {})).status).toBe(403);
    }
    expect((await request('/fuel/check', 'admin', { url: 'https://untrusted.test/' })).status).toBe(400);
    expect((await request('/fuel/check', 'admin', {})).status).toBe(200);
    expect((await request('/fuel/check', 'admin', {})).status).toBe(200); expect(collector).toHaveBeenCalledTimes(1);
    expect((await (await request('/fuel/prices')).json()).records[0].petrolPerLitre).toBe(300);
    expect((await request('/trips/statistics')).status).toBe(401);
    expect((await request('/TrIpS/StAtIsTiCs/')).status).toBe(401);
  });
  it('strictly validates optional vehicle economy and keeps the road engine car profile', async () => {
    const { request } = await setup();
    for (const value of [{ ...vehicle, kmPerLitre: '40' }, { ...vehicle, kmPerLitre: 0 }, { ...vehicle, kmPerLitre: 201 }, { ...vehicle, fuelType: 'electric' }, { ...vehicle, kind: 'truck' }, { ...vehicle, verified: true }]) {
      expect((await request('/profile', 'user', { vehicle: value }, 'PATCH')).status).toBe(400);
    }
    expect((await request('/profile', 'user', { vehicleUpdatedAt: '2000-01-01T00:00:00Z' }, 'PATCH')).status).toBe(400);
    const result = await request('/profile', 'user', { vehicle }, 'PATCH'); expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ vehicle, transport: 'car' });
    expect((await request('/profile', 'user', { vehicle: { ...vehicle, kmPerLitre: null } }, 'PATCH')).status).toBe(200);
  });
  it('snapshots server-calculated trip costs and never accepts client-supplied money or retroprices old saved trips', async () => {
    const { store, request, fuel } = await setup(); await fuel.check();
    store.updateProfile({ collectTravelData: true, vehicle });
    store.setMeta('profile', { ...store.profile(), vehicleUpdatedAt: new Date(Date.now() - 120000).toISOString() });
    expect((await request('/trips', 'user', { ...draft(), fuelEstimate: { costPkr: 0 } })).status).toBe(400);
    const response = await request('/trips', 'user', draft()); expect(response.status).toBe(201);
    const trip = await response.json() as Trip; expect(trip.fuelEstimate).toMatchObject({ vehicle, distanceMeters: trip.distanceMeters });
    expect(trip.fuelEstimate?.costPkr).toBeCloseTo(trip.distanceMeters / 1000 / 40 * 300);
    expect((await (await request('/trips/statistics', 'user')).json()).week).toMatchObject({ pricedTripCount: 1, unpricedTripCount: 0, costPkr: trip.fuelEstimate?.costPkr });
    await request('/profile', 'user', { vehicle: { ...vehicle, kmPerLitre: 20 } }, 'PATCH');
    expect((await (await request(`/trips/${trip.id}`, 'user')).json()).fuelEstimate.costPkr).toBe(trip.fuelEstimate?.costPkr);
    const oldUpload = await (await request('/trips', 'user', draft())).json() as Trip; expect(oldUpload.fuelEstimate).toBeUndefined();
  });
  it('rechecks vehicle identity atomically after an awaited save and returns the actual unpriced stored snapshot', async () => {
    const { store, request, fuel } = await setup(); await fuel.check();
    store.updateProfile({ collectTravelData: true, vehicle }); store.setMeta('profile', { ...store.profile(), vehicleUpdatedAt: new Date(Date.now() - 120000).toISOString() });
    const save = vi.spyOn(store, 'saveTripIfConsented');
    save.mockImplementation(trip => { store.updateProfile({ vehicle: { ...vehicle, kmPerLitre: 20 } }); Store.prototype.saveTripIfConsented.call(store, trip); });
    const result = await request('/trips', 'user', draft()); expect(result.status).toBe(201);
    expect((await result.json()).fuelEstimate).toBeUndefined(); expect(store.list<Trip>('trip')[0].fuelEstimate).toBeUndefined();
  });
  it('keeps a new day unpriced when only an older successful price check is known', async () => {
    const { store, request, fuel } = await setup(); await fuel.check();
    const prior = await fuel.status(); store.setMeta('fuel:status', { ...prior, state: 'error', lastSuccessAt: new Date(Date.now() - 86400_000).toISOString() });
    store.updateProfile({ collectTravelData: true, vehicle }); store.setMeta('profile', { ...store.profile(), vehicleUpdatedAt: new Date(Date.now() - 120000).toISOString() });
    const result = await request('/trips', 'user', draft()); expect(result.status).toBe(201); expect((await result.json()).fuelEstimate).toBeUndefined();
    expect((await (await request('/trips/statistics', 'user')).json()).week).toMatchObject({ pricedTripCount: 0, unpricedTripCount: 1 });
  });
});
