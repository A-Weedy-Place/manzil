import { afterEach,describe,expect,it } from 'vitest';
import type { Server } from 'node:http';
import { Store } from '../server/store';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { TransitService } from '../server/transit/service';
import { TRANSIT_AT,transitClosure,transitFixture } from './transit-fixture';
import type { TransitDisruption } from '../shared/transit';
const cleanup:(()=>void|Promise<void>)[]=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function setup(){
  const store=new Store(':memory:');cleanup.push(()=>store.close());store.setMeta('community:member:verified',{verified:true});
  const data=transitFixture(),transit=new TransitService(store,()=>data),config=readConfig({MANZIL_MODE:'emulator',FIREBASE_PROJECT_ID:'demo-transit-test',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8180',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9199'});
  const {app}=createApp(store,{config,transit,verifyToken:async token=>({uid:token,admin:token==='admin'}),planner:()=>({options:[],baseline:null,conflicts:[],warnings:[],evaluatedAt:TRANSIT_AT,graphVersion:'test',eventRevision:0,source:'local-osm'})});
  const server=await new Promise<Server>(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});cleanup.push(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
  const request=(path:string,token?:string,body?:unknown,method=body===undefined?'GET':'POST')=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return{store,data,transit,request};
}
const draft={routeId:'r1',title:'Metro suspension',description:'Manually reviewed public source',startsAt:TRANSIT_AT,endsAt:'2026-10-18T04:00:00Z',status:'published',sourceUrl:'https://example.test/service'};
describe('public local-bus API and durable service notices',()=>{
  it('returns public network and lightweight revision without timetable bulk or private profile data',async()=>{
    const {request}=await setup(),response=await request(`/transit/network?at=${TRANSIT_AT}`);expect(response.status).toBe(200);const network=await response.json();expect(network).toMatchObject({version:'test-public-v1',statuses:[{patternId:'p1',availability:'available',closureAssessment:'provided-shape'}]});expect(network.trips).toBeUndefined();expect(network.profile).toBeUndefined();
    expect(await(await request('/transit/revision')).json()).toEqual({version:'test-public-v1',eventRevision:0,disruptionRevision:0});
  });
  it('accepts public planning, rejects unknown fields/time-less dates and keeps future restrictions inactive',async()=>{
    const {data,request}=await setup(),body={origin:data.stops[0],destination:data.stops[2],departureAt:TRANSIT_AT};
    // Place inputs use only the Place contract, not arbitrary transit-stop fields.
    expect((await request('/transit/plan',undefined,body)).status).toBe(200);
    for(const patch of [{url:'https://example.test/'},{departureAt:'2026-10-18T08:00:00'},{waypoints:[]}])expect((await request('/transit/plan',undefined,{...body,...patch})).status).toBe(400);
    for(const query of ['?at=tomorrow','?at=x&at=y','?city=Lahore'])expect((await request('/transit/network'+query)).status).toBe(400);
    expect((await request('/transit/disruptions','verified',{...draft,startsAt:'2026-11-18T03:00:00Z',endsAt:'2026-11-18T04:00:00Z'})).status).toBe(201);
    expect((await(await request(`/transit/network?at=${TRANSIT_AT}`)).json()).statuses[0].availability).toBe('available');
    expect((await(await request('/transit/network?at=2026-11-18T03:30:00Z')).json()).statuses[0].availability).toBe('suspended');
  });
  it('enforces reviewer permission independently of UI and validates ordered segment references',async()=>{
    const {request}=await setup();expect((await request('/transit/disruptions',undefined,draft)).status).toBe(401);expect((await request('/transit/disruptions','ordinary',draft)).status).toBe(403);
    for(const patch of [{routeId:'unknown'},{directionId:'wrong'},{fromStopId:'b'},{fromStopId:'c',toStopId:'a'},{endsAt:TRANSIT_AT},{sourceUrl:'javascript:alert(1)'},{author:{uid:'admin'}}])expect((await request('/transit/disruptions','verified',{...draft,...patch})).status).toBe(400);
    expect((await request('/transit/disruptions','verified',{...draft,fromStopId:'b',toStopId:'c'})).status).toBe(201);
  });
  it('persists, edits and cancels notices atomically; stale revisions and another verified author cannot overwrite',async()=>{
    const {request,store}=await setup();store.setMeta('community:member:other',{verified:true});const created=await(await request('/transit/disruptions','verified',draft)).json() as TransitDisruption;
    const update={...draft,title:'Changed',revision:created.revision};expect((await request(`/transit/disruptions/${created.id}`,'other',update,'PUT')).status).toBe(403);
    const results=await Promise.all([request(`/transit/disruptions/${created.id}`,'verified',update,'PUT'),request(`/transit/disruptions/${created.id}`,'verified',update,'PUT')]);expect(results.map(result=>result.status).sort()).toEqual([200,409]);
    const cancelled=await request(`/transit/disruptions/${created.id}`,'admin',{...draft,status:'cancelled',revision:2},'PUT');expect(cancelled.status).toBe(200);
    expect(await(await request('/transit/revision')).json()).toMatchObject({disruptionRevision:3});expect((await(await request('/transit/disruptions')).json()).records).toEqual([]);
    expect((await(await request('/transit/disruptions','admin')).json()).records[0]).toMatchObject({status:'cancelled',revision:3,author:{uid:'verified'}});
  });
  it('marks published road overlap uncertain while pending reports remain invisible and do not affect buses',async()=>{
    const {store,request}=await setup(),closure=transitClosure();store.saveClosure({...closure,moderation:'pending'});
    expect((await(await request('/transit/network?at=2026-10-18T03:25:00Z')).json()).statuses[0]).toMatchObject({availability:'available',closureIds:[]});
    const approved=store.saveClosure(closure);const network=await(await request('/transit/network?at=2026-10-18T03:25:00Z')).json();expect(network.statuses[0]).toMatchObject({availability:'uncertain',closureIds:[approved.id]});
  });
});
