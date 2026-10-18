import { disruptionCoversRoute } from '../../shared/transit.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Closure, ClosureAuthor } from '../../shared/types.js';
import type { TransitDataset, TransitDisruption, TransitDisruptionDraft, TransitDisruptionState, TransitNetwork, TransitPattern, TransitPlanRequest } from '../../shared/transit.js';
import type { Repository } from '../repository.js';
import { HttpError } from '../errors.js';
import { instantSchema, placeSchema } from '../validation.js';
import { loadTransitDataset } from './dataset.js';
import { lineHitsClosure, overlap, publishedClosures } from './geometry.js';
import { planTransit, transitPlanningLimits } from './planner.js';

export const transitPlanSchema=z.object({origin:placeSchema.strict(),destination:placeSchema.strict(),departureAt:instantSchema}).strict();
export const transitDisruptionSchema=z.object({routeId:z.string().min(1).max(160),routeIds:z.array(z.string().min(1).max(160)).min(1).max(8).optional(),directionId:z.string().max(30).optional(),fromStopId:z.string().max(160).optional(),toStopId:z.string().max(160).optional(),title:z.string().trim().min(1).max(160),description:z.string().trim().max(1000),startsAt:instantSchema,endsAt:instantSchema,status:z.enum(['published','cancelled']),sourceUrl:z.string().url().max(1500).refine(value=>['http:','https:'].includes(new URL(value).protocol)).optional()}).strict().superRefine((value,context)=>{if(Date.parse(value.endsAt)<=Date.parse(value.startsAt))context.addIssue({code:'custom',path:['endsAt'],message:'End must follow start.'});if(!!value.fromStopId!==!!value.toStopId)context.addIssue({code:'custom',path:['fromStopId'],message:'Choose both segment endpoints or neither.'});});
export const transitDisruptionUpdateSchema=z.object({...transitDisruptionSchema.shape,revision:z.number().int().positive()}).strict().superRefine((value,context)=>{const {revision:_revision,...draft}=value,result=transitDisruptionSchema.safeParse(draft);if(!result.success)for(const issue of result.error.issues)context.addIssue({code:'custom',path:issue.path,message:issue.message});});

const publicPatterns=new WeakMap<TransitDataset,TransitPattern[]>();
/** Geometry is precomputed once. Avoid sending backend pair paths as a second
 * and third copy of the same city-wide coordinates on every Local refresh. */
function mapPatterns(data:TransitDataset):TransitPattern[]{
  let patterns=publicPatterns.get(data);if(patterns)return patterns;
  patterns=data.patterns.map(pattern=>{
    const {roadSegments:_pairs,stopDistancesMeters:_distances,...visible}=pattern;
    if(pattern.geometryQuality==='road-aligned-estimate'&&visible.geometrySegments?.length===1&&JSON.stringify(visible.geometrySegments[0])===JSON.stringify(visible.geometry))delete visible.geometrySegments;
    return visible;
  });publicPatterns.set(data,patterns);return patterns;
}

