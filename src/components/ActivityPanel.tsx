import { t } from '../lib/language';
import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, CircleStop, Download, LocateFixed, Map, Play, ShieldCheck, Trash2, X } from 'lucide-react';
import type { AppState, RecordedPoint, Trip, TripDraft } from '../../shared/types';
import { api, send } from '../lib/api';
import { dateTime, distance, downloadJSON, duration } from '../lib/format';
import { getAuthSession } from '../lib/auth';

interface Props { active?: boolean; state: AppState; points: RecordedPoint[]; setPoints: (points: RecordedPoint[]) => void; reload: () => Promise<void>; notify: (message: string) => void; onView: (trip: Trip) => void }
export default function ActivityPanel({ active: visible = true, state, points, setPoints, reload, notify, onView }: Props) {
  const consent = state.profile.collectTravelData === true; const [contribute, setContribute] = useState(false);
  const [recording, setRecording] = useState(false); const [started, setStarted] = useState<string | null>(null);
  const [tripName, setTripName] = useState('My recorded trip'); const [error, setError] = useState('');
  const [gpsMessage, setGpsMessage] = useState(''); const [saving, setSaving] = useState(false); const [deleteId, setDeleteId] = useState<string | null>(null);
  const watch = useRef<number | null>(null); const latest = useRef(points); latest.current = points;
  const active = useRef(false);
  const epoch = useRef(0);
  const allowed = useRef(consent); allowed.current = consent;
  const owner = useRef<string | null>(null);
  const startedTime = useRef(0);
  const stopWatch = () => { epoch.current++; if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; active.current = false; setRecording(false); };
  useEffect(() => () => { epoch.current++; active.current = false; if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); }, []);
  useEffect(() => { if (!visible) { stopWatch(); setGpsMessage('Recording paused. Resume from Activity when ready.'); } }, [visible]);
  useEffect(() => { if (!consent) { stopWatch(); setPoints([]); latest.current = []; setStarted(null); setGpsMessage(''); } }, [consent]);
  useEffect(() => {
    const visibility = () => { if (active.current && document.hidden) { stopWatch(); setGpsMessage('Recording paused while the page was hidden. Resume when you can keep Manzil visible.'); } };
    document.addEventListener('visibilitychange', visibility); return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  function start(resume = false) {
    setError(''); if (saving || active.current || !visible || document.hidden) return; if (!consent) { setError('Allow personal trip data before recording.'); return; }
    const userId = getAuthSession().user?.uid; if (!userId) { setError('Sign in before recording a personal trip.'); return; }
    if (!navigator.geolocation) { setError('This browser does not support location recording.'); return; }
    if (resume && owner.current !== userId) { setError('Account changed. Discard this recording and start a new trip.'); return; }
    if (!resume) { owner.current = userId; setPoints([]); latest.current = []; startedTime.current = Date.now(); setStarted(new Date(startedTime.current).toISOString()); }
    active.current = true; setRecording(true); setGpsMessage('Waiting for a location fix…');
    const session = ++epoch.current;
    watch.current = navigator.geolocation.watchPosition(position => {
      if (session !== epoch.current || !active.current || !allowed.current || document.hidden || owner.current !== getAuthSession().user?.uid) return;
      if (position.timestamp < startedTime.current) return;
      if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy > 100) { setGpsMessage(`Location accuracy is about ${Math.round(position.coords.accuracy)} m. Waiting for a better fix.`); return; }
      const point: RecordedPoint = { coordinate: [position.coords.longitude, position.coords.latitude], timestamp: new Date(position.timestamp).toISOString(), accuracy: position.coords.accuracy };
      const last = latest.current.at(-1);
      if (last && Date.parse(point.timestamp) - Date.parse(last.timestamp) < 4000) return;
      if (latest.current.length >= 20000) { stopWatch(); setGpsMessage('Recording stopped at this local trip’s 20,000-point limit. Save your trip.'); return; }
      const next = [...latest.current, point]; latest.current = next; setPoints(next); setGpsMessage(`Recording · GPS accuracy ${Math.round(point.accuracy)} m`);
    }, err => { if (session !== epoch.current) return; setError(err.code === 1 ? 'Location permission was declined. You can still plan journeys without recording.' : 'A location fix is unavailable. Check your device’s location settings and try again.'); stopWatch(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }
  async function save() {
    stopWatch(); setError('');
    if (!allowed.current || owner.current !== getAuthSession().user?.uid) { setError('Trip permission or account changed. This recording was not saved.'); return; }
    if (!started || points.length < 2) { setError('At least two accurate location samples are needed to save a trip. Continue recording or discard this attempt.'); return; }
    setSaving(true);
    try {
      await send('/trips', { name: tripName, startedAt: started, endedAt: new Date().toISOString(), points, contributeToRoadDiscovery: contribute } satisfies TripDraft);
      stopWatch(); setPoints([]); latest.current = []; setStarted(null); setGpsMessage(''); await reload(); notify('Trip saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your trip. The points remain here so you can retry.'); }
    finally { setSaving(false); }
  }
  async function remove(id: string) {
    try { await api(`/trips/${id}`, { method: 'DELETE' }); setDeleteId(null); await reload(); notify('Trip deleted from the local app.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete this trip.'); }
  }
  const totalMeters = state.trips.reduce((sum, t) => sum + t.distanceMeters, 0);
  async function fullTrip(trip: Trip, action: 'view' | 'export') {
    try {
      const full = await api<Trip>(`/trips/${trip.id}`);
      if (action === 'view') onView(full);
      else downloadJSON(`manzil-trip-${full.id}.geojson`, { type: 'Feature', properties: { name: full.name, startedAt: full.startedAt, endedAt: full.endedAt }, geometry: { type: 'LineString', coordinates: full.points.map(p => p.coordinate) } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this trip.'); }
  }
  const totalSeconds = state.trips.reduce((sum, t) => sum + t.durationSeconds, 0);
  return <>
    <div className="section-heading"><div><span className="eyebrow">{t("THE JOURNEYS YOU MAKE")}</span><h1>{t("Your activity")}</h1></div><Activity size={23} /></div><p className="muted">{t("Your trip history and personal statistics.")}</p>
    <div className="activity-stats"><div><strong>{state.trips.length}</strong><span>{t("saved trips")}</span></div><div><strong>{distance(totalMeters)}</strong><span>{t("recorded distance")}</span></div><div><strong>{totalSeconds ? duration(totalSeconds) : t("0 min")}</strong><span>{t("travel time")}</span></div></div>
    <section className={`record-card ${recording ? 'is-recording' : ''}`}><div className="row between"><h2><LocateFixed size={18} />{t("Record a trip")}</h2>{recording && <span className="tag red"><span className="record-dot" />{t("Recording")}</span>}</div>
      <label className="field-label">{t("Trip name")}<input value={tripName} maxLength={120} onChange={e => setTripName(e.target.value)} /></label>
      {!consent && <div className="notice-box soft travel-consent-card"><ShieldCheck size={20} /><div><strong>{t('Personal trip data is off')}</strong><p>{t('Allow GPS history for personal statistics and automatic usual-route closure alerts. Only while Manzil is visible; no background tracking.')}</p><button className="primary-button full" disabled={saving} onClick={async () => { setSaving(true); setError(''); try { await send('/profile', { collectTravelData: true, inferFrequentRoutes: true }, 'PATCH'); await reload(); notify('Personal trip data enabled. Start recording or use GPS navigation.'); } catch (error) { setError(error instanceof Error ? error.message : 'Could not save trip permission.'); } finally { setSaving(false); } }}>{t('Allow personal trip data & usual-route alerts')}</button></div></div>}
      {!started && consent && <><label className="check-row"><input type="checkbox" checked={contribute} onChange={e => setContribute(e.target.checked)} />{t("Also mark this trip as available for future road-discovery review.")}</label><p className="small muted">{t("Contribution is separate and optional. No road is added automatically and no trace is uploaded to a crowd dataset.")}</p></>}
      {started && <><p className="gps-status">{gpsMessage || 'Recording paused.'}</p><p className="small muted">{points.length} {t("accurate samples · Started ")}{dateTime(started)}</p></>}
      {!started ? <button className="primary-button full" disabled={!consent || !tripName.trim()} onClick={() => start()}><Play size={16} />{t("Start recording")}</button> : <div className="stack"><button className="primary-button full" disabled={saving || !tripName.trim()} onClick={save}><CircleStop size={17} />{saving ? t("Saving trip…") : t("Finish and save")}</button>{recording ? <button className="text-button full centered" onClick={stopWatch}>{t("Pause recording")}</button> : <button className="text-button full centered" disabled={saving} onClick={() => start(true)}>{t("Resume recording")}</button>}<button className="text-button full centered" disabled={saving} onClick={() => { stopWatch(); setPoints([]); latest.current = []; setStarted(null); setGpsMessage(''); setError(''); }}><X size={14} />{t("Discard this recording")}</button></div>}
    </section>
    {error && <div className="error-box" role="alert">{t(error)}</div>}
    <div className="section-heading compact"><h2>{t("Trip history")}</h2><span className="small muted">{t("Private")}</span></div>
    {!state.trips.length && <div className="empty-state compact-empty"><Map size={29} /><h3>{t("Every journey has a story")}</h3><p>{t("Your recorded routes, distance and time will appear here. GPS samples require a real device location.")}</p></div>}
    {state.trips.map(trip => <article className="trip-card" key={trip.id}><div className="row between"><h3>{trip.name}</h3><button className="icon-button small" aria-label={`Delete ${trip.name}`} onClick={() => setDeleteId(deleteId === trip.id ? null : trip.id)}><Trash2 size={15} /></button></div><span className="small muted">{dateTime(trip.startedAt)}</span><div className="trip-metrics"><strong>{distance(trip.distanceMeters)}</strong><span>{duration(trip.durationSeconds)}</span><span>{(trip.pointCount ?? trip.points.length) ? `${(trip.pointCount ?? trip.points.length)} points` : t("Summary only")}</span></div>{trip.gaps > 0 && <p className="small muted">{trip.gaps} {t("recording gap")}{trip.gaps > 1 ? t("s") : t("")}{t("; distance may be incomplete.")}</p>}{trip.contributeToRoadDiscovery && <span className="tag neutral">{t("Road review consent")}</span>}<div className="row"><button className="text-button" disabled={!(trip.pointCount ?? trip.points.length)} onClick={() => fullTrip(trip, 'view')}>{t("View on map")}<ArrowUpRight size={14} /></button><button className="text-button" disabled={!(trip.pointCount ?? trip.points.length)} onClick={() => fullTrip(trip, 'export')}><Download size={14} />{t("Export")}</button></div>{deleteId === trip.id && <div className="delete-confirm"><p>{t("Delete this trip and its saved trace?")}</p><button className="danger-button" onClick={() => remove(trip.id)}>{t("Delete trip")}</button><button className="text-button" onClick={() => setDeleteId(null)}>{t("Keep it")}</button></div>}</article>)}
    <div className="notice-box soft"><ShieldCheck size={18} /><p>{t("Foreground recording only. Raw points are kept for 30 days; summaries for 90 days. You can export or delete a trip. Local database files are excluded from Git.")}</p></div>
  </>;
}
