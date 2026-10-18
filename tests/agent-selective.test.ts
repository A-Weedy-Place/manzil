import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentService } from '../server/agent';
import { agentConfig } from '../server/gemini';
import { Store } from '../server/store';
import { prepareAgentProposals } from '../server/agent-proposals';
import { applyTransitChanges, planTransitNotices, resolveTransitNotice } from '../server/agent-transit';
import { TransitService } from '../server/transit/service';
import { planTransit } from '../server/transit/planner';
import { sourceSupportsInstant } from '../server/agent-time';
import { agentResultKey, type AgentExtraction, type AgentResult } from '../shared/agent';
import type { TransitDisruptionState } from '../shared/transit';
import { claimInput, extraction, finished, location, notice, now } from './agent-fixtures';
import { transitFixture } from './transit-fixture';
import { pipelineCounts } from '../src/lib/pipeline';
import { agentBlockade, locationName } from '../server/agent-location';
import { buildGraph } from '../server/routing/graph';

const stores: Store[] = [];
const db = () => { const store = new Store(':memory:');stores.push(store);return store; };
afterEach(()=>{stores.splice(0).forEach(store=>store.close());vi.useRealTimers();vi.restoreAllMocks();});
const data = () => { const value=transitFixture();value.routes[0].name='Blue Line';value.routes[0].shortName='FRB-1';return value; };
const metro = () => {
  const value=extraction(),event=value.events[0];
  Object.assign(event,{kind:'transit',restrictionType:null,transit:{service:'Blue Line',city:'Islamabad',direction:null,fromStop:null,toStop:null,scope:'whole_service'},
    title:'Blue Line suspension',location:{city:'Islamabad',road:null,from:null,to:null,point:null},startsAt:'2026-10-18T19:00:00+05:00',endsAt:'2026-10-18T20:00:00+05:00',timeBasis:'explicit',quote:'18/10/26 Islamabad Blue Line service suspended from 7 to 8 p.m.'});
  return value;
};
const metroNotice = () => notice({text:metro().events[0].quote,publishedAt:'2026-10-18T10:00:00Z'});
const metroNow=Date.parse('2026-10-18T12:00:00Z');
const transitPlan = (value=metro(),post=metroNotice(),state:TransitDisruptionState={revision:0,records:[]}) => planTransitNotices(post,value,state,{autoPublish:true,now:metroNow,data:data()});

describe('selective publication',()=>{
  it('publishes one clear road event while keeping another in review, atomically and without repeat generations',async()=>{
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);vi.spyOn(console,'log').mockImplementation(()=>{});
    const store=db(),{id,revision,status,receivedAt,...input}=notice(),post=store.upsertNotice(input).notice;
    const value=extraction();value.events.push({...value.events[0],title:'Uncertain extent',confidence:.7,uncertainties:['Exact extent unknown.']});
    const model=vi.fn(async()=>({extraction:value,usage:{inputTokens:100,outputTokens:20}}));
    const prepare:typeof prepareAgentProposals=(post,value,incidents)=>prepareAgentProposals(post,value,incidents,{resolve:async()=>location(),now});
    const service=new AgentService(store,{...agentConfig({}),enabled:true,autoPublish:true,apiKey:'offline-test'},model,undefined,prepare);
    await service.run();const result=store.meta<AgentResult>(agentResultKey(post.id))!;
    expect(result.state).toBe('review');expect(result.closureIds).toHaveLength(1);
    expect(result.proposals?.map(item=>[item.state,item.decisionMode])).toEqual([['approved','automatic'],['pending',undefined]]);
    expect(store.routingSnapshot().closures).toHaveLength(1);expect(pipelineCounts([store.getNotice(post.id)!],[result])).toMatchObject({review:1,changed:1});
    await service.run();expect(model).toHaveBeenCalledOnce();
  });
  it('counts individual undecided events across road and service proposals',()=>{
    const result={noticeId:notice().id,noticeRevision:1,state:'review',closureIds:[],transitIds:['saved-service'],proposals:[{state:'pending',kind:'road'},{state:'pending',kind:'transit'},{state:'approved',kind:'transit'}]} as unknown as AgentResult;
    expect(pipelineCounts([notice()],[result])).toMatchObject({review:2,drafts:2,changed:1});
  });
  it('builds a transverse blockade on a simple road, but refuses a junction or divided carriageway',()=>{
    const graph=buildGraph({elements:[{type:'node',id:1,lon:73,lat:33.7},{type:'node',id:2,lon:73.002,lat:33.7},{type:'way',id:1,nodes:[1,2],tags:{highway:'residential',name:'Park Road'}}]},[72.99,33.69,73.01,33.71]);
    const drawing=agentBlockade(graph,[73.001,33.7],locationName('Park Road'));expect(drawing).toMatchObject({kind:'line',widthMeters:4});expect(drawing.coordinates).toHaveLength(2);expect(Math.abs(drawing.coordinates[0][0]-drawing.coordinates[1][0])).toBeLessThan(1e-8);
    graph.edges=graph.edges.filter(edge=>edge.from===0);expect(()=>agentBlockade(graph,[73.001,33.7],locationName('Park Road'))).toThrow(/carriageway/);
  });
});

