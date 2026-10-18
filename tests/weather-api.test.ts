import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { Store } from '../server/store';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { parseWeatherResponse, WeatherService } from '../server/weather';
import type { Trip, TripDraft } from '../shared/types';

const NOW = Date.parse('2026-10-18T07:35:00Z'), HOUR = 3600_000;
const cleanup: (() => void | Promise<void>)[] = [];
beforeEach(() => { vi.useFakeTimers({ toFake:['Date'] }); vi.setSystemTime(NOW); });
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks(); vi.useRealTimers(); });
function dataset() {
  const first = Math.floor(NOW/HOUR)*HOUR - HOUR;
  return parseWeatherResponse({latitude:33.7,longitude:73.06,utc_offset_seconds:0,hourly_units:{time:'unixtime',temperature_2m:'°C'},
    hourly:{time:[first/1000,(first+HOUR)/1000,(first+2*HOUR)/1000],temperature_2m:[22,24,26],weather_code:[0,2,61],is_day:[1,1,1]}},NOW);
}
const draft = (name = 'A to B'): TripDraft => ({ name, startedAt:'2026-10-18T07:30:00Z', endedAt:'2026-10-18T07:30:30Z',contributeToRoadDiscovery:false,
  points:[{coordinate:[73.04,33.7],timestamp:'2026-10-18T07:30:00Z',accuracy:8},{coordinate:[73.041,33.7],timestamp:'2026-10-18T07:30:30Z',accuracy:8}] });
