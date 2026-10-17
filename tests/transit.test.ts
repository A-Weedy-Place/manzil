import { describe,expect,it } from 'vitest';
import { calendarRuns,planTransit } from '../server/transit/planner';
import { loadTransitDataset, validateTransitDataset } from '../server/transit/dataset';
import { Store } from '../server/store';
import { TransitService } from '../server/transit/service';
import { TRANSIT_AT,transitClosure,transitFixture } from './transit-fixture';
import type { TransitDataset,TransitDisruption } from '../shared/transit';
const request=(data:TransitDataset,departureAt=TRANSIT_AT)=>({origin:data.stops[0],destination:data.stops[2],departureAt});
const notice=(overrides:Partial<TransitDisruption>={}):TransitDisruption=>({id:'notice',revision:1,routeId:'r1',title:'Bus suspended',description:'Test',startsAt:TRANSIT_AT,endsAt:'2026-10-18T05:00:00Z',status:'published',author:{uid:'reviewer',displayName:'Reviewer',role:'verified'},createdAt:TRANSIT_AT,updatedAt:TRANSIT_AT,...overrides});
describe('local buses, stop order, timetable and restriction validation',()=>{
  it('plans a scheduled bus with its ordered stops and source-estimate warning, never live predictions',()=>{
    const data=transitFixture(),result=planTransit(data,request(data),[],[],4,2),journey=result.options[0];
    expect(journey).toMatchObject({timing:'scheduled',arrivalAt:'2026-10-18T03:30:00.000Z',durationSeconds:1800,transfers:0});
    expect(journey.legs.filter(leg=>leg.kind==='ride')[0]).toMatchObject({from:{id:'a'},to:{id:'c'},stops:[{id:'a'},{id:'b'},{id:'c'}]});
    expect(journey.warnings.join(' ')).toContain('source-model');expect(result).toMatchObject({eventRevision:4,disruptionRevision:2});
  });
  it('respects calendar exceptions, Sunday0 and service-day times greater than midnight',()=>{
    const data=transitFixture(),calendar=data.calendars[0];expect(calendarRuns(calendar,'2026-10-18')).toBe(true);calendar.exceptions=[{date:'2026-10-18',added:false}];expect(planTransit(data,request(data),[],[],0,0).options).toEqual([]);
    calendar.exceptions=[{date:'2026-10-17',added:true},{date:'2026-10-18',added:false}];calendar.weekdays=[];data.trips[0].times=[[87000,87000],[87600,87600],[88200,88200]];
    const result=planTransit(data,request(data,'2026-10-17T19:00:00Z'),[],[],0,0);expect(result.options[0]).toMatchObject({arrivalAt:'2026-10-17T19:30:00.000Z',timing:'scheduled'});
  });
  it('does not downgrade an expired known timetable into an invented untimed service',()=>{
    const data=transitFixture();expect(planTransit(data,request(data,'2026-11-18T03:00:00Z'),[],[],0,0).options).toEqual([]);
  });
  it('offers a mapped unscheduled line without promising an ETA or fake departure',()=>{
    const data=transitFixture();data.trips=[];const result=planTransit(data,request(data),[],[],0,0);expect(result.options[0]).toMatchObject({timing:'unknown',arrivalAt:null,durationSeconds:null});expect(result.options[0].legs.find(leg=>leg.kind==='ride')?.departureAt).toBeNull();
  });
  it('never boards or alights where the timetable prohibits it, or uses a restricted pattern',()=>{
    const data=transitFixture();data.trips[0].pickupAllowed![0]=false;expect(planTransit(data,request(data),[],[],0,0).options).toHaveLength(0);
    data.trips[0].pickupAllowed![0]=true;data.trips[0].dropOffAllowed![2]=false;expect(planTransit(data,request(data),[],[],0,0).options).toHaveLength(0);
    data.patterns[0].restrictedAccess=true;expect(planTransit(data,request(data),[],[],0,0).options).toHaveLength(0);
  });
  it('checks a road closure at bus traversal time, not only at departure, and ignores unpublished reports',()=>{
    const data=transitFixture();expect(planTransit(data,request(data),[transitClosure()],[],0,0).options).toHaveLength(0);
    expect(planTransit(data,request(data),[transitClosure('2026-10-18T03:31:00Z','2026-10-18T04:00:00Z')],[],0,0).options).toHaveLength(1);
    const pending=transitClosure();pending.moderation='pending';expect(planTransit(data,request(data),[pending],[],0,0).options).toHaveLength(1);
  });
  it('uses the actual intermediate timetable and dwell windows rather than spreading total duration by distance',()=>{
    const data=transitFixture();data.trips[0].times[1]=[29460,30300];
    expect(planTransit(data,request(data),[transitClosure('2026-10-18T03:12:00Z','2026-10-18T03:13:00Z')],[],0,0).options).toHaveLength(0);
    const dwell=transitClosure('2026-10-18T03:15:00Z','2026-10-18T03:16:00Z');dwell.geometry.coordinates[0]=[[73.0199,33.699],[73.0201,33.699],[73.0201,33.701],[73.0199,33.701],[73.0199,33.699]];
    expect(planTransit(data,request(data),[dwell],[],0,0).options).toHaveLength(0);
  });
  it('keeps geometry-risk caches private to one immutable plan snapshot and still checks each trip time',()=>{
    const data=transitFixture(),far=transitClosure();far.geometry={type:'Polygon',coordinates:[[[73.09,33.8],[73.1,33.8],[73.1,33.81],[73.09,33.81],[73.09,33.8]]]};
    expect(planTransit(data,request(data),[far],[],0,0).options).toHaveLength(1);
    expect(planTransit(data,request(data),[transitClosure()],[],0,0).options).toHaveLength(0);
    expect(planTransit(data,request(data),[transitClosure('2026-10-18T03:31:00Z','2026-10-18T04:00:00Z')],[],0,0).options).toHaveLength(1);
  });
  it('finds an untimed Orange connection in the full real network despite the scheduled feeder branches and several road events',()=>{
    const data=loadTransitDataset();expect(data).not.toBeNull();const network=data!,route=network.routes.find(route=>route.shortName==='Orange')!,pattern=network.patterns.find(pattern=>pattern.routeId===route.id)!,stops=new Map(network.stops.map(stop=>[stop.id,stop]));
    const closures=Array.from({length:7},(_,index)=>({...transitClosure(TRANSIT_AT,'2026-11-18T03:00:00Z'),id:`synthetic-remote-${index}`,geometry:{type:'Polygon' as const,coordinates:[[[73.2+index*.001,33.84],[73.2004+index*.001,33.84],[73.2004+index*.001,33.8404],[73.2+index*.001,33.8404],[73.2+index*.001,33.84]]]}}));
    const result=planTransit(network,{origin:stops.get(pattern.stopIds[0])!,destination:stops.get(pattern.stopIds[4])!,departureAt:TRANSIT_AT},closures,[],0,0);
    expect(result.options.some(option=>option.timing==='unknown'&&option.arrivalAt===null&&option.legs.some(leg=>leg.kind==='ride'&&leg.routeId===route.id))).toBe(true);
    expect(result.unavailableReason).toBeUndefined();
  });
  it('never connects across a source gap and conservatively excludes schematic corridor closure risk',()=>{
    const data=transitFixture();data.patterns[0].breakAfterStopIndexes=[1];expect(planTransit(data,request(data),[],[],0,0).options).toHaveLength(0);
    data.patterns[0].breakAfterStopIndexes=[];data.patterns[0].geometryQuality='stops-only';expect(planTransit(data,request(data),[transitClosure()],[],0,0).options).toHaveLength(0);expect(planTransit(data,request(data),[],[],0,0).options[0].warnings.join(' ')).toContain('unverified');
  });
  it('uses only the affected direction/stop segment of a timed service suspension',()=>{
    const data=transitFixture();expect(planTransit(data,request(data),[],[notice()],0,0).options).toHaveLength(0);
    expect(planTransit(data,request(data),[],[notice({directionId:'1'})],0,0).options).toHaveLength(1);
    const partial=notice({fromStopId:'b',toStopId:'c'});expect(planTransit(data,{...request(data),destination:data.stops[1]},[],[partial],0,0).options).toHaveLength(1);
    expect(planTransit(data,request(data),[],[notice({status:'cancelled'})],0,0).options).toHaveLength(1);
  });
  it('supports an actual transfer and bounds long/unmapped access walks',()=>{
    const data=transitFixture();data.patterns[0].stopIds=['a','b'];data.patterns[0].geometry.coordinates=data.patterns[0].geometry.coordinates.slice(0,2);data.trips[0].times=data.trips[0].times.slice(0,2);data.trips[0].pickupAllowed=[true,false];data.trips[0].dropOffAllowed=[false,true];data.trips[0].timepoint=[true,false];
    data.routes.push({...data.routes[0],id:'r2',shortName:'B2'});data.patterns.push({...data.patterns[0],id:'p2',routeId:'r2',stopIds:['b','c'],geometry:{type:'LineString',coordinates:[[73.02,33.7],[73.04,33.7]]}});data.trips.push({...data.trips[0],id:'t2',patternId:'p2',times:[[30120,30120],[30900,30900]]});
    expect(planTransit(data,request(data),[],[],0,0).options[0]).toMatchObject({transfers:1,arrivalAt:'2026-10-18T03:35:00.000Z'});
    expect(planTransit(data,{...request(data),origin:{name:'Far',coordinate:[72.5,33.7]}},[],[],0,0).unavailableReason).toContain('1 km');
  });
  it('permits a transfer between different route-specific stop IDs at exactly the same coordinates',()=>{
    const data=transitFixture();data.stops.push({...data.stops[1],id:'b-platform-2'});data.routes.push({...data.routes[0],id:'r2'});
    data.patterns[0].stopIds=['a','b'];data.patterns[0].geometry.coordinates=data.patterns[0].geometry.coordinates.slice(0,2);data.trips[0].times=[[29400,29400],[30000,30000]];data.trips[0].pickupAllowed=[true,false];data.trips[0].dropOffAllowed=[false,true];data.trips[0].timepoint=[true,false];
    data.patterns.push({...data.patterns[0],id:'p2',routeId:'r2',stopIds:['b-platform-2','c'],geometry:{type:'LineString',coordinates:[[73.02,33.7],[73.04,33.7]]}});data.trips.push({...data.trips[0],id:'t2',patternId:'p2',times:[[30120,30120],[30900,30900]]});
    const result=planTransit(data,request(data),[],[],0,0);expect(result.options[0]).toMatchObject({transfers:1,arrivalAt:'2026-10-18T03:35:00.000Z'});expect(result.options[0].legs.some(leg=>leg.kind==='walk'&&leg.from.id==='b'&&leg.to.id==='b-platform-2'&&leg.distanceMeters===0)).toBe(true);
    data.trips[1].times=[[30030,30030],[30900,30900]];expect(planTransit(data,request(data),[],[],0,0).options).toHaveLength(0);
  });
  it('does not chain a transfer walk onto final egress to silently exceed the 1 km access limit',()=>{
    const data=transitFixture();data.stops[2].coordinate=[73.03245,33.7];data.stops.push({id:'d',name:'Nearby source platform',coordinate:[73.02214,33.7]});data.patterns[0].stopIds=['a','b'];data.patterns[0].geometry.coordinates=data.patterns[0].geometry.coordinates.slice(0,2);data.trips[0].times=data.trips[0].times.slice(0,2);data.trips[0].pickupAllowed=[true,false];data.trips[0].dropOffAllowed=[false,true];data.trips[0].timepoint=[true,false];
    expect(planTransit(data,request(data),[],[],0,0).options).toHaveLength(0);
  });
  it('rejects malformed source stop references/times instead of loading a fabricated network',()=>{
    const data=transitFixture();expect(validateTransitDataset(data)).toBe(data);data.trips[0].times[1]=[1,1];expect(()=>validateTransitDataset(data)).toThrow('times');data.trips=[];data.patterns[0].stopIds[0]='unknown';expect(()=>validateTransitDataset(data)).toThrow('pattern');
  });
  it('returns explicit unavailable data and rejects a plan whose shared revision changes',async()=>{
    const store=new Store(':memory:');try{
      const missing=new TransitService(store,()=>null);expect(await missing.network(TRANSIT_AT)).toMatchObject({patterns:[],unavailableReason:expect.any(String)});
      const data=transitFixture(),service=new TransitService(store,()=>data),original=store.routingSnapshot.bind(store);let calls=0;store.routingSnapshot=()=>({...original(),revision:++calls});await expect(service.plan(request(data))).rejects.toMatchObject({status:409});
    }finally{store.close();}
  });
});