describe('source-grounded Metro notices',()=>{
  it('recognizes dated PKT ranges with shared p.m. and publishes a matched service, never a road closure',()=>{
    const result=transitPlan();expect(result.proposals[0].issues).toEqual([]);expect(result.changes).toHaveLength(1);
    expect(result.changes[0].draft).toMatchObject({routeId:'r1',startsAt:'2026-10-18T19:00:00+05:00',endsAt:'2026-10-18T20:00:00+05:00'});
    expect(sourceSupportsInstant(metro().events[0].quote,'2026-10-18T19:00:00+05:00',metroNotice().publishedAt!)).toBe(true);
  });
  it.each(['ambiguous_service','no_end','invented_time','unknown_scope','omitted_partial_extent','uncertain','tentative','image','false_city','wrong_date'])('retains %s in review',kind=>{
    const value=metro(),post=metroNotice(),event=value.events[0];
    if(kind==='ambiguous_service'){event.transit!.service='Metro';post.text=event.quote='18/10/26 Islamabad Metro service suspended from 7 to 8 pm.';}
    if(kind==='no_end')event.endsAt=null;
    if(kind==='invented_time')event.endsAt='2026-10-18T21:00:00+05:00';
    if(kind==='unknown_scope')event.transit!.scope='unknown';
    if(kind==='omitted_partial_extent')post.text=event.quote='18/10/26 Islamabad Blue Line service suspended between Alpha and Bravo from 7 pm to 8 pm.';
    if(kind==='uncertain')event.confidence=.94;
    if(kind==='tentative')post.text=event.quote='18/10/26 Islamabad Blue Line may be suspended from 7 to 8 pm.';
    if(kind==='image')event.imageIndex=0;
    if(kind==='false_city')event.transit!.city='Rawalpindi';
    if(kind==='wrong_date')event.startsAt='2026-10-19T19:00:00+05:00';
    const result=transitPlan(value,post);expect(result.changes).toEqual([]);expect(result.proposals[0].state).toBe('pending');expect(result.proposals[0].issues.length).toBeGreaterThan(0);
  });
  it('maps partial suspensions in stop order without suspending the reverse direction',()=>{
    const value=metro();value.events[0].transit={...value.events[0].transit!,scope:'segment',fromStop:'Alpha',toStop:'Bravo'};value.events[0].quote+=' between Alpha and Bravo';
    expect(resolveTransitNotice(value.events[0],data())).toMatchObject({fromStopId:'a',toStopId:'b'});
    value.events[0].transit!.fromStop='Charlie';value.events[0].quote+=' Charlie';expect(()=>resolveTransitNotice(value.events[0],data())).toThrow(/order/);
  });
  it('represents service families explicitly rather than suspending unrelated lines',()=>{
    const dataset=data();dataset.routes=[...dataset.routes,...['RLRT01','RLRT03','RLRT04'].map((shortName,index)=>({...dataset.routes[0],id:'red'+index,shortName,name:shortName}))];
    const event=metro().events[0];event.transit!.service='Red Line';event.quote='Today Islamabad Red Line service suspended from 7 pm to 8 pm.';
    expect(resolveTransitNotice(event,dataset)).toMatchObject({routeId:'red0',routeIds:['red0','red1','red2']});
  });
  it('coalesces later evidence and respects retained administrator cancellations',()=>{
    const first=transitPlan(),state=applyTransitChanges({revision:0,records:[]},first.changes),post=metroNotice();post.publishedAt='2026-10-18T11:00:00Z';
    expect(transitPlan(metro(),post,state).changes[0].id).toBe(first.changes[0].id);
    state.records[0].agent!.overridden=true;state.records[0].status='cancelled';expect(transitPlan(metro(),post,state).changes).toEqual([]);
  });
  it('commits service status with result/history and defers concurrent admin edits',async()=>{
    const store=db(),{id,revision,status,receivedAt,...input}=metroNotice(),post=store.upsertNotice(input).notice,claim=store.claimAgentWork(claimInput(post))!,plan=transitPlan();
    const completion={noticeId:post.id,revision:1,claimId:claim.claimId,changes:[],transitChanges:plan.changes,expectedTransitRevision:0,result:{...finished(claim,'applied'),extraction:metro(),proposals:plan.proposals,transitIds:plan.changes.map(item=>item.id)}};
    expect(store.completeAgentWork(completion)).toBe(true);expect(store.meta<TransitDisruptionState>('transit:disruptions')?.records).toHaveLength(1);
    const service=new TransitService(store,data);expect((await service.network('2026-10-18T14:30:00Z')).statuses[0].availability).toBe('suspended');expect((await service.network('2026-10-18T15:00:00Z')).statuses[0].availability).toBe('available');
    expect((await service.network('2026-10-18T13:59:00Z')).statuses[0].availability).toBe('available');
    const next=store.upsertNotice({...input,sourceId:'second-source',contentHash:'second'}).notice,nextClaim=store.claimAgentWork(claimInput(next))!;
    expect(store.completeAgentWork({...completion,noticeId:next.id,claimId:nextClaim.claimId})).toBe(true);
    const saved=store.meta<AgentResult>(agentResultKey(next.id))!;expect(saved).toMatchObject({state:'review',transitIds:[]});expect(saved.proposals![0].state).toBe('pending');
  });
  it('excludes a scheduled ride only during its service suspension',()=>{
    const dataset=data(),alert=applyTransitChanges({revision:0,records:[]},transitPlan().changes).records[0];
    const request={origin:{name:'Alpha',coordinate:dataset.stops[0].coordinate},destination:{name:'Charlie',coordinate:dataset.stops[2].coordinate},departureAt:'2026-10-18T03:00:00Z'};
    expect(planTransit(dataset,request,[],[alert],0,1).options.length).toBeGreaterThan(0);
    alert.startsAt='2026-10-18T03:00:00Z';alert.endsAt='2026-10-18T04:00:00Z';expect(planTransit(dataset,request,[],[alert],0,1).options).toEqual([]);
  });
  it('restores only a matched service at a past evidenced reopening time and blocks future or mismatched manual decisions',()=>{
    const state=applyTransitChanges({revision:0,records:[]},transitPlan().changes),value=metro(),event=value.events[0];
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(Date.parse('2026-10-18T14:30:00Z'));
    Object.assign(event,{action:'reopening',impact:'unknown',startsAt:'2026-10-18T19:15:00+05:00',endsAt:null,quote:'18/10/26 Islamabad Blue Line service now restored at 7:15 pm.'});
    const source=notice({sourceId:'restore-source',text:event.quote,publishedAt:'2026-10-18T14:15:00Z'});
    expect(planTransitNotices(source,value,state,{autoPublish:true,data:data()}).changes[0].draft.status).toBe('cancelled');
    const plan=planTransitNotices(source,value,state,{autoPublish:false,data:data()}),proposal=plan.proposals[0];
    expect(proposal.transitDraft?.startsAt).toBe(event.startsAt);
    const store=db(),{id,revision,status,receivedAt,...input}=source,post=store.upsertNotice(input).notice,claim=store.claimAgentWork(claimInput(post))!;
    store.setMeta('transit:disruptions',state);store.completeAgentWork({noticeId:post.id,revision:1,claimId:claim.claimId,changes:[],result:{...finished(claim),extraction:value,proposals:plan.proposals}});
    const transitDraft={routeId:'r1',title:event.title,description:'Reviewed restoration',startsAt:event.startsAt!,endsAt:state.records[0].endsAt,status:'cancelled' as const};
    const review={noticeId:post.id,noticeRevision:1,index:0,version:proposal.version,decision:'approve' as const,reviewer:{uid:'fixture-admin',displayName:'Fixture',role:'admin' as const},transitDraft};
    expect(()=>store.reviewAgentProposal({...review,transitDraft:{...transitDraft,startsAt:'2026-10-18T14:45:00Z'}})).toThrow(/future/);
    expect(()=>store.reviewAgentProposal({...review,transitDraft:{...transitDraft,routeId:'other-service'}})).toThrow(/unchanged service/);
    const decision=store.reviewAgentProposal(review);expect(decision.transit).toMatchObject({status:'cancelled',startsAt:state.records[0].startsAt,agent:{overridden:true,locationKey:'transit:r1:*:*:*'}});
    event.startsAt=null;expect(planTransitNotices(source,value,state,{autoPublish:false,data:data()}).proposals[0].transitDraft?.startsAt).toBeUndefined();
  });
});
