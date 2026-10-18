import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadTransitDataset, validateTransitDataset } from '../server/transit/dataset';
import { hasGap, sliceShape } from '../server/transit/geometry';
import { distanceMeters } from '../server/geometry';
import type { Coordinate } from '../shared/types';
import type { TransitPattern } from '../shared/transit';

const packed=readFileSync(new URL('../assets/transit/road-alignment.json.gz',import.meta.url)),alignment=JSON.parse(gunzipSync(packed).toString()),data=loadTransitDataset()!;
const provenance=JSON.parse(readFileSync(new URL('../assets/transit/provenance.json',import.meta.url),'utf8'));
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');

describe('reviewed whole-network public road-alignment derivative',()=>{
  it('binds the exact source/base/alignment versions and retains independent OSM attribution',()=>{
    expect(data).not.toBeNull();expect(validateTransitDataset(data)).toBe(data);
    expect(alignment.baseNormalizedSha256).toBe('2113cb68fbc2a3b862aa7e09dc1b26420769f561a86bc4c542f66b50ab10777d');
    expect(provenance.roadAlignmentSha256).toBe(digest(packed));expect(data.version).toBe(`${alignment.baseVersion}-roads-${digest(packed).slice(0,8)}`);
    expect(alignment.roadSource.pbfSha256).toBe('2f0682b93d0ce0f83a9c03b38bfe3734314deda5f21dbb9ef2fee2e1b6e7379a');expect(alignment.roadSource.normalizedRoadsSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(data.sources.find(source=>source.id===alignment.source.id)).toMatchObject({url:'https://download.geofabrik.de/asia/pakistan.html',license:expect.stringMatching(/ODbL/)});
    expect(alignment.graphStats.directedEdges).toBeGreaterThan(10000);
  });
  it('accounts for all old chord directions plus the five reviewed sparse supplied shapes, preserving the other18',()=>{
    const estimated=data.patterns.filter(pattern=>pattern.geometryQuality==='road-aligned-estimate');expect(estimated).toHaveLength(49);expect(alignment.patterns).toHaveLength(49);expect(data.patterns.filter(pattern=>pattern.geometryQuality==='stops-only')).toEqual([]);
    expect(alignment.refinedSupplied.map((pattern:TransitPattern)=>pattern.id).sort()).toEqual(['hb2jn','n95vp','rn4hb','wqwen','z3t6g']);
    expect(alignment.preserved).toHaveLength(18);
    for(const item of alignment.preserved){const pattern=data.patterns.find(pattern=>pattern.id===item.patternId)!;expect(digest(JSON.stringify(pattern))).toBe(item.sha256);}
    expect(data.patterns.filter(pattern=>pattern.geometryQuality==='provided-shape')).toHaveLength(14);expect(data.patterns.filter(pattern=>pattern.geometryQuality==='mapped-corridor')).toHaveLength(4);
    expect(digest(JSON.stringify(data.stops.map(stop=>[stop.id,stop.coordinate])))).toBe(alignment.sourceStopCoordinateSha256);
    expect(data.routes).toHaveLength(37);expect(data.stops).toHaveLength(1210);expect(data.trips).toHaveLength(2064);
  });
  it('checks every inferred pair against the committed used directed OSM road-edge proof, never a new chord',()=>{
    const edges=new Set(alignment.proofEdges.map((edge:any)=>`${edge.from}|${edge.to}`)),stops=new Map(data.stops.map(stop=>[stop.id,stop]));let segments=0,gaps=0;
    for(const pattern of data.patterns.filter(pattern=>pattern.geometryQuality==='road-aligned-estimate')){
      expect(pattern.roadSegments).toHaveLength(pattern.stopIds.length-1);expect(pattern.roadAlignment!.snapDistancesMeters).toHaveLength(pattern.stopIds.length);
      pattern.roadSegments!.forEach((line,index)=>{
        if(!line){gaps++;expect(hasGap(pattern,index,index+1)).toBe(true);expect(pattern.roadAlignment!.unresolved.some(item=>item.afterStopIndex===index)).toBe(true);return;}
        expect(hasGap(pattern,index,index+1)).toBe(false);expect(sliceShape(pattern,pattern.stopDistancesMeters!,index,index+1,stops)).toEqual(line);
        for(let i=1;i<line.coordinates.length;i++){const a=line.coordinates[i-1],b=line.coordinates[i];if(JSON.stringify(a)===JSON.stringify(b))continue;segments++;expect(edges.has(`${a}|${b}`),`${pattern.id} stop pair${index}, vertex${i} is not a source directed road edge`).toBe(true);}
        const from=stops.get(pattern.stopIds[index])!,to=stops.get(pattern.stopIds[index+1])!;expect(distanceMeters(from.coordinate,line.coordinates[0] as Coordinate)).toBeLessThanOrEqual(150.2);expect(distanceMeters(to.coordinate,line.coordinates.at(-1)! as Coordinate)).toBeLessThanOrEqual(150.2);
      });
      expect(pattern.geometry).toEqual(pattern.geometrySegments![0]??{type:'LineString',coordinates:[stops.get(pattern.stopIds[0])!.coordinate,stops.get(pattern.stopIds[0])!.coordinate]});
    }
    expect(segments).toBeGreaterThan(5000);expect(gaps).toBe(alignment.summary.unresolvedPairs);expect(alignment.summary.alignedPairs+gaps).toBe(alignment.summary.totalPairs);
  });
  it('preserves source defects, access restrictions and source conflicts without silently claiming current bus operations',()=>{
    const broken=data.patterns.find(pattern=>pattern.id==='eqyn8')!;expect(broken.unplacedStops).toContain('Rahimabad');expect(broken.breakAfterStopIndexes).toContain(8);expect(broken.roadSegments![8]).toBeNull();expect(broken.roadAlignment!.unresolved.find(item=>item.afterStopIndex===8)?.reason).toContain('source gap');
    expect(data.patterns.find(pattern=>pattern.id==='z3t6g')!.restrictedAccess).toBe(true);
    for(const id of ['vtvpb','me5tv'])expect(data.patterns.find(pattern=>pattern.id===id)!.routingUnavailableReason).toContain('IJP/Potohar');
    expect(data.sources.flatMap(source=>source.limitations).join(' ')).not.toContain('other lines are dashed stop-order schematics');expect(alignment.originalGeometryLimitations.flatMap((source:any)=>source.limitations).join(' ')).toContain('dashed stop-order schematics');
  });
});
