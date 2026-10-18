import { describe, expect, it } from 'vitest';
import { addSuppliedRoadAnchors, buildBusRoadGraph, BusRoadMatcher, restoreSourceStops } from '../scripts/lib/transitRoadAlignment';
import { hasGap, sliceShape, stopDistances } from '../server/transit/geometry';
import { planTransit, rideAffected } from '../server/transit/planner';
import { validateTransitDataset } from '../server/transit/dataset';
import { transitFixture, TRANSIT_AT, transitClosure } from './transit-fixture';
import { Store } from '../server/store';
import { TransitService } from '../server/transit/service';
import type { OsmDocument, OsmElement } from '../server/routing/graph';
import type { TransitPattern, TransitStop } from '../shared/transit';

const bounds: [number,number,number,number] = [72.9,33.6,73.2,33.9];
const n = (id:number,lon:number,lat:number,tags?:Record<string,string>):OsmElement => ({type:'node',id,lon,lat,tags});
const w = (id:number,nodes:number[],tags:Record<string,string>={}):OsmElement => ({type:'way',id,nodes,tags:{highway:'primary',...tags}});
const graph = (elements:OsmElement[]) => buildBusRoadGraph({elements},bounds);
const stops: TransitStop[] = [{id:'a',name:'First platform',coordinate:[73.0001,33.7001]},{id:'b',name:'Second platform',coordinate:[73.01,33.71]},{id:'c',name:'Third platform',coordinate:[73.02,33.71]}];
const pattern = ():TransitPattern => ({id:'p',routeId:'r',directionId:'0',headsign:'Third',stopIds:stops.map(stop=>stop.id),geometryQuality:'stops-only',geometry:{type:'LineString',coordinates:stops.map(stop=>stop.coordinate)}});
const elbow = () => graph([n(1,73,33.7),n(2,73.01,33.7),n(3,73.01,33.71),n(4,73.02,33.71),w(10,[1,2,3,4])]);
const align = (p=pattern(),s=stops,g=elbow()) => new BusRoadMatcher(g,s).align(p,new Map(s.map(stop=>[stop.id,stop])),'osm-test');

