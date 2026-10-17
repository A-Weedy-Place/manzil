import { createHash } from 'node:crypto';
import type { Closure, Place } from '../../shared/types.js';
import type { TransitCalendar, TransitDataset, TransitDisruption, TransitJourney, TransitLeg, TransitPattern, TransitPlanRequest, TransitPlanResponse, TransitRideLeg, TransitStop, TransitTrip, TransitWalkLeg } from '../../shared/transit.js';
import { distanceMeters } from '../geometry.js';
import { hasGap, lineDistance, lineHitsClosure, overlap, publishedClosures, sliceShape, stopDistances } from './geometry.js';

const DAY=86400_000, PKT=5*3600_000, MAX_ACCESS=1000, MAX_TRANSFER=250, WALK_SPEED=1.25, MAX_WAIT=90*60_000, MAX_JOURNEY=4*3600_000;
export const transitPlanningLimits={maxAccessWalkMeters:MAX_ACCESS,maxTransferWalkMeters:MAX_TRANSFER,maxTransfers:2,maxWaitMinutes:90,maxJourneyHours:4,walkingSpeedMetersPerSecond:WALK_SPEED};
export function calendarRuns(calendar:TransitCalendar,date:string):boolean {
  const exception=calendar.exceptions.find(item=>item.date===date);if(exception)return exception.added;
  return date>=calendar.startDate&&date<=calendar.endDate&&calendar.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
}
function serviceDays(at:number):{date:string;start:number}[]{const start=Math.floor((at+PKT)/DAY)*DAY-PKT;return[-2,-1,0,1].map(offset=>({date:new Date(start+offset*DAY+PKT).toISOString().slice(0,10),start:start+offset*DAY}));}
function disruptionHits(disruption:TransitDisruption,pattern:TransitPattern,from:number,to:number,start:number,end:number):boolean{
  if(disruption.status!=='published'||disruption.routeId!==pattern.routeId||disruption.directionId!==undefined&&disruption.directionId!==pattern.directionId||!overlap(disruption.startsAt,disruption.endsAt,start,end))return false;
  if(!disruption.fromStopId)return true;
  const first=pattern.stopIds.indexOf(disruption.fromStopId),last=pattern.stopIds.indexOf(disruption.toStopId!);
  return first>=0&&last>first&&from<last&&to>first;
}
export function rideAffected(pattern:TransitPattern,from:number,to:number,start:number,end:number,closures:Closure[],disruptions:TransitDisruption[],stops:Map<string,TransitStop>,distances:number[],scheduled?:{trip:TransitTrip;serviceStart:number},geometryRisks?:Map<string,Closure[]>):boolean {
  if(disruptions.some(alert=>disruptionHits(alert,pattern,from,to,start,end)))return true;
  // Resolve crossing time per consecutive stop pair rather than treating an entire
  // long bus line as occupying every road for the whole journey.
  const total=Math.max(1,distances[to]-distances[from]);
  for(let index=from;index<to;index++){
    const enter=scheduled?scheduled.serviceStart+scheduled.trip.times[index][index===from?1:0]*1000:start+(end-start)*(distances[index]-distances[from])/total,exit=scheduled?scheduled.serviceStart+scheduled.trip.times[index+1][0]*1000:start+(end-start)*(distances[index+1]-distances[from])/total;
    if(!closures.length)continue;
    const key=`${pattern.id}:${index}`;let risks=geometryRisks?.get(key);
    if(!risks){const line=sliceShape(pattern,distances,index,index+1,stops);risks=closures.filter(closure=>lineHitsClosure(line,closure));geometryRisks?.set(key,risks);}
    for(const closure of risks)if(overlap(closure.startsAt,closure.endsAt,enter,exit))return true;
  }
  return false;
}
interface State { stopId:string; legs:TransitLeg[]; clock:number|null; elapsed:number; walking:number; rides:number; used:Set<string>; warnings:Set<string> }
interface Boarding { trip?:TransitTrip; serviceStart?:number; departure:number|null }
export function planTransit(data:TransitDataset|null,request:TransitPlanRequest,closuresInput:Closure[],disruptions:TransitDisruption[],eventRevision:number,disruptionRevision:number):TransitPlanResponse {
  const response:TransitPlanResponse={options:[],evaluatedAt:new Date().toISOString(),departureAt:request.departureAt,eventRevision,disruptionRevision,datasetVersion:data?.version??'unavailable',warnings:[]};
  if(!data){response.unavailableReason='Local bus data is unavailable. No bus itinerary has been invented.';return response;}
  const started=Date.parse(request.departureAt),deadline=performance.now()+2500,stops=new Map(data.stops.map(stop=>[stop.id,stop])),calendars=new Map(data.calendars.map(calendar=>[calendar.id,calendar])),closures=publishedClosures(closuresInput),days=serviceDays(started);
  const patterns=data.patterns.filter(pattern=>!pattern.restrictedAccess),distances=new Map(patterns.map(pattern=>[pattern.id,stopDistances(pattern,stops)])),outbound=new Map<string,{pattern:TransitPattern;index:number}[]>(),trips=new Map<string,TransitTrip[]>(),geometryRisks=new Map<string,Closure[]>(),rideShapes=new Map<string,{shape:TransitRideLeg['geometry'];distance:number}>();
  for(const pattern of patterns)for(let index=0;index<pattern.stopIds.length-1;index++){const id=pattern.stopIds[index];outbound.set(id,[...(outbound.get(id)??[]),{pattern,index}]);}
  for(const trip of data.trips)trips.set(trip.patternId,[...(trips.get(trip.patternId)??[]),trip]);
  const walk=(from:Place,to:Place,clock:number|null):TransitWalkLeg=>{const distance=distanceMeters(from.coordinate,to.coordinate),duration=Math.ceil(distance/WALK_SPEED);return{kind:'walk',from,to,geometry:{type:'LineString',coordinates:[from.coordinate,to.coordinate]},distanceMeters:Math.round(distance),durationSeconds:duration,departureAt:clock===null?null:new Date(clock).toISOString(),arrivalAt:clock===null?null:new Date(clock+duration*1000).toISOString(),estimated:true};};
  const nearby=(coordinate:Place['coordinate'],maximum:number,preferredId?:string)=>data.stops.map(stop=>({stop,distance:distanceMeters(coordinate,stop.coordinate)})).filter(item=>item.distance<=maximum).sort((a,b)=>(a.stop.id===preferredId?-1:0)-(b.stop.id===preferredId?-1:0)||a.distance-b.distance).slice(0,32);
  const originStops=nearby(request.origin.coordinate,MAX_ACCESS,request.origin.id),destinationStops=new Set(nearby(request.destination.coordinate,MAX_ACCESS,request.destination.id).map(item=>item.stop.id));
  if(!originStops.length||!destinationStops.size){response.unavailableReason='No mapped bus stop is within a 1 km access walk of one of these locations.';return response;}
  const queue:State[]=[];
  // A small uncertainty tie-breaker must not starve unscheduled metro/Orange
  // services behind the entire scheduled feeder network. ETA preference belongs
  // in final result ordering, not a four-hour search penalty.
  const score=(state:State)=>state.elapsed+distanceMeters(stops.get(state.stopId)!.coordinate,request.destination.coordinate)/20*1000+(state.clock===null?120_000:0);
  function enqueue(state:State){queue.push(state);let index=queue.length-1;while(index){const parent=Math.floor((index-1)/2);if(score(queue[parent])<=score(state))break;queue[index]=queue[parent];index=parent;}queue[index]=state;}
  function dequeue(){const first=queue[0],last=queue.pop()!;if(queue.length){let index=0;while(index*2+1<queue.length){let child=index*2+1;if(child+1<queue.length&&score(queue[child+1])<score(queue[child]))child++;if(score(last)<=score(queue[child]))break;queue[index]=queue[child];index=child;}queue[index]=last;}return first;}
  for(const {stop} of originStops){const leg=walk(request.origin,stop,started);enqueue({stopId:stop.id,legs:leg.distanceMeters>1?[leg]:[],clock:started+leg.durationSeconds*1000,elapsed:leg.durationSeconds*1000,walking:leg.distanceMeters,rides:0,used:new Set(),warnings:new Set(['Walking connections are straight-line estimates; pedestrian access is not validated.'])});}
  const visited=new Map<string,number[]>(),finished:TransitJourney[]=[],signatures=new Map<string,number>();let expansions=0;
  function boardings(pattern:TransitPattern,index:number,clock:number|null):Boarding[]{
    const scheduled=trips.get(pattern.id)??[];
    if(!scheduled.length)return[{departure:null}];
    const valid=days.flatMap(day=>scheduled.filter(trip=>calendarRuns(calendars.get(trip.serviceId)!,day.date)&&trip.pickupAllowed?.[index]!==false).map(trip=>({trip,serviceStart:day.start,departure:day.start+trip.times[index][1]*1000})));
    if(clock===null){const possible=valid.find(item=>item.departure>=started&&item.departure<=started+MAX_JOURNEY);return possible?[{departure:null,trip:possible.trip}]:[];}
    return valid.filter(item=>item.departure>=clock&&item.departure-clock<=MAX_WAIT).sort((a,b)=>a.departure-b.departure).slice(0,3);
  }
  function finish(state:State){
    const stop=stops.get(state.stopId)!;
    if(state.rides&&state.legs.at(-1)?.kind==='ride'&&destinationStops.has(stop.id)){
      const last=walk(stop,request.destination,state.clock),legs=last.distanceMeters>1?[...state.legs,last]:state.legs,rides=legs.filter((leg):leg is TransitRideLeg=>leg.kind==='ride');
      // Boarding/alighting one stop earlier is not a genuinely different bus route.
      const signature=rides.map(leg=>leg.patternId).join('|'),arrival=state.clock===null?null:state.clock+last.durationSeconds*1000;
      const candidate:TransitJourney={id:createHash('sha256').update(signature).digest('hex').slice(0,16),legs,departureAt:request.departureAt,arrivalAt:arrival===null?null:new Date(arrival).toISOString(),durationSeconds:arrival===null?null:Math.round((arrival-started)/1000),walkingDistanceMeters:state.walking+last.distanceMeters,distanceMeters:Math.round(legs.reduce((sum,leg)=>sum+leg.distanceMeters,0)),transfers:rides.length-1,timing:arrival===null?'unknown':'scheduled',warnings:[...state.warnings]};
      const existing=signatures.get(signature);
      if(existing===undefined){signatures.set(signature,finished.length);finished.push(candidate);}
      else if((candidate.durationSeconds??candidate.walkingDistanceMeters)<(finished[existing].durationSeconds??finished[existing].walkingDistanceMeters))finished[existing]=candidate;
    }
  }
  // Collect a validated completed ride when generated, before other branch
  // expansions can consume the bounded search budget. This also protects direct
  // untimed services from starvation without fabricating their arrival time.
  function push(state:State){if(state.elapsed>MAX_JOURNEY)return;finish(state);const key=`${state.stopId}|${state.rides}|${state.legs.at(-1)?.kind}|${state.clock===null?'unknown':'scheduled'}`,labels=visited.get(key)??[];if(labels.length>=2&&state.elapsed>=labels.at(-1)!)return;labels.push(state.elapsed);labels.sort((a,b)=>a-b);visited.set(key,labels.slice(0,2));enqueue(state);}
  while(queue.length&&expansions++<1800&&performance.now()<deadline){
    if(finished.length>=9)break;
    const state=dequeue(),stop=stops.get(state.stopId)!;
    if(state.rides>=3)continue;
    if(state.rides&&state.legs.at(-1)?.kind==='ride')for(const {stop:next,distance} of nearby(stop.coordinate,MAX_TRANSFER)){
      if(next.id===stop.id)continue;const leg=walk(stop,next,state.clock);push({...state,stopId:next.id,legs:[...state.legs,leg],elapsed:state.elapsed+leg.durationSeconds*1000,clock:state.clock===null?null:state.clock+leg.durationSeconds*1000,walking:state.walking+leg.distanceMeters});
    }
    for(const {pattern,index} of outbound.get(stop.id)??[]){
      if(state.used.has(pattern.routeId))continue;
      const readyAt=state.clock===null?null:state.clock+(state.rides?60_000:0);
      for(const boarding of boardings(pattern,index,readyAt))for(let end=index+1;end<pattern.stopIds.length;end++){
        if(hasGap(pattern,index,end))break;if(boarding.trip?.dropOffAllowed?.[end]===false)continue;
        const shapeKey=`${pattern.id}:${index}:${end}`;let cachedShape=rideShapes.get(shapeKey);
        if(!cachedShape){const shape=sliceShape(pattern,distances.get(pattern.id)!,index,end,stops);cachedShape={shape,distance:lineDistance(shape)};rideShapes.set(shapeKey,cachedShape);}
        const {shape,distance}=cachedShape,unknown=boarding.departure===null||state.clock===null;
        const departure=unknown?null:boarding.departure!,arrival=unknown?null:boarding.serviceStart!+boarding.trip!.times[end][0]*1000;
        const approximateDuration=Math.max(60,distance/6),elapsed=unknown?state.elapsed+approximateDuration*1000:arrival!-started;
        const fromTime=departure??started,toTime=arrival??started+MAX_JOURNEY;
        if(rideAffected(pattern,index,end,fromTime,toTime,closures,disruptions,stops,distances.get(pattern.id)!,!unknown?{trip:boarding.trip!,serviceStart:boarding.serviceStart!}:undefined,geometryRisks))continue;
        const to=stops.get(pattern.stopIds[end])!,ride:TransitRideLeg={kind:'ride',routeId:pattern.routeId,patternId:pattern.id,...(boarding.trip?{tripId:boarding.trip.id}:{}),from:stop,to,stops:pattern.stopIds.slice(index,end+1).map(id=>stops.get(id)!),geometry:shape,distanceMeters:Math.round(distance),departureAt:departure===null?null:new Date(departure).toISOString(),arrivalAt:arrival===null?null:new Date(arrival).toISOString(),durationSeconds:arrival===null||departure===null?null:Math.round((arrival-departure)/1000),availability:'available',geometryQuality:pattern.geometryQuality};
        const warnings=new Set(state.warnings);if(unknown)warnings.add('No dependable timetable is available for every connection; no arrival time is promised.');if(pattern.geometryQuality==='stops-only')warnings.add('Some bus lines connect known stops schematically; their road alignment and closure clearance are unverified.');if(boarding.trip?.timepoint?.slice(index,end+1).some(value=>!value))warnings.add('Intermediate stop times are source-model estimates, not live vehicle predictions.');
        push({stopId:to.id,legs:[...state.legs,ride],clock:arrival,elapsed,walking:state.walking,rides:state.rides+1,used:new Set([...state.used,pattern.routeId]),warnings});
      }
    }
  }
  response.options=finished.sort((a,b)=>(a.timing==='unknown'?1:0)-(b.timing==='unknown'?1:0)||(a.durationSeconds??a.transfers*1800+a.walkingDistanceMeters)-(b.durationSeconds??b.transfers*1800+b.walkingDistanceMeters)).slice(0,3);
  if(expansions>=1800||performance.now()>=deadline)response.warnings.push('Planning reached its bounded search limit; additional connections may exist.');
  if(!response.options.length)response.unavailableReason='No eligible connection was found within the mapped service, timetable, closure and walking limits. A closed bus line is not rerouted onto another road.';
  return response;
}
