import { afterEach, expect, it, vi } from 'vitest';
import { request as httpRequest, type Server } from 'node:http';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { createAgentDispatch } from '../server/agent-dispatch';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { Store } from '../server/store';
import { AgentService } from '../server/agent';
import { agentConfig } from '../server/gemini';
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); vi.restoreAllMocks(); });
const origin = 'https://manzil-source-worker-abc-as.a.run.app';
const env = { NODE_ENV:'production',FIREBASE_PROJECT_ID:'manzil-fixture',ALLOWED_HOSTS:'api.example.test',ALLOWED_ORIGINS:'https://app.example.test' };
async function server(options: Parameters<typeof createApp>[1]) {
  const store = new Store(':memory:'); cleanup.push(() => store.close());
  const {app} = createApp(store,options);
  const listener = await new Promise<Server>(resolve => { const value=app.listen(0,'127.0.0.1',()=>resolve(value)); });
  cleanup.push(() => new Promise<void>(resolve=>{listener.closeAllConnections();listener.close(()=>resolve());}));
  const base='http://127.0.0.1:'+(listener.address() as {port:number}).port;
  return { store,request:(path:string,token?:string,body?:unknown)=>new Promise<Response>((resolve,reject)=>{
    const value=httpRequest(base+path,{method:body===undefined?'GET':'POST',headers:{Host:'api.example.test','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},response=>{
      const chunks:Buffer[]=[]; response.on('data',chunk=>chunks.push(Buffer.from(chunk))); response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode}))); });
    value.on('error',reject); value.end(body===undefined?undefined:JSON.stringify(body));
  }) };
}
it('dispatches only a fixed agent job using its own audience-specific identity and bounded timeout',async()=>{
  const request=vi.fn(async()=>({data:{processed:2}}));
  const getIdTokenClient=vi.fn(async()=>({request}));
  const run=createAgentDispatch(origin,{getIdTokenClient} as unknown as GoogleAuth);
  expect(await run()).toEqual({processed:2}); await run();
  expect(getIdTokenClient).toHaveBeenCalledExactlyOnceWith(origin);
  expect(request).toHaveBeenCalledWith({url:origin+'/internal/tick',method:'POST',data:{job:'agent'},timeout:140000,retry:false,maxContentLength:80000});
});
it('sanitizes dispatch errors rather than exposing credentials or transport payloads',async()=>{
  const run=createAgentDispatch(origin,{getIdTokenClient:async()=>{throw Error('private-token-do-not-display');}} as unknown as GoogleAuth);
  await expect(run()).rejects.toMatchObject({status:503});
  await expect(run()).rejects.not.toThrow('private-token-do-not-display');
});
it('allows admin production analysis without placing a model key in the API and denies guest/user/override bodies',async()=>{
  const dispatch=vi.fn(async()=>({processed:0}));
  const {request}=await server({config:readConfig({...env,AGENT_WORKER_URL:origin}),dispatchAgent:dispatch,
    verifyToken:async token=>({uid:token,admin:token==='admin'})});
  expect((await request('/api/agent/run',undefined,{})).status).toBe(401);
  expect((await request('/api/agent/run','user',{})).status).toBe(403);
  expect((await request('/api/agent/run','admin',{url:'https://attacker.invalid'})).status).toBe(400);
  expect((await request('/api/agent/run','admin',{})).status).toBe(200);
  expect(dispatch).toHaveBeenCalledOnce();
  expect(await (await request('/api/agent/status','admin')).json()).toMatchObject({canRunHere:true,execution:'private_worker'});
});
it('restricts the API workload identity to analysis jobs and keeps scheduler/foreign-token checks intact',async()=>{
  let email='manzil-api@manzil-fixture.iam.gserviceaccount.com';
  const verify=vi.spyOn(OAuth2Client.prototype,'verifyIdToken').mockImplementation(async()=>({getPayload:()=>({email,email_verified:true})}) as any);
  const fixture = new Store(':memory:'); cleanup.push(()=>fixture.close());
  const agent=new AgentService(fixture,{...agentConfig({}),enabled:false}); const run=vi.spyOn(agent,'run').mockResolvedValue({processed:0});
  const {request}=await server({config:readConfig({...env,MANZIL_SERVICE_ROLE:'worker',WORKER_AUDIENCE:origin,
    WORKER_SERVICE_ACCOUNT_EMAIL:'scheduler@manzil-fixture.iam.gserviceaccount.com',WORKER_MANUAL_SERVICE_ACCOUNT_EMAIL:email,WORKER_ALLOWED_JOBS:'source,agent'}),agent});
  expect((await request('/internal/tick','workload-token',{job:'source'})).status).toBe(403);
  expect((await request('/internal/tick','workload-token',{job:'agent'})).status).toBe(200); expect(run).toHaveBeenCalledOnce();
  expect(verify).toHaveBeenCalledWith({idToken:'workload-token',audience:origin});
  email='foreign@manzil-fixture.iam.gserviceaccount.com';
  expect((await request('/internal/tick','workload-token',{job:'agent'})).status).toBe(403);
  email='scheduler@manzil-fixture.iam.gserviceaccount.com';
  expect((await request('/internal/tick','workload-token',{job:'source'})).status).toBe(200);
});
