import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Store } from '../server/store';
import { AgentService } from '../server/agent';
import { agentConfig } from '../server/gemini';
import { prepareAgentProposals } from '../server/agent-proposals';
import { resolveAgentLocation } from '../server/agent-location';
import { eventWindow, PROVISIONAL_MS } from '../server/agent-evidence';
import { buildGraph } from '../server/routing/graph';
import { activeClosureRoads } from '../server/routing/closure-segments';
import { TransitService } from '../server/transit/service';
import { planTransitNotices, applyTransitChanges } from '../server/agent-transit';
import { agentResultKey, type AgentResult } from '../shared/agent';
import type { SourceNotice } from '../shared/types';
import { extraction, notice, now, claimInput, finished } from './agent-fixtures';
import { transitFixture } from './transit-fixture';

// Synthetic source/model responses; actual geometry tools, durable repository and Local evaluation.
const graph = buildGraph({elements:[
  ...[[73,33.7],[73.001,33.7],[73.002,33.7],[73.003,33.7],[73.001,33.701],[73.002,33.701]].map((p,i)=>({type:'node' as const,id:i+1,lon:p[0],lat:p[1]})),
  {type:'way',id:10,nodes:[1,2,3,4],tags:{highway:'residential',name:'Park Road'}},
  {type:'way',id:11,nodes:[2,5],tags:{highway:'residential',name:'First Road'}},
  {type:'way',id:12,nodes:[3,6],tags:{highway:'residential',name:'Second Road'}},
]},[72.99,33.69,73.01,33.71]);
const stores: Store[]=[];
const db=()=>{const value=new Store(':memory:');stores.push(value);return value;};
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);});
afterEach(()=>{stores.splice(0).forEach(store=>store.close());vi.useRealTimers();vi.restoreAllMocks();});
function current(text='Park Road in Islamabad is blocked from First Road to Second Road for VIP movement.') {
  const value=extraction();Object.assign(value.events[0],{quote:text,startsAt:null,endsAt:null,timeBasis:'unknown',confidence:.9,uncertainties:['Closure end time is not provided.']});
  return {value,post:notice({text})};
}
function save(store:Store,post:SourceNotice){const {id,revision,status,receivedAt,...source}=post;return store.upsertNotice(source).notice;}
const prepare:typeof prepareAgentProposals=(post,value,incidents)=>prepareAgentProposals(post,value,incidents,{resolve:event=>resolveAgentLocation(event,graph)});
const config={...agentConfig({}),enabled:true,autoPublish:true,apiKey:'synthetic-test-key'};

