import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { ClosureDraft, Drawing, GraphStatus } from '../shared/types';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { Store } from '../server/store';
import { buildGraph } from '../server/routing/graph';
import { drawingToPolygon } from '../server/geometry';
import { closureDraftSchema } from '../server/validation';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async()=>{for(const action of cleanup.splice(0).reverse())await action();});
const drawing: Drawing = {kind:'line',coordinates:[[73.001,33.6999],[73.001,33.7001]],widthMeters:4};
const draft: ClosureDraft = {restrictionType:'blockade',title:'Main Road barrier',description:'Temporary lane barrier',reason:'construction',startsAt:'2027-01-01T10:00:00Z',endsAt:null,status:'published',drawing,geometry:drawingToPolygon(drawing)};
function graphFixture() {
  return buildGraph({elements:[
    {type:'node',id:1,lon:73,lat:33.7},{type:'node',id:2,lon:73.002,lat:33.7},
    {type:'node',id:3,lon:73,lat:33.705},{type:'node',id:4,lon:73.002,lat:33.705},
    {type:'way',id:10,nodes:[1,2],tags:{highway:'residential',name:'Main Road'}},
    {type:'way',id:11,nodes:[3,4],tags:{highway:'service',name:'Private Road',access:'private'}},
  ]},[72.99,33.69,73.01,33.71]);
}
async function setup(available = true) {
  const store=new Store(':memory:');cleanup.push(()=>store.close());
  store.setMeta('community:member:reviewer',{verified:true});
  const graph=graphFixture();
  const graphStatus:GraphStatus={ready:available,source:'fixture',version:'fixture',nodeCount:graph.nodes.length,edgeCount:graph.edges.length,importedAt:null,bounds:graph.bounds,limitations:[]};
  const {app}=createApp(store,{config:readConfig({MANZIL_MODE:'emulator',FIREBASE_PROJECT_ID:'demo-blockade-test',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8180',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9199'}),verifyToken:async uid=>({uid,admin:uid==='admin'}),roadGraph:()=>available?graph:null,graph:()=>graphStatus});
  const server=await new Promise<Server>(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  cleanup.push(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
  const request=(path:string,token?:string,body?:unknown,method=body===undefined?'GET':'POST')=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {store,request};
}

describe('short transverse blockade API contract',()=>{
  it('previews the exact two-point line publicly and rejects forged scopes or unsupported geometry',async()=>{
    const {request}=await setup();
    const from=drawing.coordinates[0],to=drawing.coordinates[1];
    const preview=await request('/roads/blockade',undefined,{from,to});
    expect(preview.status).toBe(200);expect(await preview.json()).toMatchObject({drawing,roadNames:['Main Road']});
    expect((await request('/roads/blockade',undefined,{from,to,admin:true})).status).toBe(400);
    expect((await request('/roads/blockade',undefined,{from:[73.001,33.699],to:[73.001,33.701]})).status).toBe(422);
    expect((await request('/roads/blockade',undefined,{from:[73.0009,33.7],to:[73.0011,33.7]})).status).toBe(422);
    expect((await request('/roads/blockade',undefined,{from:[73.001,33.7049],to:[73.001,33.7051]})).status).toBe(422);
    expect((await request('/roads/blockade',undefined,{from:[74,34],to:[74,34.0001]})).status).toBe(503);
  });
  it('keeps approved blockades in the exact selected scope and ordinary reports private until reviewed',async()=>{
    const {request}=await setup();
    expect((await request('/closures',undefined,draft)).status).toBe(401);
    const create=await request('/closures','alice',draft);expect(create.status).toBe(201);const pending=await create.json();
    expect(pending).toMatchObject({restrictionType:'blockade',status:'draft',moderation:'pending',drawing,geometry:draft.geometry});
    expect((await (await request('/state')).json()).closures).toEqual([]);
    expect((await request(`/closures/${pending.id}/review`,'reviewer',{revision:pending.revision,decision:'approve'})).status).toBe(200);
    expect((await (await request('/state')).json()).closures).toEqual([expect.objectContaining({id:pending.id,status:'published',restrictionType:'blockade',geometry:draft.geometry})]);
  });
  it('rejects shape inflation, extra endpoints and invalid widths before saving or updating',async()=>{
    const {request,store}=await setup();
    const wrongGeometry=drawingToPolygon({...drawing,widthMeters:50});
    for(const invalid of [
      {...draft,geometry:wrongGeometry},
      {...draft,drawing:{...drawing,widthMeters:14}},
      {...draft,drawing:{...drawing,coordinates:[...drawing.coordinates,[73.0011,33.7001]]}},
      {...draft,drawing:undefined},
    ]) expect((await request('/closures','admin',invalid)).status).toBe(400);
    const offroad={...drawing,coordinates:[[73.001,33.7049],[73.001,33.7051]] as [number,number][]};
    expect((await request('/closures','admin',{...draft,drawing:offroad,geometry:drawingToPolygon(offroad)})).status).toBe(422);
    expect(store.list('closure')).toHaveLength(0);
    const saved=await (await request('/closures','admin',draft)).json();
    // Older clients cannot omit the type to replace a short blockade with a larger area.
    const {restrictionType:_,...legacyBody}=draft;
    expect((await request(`/closures/${saved.id}`,'admin',{...legacyBody,geometry:wrongGeometry,revision:saved.revision},'PUT')).status).toBe(400);
    expect((await request(`/closures/${saved.id}`,'admin',{...draft,title:'Revised',revision:saved.revision},'PUT')).status).toBe(200);
  });
  it('rejects malformed stored pending blockades on approval but still permits rejection',async()=>{
    const {request,store}=await setup();
    const malformed=store.saveClosure({...draft,geometry:drawingToPolygon({...drawing,widthMeters:50}),status:'draft',moderation:'pending',author:{uid:'alice',displayName:'Alice',role:'user'}});
    expect((await request(`/closures/${malformed.id}/review`,'reviewer',{revision:malformed.revision,decision:'approve'})).status).toBe(400);
    expect((await request(`/closures/${malformed.id}/review`,'reviewer',{revision:malformed.revision,decision:'reject'})).status).toBe(200);
    expect((await (await request('/state')).json()).closures).toEqual([]);
  });
  it('returns unavailable without a road graph instead of inventing a blockade location',async()=>{
    const {request}=await setup(false);
    expect((await request('/roads/blockade',undefined,{from:drawing.coordinates[0],to:drawing.coordinates[1]})).status).toBe(503);
    expect((await request('/closures','admin',draft)).status).toBe(503);
  });
  it('preserves legacy areas but enforces canonical geometry for explicit road closures',()=>{
    const legacy={...draft,restrictionType:undefined,drawing:undefined};
    expect(closureDraftSchema.safeParse(legacy).success).toBe(true);
    expect(closureDraftSchema.safeParse({...draft,restrictionType:'road_closure'}).success).toBe(true);
    expect(closureDraftSchema.safeParse({...draft,restrictionType:'road_closure',geometry:drawingToPolygon({...drawing,widthMeters:14})}).success).toBe(false);
  });
});
