import booleanIntersects from '@turf/boolean-intersects';
import type { LineString } from 'geojson';
import type { Closure, Coordinate } from '../../shared/types.js';
import type { TransitPattern, TransitStop } from '../../shared/transit.js';
import { distanceMeters } from '../geometry.js';

export const lineDistance = (line: LineString) => line.coordinates.slice(1).reduce((sum,p,i) => sum + distanceMeters(line.coordinates[i] as Coordinate,p as Coordinate),0);
export function hasGap(pattern: TransitPattern, from: number, to: number): boolean { return !!pattern.breakAfterStopIndexes?.some(index => index >= from && index < to) || !!pattern.roadSegments?.slice(from,to).some(line=>line===null); }
/** Locate ordered stops monotonically along a supplied shape, preserving curved geometry. */
export function stopDistances(pattern: TransitPattern, stops: Map<string,TransitStop>): number[] {
  if (pattern.stopDistancesMeters?.length === pattern.stopIds.length && pattern.stopDistancesMeters.every((d,i,a) => Number.isFinite(d) && d >= 0 && (!i || d >= a[i-1]))) return pattern.stopDistancesMeters;
  const coordinates = pattern.geometry.coordinates as Coordinate[], cumulative = [0];
  for (let i=1;i<coordinates.length;i++) cumulative.push(cumulative[i-1]+distanceMeters(coordinates[i-1],coordinates[i]));
  let minimum = 0;
  return pattern.stopIds.map(id => {
    const point = stops.get(id)!.coordinate; let best = Infinity, result = minimum;
    for (let i=1;i<coordinates.length;i++) {
      if (cumulative[i] < minimum) continue;
      const a=coordinates[i-1],b=coordinates[i],cos=Math.cos(point[1]*Math.PI/180),dx=(b[0]-a[0])*cos,dy=b[1]-a[1],length=dx*dx+dy*dy;
      const lower = cumulative[i]===cumulative[i-1]?0:Math.max(0,(minimum-cumulative[i-1])/(cumulative[i]-cumulative[i-1]));
      const t=Math.max(lower,Math.min(1,length?((point[0]-a[0])*cos*dx+(point[1]-a[1])*dy)/length:0));
      const projected:Coordinate=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],d=distanceMeters(point,projected);
      if(d<best){best=d;result=cumulative[i-1]+t*(cumulative[i]-cumulative[i-1]);}
    }
    minimum=result; return result;
  });
}
export function sliceShape(pattern:TransitPattern, distances:number[], from:number,to:number, stops:Map<string,TransitStop>):LineString {
  if(pattern.roadSegments){
    if(hasGap(pattern,from,to))throw new Error('An unresolved transit road gap cannot be drawn or ridden.');
    const coordinates:number[][]=[];
    for(const segment of pattern.roadSegments.slice(from,to)){
      if(!segment)throw new Error('An unresolved transit road gap cannot be drawn or ridden.');
      if(coordinates.length&&distanceMeters(coordinates.at(-1)! as Coordinate,segment.coordinates[0] as Coordinate)>.2)throw new Error('Transit road segments are not connected.');
      coordinates.push(...(coordinates.length?segment.coordinates.slice(1):segment.coordinates));
    }
    if(coordinates.length<2)throw new Error('No aligned transit road section is available.');
    return{type:'LineString',coordinates};
  }
  if(pattern.geometryQuality==='stops-only') return {type:'LineString',coordinates:pattern.stopIds.slice(from,to+1).map(id=>stops.get(id)!.coordinate)};
  const start=distances[from],end=distances[to],coordinates=pattern.geometry.coordinates as Coordinate[],output:Coordinate[]=[];let offset=0;
  for(let i=1;i<coordinates.length;i++){
    const a=coordinates[i-1],b=coordinates[i],length=distanceMeters(a,b),next=offset+length;
    if(next>=start && offset<=end && length>0){const low=Math.max(0,(start-offset)/length),high=Math.min(1,(end-offset)/length); if(low<=high){const lerp=(t:number):Coordinate=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(!output.length)output.push(lerp(low));output.push(lerp(high));}}
    offset=next;if(offset>end)break;
  }
  if(output.length<2)throw new Error('No supplied road geometry is available for this transit section.');
  return {type:'LineString',coordinates:output};
}
export function publishedClosures(closures:Closure[]):Closure[]{return closures.filter(closure=>closure.status==='published'&&(!closure.moderation||closure.moderation==='approved'));}
export function overlap(startsAt:string,endsAt:string|null,from:number,to=from):boolean{return Date.parse(startsAt)<=to&&(!endsAt||Date.parse(endsAt)>from);}
export function lineHitsClosure(geometry:LineString,closure:Closure):boolean{
  try{return booleanIntersects({type:'Feature',properties:{},geometry},{type:'Feature',properties:{},geometry:closure.geometry});}catch{return true;}
}
