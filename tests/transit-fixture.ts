import type { TransitDataset } from '../shared/transit';
import type { Closure } from '../shared/types';
export const TRANSIT_AT='2026-10-18T03:00:00.000Z'; // 08:00 PKT, Sunday
export function transitFixture():TransitDataset{
  return{version:'test-public-v1',importedAt:TRANSIT_AT,sources:[{id:'fixture',name:'Synthetic test only',url:'https://example.test/',license:'test',retrievedAt:TRANSIT_AT,limitations:['Synthetic.']}],limitations:[],
    routes:[{id:'r1',shortName:'B1',name:'A to C',agency:'Fixture',color:'#2563eb',sourceId:'fixture',coverage:'stops-and-shape'}],
    stops:[{id:'a',name:'Alpha',coordinate:[73,33.7]},{id:'b',name:'Bravo',coordinate:[73.02,33.7]},{id:'c',name:'Charlie',coordinate:[73.04,33.7]}],
    patterns:[{id:'p1',routeId:'r1',directionId:'0',headsign:'Charlie',stopIds:['a','b','c'],geometry:{type:'LineString',coordinates:[[73,33.7],[73.02,33.7],[73.04,33.7]]},geometryQuality:'provided-shape'}],
    calendars:[{id:'daily',startDate:'2026-10-01',endDate:'2026-10-31',weekdays:[0,1,2,3,4,5,6],exceptions:[]}],
    trips:[{id:'t1',patternId:'p1',serviceId:'daily',times:[[29400,29400],[30000,30000],[30600,30600]],pickupAllowed:[true,true,false],dropOffAllowed:[false,true,true],timepoint:[true,false,false]}]};
}
export function transitClosure(startsAt='2026-10-18T03:20:00Z',endsAt='2026-10-18T03:29:00Z'):Closure{
  return{id:'road',revision:1,createdAt:TRANSIT_AT,updatedAt:TRANSIT_AT,title:'Road closed',description:'',status:'published',moderation:'approved',startsAt,endsAt,reason:'construction',geometry:{type:'Polygon',coordinates:[[[73.029,33.699],[73.031,33.699],[73.031,33.701],[73.029,33.701],[73.029,33.699]]]}};
}