describe('precomputed public bus-road alignment, never runtime car rerouting',()=>{
  it('uses bus/PSV access priority and includes dedicated bus infrastructure',()=>{
    const nodes=[n(1,73,33.7),n(2,73.01,33.7)];
    expect(graph([...nodes,w(1,[1,2],{highway:'busway',motorcar:'no',bus:'designated'})]).edges).toHaveLength(2);
    expect(graph([...nodes,w(1,[1,2],{access:'private',psv:'yes'})]).edges).toHaveLength(2);
    expect(graph([...nodes,w(1,[1,2],{bus:'no',motor_vehicle:'yes'})]).edges).toHaveLength(0);
    expect(graph([...nodes,w(1,[1,2],{'bus:conditional':'yes @ (Mo-Fr)'})]).edges).toHaveLength(0);
    expect(graph([...nodes,w(1,[1,2],{motorcar:'no'})]).edges).toHaveLength(2);
  });
  it('obeys bus-specific one-way directions and conservatively rejects conditional directions',()=>{
    const nodes=[n(1,73,33.7),n(2,73.01,33.7)];
    expect(graph([...nodes,w(1,[1,2],{oneway:'yes','oneway:bus':'no'})]).edges).toHaveLength(2);
    const reverse=graph([...nodes,w(1,[1,2],{'oneway:psv':'-1'})]);expect(reverse.edges).toHaveLength(1);expect(reverse.nodes[reverse.edges[0].from].id).toBe('2');
    expect(graph([...nodes,w(1,[1,2],{'oneway:bus:conditional':'yes @ (Mo-Fr)'})]).edges).toHaveLength(0);
  });
  it('prefers mapped dedicated busway platforms for known BRT patterns instead of the nearer parallel car road',()=>{
    const s=[{id:'a',name:'A',coordinate:[73,33.7] as [number,number]},{id:'b',name:'B',coordinate:[73.01,33.7] as [number,number]}],g=graph([n(1,73,33.7),n(2,73.01,33.7),n(3,73,33.7002),n(4,73.01,33.7002),w(1,[1,2]),w(2,[3,4],{highway:'busway',access:'no',bus:'designated'})]),p={...pattern(),stopIds:['a','b']};
    const result=new BusRoadMatcher(g,s,new Set(['a','b'])).align(p,new Map(s.map(stop=>[stop.id,stop])),'osm-test').pattern;
    expect(result.roadSegments![0]!.coordinates.every(point=>point[1]===33.7002)).toBe(true);expect(result.roadAlignment!.snapDistancesMeters[0]).toBeGreaterThan(20);
  });
  it('keeps nearby general bus-road candidates for feeder stops published on an isolated BRT median',()=>{
    const s=[{id:'a',name:'General road A',coordinate:[73,33.7] as [number,number]},{id:'b',name:'Published median platform',coordinate:[73.01,33.7005] as [number,number]},{id:'c',name:'General road C',coordinate:[73.02,33.7] as [number,number]}];
    const g=graph([n(1,73,33.7),n(2,73.01,33.7),n(3,73.02,33.7),n(4,73.009,33.7005),n(5,73.01,33.7005),n(6,73.011,33.7005),w(1,[1,2,3]),w(2,[4,5,6],{highway:'busway',access:'no',bus:'designated'})]);
    const result=new BusRoadMatcher(g,s).align(pattern(),new Map(s.map(stop=>[stop.id,stop])),'osm-test').pattern;
    expect(result.roadAlignment!.unresolved).toEqual([]);expect(result.roadAlignment!.snapDistancesMeters[1]).toBeGreaterThan(50);expect(result.roadSegments!.every(line=>line!.coordinates.every(point=>point[1]===33.7))).toBe(true);
  });
  it('does not open an unpermitted barrier by translating default bus access',()=>{
    const nodes=[n(1,73,33.7),n(2,73.01,33.7,{barrier:'bollard'})];
    expect(graph([...nodes,w(1,[1,2])]).edges).toHaveLength(0);
    nodes[1].tags!.psv='yes';expect(graph([...nodes,w(1,[1,2])]).edges).toHaveLength(2);
    nodes[1].tags!.bus='no';expect(graph([...nodes,w(1,[1,2])]).edges).toHaveLength(0);
  });
  it('keeps generic restrictions for buses unless bus/PSV is explicitly exempt',()=>{
    const elements:OsmElement[]=[n(1,73,33.7),n(2,73.01,33.7),n(3,73.01,33.71),w(1,[1,2]),w(2,[2,3]),{type:'relation',id:50,tags:{type:'restriction',restriction:'no_right_turn',except:'motorcar'},members:[{type:'way',ref:1,role:'from'},{type:'node',ref:2,role:'via'},{type:'way',ref:2,role:'to'}]}];
    expect(graph(elements).restrictions).toHaveLength(1);elements.at(-1)!.tags!.except='bus';expect(graph(elements).restrictions).toHaveLength(0);
  });
  it('conservatively translates motor-vehicle and vehicle conditional restrictions rather than silently allowing turns',()=>{
    for(const key of ['restriction:motor_vehicle:conditional','restriction:vehicle','restriction:vehicle:conditional']){
      const tags={type:'restriction',[key]:key.endsWith('conditional')?'no_right_turn @ (Mo-Fr)':'no_right_turn'},elements:OsmElement[]=[n(1,73,33.7),n(2,73.01,33.7),n(3,73.01,33.71),w(1,[1,2]),w(2,[2,3]),{type:'relation',id:50,tags,members:[{type:'way',ref:1,role:'from'},{type:'node',ref:2,role:'via'},{type:'way',ref:2,role:'to'}]}];
      expect(graph(elements).restrictions,key).toHaveLength(1);expect(graph(elements).restrictions[0]).toMatchObject({fromWay:'1',toWay:'2',only:false});
    }
  });
  it('follows original road bends and projected road points instead of joining stop coordinates',()=>{
    const source=elbow(),result=align().pattern,line=result.roadSegments![0]!;
    expect(result.geometryQuality).toBe('road-aligned-estimate');expect(line.coordinates).toContainEqual([73.01,33.7]);expect(line.coordinates[0]).not.toEqual(stops[0].coordinate);
    expect(result.roadAlignment!.snapDistancesMeters[0]).toBeGreaterThan(0);expect(result.roadAlignment!.unresolved).toEqual([]);
    expect(result.stopIds).toEqual(stops.map(stop=>stop.id));expect(stops[0].coordinate).toEqual([73.0001,33.7001]);
    const edges=new Set(source.edges.map(edge=>`${source.nodes[edge.from].coordinate}|${source.nodes[edge.to].coordinate}`));expect(edges.has(`${stops[0].coordinate}|${stops[1].coordinate}`)).toBe(false);
  });
  it('preserves source gaps with separate road sections, matching snap metadata and no representative connector',()=>{
    const s=[...stops,{id:'d',name:'Fourth platform',coordinate:[73.03,33.71] as [number,number]}],p={...pattern(),stopIds:s.map(stop=>stop.id),breakAfterStopIndexes:[1]};
    const g=graph([n(1,73,33.7),n(2,73.01,33.7),n(3,73.01,33.71),n(4,73.02,33.71),n(5,73.03,33.71),w(10,[1,2,3,4,5])]),result=align(p,s,g).pattern;
    expect(result.roadSegments).toHaveLength(3);expect(result.roadSegments![1]).toBeNull();expect(result.geometrySegments).toHaveLength(2);expect(result.geometry).toEqual(result.geometrySegments![0]);expect(result.roadAlignment!.snapDistancesMeters).toHaveLength(4);
    expect(hasGap(result,0,3)).toBe(true);expect(()=>sliceShape(result,result.stopDistancesMeters!,0,3,new Map(s.map(stop=>[stop.id,stop])))).toThrow(/gap/);
    expect(sliceShape(result,result.stopDistancesMeters!,2,3,new Map(s.map(stop=>[stop.id,stop])))).toEqual(result.roadSegments![2]);
  });
  it('leaves stops farther than 150 m from supported roads unresolved, never moved to invented roads',()=>{
    const far=stops.map(stop=>({...stop,coordinate:[stop.coordinate[0],stop.coordinate[1]+.05] as [number,number]})),result=align(pattern(),far).pattern;
    expect(result.roadSegments).toEqual([null,null]);expect(result.geometrySegments).toEqual([]);expect(result.breakAfterStopIndexes).toEqual([0,1]);expect(result.roadAlignment!.snapDistancesMeters).toEqual([null,null,null]);
  });
  it('does not connect geometrically crossing roads without a shared original OSM node',()=>{
    const g=graph([n(1,73,33.7),n(2,73.02,33.7),n(3,73.01,33.69),n(4,73.01,33.71),w(1,[1,2]),w(2,[3,4])]),s=[{id:'a',name:'A',coordinate:[73,33.7] as [number,number]},{id:'b',name:'B',coordinate:[73.01,33.71] as [number,number]}],p={...pattern(),stopIds:['a','b']};
    expect(align(p,s,g).pattern.roadSegments).toEqual([null]);
  });
  it('does not reverse a directed bus road to manufacture a return pattern',()=>{
    const g=graph([n(1,73,33.7),n(2,73.01,33.7),w(1,[1,2],{oneway:'yes'})]),s=[{id:'a',name:'A',coordinate:[73.01,33.7] as [number,number]},{id:'b',name:'B',coordinate:[73,33.7] as [number,number]}];
    expect(align({...pattern(),stopIds:['a','b']},s,g).pattern.roadSegments).toEqual([null]);
  });
  it('retains the incoming road restriction at an intermediate stop rather than resetting every leg',()=>{
    const elements:OsmElement[]=[n(1,73,33.7),n(2,73.01,33.7),n(3,73.01,33.71),w(1,[1,2],{oneway:'yes'}),w(2,[2,3],{oneway:'yes'}),{type:'relation',id:50,tags:{type:'restriction',restriction:'no_left_turn'},members:[{type:'way',ref:1,role:'from'},{type:'node',ref:2,role:'via'},{type:'way',ref:2,role:'to'}]}];
    const s=[{id:'a',name:'A',coordinate:[73,33.7] as [number,number]},{id:'b',name:'B',coordinate:[73.01,33.7] as [number,number]},{id:'c',name:'C',coordinate:[73.01,33.71] as [number,number]}],result=align(pattern(),s,graph(elements)).pattern;
    expect(result.roadSegments![0]).not.toBeNull();expect(result.roadSegments![1]).toBeNull();expect(result.breakAfterStopIndexes).toEqual([1]);
  });
  it('retains sparse supplied intermediate anchors instead of silently choosing a different shorter road',()=>{
    const s=[{id:'a',name:'A',coordinate:[73,33.7] as [number,number]},{id:'b',name:'B',coordinate:[73.01,33.7] as [number,number]}],lookup=new Map(s.map(stop=>[stop.id,stop]));
    const p:TransitPattern={...pattern(),stopIds:['a','b'],geometryQuality:'provided-shape',geometry:{type:'LineString',coordinates:[[73,33.7],[73,33.71],[73.01,33.71],[73.01,33.7]]}};
    p.stopDistancesMeters=stopDistances(p,lookup);const anchors=addSuppliedRoadAnchors(p,lookup);expect(anchors.stops).toHaveLength(4);expect(anchors.originalStopIndexes).toEqual([0,3]);
    const g=graph([n(1,73,33.7),n(2,73,33.71),n(3,73.01,33.71),n(4,73.01,33.7),w(1,[1,2,3,4]),w(2,[1,4])]),matcher=new BusRoadMatcher(g,anchors.stops),aligned=matcher.align(anchors.pattern,new Map(anchors.stops.map(stop=>[stop.id,stop])),'osm-test').pattern,restored=restoreSourceStops(p,aligned,anchors.originalStopIndexes,lookup);
    expect(restored.stopIds).toEqual(['a','b']);expect(restored.roadSegments).toHaveLength(1);expect(restored.roadSegments![0]!.coordinates).toContainEqual([73,33.71]);expect(restored.roadSegments![0]!.coordinates).toContainEqual([73.01,33.71]);expect(restored.geometryQuality).toBe('road-aligned-estimate');expect(restored.roadAlignment!.snapDistancesMeters).toEqual([0,0]);
    expect(p.geometryQuality).toBe('provided-shape');expect(p.geometry.coordinates).toHaveLength(4);
  });
  it('slices exact road-pair geometry for closure traversal, with no old chord crossing',()=>{
    const p=align().pattern,lookup=new Map(stops.map(stop=>[stop.id,stop])),distances=stopDistances(p,lookup),closure=transitClosure(TRANSIT_AT,'2026-10-18T04:00:00Z');
    closure.geometry={type:'Polygon',coordinates:[[[73.0099,33.6999],[73.0101,33.6999],[73.0101,33.7001],[73.0099,33.7001],[73.0099,33.6999]]]};
    expect(sliceShape(p,distances,0,1,lookup)).toEqual(p.roadSegments![0]);expect(rideAffected(p,0,1,Date.parse(TRANSIT_AT),Date.parse(TRANSIT_AT)+600000,[closure],[],lookup,distances)).toBe(true);
    closure.geometry={type:'Polygon',coordinates:[[[73.0048,33.7048],[73.0052,33.7048],[73.0052,33.7052],[73.0048,33.7052],[73.0048,33.7048]]]};expect(rideAffected(p,0,1,Date.parse(TRANSIT_AT),Date.parse(TRANSIT_AT)+600000,[closure],[],lookup,distances)).toBe(false);
  });
  it('does not replace a missing supplied-shape interval with a new stop-to-stop chord',()=>{
    const data=transitFixture(),p=data.patterns[0],lookup=new Map(data.stops.map(stop=>[stop.id,stop]));p.geometry.coordinates=[[73,33.7],[73,33.7]];p.stopDistancesMeters=[0,1000,2000];
    expect(()=>sliceShape(p,p.stopDistancesMeters!,0,1,lookup)).toThrow(/No supplied road geometry/);
    const result=planTransit(data,{origin:data.stops[0],destination:data.stops[2],departureAt:TRANSIT_AT},[],[],0,0);expect(result.options).toEqual([]);expect(result.warnings.join(' ')).toContain('geometry is unavailable');
  });
  it('retains timetable/access checks while returning estimated alignment warnings',()=>{
    const data=transitFixture(),p=data.patterns[0],line=p.geometry;data.sources.push({id:'osm-test',name:'OSM',url:'https://www.openstreetmap.org/copyright',license:'ODbL',retrievedAt:TRANSIT_AT,limitations:[]});
    p.geometryQuality='road-aligned-estimate';p.geometrySourceId='osm-test';p.roadSegments=[{type:'LineString',coordinates:line.coordinates.slice(0,2)},{type:'LineString',coordinates:line.coordinates.slice(1)}];p.geometrySegments=[p.geometry];p.roadAlignment={method:'ordered-bus-road-shortest-path',snapDistancesMeters:[0,0,0],unresolved:[]};
    expect(validateTransitDataset(data)).toBe(data);const result=planTransit(data,{origin:data.stops[0],destination:data.stops[2],departureAt:TRANSIT_AT},[],[],0,0);expect(result.options[0].warnings.join(' ')).toContain('actual operator streets can differ');expect(result.options[0].arrivalAt).toBe('2026-10-18T03:30:00.000Z');
    p.roadSegments[0]=null;expect(()=>validateTransitDataset(data)).toThrow(/road gap/);p.breakAfterStopIndexes=[0];p.roadAlignment.unresolved=[{afterStopIndex:0,reason:'Missing mapped road'}];p.geometry=p.roadSegments[1]!;p.geometrySegments=[p.geometry];expect(validateTransitDataset(data)).toBe(data);
  });
  it('rejects displayed groups or representative lines that diverge from exact pair geometry or bridge gaps',()=>{
    const data=transitFixture(),p=data.patterns[0];data.sources.push({id:'osm-test',name:'OSM',url:'https://www.openstreetmap.org/copyright',license:'ODbL',retrievedAt:TRANSIT_AT,limitations:[]});p.geometryQuality='road-aligned-estimate';p.geometrySourceId='osm-test';p.roadSegments=[null,{type:'LineString',coordinates:p.geometry.coordinates.slice(1)}];p.breakAfterStopIndexes=[0];p.roadAlignment={method:'ordered-bus-road-shortest-path',snapDistancesMeters:[0,0,0],unresolved:[{afterStopIndex:0,reason:'Unknown road'}]};
    p.geometrySegments=[p.roadSegments[1]!];const old=p.geometry;p.geometry=p.roadSegments[1]!;expect(validateTransitDataset(data)).toBe(data);
    p.geometrySegments=[old];expect(()=>validateTransitDataset(data)).toThrow(/map sections differ/);p.geometrySegments=[p.roadSegments[1]!];p.geometry=old;expect(()=>validateTransitDataset(data)).toThrow(/representative geometry/);
    p.roadSegments=[null,null];p.breakAfterStopIndexes=[0,1];p.roadAlignment.unresolved.push({afterStopIndex:1,reason:'Unknown road'});p.geometrySegments=[];p.geometry={type:'LineString',coordinates:[data.stops[0].coordinate,data.stops[0].coordinate]};expect(validateTransitDataset(data)).toBe(data);
    p.geometry=old;expect(()=>validateTransitDataset(data)).toThrow(/representative geometry/);
  });
  it('sends one map geometry copy while retaining exact backend pair paths for planning',async()=>{
    const data=transitFixture(),p=data.patterns[0];p.geometryQuality='road-aligned-estimate';p.geometrySegments=[p.geometry];p.stopDistancesMeters=[0,1800,3600];p.roadSegments=[{type:'LineString',coordinates:p.geometry.coordinates.slice(0,2)},{type:'LineString',coordinates:p.geometry.coordinates.slice(1)}];
    const store=new Store(':memory:');try{const service=new TransitService(store,()=>data),first=await service.network(TRANSIT_AT),second=await service.network(TRANSIT_AT);expect(first.patterns).toBe(second.patterns);expect(first.patterns[0].roadSegments).toBeUndefined();expect(first.patterns[0].stopDistancesMeters).toBeUndefined();expect(first.patterns[0].geometrySegments).toBeUndefined();expect(first.patterns[0].geometry).toBe(p.geometry);expect(p.roadSegments).toHaveLength(2);expect(p.geometrySegments).toHaveLength(1);const plan=await service.plan({origin:data.stops[0],destination:data.stops[2],departureAt:TRANSIT_AT});expect(plan.options[0].legs.find(leg=>leg.kind==='ride')!.geometry).toEqual(p.geometry);}finally{store.close();}
  });
  it('does not discard a non-equivalent explicit display section while compacting the public response',async()=>{
    const data=transitFixture(),p=data.patterns[0];p.geometryQuality='road-aligned-estimate';p.geometrySegments=[{type:'LineString',coordinates:[[73,33.7],[73.01,33.7]]}];
    const store=new Store(':memory:');try{const response=await new TransitService(store,()=>data).network(TRANSIT_AT);expect(response.patterns[0].geometrySegments).toEqual(p.geometrySegments);}finally{store.close();}
  });
});
