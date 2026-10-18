import { describe, expect, it, vi } from 'vitest';
import { resolveAgentLocation } from '../server/agent-location';
import { buildGraph } from '../server/routing/graph';
import type { Coordinate, Place } from '../shared/types';
import { extraction } from './agent-fixtures';

const cityGraph = () => buildGraph({ elements: [
  ...[[74.30,31.50],[74.301,31.50],[74.302,31.50],[74.301,31.501],[74.302,31.501]].map((p,i) => ({ type: 'node' as const, id: i + 1, lon: p[0], lat: p[1] })),
  { type: 'way', id: 10, nodes: [1,2,3], tags: { highway: 'residential', name: 'Park Road' } },
  { type: 'way', id: 11, nodes: [2,4], tags: { highway: 'residential', name: 'First Road' } },
  { type: 'way', id: 12, nodes: [3,5], tags: { highway: 'residential', name: 'Second Road' } },
] }, [74.29,31.49,74.31,31.51]);
const place = (name: string, coordinate: Coordinate, city = 'Lahore'): Place => ({ id: name, name: `${name}, ${city}, Pakistan`, coordinate });
function event() { const value = extraction().events[0]; value.location.city = 'Lahore'; return value; }

describe('agent mapping beyond the bundled road area', () => {
  it('projects a precise blockade onto the middle of a long one-way edge instead of requiring a nearby OSM node', async () => {
    const graph=buildGraph({elements:[{type:'node',id:1,lon:73,lat:33.7},{type:'node',id:2,lon:73.01,lat:33.7},
      {type:'way',id:10,nodes:[1,2],tags:{highway:'primary',name:'Park Road',oneway:'yes'}}]},[72.99,33.69,73.02,33.71]);
    const value=extraction().events[0];value.restrictionType='blockade';value.location={city:'Islamabad',road:'Park Road',point:'Town Hall',from:null,to:null};
    const result=await resolveAgentLocation(value,graph,async()=>[place('Town Hall',[73.005,33.7],'Islamabad')]);
    expect(result).toMatchObject({restrictionType:'blockade',drawing:{kind:'line',widthMeters:4}});
    expect(result.drawing.coordinates[0][0]).toBeCloseTo(73.005,5);
  });
  it('uses source city names to geocode road endpoints before requesting their real road graph', async () => {
    const lookup = vi.fn(async (query: string) => [query.startsWith('First Road') ? place('First Road', [74.301,31.5]) : place('Second Road', [74.302,31.5])]);
    const graphFor = vi.fn(async () => cityGraph());
    const result = await resolveAgentLocation(event(), undefined, lookup, graphFor);
    expect(lookup.mock.calls.map(([query]) => query)).toEqual(['First Road, Park Road, Lahore, Pakistan', 'Second Road, Park Road, Lahore, Pakistan']);
    expect(graphFor).toHaveBeenCalledExactlyOnceWith([[74.301,31.5],[74.302,31.5]]);
    expect(result.drawing.coordinates).toEqual([[74.301,31.5],[74.302,31.5]]);
    expect(result.key).toBe('lahore:parkroad:firstroad:secondroad');
  });

  it('retains legacy untyped named review pins in another city without accepting model coordinates', async () => {
    const value = event(); value.restrictionType = undefined; value.location.from = value.location.to = null; value.location.point = 'Town Hall';
    const lookup = vi.fn(async () => [place('Town Hall', [74.301,31.5001])]), graphFor = vi.fn(async () => cityGraph());
    const result = await resolveAgentLocation(value, undefined, lookup, graphFor);
    expect(result.drawing).toEqual({ kind: 'point', coordinates: [[74.301,31.5]], widthMeters: 14 });
    expect(lookup).toHaveBeenCalledWith('Town Hall, Park Road, Lahore, Pakistan');
  });

  it.each(['wrong-city', 'ambiguous', 'missing', 'wrong-name', 'outside-pakistan'] as const)('holds %s geocoding rather than selecting another city’s matching road', async kind => {
    const graphFor = vi.fn(async () => cityGraph());
    const lookup = async () => kind === 'missing' ? [] : kind === 'ambiguous' ? [place('First Road', [74.301,31.5]), place('First Road', [74.35,31.5])] :
      [place(kind === 'wrong-name' ? 'Other Road' : 'First Road', kind === 'outside-pakistan' ? [0,0] : [74.301,31.5], kind === 'wrong-city' ? 'Islamabad' : 'Lahore')];
    await expect(resolveAgentLocation(event(), undefined, lookup, graphFor)).rejects.toThrow(/unavailable or ambiguous/);
    expect(graphFor).not.toHaveBeenCalled();
  });

  it('retains exact announced road-name validation after a successful external graph lookup', async () => {
    const value = event(); value.location.road = 'Invented Road';
    const lookup = async (query: string) => [query.startsWith('First Road') ? place('First Road', [74.301,31.5]) : place('Second Road', [74.302,31.5])];
    await expect(resolveAgentLocation(value, undefined, lookup, async () => cityGraph())).rejects.toThrow(/could not be matched/);
  });

  it('keeps graph lookup failures explicit without inventing a corridor', async () => {
    const lookup = async (query: string) => [query.startsWith('First Road') ? place('First Road', [74.301,31.5]) : place('Second Road', [74.302,31.5])];
    await expect(resolveAgentLocation(event(), undefined, lookup, async () => { throw new Error('Road provider temporarily unavailable.'); })).rejects.toThrow('Road provider temporarily unavailable.');
  });

  it.each([null, 'Lahore and Multan'])('requires a single supplied city without restricting it to Islamabad: %s', async city => {
    const value = event(); value.location.city = city; const lookup = vi.fn(), graphFor = vi.fn();
    await expect(resolveAgentLocation(value, undefined, lookup, graphFor)).rejects.toThrow(/one city/);
    expect(lookup).not.toHaveBeenCalled(); expect(graphFor).not.toHaveBeenCalled();
  });
});