export class TransitService {
  constructor(private store:Repository,private data:()=>TransitDataset|null=loadTransitDataset){}
  async disruptions():Promise<TransitDisruptionState>{return await this.store.meta<TransitDisruptionState>('transit:disruptions')??{revision:0,records:[]};}
  async revision(){const [revision,state]=await Promise.all([this.store.meta<number>('eventRevision'),this.disruptions()]);return{version:this.data()?.version??'unavailable',eventRevision:revision??0,disruptionRevision:state.revision};}
  async network(at:string):Promise<TransitNetwork>{
    const [snapshot,state]=await Promise.all([this.store.routingSnapshot(),this.disruptions()]),data=this.data(),instant=Date.parse(at),closures=publishedClosures(snapshot.closures),alerts=state.records.filter(alert=>alert.status==='published');
    const result:TransitNetwork={version:data?.version??'unavailable',importedAt:data?.importedAt??null,evaluatedAt:at,eventRevision:snapshot.revision,disruptionRevision:state.revision,sources:data?.sources??[],routes:data?.routes??[],stops:data?.stops??[],patterns:data?mapPatterns(data):[],statuses:[],disruptions:alerts,limitations:[...(data?.limitations??[]),'Walking links are straight-line estimates, not pedestrian navigation.','Grey road-affected bus lines are uncertain; only a service notice confirms suspension.','No live bus locations. Source-interpreted service notices are not an operator live feed.'],...(!data?{unavailableReason:'Local bus data is unavailable. No fallback network is presented as real service.'}:{})};
    result.statuses=data?.patterns.map(pattern=>{
      // A schematic chord can establish only a conservative risk, never an exact
      // road closure or clearance. It is still grey/excluded when that risk hits.
      const hits:Closure[]=closures.filter(closure=>overlap(closure.startsAt,closure.endsAt,instant)&&(pattern.geometrySegments??[pattern.geometry]).some(line=>lineHitsClosure(line,closure)));
      // Stop order scopes an undirected partial notice to the matching direction,
      // consistently with the planner; sharing both stops alone is insufficient.
      const relevant=alerts.filter(alert=>disruptionCoversRoute(alert,pattern.routeId)&&(alert.directionId===undefined||alert.directionId===pattern.directionId)&&overlap(alert.startsAt,alert.endsAt,instant)&&(!alert.fromStopId||pattern.stopIds.indexOf(alert.fromStopId)>=0&&pattern.stopIds.indexOf(alert.toStopId!)>pattern.stopIds.indexOf(alert.fromStopId)));
      return{patternId:pattern.id,availability:relevant.length?'suspended':hits.length||pattern.routingUnavailableReason?'uncertain':'available',closureIds:hits.map(closure=>closure.id),disruptionIds:relevant.map(alert=>alert.id),closureAssessment:pattern.geometryQuality==='stops-only'?'unavailable':pattern.geometryQuality};
    })??[];
    return result;
  }
  async plan(request:TransitPlanRequest){
    const [snapshot,state]=await Promise.all([this.store.routingSnapshot(),this.disruptions()]);
    const result=planTransit(this.data(),request,snapshot.closures,state.records,snapshot.revision,state.revision);
    const [latest,alerts]=await Promise.all([this.store.routingSnapshot(),this.disruptions()]);
    if(latest.revision!==snapshot.revision||alerts.revision!==state.revision)throw new HttpError(409,'Road or bus restrictions changed while planning. Find local routes again.');
    return result;
  }
  async save(draft:TransitDisruptionDraft,author:ClosureAuthor,existingId?:string,revision?:number):Promise<TransitDisruption>{
    if(author.role!=='verified'&&author.role!=='admin')throw new HttpError(403,'A verified contributor or administrator must publish bus service notices.');
    validateTransitDraft(draft,this.data());
    const now=new Date().toISOString(),recordId=existingId??randomUUID();let saved:TransitDisruption|undefined;
    await this.store.updateTransitDisruptions(current=>{
      const old=current.records.find(record=>record.id===recordId);
      if(existingId&&!old)throw new HttpError(404,'Bus service notice not found.');
      if(old&&author.role!=='admin'&&old.author.uid!==author.uid)throw new HttpError(403,'Only the author or an administrator can edit this bus notice.');
      if(old&&revision!==old.revision)throw new HttpError(409,'This bus notice changed. Reload it before saving.');
      if(!old&&current.records.length>=100)throw new HttpError(409,'The bus-notice store has reached its 100-record limit. Ask an administrator to archive old notices.');
      saved={...draft,...(old?.agent?{agent:{...old.agent,overridden:true}}:{}),id:recordId,revision:(old?.revision??0)+1,author:old?.author??author,createdAt:old?.createdAt??now,updatedAt:now};
      return{revision:current.revision+1,records:[...current.records.filter(record=>record.id!==recordId),saved]};
    });
    return saved!;
  }
}
export { transitPlanningLimits };

/** The API and the agent use the same catalogue/ordered-stop validation. */
export function validateTransitDraft(draft:TransitDisruptionDraft,data:TransitDataset|null=loadTransitDataset()) {
  transitDisruptionSchema.parse(draft);
  if(!data)throw new HttpError(503,'Load public bus data before publishing a service notice.');
  const ids=draft.routeIds??[draft.routeId];
  if(!ids.includes(draft.routeId)||new Set(ids).size!==ids.length||ids.some(id=>!data.routes.some(route=>route.id===id)))throw new HttpError(400,'Choose known local routes.');
  if(ids.length>1&&(draft.directionId!==undefined||draft.fromStopId))throw new HttpError(400,'Multi-route notices must cover the whole service.');
  const patterns=data.patterns.filter(pattern=>ids.includes(pattern.routeId)&&(draft.directionId===undefined||pattern.directionId===draft.directionId));
  if(draft.directionId!==undefined&&!patterns.length)throw new HttpError(400,'Choose a known direction.');
  if(draft.fromStopId&&!patterns.some(pattern=>pattern.stopIds.indexOf(draft.fromStopId!)>=0&&pattern.stopIds.indexOf(draft.toStopId!)>pattern.stopIds.indexOf(draft.fromStopId!)))throw new HttpError(400,'Select ordered stops from one route direction.');
}
