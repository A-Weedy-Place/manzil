import { describe, expect, it, vi } from 'vitest';
import type { Coordinate, PlanRequest, PlanResponse } from '../shared/types';
import { createJourneyPlanner, getRoutingGraph } from '../server/routing';
import { LocalRouter } from '../server/routing/engine';

const departureAt = '2027-01-15T11:00:00Z';
const place = (name: string, coordinate: Coordinate) => ({ name, coordinate });
const request: PlanRequest = { origin: place('Lahore', [74.3587, 31.5204]), destination: place('Karachi', [67.0011, 24.8607]), departureAt };
const result: PlanResponse = { options: [], baseline: null, conflicts: [], warnings: [], evaluatedAt: departureAt, graphVersion: 'test-online', eventRevision: 0, source: 'osrm' };

describe('Pakistan journey dispatch', () => {
  it('uses online routing for Pakistan cities beyond Islamabad and preserves ordered stops', async () => {
    const online = vi.fn(async () => result);
    const plan = createJourneyPlanner(new LocalRouter(getRoutingGraph()!), online);
    const withStops = { ...request, waypoints: [place('Multan', [71.5249, 30.1575]), place('Sukkur', [68.8574, 27.7244])] };
    expect(await plan(withStops, [], 12)).toBe(result);
    expect(online).toHaveBeenCalledWith(withStops, [], 12);
  });
  it('keeps covered Islamabad journeys local without making an online request', async () => {
    const online = vi.fn(async () => result);
    const local = new LocalRouter(getRoutingGraph()!);
    const localPlan = vi.spyOn(local, 'plan').mockReturnValue({ ...result, source: 'local-osm' });
    const input = { ...request, origin: place('Faisal Mosque', [73.0376503, 33.7314163]), destination: place('PIMS', [73.052076, 33.7060737]) };
    expect((await createJourneyPlanner(local, online)(input, [], 3)).source).toBe('local-osm');
    expect(localPlan).toHaveBeenCalledWith(input, [], 3);
    expect(online).not.toHaveBeenCalled();
  });
  it('allows Pakistan journeys when the optional Islamabad graph is missing', async () => {
    const online = vi.fn(async () => result);
    expect(await createJourneyPlanner(null, online)(request, [], 0)).toBe(result);
  });
  it.each(['origin', 'destination', 'waypoints'] as const)('rejects a foreign %s before contacting a provider', async field => {
    const online = vi.fn(async () => result);
    const foreign = place('Delhi', [77.209, 28.6139]);
    const input = { ...request, ...(field === 'waypoints' ? { waypoints: [foreign] } : { [field]: foreign }) };
    const response = await createJourneyPlanner(null, online)(input, [], 4);
    expect(response.options).toEqual([]);
    expect(response.unavailableReason).toContain('within Pakistan');
    expect(online).not.toHaveBeenCalled();
  });
});