async function setup(scoped = false) {
  const store = new Store(':memory:'); cleanup.push(() => store.close());
  const alice = scoped ? new Store(':memory:') : store, bob = scoped ? new Store(':memory:') : store;
  if (scoped) { cleanup.push(() => alice.close(), () => bob.close()); vi.spyOn(store,'forUser').mockImplementation(uid => uid === 'alice' ? alice : uid === 'bob' ? bob : store); }
  const collector = vi.fn(async () => dataset()), weather = new WeatherService(store,collector);
  const config = readConfig({MANZIL_MODE:'emulator',FIREBASE_PROJECT_ID:'demo-weather-test',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8180',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9199'});
  const {app} = createApp(store,{weather,config,verifyToken:async token=>({uid:token,admin:false}),planner:()=>({options:[],baseline:null,conflicts:[],warnings:[],evaluatedAt:new Date().toISOString(),graphVersion:'fixture',eventRevision:0,source:'local-osm'})});
  const server = await new Promise<Server>(resolve => {const result=app.listen(0,'127.0.0.1',()=>resolve(result));});
  cleanup.push(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const base = `http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
  const request = (path:string,token?:string,body?:unknown,method=body===undefined?'GET':'POST')=>fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {store,alice,bob,request,collector,weather};
}

describe('weather API and private saved snapshots',()=>{
  it('serves fixed Islamabad weather publicly with exact PKT-hour matching and no arbitrary locations or query injection',async()=>{
    const {request,collector}=await setup();
    const result=await request('/weather?at=2026-10-18T12%3A59%3A00%2B05%3A00'); expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({location:'Islamabad',state:'fresh',at:'2026-10-18T07:59:00.000Z',reading:{at:'2026-10-18T07:00:00.000Z',temperatureC:24,weatherCode:2,coordinate:[73.0479,33.6844]}});
    for (const query of ['?latitude=33','?city=Lahore','?at=tomorrow','?at=2026-10-18T12:00:00','?at=x&at=y','?url=https://untrusted.test']) expect((await request(`/weather${query}`)).status).toBe(400);
    expect((await request('/WeAtHeR/')).status).toBe(200); expect(collector).toHaveBeenCalledTimes(1);
    expect(await (await request('/weather?at=2026-11-18T07:00:00Z')).json()).toMatchObject({state:'unavailable',reading:null}); expect(collector).toHaveBeenCalledTimes(1);
  });
  it('never waits for upstream while saving a trip or retrieving app state and never accepts client-supplied weather',async()=>{
    const {store,request,collector,weather}=await setup(); store.updateProfile({collectTravelData:true});
    const get=vi.spyOn(weather,'get');
    expect((await request('/state')).status).toBe(200);
    expect((await request('/trips','alice',{...draft(),weather:dataset().readings[1]})).status).toBe(400);
    const saved=await request('/trips','alice',draft()); expect(saved.status).toBe(201); expect((await saved.json()).weather).toBeUndefined();
    expect(collector).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    expect((await request('/trips',undefined,draft())).status).toBe(401);
  });
  it('persists only the departure-hour city snapshot and preserves it through edits, summaries and later forecast updates',async()=>{
    const {store,request,collector,weather}=await setup(); store.updateProfile({collectTravelData:true}); await weather.check();
    const saved=await (await request('/trips','alice',draft())).json() as Trip;
    expect(saved.weather).toMatchObject({at:'2026-10-18T07:00:00.000Z',temperatureC:24,coordinate:[73.0479,33.6844]});
    const original=saved.weather; collector.mockResolvedValue({...dataset(),readings:dataset().readings.map(item=>({...item,temperatureC:40}))});
    vi.setSystemTime(NOW+HOUR); await weather.check();
    expect((await (await request(`/trips/${saved.id}`,'alice')).json()).weather).toEqual(original);
    expect((await (await request('/trips','alice')).json())[0].weather).toEqual(original);
    expect((await (await request(`/trips/${saved.id}`,'alice',{name:'Renamed journey'},'PATCH')).json()).weather).toEqual(original);
    expect((await request(`/trips/${saved.id}`,'alice',{weather:original},'PATCH')).status).toBe(400);
  });
  it('leaves out-of-city, uncovered, future and legacy trips unpriced by weather instead of backfilling current conditions',async()=>{
    const {store,request,weather}=await setup(); store.updateProfile({collectTravelData:true}); await weather.check();
    const outside=draft(); outside.points=outside.points.map(point=>({...point,coordinate:[74.3+(point.coordinate[0]-73.04),31.5]}));
    expect((await (await request('/trips','alice',outside)).json()).weather).toBeUndefined();
    const old=draft(); old.startedAt='2026-10-10T07:30:00Z';old.endedAt='2026-10-10T07:30:30Z';old.points=old.points.map((point,i)=>({...point,timestamp:i?old.endedAt:old.startedAt}));
    expect((await (await request('/trips','alice',old)).json()).weather).toBeUndefined();
    const future=draft();future.startedAt='2026-10-18T08:30:00Z';future.endedAt='2026-10-18T08:30:30Z';future.points=future.points.map((point,i)=>({...point,timestamp:i?future.endedAt:future.startedAt}));
    expect((await (await request('/trips','alice',future)).json()).weather).toBeUndefined();
  });
  it('rechecks consent atomically after awaiting cached weather and does not persist a forbidden snapshot',async()=>{
    const {store,request,weather}=await setup();store.updateProfile({collectTravelData:true});await weather.check();
    vi.spyOn(weather,'snapshot').mockImplementation(async()=>{store.updateProfile({collectTravelData:false});return dataset().readings[1];});
    expect((await request('/trips','alice',draft())).status).toBe(403); expect(store.list('trip')).toEqual([]);
  });
  it('retains the correct authenticated private scope through overlapping cached-weather awaits',async()=>{
    const {store,alice,bob,request,weather}=await setup(true);alice.updateProfile({collectTravelData:true});bob.updateProfile({collectTravelData:true});await weather.check();
    const original=weather.snapshot.bind(weather); const releases:(()=>void)[]=[];
    vi.spyOn(weather,'snapshot').mockImplementation(async(at,coordinate)=>{await new Promise<void>(resolve=>releases.push(resolve));return original(at,coordinate);});
    const first=request('/trips','alice',draft('Alice route')),second=request('/trips','bob',draft('Bob route'));
    await vi.waitFor(()=>expect(releases).toHaveLength(2));releases.reverse().forEach(release=>release());
    expect((await first).status).toBe(201);expect((await second).status).toBe(201);
    expect(alice.list<Trip>('trip').map(item=>item.name)).toEqual(['Alice route']);expect(bob.list<Trip>('trip').map(item=>item.name)).toEqual(['Bob route']);expect(store.list('trip')).toEqual([]);
  });
});
