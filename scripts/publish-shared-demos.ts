/** Explicit owner-authorized shared DEMO fixtures, never personal User 123 data. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Firestore } from 'firebase-admin/firestore';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { Store } from '../server/store.js';
import { demoCatalogue } from '../server/demos.js';
import { getRoutingGraph } from '../server/routing/index.js';
import { RoadCoverageProvider } from '../server/routing/road-coverage.js';
import { selectRoadPoint, selectRoadSection } from '../server/routing/road-selection.js';
import { drawingToPolygon } from '../server/geometry.js';
import { closureDraftSchema } from '../server/validation.js';
import { localTestClosureDrafts, LOCAL_TEST_CLOSURE_IDS } from './lib/local-test-closures.js';
import { localUpcomingClosureDrafts, LOCAL_UPCOMING_CLOSURE_IDS } from './lib/local-upcoming-closures.js';
import type { Closure } from '../shared/types.js';

const projectId='manzil-app-v1', hash=(value:string)=>createHash('sha256').update(value).digest('hex');
async function main(){
  if(process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Cloud demo import must not use an emulator.');
  if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw new Error('Use no arguments to preview or --apply to publish the labelled shared demo closures.');
  const apply=process.argv.includes('--apply'),now=Date.now(),graph=getRoutingGraph();if(!graph)throw new Error('Bundled roads unavailable.');
  const memory=new Store(':memory:'),coverage=new RoadCoverageProvider(()=>graph);
  const catalogue=await demoCatalogue(memory,graph,new Date(now).toISOString());memory.close();
  const drafts=[...localTestClosureDrafts(graph,catalogue,now),...localUpcomingClosureDrafts(catalogue,now)],ids=[...LOCAL_TEST_CLOSURE_IDS,...LOCAL_UPCOMING_CLOSURE_IDS];
  const closures:Closure[]=[];
  for(const [index,draft] of drafts.entries()){
    const points=draft.drawing!.coordinates;
    const scoped=await coverage.graphFor([points[0],points.at(-1)!]);
    // The old 26 Number illustration becomes a genuine nearby mapped road point.
    const section=ids[index].endsWith('26-number')?selectRoadPoint(scoped,[72.9350241,33.6330248]):selectRoadSection(scoped,points[0],points.at(-1)!);
    const canonical=closureDraftSchema.parse({...draft,title:draft.title.replace(/^Test\s*·\s*/, 'Demo · '),restrictionType:'road_closure',drawing:section.drawing,geometry:drawingToPolygon(section.drawing),
      description:`Synthetic shared demonstration restriction on mapped road geometry. Not a real traffic advisory. Admins can cancel this record in Blockades.\n${ids[index]}`});
    closures.push({...canonical,id:ids[index],demoData:true,moderation:'approved',author:{uid:'system:demo',displayName:'Manzil demo',role:'admin'},revision:1,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
  }
  console.log(JSON.stringify({projectId,apply,synthetic:true,personalData:false,closures:closures.map(({id,title,startsAt,endsAt,drawing})=>({id,title,startsAt,endsAt,points:drawing?.coordinates.length}))},null,2));
  if(!apply)return;
  const token=execFileSync('cmd.exe',['/d','/s','/c',`gcloud.cmd auth print-access-token --project=${projectId} --quiet`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const client=new OAuth2Client({quotaProjectId:projectId});client.setCredentials({access_token:token,expiry_date:Date.now()+25*60_000});
  const db=new Firestore({projectId,preferRest:true,auth:new GoogleAuth({authClient:client,projectId})});
  try{
    const root=db.collection('manzil').doc('v1'),meta=root.collection('meta'),marker=meta.doc(hash('demoScenario:shared-release:v1')),revision=meta.doc(hash('eventRevision'));
    const refs=closures.map(closure=>root.collection('closure').doc(hash(closure.id)));
    const result=await db.runTransaction(async tx=>{
      const [mark,rev,...old]=await tx.getAll(marker,revision,...refs);if(mark.exists)return{created:0,alreadySeeded:true};
      let created=0;
      for(const [index,closure]of closures.entries()){if(old[index].exists)continue;tx.create(refs[index],{json:JSON.stringify(closure),status:closure.status,updatedAt:closure.updatedAt});created++;}
      if(created)tx.set(revision,{json:JSON.stringify((rev.data()?.json?JSON.parse(rev.data()!.json):0)+1)});
      tx.create(marker,{json:JSON.stringify({synthetic:true,createdAt:new Date(now).toISOString(),closureIds:ids,created})});return{created,alreadySeeded:false};
    });console.log(JSON.stringify(result));
  }finally{client.setCredentials({});await db.terminate();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Shared demo import failed.');process.exitCode=1;});