it('automatically persists a VIP road closure with real graph geometry and a 48-hour provisional window; repeat runs do not extend it',async()=>{
  const store=db(),input=current(),post=save(store,input.post),model=vi.fn(async()=>({extraction:input.value,usage:{inputTokens:100,outputTokens:20}}));
  const agent=new AgentService(store,config,model,undefined,prepare);await agent.run();
  const result=store.meta<AgentResult>(agentResultKey(post.id))!,closures=store.routingSnapshot().closures;
  expect(result.state).toBe('applied');expect(closures).toHaveLength(1);
  expect(closures[0]).toMatchObject({status:'published',restrictionType:'road_closure',agent:{expiryBasis:'provisional'}});
  expect(Date.parse(closures[0].endsAt!)-Date.parse(closures[0].startsAt)).toBe(48*3600_000);
  expect(activeClosureRoads(graph,closures,new Date(now).toISOString()).features.length).toBeGreaterThan(0);
  expect(result.proposals![0]).toMatchObject({state:'approved',decisionMode:'automatic'});
  await agent.run();expect(model).toHaveBeenCalledOnce();expect(store.routingSnapshot().closures[0].endsAt).toBe(closures[0].endsAt);
});
it('matches a later explicit road reopening without a model-supplied target ID and removes its routing effect',async()=>{
  const store=db(),input=current(),first=save(store,input.post);
  const model=vi.fn(async()=>({extraction:input.value,usage:{inputTokens:100,outputTokens:20}}));
  const agent=new AgentService(store,config,model,undefined,prepare);await agent.run();
  const old=store.routingSnapshot().closures[0];vi.setSystemTime(now+600_000);
  const text='Park Road in Islamabad is now open; traffic resumed.',value=extraction();
  Object.assign(value.events[0],{action:'reopening',impact:'unknown',quote:text,startsAt:null,endsAt:null,targetIncidentId:null});
  const post=save(store,notice({text,sourceId:'new-reopening',contentHash:'new-reopening',publishedAt:new Date(now+300_000).toISOString()}));
  model.mockResolvedValueOnce({extraction:value,usage:{inputTokens:100,outputTokens:20}});await agent.run();
  expect(store.meta<AgentResult>(agentResultKey(post.id))).toMatchObject({state:'applied',closureIds:[old.id]});
  expect(store.get('closure',old.id)).toMatchObject({id:old.id,status:'cancelled',revision:2});
  expect(activeClosureRoads(graph,store.routingSnapshot().closures,new Date(Date.now()).toISOString()).features).toEqual([]);
  expect(store.meta<AgentResult>(agentResultKey(first.id))?.closureIds).toEqual([old.id]);
});
it('reassesses saved pending work without another model request and cannot undo a concurrent administrator decision',async()=>{
  const store=db(),input=current(),post=save(store,input.post),claim=store.claimAgentWork(claimInput(post))!;
  store.completeAgentWork({noticeId:post.id,revision:1,claimId:claim.claimId,changes:[],result:{...finished(claim),extraction:input.value,
    proposals:await prepare(post,input.value,[])}});
  const model=vi.fn();await new AgentService(store,config,model,undefined,prepare).run();
  expect(model).not.toHaveBeenCalled();expect(store.meta<AgentResult>(agentResultKey(post.id))?.state).toBe('applied');
  expect(store.routingSnapshot().closures).toHaveLength(1);
  const result=store.meta<AgentResult>(agentResultKey(post.id))!;
  expect(store.completeAgentWork({noticeId:post.id,revision:1,claimId:claim.claimId,reassessmentFingerprint:'stale',changes:[],result})).toBe(false);
});
it('keeps rejected historical proposals intact during reassessment',async()=>{
  const store=db(),input=current(),post=save(store,input.post),claim=store.claimAgentWork(claimInput(post))!;
  const proposals=await prepare(post,input.value,[]);proposals[0].state='rejected';proposals[0].decisionMode='admin';
  store.completeAgentWork({noticeId:post.id,revision:1,claimId:claim.claimId,changes:[],result:{...finished(claim),extraction:input.value,proposals}});
  await new AgentService(store,config,vi.fn(),undefined,prepare).run();
  expect(store.routingSnapshot().closures).toEqual([]);
  expect(store.meta<AgentResult>(agentResultKey(post.id))?.proposals?.[0]).toEqual(proposals[0]);
});
it('expires stale evidence rather than starting another 48 hours from collection',()=>{
  const input=current();expect(PROVISIONAL_MS).toBe(48*3600_000);
  expect(()=>eventWindow(input.post,input.value.events[0],now+3*86400_000)).toThrow(/expired/);
});
it('does not activate an unspecified future VIP restriction or infer roads from movement alone',()=>{
  const input=current('VIP movement will start shortly and Park Road in Islamabad will close.');
  expect(()=>eventWindow(input.post,input.value.events[0],now)).toThrow(/unresolved/);
});
it('a clear Metro suspension changes Local availability for 48 hours and a later reopening restores it',async()=>{
  const data=transitFixture();Object.assign(data.routes[0],{shortName:'FRB-1',name:'Blue Line'});
  const input=current('Islamabad Blue Line service is suspended for VIP movement.');
  Object.assign(input.value.events[0],{kind:'transit',restrictionType:null,transit:{service:'Blue Line',city:'Islamabad',scope:'whole_service',direction:null,fromStop:null,toStop:null}});
  const plan=planTransitNotices(input.post,input.value,{revision:0,records:[]},{autoPublish:true,now,data});
  expect(plan.changes).toHaveLength(1);const store=db(),state=applyTransitChanges({revision:0,records:[]},plan.changes);store.setMeta('transit:disruptions',state);
  const local=new TransitService(store,()=>data);expect((await local.network(new Date(now).toISOString())).statuses[0].availability).toBe('suspended');
  expect((await local.network(new Date(now+3*86400_000).toISOString())).statuses[0].availability).toBe('available');
  const text='Islamabad Blue Line service has now resumed.';input.post.text=input.value.events[0].quote=text;
  input.post.publishedAt=new Date(now+300_000).toISOString();input.post.sourceId='metro-restored';Object.assign(input.value.events[0],{action:'reopening',impact:'unknown'});
  const restored=planTransitNotices(input.post,input.value,state,{autoPublish:true,now:now+600_000,data});expect(restored.changes).toHaveLength(1);
  store.setMeta('transit:disruptions',applyTransitChanges(state,restored.changes));
  expect((await local.network(new Date(now+600_000).toISOString())).statuses[0].availability).toBe('available');
  expect(store.routingSnapshot().closures).toEqual([]);
});
