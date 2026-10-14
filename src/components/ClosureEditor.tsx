import { useState } from 'react';
import { Check, Circle, MousePointer2, Pentagon, Plus, Route, Undo2, X } from 'lucide-react';
import type { Polygon } from 'geojson';
import type { Closure, ClosureDraft, ClosureReason, Drawing, MapMode } from '../../shared/types';
import { send } from '../lib/api';
import { inputISO, localInput } from '../lib/format';

interface Props {
  closure: Closure | null; drawing: Drawing; onDraw: (drawing: Drawing) => void;
  mode: MapMode; setMode: (mode: MapMode) => void;
  onSave: (draft: ClosureDraft) => Promise<void>; onCancel: () => void;
  seed?: Partial<ClosureDraft>;
}
export default function ClosureEditor({ closure, drawing, onDraw, mode, setMode, onSave, onCancel, seed }: Props) {
  const [title, setTitle] = useState(closure?.title ?? seed?.title ?? '');
  const [description, setDescription] = useState(closure?.description ?? seed?.description ?? '');
  const [reason, setReason] = useState<ClosureReason>(closure?.reason ?? 'other');
  const [start, setStart] = useState(closure ? localInput(new Date(closure.startsAt)) : localInput());
  const [end, setEnd] = useState(closure?.endsAt ? localInput(new Date(closure.endsAt)) : localInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [unknownEnd, setUnknownEnd] = useState(closure ? !closure.endsAt : false);
  const [publish, setPublish] = useState(closure?.status !== 'draft');
  const [sourceUrl, setSourceUrl] = useState(closure?.sourceUrl ?? seed?.sourceUrl ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [coordinate, setCoordinate] = useState('');
  const minPoints = drawing.kind === 'point' ? 1 : drawing.kind === 'line' ? 2 : 3;
  const chooseTool = (kind: Drawing['kind']) => { onDraw({ kind, coordinates: [], widthMeters: drawing.widthMeters }); setMode(kind); };
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError('');
    try {
      if (drawing.coordinates.length < minPoints) throw new Error(`Add at least ${minPoints} point${minPoints > 1 ? 's' : ''} to the map.`);
      const startsAt = inputISO(start); const endsAt = unknownEnd ? null : inputISO(end);
      if (endsAt && endsAt <= startsAt) throw new Error('End time must be after the start time.');
      setSaving(true);
      const geometry = await send<Polygon>('/geometry', drawing);
      await onSave({ title: title.trim(), description: description.trim(), reason, startsAt, endsAt, status: publish ? 'published' : 'draft', sourceUrl: sourceUrl.trim() || undefined, geometry, drawing });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this closure.'); }
    finally { setSaving(false); }
  }
  function addCoordinate() {
    const match = coordinate.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match || Math.abs(+match[1]) > 90 || Math.abs(+match[2]) > 180) { setError('Enter latitude, longitude, for example 33.7000, 73.0500.'); return; }
    const next: [number, number] = [+match[2], +match[1]];
    onDraw({ ...drawing, coordinates: drawing.kind === 'point' ? [next] : [...drawing.coordinates, next] }); setCoordinate(''); setError('');
  }
  return <form className="editor-form" onSubmit={save}>
    <div className="section-heading"><div><span className="eyebrow">MAP EDITOR</span><h1>{closure ? 'Edit restriction' : 'Add a road restriction'}</h1></div><button type="button" className="icon-button" aria-label="Close editor" onClick={onCancel}><X size={18} /></button></div>
    <p className="muted">Mark the affected stretch, then choose when it applies. Your route will work around it.</p>
    <fieldset className="tool-fieldset"><legend>1. Draw the affected area</legend><div className="segmented drawing-tools">
      {([['point', Circle, 'Point'], ['line', Route, 'Road'], ['polygon', Pentagon, 'Area']] as const).map(([kind, Icon, label]) => <button key={kind} type="button" className={drawing.kind === kind ? 'active' : ''} aria-pressed={drawing.kind === kind} onClick={() => chooseTool(kind)}><Icon size={16} aria-hidden="true" />{label}</button>)}
    </div></fieldset>
    <div className="drawing-hint"><MousePointer2 size={18} /><span>{mode === 'browse' ? 'Drawing paused. Drag a point or resume drawing.' : drawing.kind === 'point' ? 'Click the map to place the closure.' : `Click along ${drawing.kind === 'line' ? 'the affected road' : 'the boundary'}. Drag points to adjust.`}<strong>{drawing.coordinates.length} point{drawing.coordinates.length !== 1 ? 's' : ''} placed</strong></span></div>
    <div className="row wrap"><button type="button" className="text-button" disabled={!drawing.coordinates.length} onClick={() => onDraw({ ...drawing, coordinates: drawing.coordinates.slice(0, -1) })}><Undo2 size={15} />Undo point</button><button type="button" className="text-button" onClick={() => setMode(mode === 'browse' ? drawing.kind : 'browse')}><Check size={15} />{mode === 'browse' ? 'Resume drawing' : 'Finish drawing'}</button></div>
    {drawing.kind !== 'polygon' && <label className="field-label">{drawing.kind === 'point' ? 'Closure diameter' : 'Total corridor width'}<span className="range-row"><input type="range" min="10" max="200" step="5" value={drawing.widthMeters} onChange={e => onDraw({ ...drawing, widthMeters: +e.target.value })} /><output>{drawing.widthMeters} m</output></span></label>}
    <details className="coordinate-details"><summary>Enter or adjust coordinates</summary><p className="small muted">Latitude, longitude. This also provides a keyboard alternative to drawing.</p><div className="row"><input aria-label="New closure coordinate" placeholder="33.7000, 73.0500" value={coordinate} onChange={e => setCoordinate(e.target.value)} /><button type="button" className="icon-button bordered" aria-label="Add coordinate" onClick={addCoordinate}><Plus size={18} /></button></div>
      {drawing.coordinates.map((point, index) => <div className="coordinate-row" key={index}><span>{index + 1}</span><input aria-label={`Point ${index + 1} latitude`} type="number" step="any" min="-90" max="90" value={point[1]} onChange={e => onDraw({ ...drawing, coordinates: drawing.coordinates.map((p, i) => i === index ? [p[0], +e.target.value] : p) })} /><input aria-label={`Point ${index + 1} longitude`} type="number" step="any" min="-180" max="180" value={point[0]} onChange={e => onDraw({ ...drawing, coordinates: drawing.coordinates.map((p, i) => i === index ? [+e.target.value, p[1]] : p) })} /><button type="button" className="icon-button small" aria-label={`Remove point ${index + 1}`} onClick={() => onDraw({ ...drawing, coordinates: drawing.coordinates.filter((_, i) => i !== index) })}><X size={14} /></button></div>)}
    </details>
    <div className="form-divider" /><label className="field-label">2. What is happening?<input required maxLength={160} placeholder="e.g. Planned restriction near F-8" value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label className="field-label">Reason<select value={reason} onChange={e => setReason(e.target.value as ClosureReason)}><option value="other">Road restriction</option><option value="protest">Protest / gathering</option><option value="vip">VIP movement</option><option value="construction">Roadworks</option><option value="accident">Accident / obstruction</option></select></label>
    <label className="field-label">Starts · Pakistan time<input type="datetime-local" required value={start} onInput={e => setStart(e.currentTarget.value)} /></label>
    {!unknownEnd && <label className="field-label">Ends · Pakistan time<input type="datetime-local" required value={end} onInput={e => setEnd(e.currentTarget.value)} /></label>}
    <label className="check-row"><input type="checkbox" checked={unknownEnd} onChange={e => setUnknownEnd(e.target.checked)} />End time unknown; keep active until cancelled</label>
    <label className="field-label">Notes <span className="optional">optional</span><textarea rows={2} maxLength={3000} value={description} placeholder="Affected directions, landmarks or context…" onChange={e => setDescription(e.target.value)} /></label>
    <label className="field-label">Source link <span className="optional">optional</span><input type="url" value={sourceUrl} placeholder="https://…" onChange={e => setSourceUrl(e.target.value)} /></label>
    <label className="check-row"><input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} />Apply to route planning <span className="optional">otherwise save as draft</span></label>
    <p className="small muted">Drawn restrictions apply to intersecting roads in both directions. Review flyovers and divided roads before saving.</p>
    {error && <div className="error-box" role="alert">{error}</div>}
    <button className="primary-button full" disabled={saving || !title.trim()}>{saving ? 'Saving restriction…' : <><Check size={17} />{closure ? 'Save changes' : publish ? 'Save restriction' : 'Save draft'}</>}</button>
    <button type="button" className="text-button full centered" onClick={onCancel}>Cancel</button>
  </form>;
}
