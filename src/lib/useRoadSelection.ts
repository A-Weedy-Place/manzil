import { useEffect, useRef, useState } from 'react';
import type { Coordinate, Drawing } from '../../shared/types';
import { api } from './api';

export interface RoadSelectionState { anchors: Coordinate[]; busy: boolean; error: string; distanceMeters: number | null; roadNames: string[] }
export type RoadSelectionKind = 'road_closure' | 'blockade';
interface Section { drawing: Drawing; roadNames: string[]; distanceMeters: number }
const empty = (): RoadSelectionState => ({ anchors: [], busy: false, error: '', distanceMeters: null, roadNames: [] });
const validCoordinate = (point: unknown): point is Coordinate => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;

function closestOnRoad(point: Coordinate, line: Coordinate[]): Coordinate {
  let best = line[0], error = Infinity;
  const scale = Math.cos(point[1] * Math.PI / 180);
  for (let index = 1; index < line.length; index++) {
    const a = line[index - 1], b = line[index], dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, (((point[0] - a[0]) * scale) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const next: Coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const distance = ((point[0] - next[0]) * scale) ** 2 + (point[1] - next[1]) ** 2;
    if (distance < error) { best = next; error = distance; }
  }
  return best;
}

/** One picker shared by map clicks and the keyboard coordinate alternative.
 * A road closure resolves a usable road section from its first point; a
 * physical blockade retains its first raw point until its second end is validated.
 * Failed requests preserve the last accepted selection without fallback geometry. */
export function useRoadSelection({ enabled, owner, drawing, kind = 'road_closure', onDraw, onRoadName }: {
  enabled: boolean; owner: string | null; drawing: Drawing | null; kind?: RoadSelectionKind;
  onDraw: (drawing: Drawing) => void; onRoadName: (name: string) => void;
}) {
  const [state, setState] = useState<RoadSelectionState>(empty);
  const selection = useRef(state); selection.current = state;
  const current = useRef({ enabled, owner, drawing, kind, onDraw, onRoadName }); current.current = { enabled, owner, drawing, kind, onDraw, onRoadName };
  const pending = useRef<AbortController | null>(null), sequence = useRef(0), alive = useRef(true);
  const acceptedDrawing = useRef(drawing);
  const context = useRef({ enabled, owner, kind });
  function reset() {
    sequence.current++; pending.current?.abort(); pending.current = null;
    selection.current = empty(); setState(selection.current); acceptedDrawing.current = current.current.drawing;
  }
  useEffect(() => {
    if (!enabled || context.current.owner !== owner || context.current.kind !== kind || acceptedDrawing.current !== drawing) reset();
    context.current = { enabled, owner, kind };
    acceptedDrawing.current = drawing;
  }, [enabled, owner, drawing, kind]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; pending.current?.abort(); }; }, []);

  async function choose(coordinate: Coordinate) {
    const snapshot = current.current;
    if (!alive.current || !snapshot.enabled || !snapshot.owner) return;
    pending.current?.abort();
    const controller = new AbortController(), request = ++sequence.current;
    pending.current = controller;
    if (!validCoordinate(coordinate)) {
      pending.current = null; setState(value => ({ ...value, busy: false, error: 'Road selection unavailable.' })); return;
    }
    const from = selection.current.anchors.length === 1 ? selection.current.anchors[0] : null;
    if (snapshot.kind === 'blockade' && !from) {
      const point: Coordinate = [...coordinate];
      const nextDrawing: Drawing = { kind: 'line', coordinates: [point], widthMeters: 4 };
      const next = { ...empty(), anchors: [point] };
      pending.current = null; acceptedDrawing.current = nextDrawing; selection.current = next; setState(next);
      snapshot.onDraw(nextDrawing); snapshot.onRoadName(''); return;
    }
    const accepted = acceptedDrawing.current;
    setState(value => ({ ...value, busy: true, error: '' }));
    const stillCurrent = () => alive.current && sequence.current === request && current.current.enabled && current.current.owner === snapshot.owner && current.current.kind === snapshot.kind && (current.current.drawing === snapshot.drawing || current.current.drawing === accepted);
    // An uncached road selection may need a bounded public OSM lookup first.
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]);
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([api<Section>(snapshot.kind === 'blockade' ? '/roads/blockade' : from ? '/roads/section' : '/roads/point', {
        method: 'POST', body: JSON.stringify(from ? { from, to: coordinate } : { coordinate }),
        signal,
      }), aborted]);
      if (!stillCurrent() || signal.aborted) return;
      const points = result?.drawing?.coordinates;
      if (result?.drawing?.kind !== 'line' || !Array.isArray(points) || points.length < 2 || points.length > 1000 || !points.every(validCoordinate) || !points.some(point => point[0] !== points[0][0] || point[1] !== points[0][1]) || !Number.isFinite(result.drawing.widthMeters) || result.drawing.widthMeters < 2 || result.drawing.widthMeters > 1000 || !Number.isFinite(result.distanceMeters) || result.distanceMeters <= 0 || !Array.isArray(result.roadNames) || !result.roadNames.every(name => typeof name === 'string')) throw new Error('Road selection unavailable.');
      if (snapshot.kind === 'blockade' && (!from || points.length !== 2 || result.drawing.widthMeters !== 4 || result.distanceMeters < 2 || result.distanceMeters > 80 || points[0][0] !== from[0] || points[0][1] !== from[1] || points[1][0] !== coordinate[0] || points[1][1] !== coordinate[1])) throw new Error('Road selection unavailable.');
      const anchors = from ? [points[0], points.at(-1)!] : [closestOnRoad(coordinate, points)];
      const next = { anchors, busy: false, error: '', distanceMeters: result.distanceMeters, roadNames: result.roadNames };
      acceptedDrawing.current = result.drawing; selection.current = next; setState(next);
      current.current.onDraw(result.drawing); current.current.onRoadName(result.roadNames.join(' · '));
    } catch (reason) {
      if (!stillCurrent() || controller.signal.aborted) return;
      setState(value => ({ ...value, busy: false, error: signal.aborted && signal.reason?.name === 'TimeoutError' || reason instanceof Error && reason.name === 'TimeoutError' ? 'Road selection timed out. Try again.' : reason instanceof Error ? reason.message : 'Road selection unavailable.' }));
    } finally { signal.removeEventListener('abort', onAbort); if (pending.current === controller) pending.current = null; }
  }
  return { ...state, choose, reset };
}

export type RoadSelectionController = ReturnType<typeof useRoadSelection>;
