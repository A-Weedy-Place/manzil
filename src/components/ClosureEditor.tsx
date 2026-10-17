import { t } from '../lib/language';
import { useEffect, useRef, useState } from 'react';
import { Check, Circle, ImagePlus, MousePointer2, Pentagon, Plus, Route, Undo2, X } from 'lucide-react';
import type { Polygon } from 'geojson';
import type { Closure, ClosureDraft, ClosureReason, Drawing, MapMode } from '../../shared/types';
import { send } from '../lib/api';
import { inputISO, localInput } from '../lib/format';
import { fileToPhotoDataUrl } from '../lib/images';

interface Props {
  closure: Closure | null; drawing: Drawing; onDraw: (drawing: Drawing) => void;
  mode: MapMode; setMode: (mode: MapMode) => void;
  onSave: (draft: ClosureDraft) => Promise<void>; onCancel: () => void;
  seed?: Partial<ClosureDraft>;
  canPublish?: boolean; selectedRoadName?: string;
}
export default function ClosureEditor({ closure, drawing, onDraw, mode, setMode, onSave, onCancel, seed, canPublish = true, selectedRoadName = '' }: Props) {
  const [title, setTitle] = useState(closure?.title ?? seed?.title ?? '');
  const [titleTouched, setTitleTouched] = useState(!!(closure?.title ?? seed?.title));
  const [roadTool, setRoadTool] = useState(mode === 'road');
  const [photos, setPhotos] = useState<string[]>(closure?.photos ?? seed?.photos ?? []);
  const [photoBusy, setPhotoBusy] = useState(false), [roadBusy, setRoadBusy] = useState(false);
  const current = useRef({ drawing, roadTool }); current.current = { drawing, roadTool };
  const sectionSequence = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sectionSequence.current++; }; }, []);
  useEffect(() => { if (selectedRoadName && !titleTouched && !closure) setTitle(selectedRoadName); }, [selectedRoadName, titleTouched, closure]);
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
  const chooseTool = (kind: Drawing['kind']) => { sectionSequence.current++; setRoadBusy(false); setRoadTool(false); onDraw({ kind, coordinates: [], widthMeters: drawing.widthMeters }); setMode(kind); };
  const chooseRoad = () => { sectionSequence.current++; setRoadBusy(false); setRoadTool(true); onDraw({ kind: 'line', coordinates: [], widthMeters: drawing.widthMeters }); setMode('road'); };
  async function addPhoto(files: FileList | null) {
    if (!files?.length) return; setPhotoBusy(true); setError('');
    try { if (photos.length + files.length > 2) throw new Error('Add up to two photos.'); const next: string[] = []; for (const file of Array.from(files)) next.push(await fileToPhotoDataUrl(file)); setPhotos(current => [...current, ...next].slice(0, 2)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read this photo.'); } finally { setPhotoBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError('');
    try {
      if (drawing.coordinates.length < minPoints) throw new Error(`Add at least ${minPoints} point${minPoints > 1 ? 's' : ''} to the map.`);
      const startsAt = inputISO(start); const endsAt = unknownEnd ? null : inputISO(end);
      if (endsAt && endsAt <= startsAt) throw new Error('End time must be after the start time.');
      setSaving(true);
      const geometry = await send<Polygon>('/geometry', drawing);
      await onSave({ title: title.trim(), description: description.trim(), reason, startsAt, endsAt, status: canPublish && publish ? 'published' : 'draft', sourceUrl: sourceUrl.trim() || undefined, geometry, drawing, photos });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this closure.'); }
    finally { setSaving(false); }
  }
  async function addCoordinate() {
    const match = coordinate.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match || Math.abs(+match[1]) > 90 || Math.abs(+match[2]) > 180) { setError('Enter latitude, longitude, for example 33.7000, 73.0500.'); return; }
    const next: [number, number] = [+match[2], +match[1]];
    if (roadTool && drawing.coordinates.length) {
      const sequence = ++sectionSequence.current;
      setRoadBusy(true); setError('');
      try {
        const result = await send<{ drawing: Drawing; roadNames: string[] }>('/roads/section', { from: drawing.coordinates[0], to: next });
        if (!mounted.current || sequence !== sectionSequence.current || current.current.drawing !== drawing || !current.current.roadTool) return;
        onDraw({ ...result.drawing, widthMeters: drawing.widthMeters }); if (!titleTouched) setTitle(result.roadNames.join(' · ')); setCoordinate('');
      }
      catch (reason) { if (mounted.current && sequence === sectionSequence.current && current.current.drawing === drawing) setError(reason instanceof Error ? reason.message : 'Could not select this road section.'); } finally { if (mounted.current && sequence === sectionSequence.current) setRoadBusy(false); }
      return;
    }
    onDraw({ ...drawing, coordinates: drawing.kind === 'point' ? [next] : [...drawing.coordinates, next] }); setCoordinate(''); setError('');
  }
  return <form className="editor-form" onSubmit={save}>
    <div className="section-heading"><div><span className="eyebrow">{t("MAP EDITOR")}</span><h1>{closure ? t("Edit restriction") : t("Add a road restriction")}</h1></div><button type="button" className="icon-button" aria-label={t("Close editor")} onClick={onCancel}><X size={18} /></button></div>
    <fieldset className="tool-fieldset"><legend>{t('Affected section')}</legend><div className="segmented drawing-tools">
      <button type="button" className={roadTool ? 'active' : ''} aria-pressed={roadTool} onClick={chooseRoad}><Route size={16} aria-hidden="true" />{t('Road section')}</button>
      {([['point', Circle, 'Point'], ['line', Route, 'Draw'], ['polygon', Pentagon, 'Area']] as const).map(([kind, Icon, label]) => <button key={kind} type="button" className={!roadTool && drawing.kind === kind ? 'active' : ''} aria-pressed={!roadTool && drawing.kind === kind} onClick={() => chooseTool(kind)}><Icon size={16} aria-hidden="true" />{t(label)}</button>)}
    </div></fieldset>
    <div className="drawing-hint"><MousePointer2 size={18} /><span>{roadTool ? drawing.coordinates.length < 1 ? t('Select where the closed section starts.') : drawing.coordinates.length < 2 ? t('Select where the closed section ends.') : t('Road section selected. Adjust its width if needed.') : mode === 'browse' ? t("Drawing paused. Drag a point or resume drawing.") : drawing.kind === 'point' ? t("Click the map to place the closure.") : `Click along ${drawing.kind === 'line' ? t("the affected road") : t("the boundary")}. Drag points to adjust.`}</span></div>
    <div className="row wrap"><button type="button" className="text-button" disabled={!drawing.coordinates.length} onClick={() => onDraw({ ...drawing, coordinates: roadTool ? [] : drawing.coordinates.slice(0, -1) })}><Undo2 size={15} />{t(roadTool ? 'Clear section' : 'Undo point')}</button><button type="button" className="text-button" onClick={() => setMode(mode === 'browse' ? roadTool ? 'road' : drawing.kind : 'browse')}><Check size={15} />{mode === 'browse' ? t("Resume drawing") : t("Finish drawing")}</button></div>
    {drawing.kind !== 'polygon' && <label className="field-label">{drawing.kind === 'point' ? t("Closure diameter") : t("Total corridor width")}<span className="range-row"><input type="range" min="10" max="200" step="1" value={drawing.widthMeters} onChange={e => onDraw({ ...drawing, widthMeters: +e.target.value })} /><output>{drawing.widthMeters} {t("m")}</output></span></label>}
    <details className="coordinate-details"><summary>{t("Enter or adjust coordinates")}</summary><p className="small muted">{t("Latitude, longitude. This also provides a keyboard alternative to drawing.")}</p><div className="row"><input aria-label={t("New closure coordinate")} placeholder={t("33.7000, 73.0500")} value={coordinate} onChange={e => setCoordinate(e.target.value)} /><button type="button" className="icon-button bordered" aria-label={t("Add coordinate")} onClick={addCoordinate}><Plus size={18} /></button></div>
      {drawing.coordinates.map((point, index) => <div className="coordinate-row" key={index}><span>{index + 1}</span><input aria-label={`Point ${index + 1} latitude`} type="number" step="any" min="-90" max="90" value={point[1]} onChange={e => onDraw({ ...drawing, coordinates: drawing.coordinates.map((p, i) => i === index ? [p[0], +e.target.value] : p) })} /><input aria-label={`Point ${index + 1} longitude`} type="number" step="any" min="-180" max="180" value={point[0]} onChange={e => onDraw({ ...drawing, coordinates: drawing.coordinates.map((p, i) => i === index ? [+e.target.value, p[1]] : p) })} /><button type="button" className="icon-button small" aria-label={`Remove point ${index + 1}`} onClick={() => onDraw({ ...drawing, coordinates: drawing.coordinates.filter((_, i) => i !== index) })}><X size={14} /></button></div>)}
    </details>
    <div className="form-divider" /><label className="field-label">{t('Road / place')}<input required maxLength={160} placeholder={t('Road name or nearby landmark')} value={title} onChange={e => { setTitle(e.target.value); setTitleTouched(true); }} /></label>
    <label className="field-label">{t("Reason")}<select value={reason} onChange={e => setReason(e.target.value as ClosureReason)}><option value="other">{t("Road restriction")}</option><option value="protest">{t("Protest / gathering")}</option><option value="vip">{t("VIP movement")}</option><option value="construction">{t("Roadworks")}</option><option value="accident">{t("Accident / obstruction")}</option></select></label>
    <label className="field-label">{t("Starts · Pakistan time")}<input type="datetime-local" required value={start} onInput={e => setStart(e.currentTarget.value)} /></label>
    {!unknownEnd && <label className="field-label">{t("Ends · Pakistan time")}<input type="datetime-local" required value={end} onInput={e => setEnd(e.currentTarget.value)} /></label>}
    <label className="check-row"><input type="checkbox" checked={unknownEnd} onChange={e => setUnknownEnd(e.target.checked)} />{t("End time unknown; keep active until cancelled")}</label>
    <label className="field-label">{t("Notes ")}<span className="optional">{t("optional")}</span><textarea rows={2} maxLength={3000} value={description} placeholder={t("Affected directions, landmarks or context…")} onChange={e => setDescription(e.target.value)} /></label>
    <div className="closure-photo-editor"><span className="field-label">{t('Photos')} <span className="optional">{photos.length}/2</span></span><div className="closure-photo-grid">{photos.map((photo, index) => <div key={index}><img src={photo} alt={`${t('Closure photo')} ${index + 1}`} /><button type="button" className="icon-button" aria-label={`${t('Remove photo')} ${index + 1}`} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}><X size={16} /></button></div>)}</div><label className="secondary-button photo-upload"><ImagePlus size={17} aria-hidden="true" />{t(photoBusy ? 'Preparing photo…' : 'Add photo')}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={photoBusy || photos.length >= 2} onChange={event => { void addPhoto(event.target.files); event.target.value = ''; }} /></label></div>
    <label className="field-label">{t("Source link ")}<span className="optional">{t("optional")}</span><input type="url" value={sourceUrl} placeholder={t("https://…")} onChange={e => setSourceUrl(e.target.value)} /></label>
    {canPublish ? <label className="check-row"><input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} />{t("Apply to route planning ")}<span className="optional">{t("otherwise save as draft")}</span></label> : <p className="review-note"><ShieldNote />{t('Your report will be reviewed before appearing on the public map.')}</p>}
    <p className="small muted">{t("Drawn restrictions apply to intersecting roads in both directions. Review flyovers and divided roads before saving.")}</p>
    {error && <div className="error-box" role="alert">{t(error)}</div>}
    <button className="primary-button full" disabled={saving || photoBusy || roadBusy || !title.trim()}>{saving ? t("Saving restriction…") : <><Check size={17} />{!canPublish ? t('Submit for review') : closure ? t("Save changes") : publish ? t("Save restriction") : t("Save draft")}</>}</button>
    <button type="button" className="text-button full centered" onClick={onCancel}>{t("Cancel")}</button>
  </form>;
}
function ShieldNote() { return <Check size={17} aria-hidden="true" />; }
