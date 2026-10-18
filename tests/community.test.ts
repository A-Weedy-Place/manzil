import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { Closure, ClosureDraft, GraphStatus } from '../shared/types';
import { createApp } from '../server/app';
import { readConfig } from '../server/config';
import { Store } from '../server/store';
import { photoSchema } from '../server/validation';
import { authenticateToken, directoryEntry, type DirectoryUser } from '../server/community';
import type { Repository } from '../server/repository';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const run of cleanup.splice(0).reverse()) await run(); });
const graph: GraphStatus = { ready: false, source: 'fixture', version: 'fixture', nodeCount: 0, edgeCount: 0, importedAt: null, bounds: [72,33,74,35], limitations: [] };
const draft: ClosureDraft = { title: 'Kaghan Road', description: 'Construction at the junction', reason: 'construction', startsAt: '2027-01-01T10:00:00Z', endsAt: null, status: 'published',
  geometry: { type: 'Polygon', coordinates: [[[73.04,33.7],[73.041,33.7],[73.041,33.701],[73.04,33.7]]] } };
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/cB8AAAAASUVORK5CYII=';
async function setup() {
  const store = new Store(':memory:'); cleanup.push(() => store.close());
  const users: DirectoryUser[] = ['alice','bob','reviewer','admin'].map(uid => ({ uid, email: `${uid}@example.test`, disabled: false, customClaims: { admin: uid === 'admin' } }));
  store.setMeta('community:member:reviewer', { verified: true });
  const directory = { listUsers: vi.fn(async (_limit: number, _token?: string) => ({ users, pageToken: 'next-page' })),
    getUser: vi.fn(async (uid: string) => { const user = users.find(item => item.uid === uid); if (!user) throw {code:'auth/user-not-found'}; return user; }),
    setCustomUserClaims: vi.fn(async (uid: string, claims: Record<string,unknown> | null) => { const user = users.find(item => item.uid === uid); if (!user) throw {code:'auth/user-not-found'}; user.customClaims = claims ?? {}; }) };
  const { app } = createApp(store, { graph: () => graph, config: readConfig({ MANZIL_MODE:'emulator', FIREBASE_PROJECT_ID:'demo-community-test', FIRESTORE_EMULATOR_HOST:'127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9199' }),
    verifyToken: async token => { const user = users.find(item => item.uid === token); if (!user) throw new Error(); return { uid: user.uid, admin: user.customClaims?.admin === true }; }, userDirectory: directory });
  const server = await new Promise<Server>(resolve => { const server = app.listen(0,'127.0.0.1',() => resolve(server)); });
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const base = `http://127.0.0.1:${(server.address() as { port:number }).port}/api`;
  const request = (path:string, token?:string, body?:unknown, method = body === undefined ? 'GET' : 'POST') => fetch(`${base}${path}`, { method,
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { store, request, directory, users };
}
describe('community reports and trusted membership', () => {
  it('keeps normal reports pending/private, strips spoofed authorship and photos from state, and publishes after review', async () => {
    const { request, store } = await setup();
    const result = await request('/closures','alice',{ ...draft, photos:[photo], moderation:'approved', author:{uid:'admin',displayName:'Fake',role:'admin'} });
    expect(result.status).toBe(201); const report = await result.json() as Closure;
    expect(report).toMatchObject({ status:'draft', moderation:'pending', author:{uid:'alice',role:'user'}, photos:[photo] });
    expect((await store.routingSnapshot()).closures).toEqual([]);
    expect((await (await request('/state')).json()).closures).toEqual([]);
    expect((await (await request('/state','bob')).json()).closures).toEqual([]);
    expect((await request(`/closures/${report.id}`,'bob')).status).toBe(404);
    const own = (await (await request('/state','alice')).json()).closures[0];
    expect(own.photoCount).toBe(1); expect(own).not.toHaveProperty('photos');
    expect((await (await request(`/closures/${report.id}`,'reviewer')).json()).photos).toEqual([photo]);
    expect((await request(`/closures/${report.id}/review`,'alice',{revision:report.revision,decision:'approve'})).status).toBe(403);
    const approved = await request(`/closures/${report.id}/review`,'reviewer',{revision:report.revision,decision:'approve'});
    expect(approved.status).toBe(200); expect(await approved.json()).toMatchObject({status:'published',moderation:'approved',reviewedBy:{uid:'reviewer',role:'verified'}});
    expect((await (await request('/state')).json()).closures).toHaveLength(1);
    expect((await request(`/closures/${report.id}/review`,'admin',{revision:report.revision,decision:'reject'})).status).toBe(409);
    expect((await request(`/closures/${report.id}`,'alice',{...draft,revision:2},'PUT')).status).toBe(403);
  });
  it('enforces fresh verification on every request without letting admin fields grant roles', async () => {
    const { request, directory } = await setup();
    expect((await request('/admin/users','alice')).status).toBe(403);
    expect((await request('/admin/users')).status).toBe(401);
    const listing = await (await request('/admin/users?pageToken=previous','admin')).json();
    expect(directory.listUsers).toHaveBeenCalledWith(50,'previous'); expect(listing.nextPageToken).toBe('next-page');
    expect(listing.users.find((user:{uid:string}) => user.uid === 'reviewer')).toMatchObject({role:'verified',verified:true});
    expect((await request('/admin/users/alice','admin',{verified:true,admin:true},'PATCH')).status).toBe(400);
    expect((await request('/admin/users/admin','admin',{verified:false},'PATCH')).status).toBe(409);
    expect((await request('/admin/users/alice','admin',{verified:true},'PATCH')).status).toBe(200);
    expect((await (await request('/state','alice')).json()).membership).toMatchObject({uid:'alice',role:'verified'});
    const approved = await (await request('/closures','alice',draft)).json(); expect(approved.status).toBe('published');
    expect((await request('/admin/users/alice','admin',{verified:false},'PATCH')).status).toBe(200);
    const pending = await (await request('/closures','alice',draft)).json(); expect(pending.status).toBe('draft');
    expect((await request('/ADMIN/users/alice/','bob',{verified:true},'PATCH')).status).toBe(403);
  });
  it('reports unavailable account service separately from missing users and leaves verification unchanged', async () => {
    const { request, directory, store } = await setup();
    directory.listUsers.mockRejectedValueOnce({code:'auth/insufficient-permission'});
    expect((await request('/admin/users','admin')).status).toBe(503);
    directory.getUser.mockRejectedValueOnce({code:'auth/user-not-found'});
    expect((await request('/admin/users/missing','admin',{verified:true},'PATCH')).status).toBe(404);
    directory.getUser.mockRejectedValueOnce({code:'auth/insufficient-permission'});
    expect((await request('/admin/users/alice','admin',{verified:true},'PATCH')).status).toBe(503);
    expect(store.meta('community:member:alice')).toBeUndefined();
  });
  it('allows reviewer/admin corrections without publishing pending reports and rejects stale review decisions', async () => {
    const { request, store } = await setup();
    const report = await (await request('/closures','alice',draft)).json();
    expect((await request(`/closures/${report.id}`,'bob',{...draft,revision:1},'PUT')).status).toBe(403);
    const reviewer = await request(`/closures/${report.id}`,'reviewer',{...draft,title:'Reviewer correction',revision:1,author:{uid:'reviewer'},moderation:'approved'},'PUT');
    expect(reviewer.status).toBe(200); expect(await reviewer.json()).toMatchObject({status:'draft',moderation:'pending',revision:2,title:'Reviewer correction',author:report.author});
    expect((await store.routingSnapshot()).closures).toEqual([]);
    expect((await request(`/closures/${report.id}/review`,'reviewer',{revision:1,decision:'approve'})).status).toBe(409);
    const administrator = await request(`/closures/${report.id}`,'admin',{...draft,title:'Administrator correction',revision:2},'PUT');
    expect(administrator.status).toBe(200); expect(await administrator.json()).toMatchObject({status:'draft',moderation:'pending',revision:3,author:report.author});
    expect((await (await request('/state')).json()).closures).toEqual([]);
    expect((await request(`/closures/${report.id}`,'alice',{...draft,revision:2},'PUT')).status).toBe(409);
    const own = await (await request(`/closures/${report.id}`,'alice',{...draft,title:'Owner correction',revision:3},'PUT')).json();
    expect(own).toMatchObject({status:'draft',moderation:'pending',revision:4,author:report.author});
    const rejected = await request(`/closures/${report.id}/review`,'reviewer',{revision:4,decision:'reject'}); expect(rejected.status).toBe(200);
    expect((await (await request('/state')).json()).closures).toEqual([]);
    expect((await request(`/closures/${report.id}`,'alice',{...draft,revision:5},'PUT')).status).toBe(403);
    expect((await request(`/closures/${report.id}`,'reviewer',{...draft,revision:5},'PUT')).status).toBe(403);
    expect((await request(`/closures/${report.id}`,'admin',{...draft,status:'draft',revision:5},'PUT')).status).toBe(200);
  });
  it('lets verified contributors move or cancel another author’s public restriction while keeping attribution and current authority', async () => {
    const { request, store } = await setup();
    const report = await (await request('/closures','admin',{...draft,photos:[photo]})).json() as Closure;
    const moved = {type:'Polygon',coordinates:[[[73.043,33.7],[73.044,33.7],[73.044,33.701],[73.043,33.7]]]} as const;
    expect((await request(`/closures/${report.id}`,'alice',{...draft,geometry:moved,revision:1},'PUT')).status).toBe(403);
    const update = await request(`/closures/${report.id}`,'reviewer',{...draft,title:'Moved restriction',geometry:moved,revision:1},'PUT');
    expect(update.status).toBe(200); expect(await update.json()).toMatchObject({status:'published',moderation:'approved',revision:2,author:report.author,photos:[photo],geometry:moved});
    expect((await store.routingSnapshot()).closures.find(item=>item.id===report.id)).toMatchObject({revision:2,title:'Moved restriction',geometry:moved});
    expect((await request(`/closures/${report.id}`,'reviewer',{...draft,revision:1},'PUT')).status).toBe(409);
    expect((await request('/admin/users/reviewer','admin',{verified:false},'PATCH')).status).toBe(200);
    expect((await request(`/closures/${report.id}`,'reviewer',undefined,'DELETE')).status).toBe(403);
    expect((await request('/admin/users/reviewer','admin',{verified:true},'PATCH')).status).toBe(200);
    const cancelled = await request(`/closures/${report.id}`,'reviewer',undefined,'DELETE');
    expect(cancelled.status).toBe(200); expect(await cancelled.json()).toMatchObject({status:'cancelled',revision:3,author:report.author});
    expect((await store.routingSnapshot()).closures).toEqual([]);
  });
  it('lets reviewers cancel a private pending report without making it public or granting ordinary cross-owner access', async () => {
    const {request,store}=await setup();
    const report=await(await request('/closures','alice',draft)).json() as Closure;
    expect((await request(`/closures/${report.id}`,'bob',undefined,'DELETE')).status).toBe(403);
    const cancelled=await request(`/closures/${report.id}`,'reviewer',undefined,'DELETE');
    expect(cancelled.status).toBe(200); expect(await cancelled.json()).toMatchObject({status:'cancelled',moderation:'pending',revision:2,author:report.author});
    expect((await store.routingSnapshot()).closures).toEqual([]);
    expect((await request(`/closures/${report.id}/review`,'admin',{revision:2,decision:'approve'})).status).toBe(409);
  });
  it('keeps single-user SQLite profile contents out of every other account’s admin directory projection', async () => {
    const {request,store}=await setup();
    store.updateProfile({displayName:'Private local name',city:'Islamabad',location:'Private neighbourhood',collectTravelData:true,
      photoDataUrl:photo,vehicle:{kind:'car',fuelType:'petrol',label:'Private car',kmPerLitre:12}});
    const directory=await(await request('/admin/users','admin')).json();
    expect(directory.users).toHaveLength(4);
    for(const user of directory.users){
      expect(user.travelDataSharing).toBeNull(); expect(user).not.toHaveProperty('city');
      expect(JSON.stringify(user)).not.toMatch(/Private local name|Private neighbourhood|Private car|photoDataUrl|collectTravelData|kmPerLitre/);
    }
  });
  it('keeps consent unknown if the scoped profile projection fails instead of creating or reading a full personal profile', async () => {
    const scoped = {meta:vi.fn(async()=>{throw new Error('Temporary profile read failure');}),profile:vi.fn()};
    const root = {backend:'firestore',meta:vi.fn(async()=>undefined),forUser:vi.fn(()=>scoped)};
    const entry=await directoryEntry(root as unknown as Repository,{uid:'directory-only',displayName:'Auth fallback',email:'directory@example.test',disabled:false});
    expect(entry).toMatchObject({uid:'directory-only',displayName:'Auth fallback',travelDataSharing:null});
    expect(entry).not.toHaveProperty('city'); expect(root.forUser).toHaveBeenCalledExactlyOnceWith('directory-only');
    expect(scoped.meta).toHaveBeenCalledExactlyOnceWith('profile'); expect(scoped.profile).not.toHaveBeenCalled();
  });
  it('rejects forged or oversized image data and never accepts role fields in profile', async () => {
    const { request } = await setup();
    expect(photoSchema.safeParse(photo).success).toBe(true);
    for (const invalid of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,aGVsbG8=',`data:image/png;base64,${Buffer.alloc(150001).toString('base64')}`]) {
      expect((await request('/closures','alice',{...draft,photos:[invalid]})).status).toBe(400);
    }
    expect((await request('/closures','alice',{...draft,photos:Array(6).fill(photo)})).status).toBe(201);
    expect((await request('/closures','alice',{...draft,photos:Array(7).fill(photo)})).status).toBe(400);
    const largePng = Buffer.alloc(100_000); Buffer.from(photo.split(',')[1],'base64').copy(largePng);
    const largePhoto = `data:image/png;base64,${largePng.toString('base64')}`;
    expect(photoSchema.safeParse(largePhoto).success).toBe(true);
    expect((await request('/closures','alice',{...draft,photos:Array(6).fill(largePhoto)})).status).toBe(400);
    expect((await request('/profile','alice',{verified:true},'PATCH')).status).toBe(400);
  });
  it('allows admin grants and revocations while preserving unrelated claims and retained verification', async () => {
    const { request, directory, users, store } = await setup();
    users.find(user => user.uid === 'alice')!.customClaims = { subscription: 'trial', feature: ['maps'] };
    store.setMeta('community:member:alice', { verified: true });
    expect((await request('/admin/users/alice','bob',{admin:true},'PATCH')).status).toBe(403);
    const promoted = await request('/admin/users/alice','admin',{admin:true},'PATCH');
    expect(promoted.status).toBe(200); expect(await promoted.json()).toMatchObject({uid:'alice',role:'admin',verified:true});
    expect(directory.setCustomUserClaims).toHaveBeenCalledWith('alice',{subscription:'trial',feature:['maps'],admin:true});
    expect((await request('/admin/users','alice')).status).toBe(200);
    const demoted = await request('/admin/users/alice','admin',{admin:false},'PATCH');
    expect(demoted.status).toBe(200); expect(await demoted.json()).toMatchObject({uid:'alice',role:'verified',verified:true});
    expect(directory.setCustomUserClaims).toHaveBeenLastCalledWith('alice',{subscription:'trial',feature:['maps']});
    expect((await request('/admin/users','alice')).status).toBe(403);
    expect((await request('/admin/users/admin','admin',{admin:false},'PATCH')).status).toBe(409);
    expect((await request('/admin/users/alice','admin',{admin:true,verified:true},'PATCH')).status).toBe(400);
    expect((await request('/profile','alice',{admin:true},'PATCH')).status).toBe(400);
  });
  it('fails closed when the account service cannot change roles or the acting admin has been revoked', async () => {
    const { request, directory, users } = await setup();
    directory.setCustomUserClaims.mockRejectedValueOnce({code:'auth/insufficient-permission'});
    expect((await request('/admin/users/alice','admin',{admin:true},'PATCH')).status).toBe(503);
    expect(users.find(user => user.uid === 'alice')?.customClaims?.admin).toBe(false);
    const get = directory.getUser.getMockImplementation()!;
    directory.getUser.mockImplementationOnce(async uid => ({...await get(uid),customClaims:{admin:false}}));
    expect((await request('/admin/users/alice','admin',{verified:true},'PATCH')).status).toBe(403);
    expect(directory.setCustomUserClaims).toHaveBeenCalledTimes(1);
  });
  it('prevents disabled account promotion and verification', async () => {
    const { request, users, directory } = await setup();
    users.find(user => user.uid === 'alice')!.disabled = true;
    expect((await request('/admin/users/alice','admin',{admin:true},'PATCH')).status).toBe(409);
    expect((await request('/admin/users/alice','admin',{verified:true},'PATCH')).status).toBe(409);
    expect(directory.setCustomUserClaims).not.toHaveBeenCalled();
  });
  it('rechecks queued admin writes so cross-demotion cannot revoke both administrators', async () => {
    const { request, users } = await setup();
    users.find(user => user.uid === 'alice')!.customClaims = {admin:true};
    const results = await Promise.all([
      request('/admin/users/alice','admin',{admin:false},'PATCH'),
      request('/admin/users/admin','alice',{admin:false},'PATCH'),
    ]);
    expect(results.map(result=>result.status).sort()).toEqual([200,403]);
    expect(users.filter(user=>user.customClaims?.admin===true)).toHaveLength(1);
  });
  it('resolves current Auth claims rather than granting an old token continued administrator access', async () => {
    const getUser = vi.fn(async () => ({uid:'person',disabled:false,customClaims:{admin:false},displayName:'Sara'}));
    const authority = {verifyIdToken:vi.fn(async () => ({uid:'person',admin:true,name:'Old name'})),getUser};
    expect(await authenticateToken(authority,'old-admin-token')).toEqual({uid:'person',admin:false,name:'Sara'});
    getUser.mockResolvedValueOnce({uid:'person',disabled:false,customClaims:{admin:true},displayName:'Sara'});
    expect((await authenticateToken(authority,'same-token')).admin).toBe(true);
    getUser.mockResolvedValueOnce({uid:'person',disabled:true,customClaims:{admin:true},displayName:'Sara'});
    await expect(authenticateToken(authority,'disabled-token')).rejects.toThrow('Account disabled.');
    expect(authority.verifyIdToken).toHaveBeenCalledWith('old-admin-token',true);
  });
  it('requires collection consent for trip writes and opt-out disables route learning while preserving history', async () => {
    const { request, store } = await setup();
    const start = Date.now() - 60000;
    const trip = {name:'Private trip',startedAt:new Date(start).toISOString(),endedAt:new Date(start+30000).toISOString(),contributeToRoadDiscovery:false,
      points:[{coordinate:[73.04,33.7],timestamp:new Date(start).toISOString(),accuracy:8},{coordinate:[73.041,33.7],timestamp:new Date(start+30000).toISOString(),accuracy:8}]};
    expect((await request('/trips','alice',trip)).status).toBe(403);
    expect((await request('/profile','alice',{inferFrequentRoutes:true},'PATCH')).status).toBe(400);
    expect((await request('/profile','alice',{collectTravelData:true,inferFrequentRoutes:true,city:'Islamabad',location:'F-8',photoDataUrl:photo},'PATCH')).status).toBe(200);
    expect((await request('/trips','alice',trip)).status).toBe(201);
    expect((await request('/profile','alice',{collectTravelData:false},'PATCH')).status).toBe(200);
    expect(store.profile()).toMatchObject({collectTravelData:false,inferFrequentRoutes:false});
    expect(store.list('trip')).toHaveLength(1); expect((await request('/trips','alice',trip)).status).toBe(403);
  });
  it('atomically rechecks consent before saving after an earlier profile read', async () => {
    const { request, store } = await setup(); store.updateProfile({collectTravelData:true});
    const save = vi.spyOn(store,'saveTripIfConsented');
    save.mockImplementation(trip => { store.updateProfile({collectTravelData:false}); return Store.prototype.saveTripIfConsented.call(store,trip); });
    const start = Date.now()-60000;
    const result = await request('/trips','alice',{name:'Race fixture',startedAt:new Date(start).toISOString(),endedAt:new Date(start+30000).toISOString(),contributeToRoadDiscovery:false,
      points:[{coordinate:[73.04,33.7],timestamp:new Date(start).toISOString(),accuracy:8},{coordinate:[73.041,33.7],timestamp:new Date(start+30000).toISOString(),accuracy:8}]});
    expect(result.status).toBe(403); expect(store.list('trip')).toEqual([]);
  });
});
