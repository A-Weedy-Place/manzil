import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Closure, PlanRequest, PlanResponse } from '../shared/types';
import { createApp } from '../server/app';
import { Store } from '../server/store';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const departureAt = '2027-01-15T11:00:00Z';
const body = { origin: { name: 'Lahore', coordinate: [74.35, 31.52] }, destination: { name: 'Karachi', coordinate: [67.01, 24.86] }, departureAt };
const empty: PlanResponse = { options: [], baseline: null, conflicts: [], warnings: [], evaluatedAt: departureAt, graphVersion: 'osrm', eventRevision: 0, source: 'osrm' };
async function setup(options: Parameters<typeof createApp>[1]) {
  const store = new Store(':memory:'); cleanup.push(() => store.close());
  const { app } = createApp(store, options);
  const server = await new Promise<Server>(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  return { store, url: `http://127.0.0.1:${address.port}/api` };
}
describe('asynchronous online API adapters', () => {
  it('awaits online place lookup and planning instead of serializing a promise', async () => {
    const places = [{ name: 'Lahore, Punjab, Pakistan', coordinate: [74.35, 31.52] as [number, number] }];
    const { url } = await setup({ places: async () => places, planner: async () => empty });
    expect(await (await fetch(`${url}/places?q=Lahore`)).json()).toEqual(places);
    expect(await (await fetch(`${url}/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()).toEqual(empty);
  });
  it('rechecks restrictions changed during an online request before responding', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const planner = vi.fn(async (_input: PlanRequest, _closures: Closure[], revision: number) => { if (revision === 0) await pending; return { ...empty, eventRevision: revision }; });
    const { store, url } = await setup({ planner });
    const request = fetch(`${url}/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    await vi.waitFor(() => expect(planner).toHaveBeenCalledTimes(1));
    store.saveClosure({ title: 'New closure', description: '', status: 'published', reason: 'construction', startsAt: departureAt, endsAt: null, geometry: { type: 'Polygon', coordinates: [[[74.35, 31.52], [74.351, 31.52], [74.351, 31.521], [74.35, 31.52]]] } });
    release();
    const response = await request;
    expect(response.status).toBe(200);
    expect((await response.json()).eventRevision).toBe(store.eventRevision);
    expect(planner).toHaveBeenCalledTimes(2);
  });
  it('returns 409 when both bounded online planning attempts are superseded', async () => {
    const planner = vi.fn(async (_input: PlanRequest, _closures: Closure[], revision: number) => {
      store.saveClosure({ title: `Changed during attempt ${revision}`, description: 'Offline test fixture', status: 'published', reason: 'construction',
        startsAt: departureAt, endsAt: null, geometry: { type: 'Polygon', coordinates: [[[74.35, 31.52], [74.351, 31.52], [74.351, 31.521], [74.35, 31.52]]] } });
      return { ...empty, eventRevision: revision };
    });
    const { store, url } = await setup({ planner });
    const response = await fetch(`${url}/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('changed') });
    expect(planner).toHaveBeenCalledTimes(2);
  });
});
