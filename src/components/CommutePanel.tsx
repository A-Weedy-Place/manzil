import { t } from '../lib/language';
import { useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, Plus, RefreshCw, Repeat2, Trash2, X } from 'lucide-react';
import type { AppState, Commute, CommuteDraft, CommuteImpact, Place } from '../../shared/types';
import { send, api } from '../lib/api';
import { time, dayDate } from '../lib/format';

interface Props { state: AppState; origin: Place | null; destination: Place | null; waypoints: (Place | null)[]; initialOpen: boolean; reload: () => Promise<void>; notify: (message: string) => void; onPlan: (commute: Commute, impact: CommuteImpact) => void; onSelectEndpoints: () => void }
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export default function CommutePanel({ state, origin, destination, waypoints, initialOpen, reload, notify, onPlan, onSelectEndpoints }: Props) {
  const [open, setOpen] = useState(initialOpen); const [name, setName] = useState('My commute'); const [departure, setDeparture] = useState('17:00'); const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); if (!origin || !destination || waypoints.some(place => !place)) { setError('Choose the start, stops and destination first.'); return; }
    setBusy('save');
    try { await send('/commutes', { name, origin, destination, waypoints: waypoints.filter((place): place is Place => !!place), departureTime: departure, days, enabled: true } satisfies CommuteDraft); await reload(); setOpen(false); notify('Journey saved.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save commute.'); } finally { setBusy(null); }
  }
  async function check(commute: Commute) {
    setBusy(commute.id); setError('');
    try { const impact = await send<CommuteImpact>(`/commutes/${commute.id}/check`, {}); await reload(); onPlan(commute, impact); }
    catch (e) { setError(e instanceof Error ? e.message : 'Commute check failed.'); } finally { setBusy(null); }
  }
  async function remove(commute: Commute) {
    setBusy(commute.id);
    try { await api(`/commutes/${commute.id}`, { method: 'DELETE' }); await reload(); notify('Commute removed.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove commute.'); } finally { setBusy(null); }
  }
  return <>
    <div className="section-heading"><h1>{t("Saved journeys")}</h1><Repeat2 size={23} /></div>
    <button className="primary-button full" onClick={() => setOpen(!open)} aria-expanded={open}><Plus size={18} />{t("Save a commute")}</button>
    {open && <form className="inline-form" onSubmit={save}><div className="row between"><h2>{t("New commute")}</h2><button type="button" className="icon-button small" aria-label={t("Close commute form")} onClick={() => setOpen(false)}><X size={17} /></button></div><div className="endpoint-summary"><span>{t("A ")}<strong>{origin?.name ?? 'Choose a start'}</strong></span>{waypoints.map((place, index) => <span key={index}>{index + 1} <strong>{place?.name ?? 'Choose a stop'}</strong></span>)}<span>{t("B ")}<strong>{destination?.name ?? 'Choose a destination'}</strong></span><button type="button" className="text-button" onClick={onSelectEndpoints}>{t("Change in journey planner")}<ArrowRight size={14} /></button></div><label className="field-label">{t("Commute name")}<input required value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label><label className="field-label">{t("Usual departure · Pakistan time")}<input required type="time" value={departure} onInput={e => setDeparture(e.currentTarget.value)} /></label><fieldset className="tool-fieldset"><legend>{t("Repeat on")}</legend><div className="day-picker">{DAYS.map((day, i) => <button type="button" key={i} aria-label={DAY_NAMES[i]} aria-pressed={days.includes(i)} className={days.includes(i) ? 'selected' : ''} onClick={() => setDays(days.includes(i) ? days.filter(d => d !== i) : [...days, i].sort())}>{day}</button>)}</div></fieldset><button className="primary-button full" disabled={busy === 'save' || !days.length || !origin || !destination}>{busy === 'save' ? t("Saving…") : t("Save commute")}</button></form>}
    {error && <div className="error-box" role="alert">{t(error)}</div>}
    <div className="section-heading compact"><h2>{t("Saved journeys")}</h2><span className="small muted">{state.commutes.length}</span></div>
    {!state.commutes.length && <div className="empty-state"><CalendarDays size={32} /><h3>{t("Your daily head start")}</h3><p>{t("Choose a journey, save its usual time and repeat days. No GPS tracking required.")}</p></div>}
    {state.commutes.map(commute => <article className="commute-card" key={commute.id}><div className="row between"><h3>{commute.name}</h3><button className="icon-button small" disabled={busy === commute.id} aria-label={`Remove ${commute.name}`} onClick={() => remove(commute)}><Trash2 size={15} /></button></div><div className="commute-route"><span>{commute.origin.name}</span><ArrowRight size={15} /><span>{commute.destination.name}</span></div><div className="small muted">{commute.waypoints?.length ? `Via ${commute.waypoints.map(place => place.name).join(' → ')}` : null}</div><div className="row small muted"><Clock3 size={14} />{commute.departureTime} {t("PKT")}<span>{t("·")}</span>{commute.days.map(d => DAY_NAMES[d]).join(', ')}</div><button className="secondary-button full" disabled={busy !== null} onClick={() => check(commute)}><RefreshCw size={15} className={busy === commute.id ? 'spin' : ''} />{busy === commute.id ? t("Checking next departure…") : t("Check next departure")}</button></article>)}
    <div className="notice-box soft"><Clock3 size={17} /><p>{t("Local checks and in-app alerts work while the server runs. Reliable closed-browser push is planned for deployment.")}</p></div>
  </>;
}
