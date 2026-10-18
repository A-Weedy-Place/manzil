import { t } from '../lib/language';
import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, MapPin, Plus, Route, Construction, X } from 'lucide-react';
import type { Polygon } from 'geojson';
import type { Closure, ClosureDraft, ClosureReason, Drawing, MapMode, RestrictionType } from '../../shared/types';
import { MAX_CLOSURE_PHOTOS, MAX_CLOSURE_PHOTO_CHARACTERS } from '../../shared/closures';
import type { RoadSelectionController } from '../lib/useRoadSelection';
import { send } from '../lib/api';
import { distance, inputISO, localInput } from '../lib/format';
import { fileToPhotoDataUrl } from '../lib/images';
import type { AgentProposal } from '../../shared/agent';
interface Props {
  closure: Closure | null; drawing: Drawing; onDraw: (drawing: Drawing) => void;
  mode: MapMode; setMode: (mode: MapMode) => void;
  onSave: (draft: ClosureDraft) => Promise<void>; onCancel: () => void;
  seed?: Partial<ClosureDraft>; canPublish?: boolean; selectedRoadName?: string;
  roadSelection?: RoadSelectionController; onStartRoad?: () => void;
  restrictionType?: RestrictionType; onTypeChange?: (kind: RestrictionType) => void; selectionChanged?: boolean;
  agentProposal?: AgentProposal; onReject?: () => Promise<void>;
}
export default function ClosureEditor({ closure, drawing, onDraw, mode, setMode, onSave, onCancel, seed, canPublish = true, selectedRoadName = '', roadSelection, onStartRoad, restrictionType = closure?.restrictionType ?? seed?.restrictionType ?? 'road_closure', onTypeChange, selectionChanged = false, agentProposal, onReject }: Props) {
  const [title, setTitle] = useState(closure?.title ?? seed?.title ?? '');
  const [titleTouched, setTitleTouched] = useState(!!(closure?.title ?? seed?.title));
  const [description, setDescription] = useState(closure?.description ?? seed?.description ?? '');
  const [reason, setReason] = useState<ClosureReason>(closure?.reason ?? seed?.reason ?? 'other');
  const [start, setStart] = useState(closure?.startsAt || seed?.startsAt ? localInput(new Date((closure?.startsAt ?? seed?.startsAt)!)) : agentProposal ? '' : localInput());
  const [end, setEnd] = useState(closure?.endsAt || seed?.endsAt ? localInput(new Date((closure?.endsAt ?? seed?.endsAt)!)) : agentProposal ? '' : localInput(new Date(Date.now() + 3600000)));
  const [unknownEnd, setUnknownEnd] = useState(closure ? !closure.endsAt : seed?.endsAt === null);
  const [endConfirmed, setEndConfirmed] = useState(false), [accessConfirmed, setAccessConfirmed] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(closure?.sourceUrl ?? seed?.sourceUrl ?? '');
  const [photos, setPhotos] = useState<string[]>(closure?.photos ?? seed?.photos ?? []);
  const [photoBusy, setPhotoBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [coordinate, setCoordinate] = useState('');
  const alive = useRef(true), photoSequence = useRef(0), currentDrawing = useRef(drawing); currentDrawing.current = drawing;
  const currentPhotos = useRef(photos); currentPhotos.current = photos;
  const completedDrawing = useRef<Drawing | null>(null);
  useEffect(() => { if (roadSelection?.anchors.length === 2 && !roadSelection.busy) completedDrawing.current = drawing; }, [drawing, roadSelection?.anchors, roadSelection?.busy]);
  const hasRoad = drawing.coordinates.length >= (drawing.kind === 'point' ? 1 : drawing.kind === 'polygon' ? 3 : 2) && (!selectionChanged || roadSelection?.anchors.length === 2 || completedDrawing.current === drawing);
  const busy = saving || photoBusy || roadSelection?.busy === true;
  useEffect(() => { alive.current = true; return () => { alive.current = false; photoSequence.current++; }; }, []);
  useEffect(() => { if (selectedRoadName && !titleTouched && !closure) setTitle(selectedRoadName); }, [selectedRoadName, titleTouched, closure]);
  function chooseRoad() {
    setError(''); setCoordinate('');
    if (onStartRoad) onStartRoad();
    else { onDraw({ kind: 'line', coordinates: [], widthMeters: 14 }); setMode('road'); }
  }
  async function addPhotos(files: FileList | null) {
    if (!files?.length || photoBusy) return;
    const selected = Array.from(files), sequence = ++photoSequence.current;
    setPhotoBusy(true); setError('');
    try {
      if (currentPhotos.current.length + selected.length > MAX_CLOSURE_PHOTOS) throw new Error('Add up to six photos.');
      const next: string[] = [];
      for (const file of selected) next.push(await fileToPhotoDataUrl(file));
      if (!alive.current || sequence !== photoSequence.current) return;
      const combined = [...currentPhotos.current, ...next];
      if (combined.length > MAX_CLOSURE_PHOTOS) throw new Error('Add up to six photos.');
      if (combined.reduce((size, photo) => size + photo.length, 0) > MAX_CLOSURE_PHOTO_CHARACTERS) throw new Error('Photos are too large together. Choose smaller photos.');
      setPhotos(combined);
    } catch (reason) { if (alive.current && sequence === photoSequence.current) setError(reason instanceof Error ? reason.message : 'Could not read this photo.'); }
    finally { if (alive.current && sequence === photoSequence.current) setPhotoBusy(false); }
  }
  async function addCoordinate() {
    const match = coordinate.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match || Math.abs(+match[1]) > 90 || Math.abs(+match[2]) > 180) { setError('Enter latitude, longitude, for example 33.7000, 73.0500.'); return; }
    if (!roadSelection) return;
    setError(''); await roadSelection.choose([+match[2], +match[1]]);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setError('');
    try {
      if (!hasRoad) throw new Error('Select a road on the map.');
      if (agentProposal && !start) throw new Error('Enter the confirmed start time before approving.');
      if (agentProposal && unknownEnd && !endConfirmed) throw new Error('Confirm that this restriction should remain active until cancelled, or set an end time.');
      if (agentProposal && (agentProposal.action === 'disruption' || agentProposal.impact !== 'closed') && !accessConfirmed) throw new Error('Confirm that this is an actual road restriction before approving.');
      if (!start || !unknownEnd && !end) throw new Error('Choose a valid date and time.');
      const startsAt = inputISO(start), endsAt = unknownEnd ? null : inputISO(end);
      if (endsAt && endsAt <= startsAt) throw new Error('End time must be after the start time.');
      setSaving(true);
      const snapshot = drawing, geometry = await send<Polygon>('/geometry', snapshot);
      if (!alive.current || currentDrawing.current !== snapshot) throw new Error('The road selection changed. Save again.');
      const status = canPublish && (agentProposal || closure?.status !== 'draft') ? 'published' : 'draft';
      const typed = selectionChanged || closure?.restrictionType || seed?.restrictionType || !closure && !agentProposal;
      await onSave({ ...(typed ? { restrictionType } : {}), title: title.trim(), description: description.trim(), reason, startsAt, endsAt, status, sourceUrl: sourceUrl.trim() || undefined, geometry, drawing: snapshot, photos });
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Could not save this closure.'); }
    finally { if (alive.current) setSaving(false); }
  }
  const action = agentProposal ? 'Approve and add to map' : !canPublish ? 'Submit for review' : closure?.status === 'draft' ? 'Save draft' : closure ? 'Save changes' : 'Add closure';
  return <form className="editor-form closure-simple-editor" onSubmit={save} aria-busy={busy}>
    <div className="section-heading"><h1>{t(closure ? 'Edit closure' : 'Add closure')}</h1><button type="button" className="icon-button" aria-label={t('Close editor')} disabled={saving} onClick={onCancel}><X size={18} /></button></div>
    {onTypeChange && <fieldset className="closure-type-field"><legend>{t('Type')}</legend><div className="segmented closure-type-options"><button type="button" aria-pressed={restrictionType === 'road_closure'} className={restrictionType === 'road_closure' ? 'active' : ''} disabled={busy} onClick={() => { if (restrictionType !== 'road_closure') onTypeChange('road_closure'); }}><Route size={17} />{t('Road closure')}</button><button type="button" aria-pressed={restrictionType === 'blockade'} className={restrictionType === 'blockade' ? 'active' : ''} disabled={busy} onClick={() => { if (restrictionType !== 'blockade') onTypeChange('blockade'); }}><Construction size={17} />{t('Blockade')}</button></div></fieldset>}
    {agentProposal && <section className="closure-agent-review"><h2>{t('Review agent map proposal')}</h2>{agentProposal.issues.length > 0 && <details><summary>{t('Review notes')}</summary><ul>{agentProposal.issues.map((issue, index) => <li key={index}>{t(issue)}</li>)}</ul></details>}{(agentProposal.action === 'disruption' || agentProposal.impact !== 'closed') && <label className="check-row"><input type="checkbox" checked={accessConfirmed} onChange={event => setAccessConfirmed(event.target.checked)} />{t('I confirm this is an actual road restriction, not only congestion or a service suspension.')}</label>}</section>}
    <section className={`closure-road-picker ${hasRoad ? 'has-road' : ''}`} aria-label={t('Affected road')}>
      <div className="closure-road-selection"><span className="closure-road-icon">{restrictionType === 'blockade' ? <Construction size={21} /> : <Route size={21} />}</span><div><strong>{t(roadSelection?.busy ? 'Selecting road…' : hasRoad ? selectedRoadName || (restrictionType === 'blockade' ? 'Blockade selected' : 'Road selected') : roadSelection?.anchors.length === 1 ? restrictionType === 'blockade' ? 'Select the other end of the blockade' : 'Select the end on the same road' : restrictionType === 'blockade' ? 'Draw across the blocked lanes' : 'Select a road on the map')}</strong>{hasRoad && roadSelection?.distanceMeters != null && <small>{distance(roadSelection.distanceMeters)}</small>}</div>{hasRoad && <Check size={19} aria-hidden="true" />}</div>
      <div className="closure-road-actions"><button type="button" className={hasRoad ? 'text-button' : 'secondary-button full'} disabled={busy} onClick={chooseRoad}><MapPin size={16} />{t(restrictionType === 'blockade' ? hasRoad ? 'Redraw blockade' : 'Draw blockade' : hasRoad ? 'Change road' : 'Choose road')}</button>{roadSelection?.anchors.length === 1 && <button type="button" className="text-button" disabled={busy} onClick={() => setMode('road')}><Plus size={16} />{t('Add end point')}</button>}</div>
      {roadSelection?.error && <div className="error-box" role="alert">{t(roadSelection.error)}</div>}
      {roadSelection && <details className="closure-coordinate-input"><summary>{t('Coordinates')}</summary><label className="field-label">{t('Road point · latitude, longitude')}<input value={coordinate} placeholder="33.7000, 73.0500" disabled={busy} onChange={event => setCoordinate(event.target.value)} /></label><button className="secondary-button full" type="button" disabled={busy || !coordinate.trim() || mode !== 'road'} onClick={addCoordinate}>{t('Select point')}</button></details>}
    </section>
    <label className="field-label">{t('Road / place')}<input required maxLength={160} placeholder={t('Road name or nearby landmark')} value={title} onChange={event => { setTitle(event.target.value); setTitleTouched(true); }} /></label>
    <label className="field-label">{t('Reason')}<select value={reason} onChange={event => setReason(event.target.value as ClosureReason)}><option value="other">{t('Road restriction')}</option><option value="protest">{t('Protest / gathering')}</option><option value="vip">{t('VIP movement')}</option><option value="construction">{t('Roadworks')}</option><option value="accident">{t('Accident / obstruction')}</option></select></label>
    <label className="field-label">{t('Starts · Pakistan time')}<input type="datetime-local" required value={start} onInput={event => setStart(event.currentTarget.value)} /></label>
    <div className="closure-end-time">{!unknownEnd && <label className="field-label">{t('Ends · Pakistan time')}<input type="datetime-local" required value={end} onInput={event => setEnd(event.currentTarget.value)} /></label>}<label className="check-row"><input type="checkbox" checked={unknownEnd} onChange={event => setUnknownEnd(event.target.checked)} />{t('End time unknown')}</label></div>
    {agentProposal && unknownEnd && <label className="check-row"><input type="checkbox" checked={endConfirmed} onChange={event => setEndConfirmed(event.target.checked)} />{t('I approve keeping this restriction active until an administrator cancels it.')}</label>}
    <label className="field-label">{t('Notes ')}<span className="optional">{t('optional')}</span><textarea rows={2} maxLength={3000} value={description} onChange={event => setDescription(event.target.value)} /></label>
    <div className="closure-photo-editor"><span className="field-label">{t('Photos')} <span className="optional">{photos.length}/{MAX_CLOSURE_PHOTOS}</span></span><div className="closure-photo-grid">{photos.map((photo, index) => <div key={index}><img src={photo} alt={`${t('Closure photo')} ${index + 1}`} /><button type="button" className="icon-button" disabled={busy} aria-label={`${t('Remove photo')} ${index + 1}`} onClick={() => setPhotos(value => value.filter((_, i) => i !== index))}><X size={16} /></button></div>)}</div><label className="secondary-button photo-upload"><ImagePlus size={17} aria-hidden="true" />{t(photoBusy ? 'Preparing photo…' : 'Add photos')}<input aria-label={t('Closure photos')} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || photos.length >= MAX_CLOSURE_PHOTOS} onChange={event => { void addPhotos(event.target.files); event.target.value = ''; }} /></label></div>
    <label className="field-label">{t('Source link ')}<span className="optional">{t('optional')}</span><input type="url" maxLength={1500} value={sourceUrl} placeholder="https://…" onChange={event => setSourceUrl(event.target.value)} /></label>
    {error && <div className="error-box" role="alert">{t(error)}</div>}
    <button className="primary-button full" disabled={busy || !title.trim() || !hasRoad}>{saving ? t('Saving closure…') : <><Check size={17} />{t(action)}</>}</button>
    {agentProposal && onReject && <button type="button" className="secondary-button full" disabled={busy} onClick={async () => { setSaving(true); try { await onReject(); } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Could not reject map draft.'); } finally { if (alive.current) setSaving(false); } }}>{t('Reject proposal')}</button>}
    <button type="button" className="text-button full centered" disabled={saving} onClick={onCancel}>{t('Cancel')}</button>
  </form>;
}
