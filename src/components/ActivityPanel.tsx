import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, CircleStop, Download, LocateFixed, Map, Play, ShieldCheck, Trash2, X } from 'lucide-react';
import type { AppState, RecordedPoint, Trip, TripDraft } from '../../shared/types';
import { api, send } from '../lib/api';
import { dateTime, distance, downloadJSON, duration } from '../lib/format';

interface Props { state: AppState; points: RecordedPoint[]; setPoints: (points: RecordedPoint[]) => void; reload: () => Promise<void>; notify: (message: string) => void; onView: (trip: Trip) => void }
export default function ActivityPanel({ state, points, setPoints, reload, notify, onView }: Props) {
  const [consent, setConsent] = useState(false); const [contribute, setContribute] = useState(false);
  const [recording, setRecording] = useState(false); const [started, setStarted] = useState<string | null>(null);
  const [tripName, setTripName] = useState('My recorded trip'); const [error, setError] = useState('');
  const [gpsMessage, setGpsMessage] = useState(''); const [saving, setSaving] = useState(false); const [deleteId, setDeleteId] = useState<string | null>(null);
  const watch = useRef<number | null>(null); const latest = useRef(points); latest.current = points;
  const active = useRef(false);
  const startedTime = useRef(0);
  const stopWatch = () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; active.current = false; setRecording(false); };
  useEffect(() => () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); }, []);
  useEffect(() => {
    const visibility = () => { if (active.current && document.hidden) setGpsMessage('Recording may pause while this page is hidden. Keep Manzil visible for reliable foreground GPS.'); };
    document.addEventListener('visibilitychange', visibility); return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  function start(resume = false) {
    setError(''); if (saving) return; if (!consent) { setError('Allow this trip’s location history before starting.'); return; }
    if (!navigator.geolocation) { setError('This browser does not support location recording.'); return; }
    if (!resume) { setPoints([]); latest.current = []; startedTime.current = Date.now(); setStarted(new Date(startedTime.current).toISOString()); }
    active.current = true; setRecording(true); setGpsMessage('Waiting for a location fix…');
    watch.current = navigator.geolocation.watchPosition(position => {
      if (!active.current) return;
      if (position.timestamp < startedTime.current) return;
      if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy > 100) { setGpsMessage(`Location accuracy is about ${Math.round(position.coords.accuracy)} m. Waiting for a better fix.`); return; }
      const point: RecordedPoint = { coordinate: [position.coords.longitude, position.coords.latitude], timestamp: new Date(position.timestamp).toISOString(), accuracy: position.coords.accuracy };
      const last = latest.current.at(-1);
      if (last && Date.parse(point.timestamp) - Date.parse(last.timestamp) < 4000) return;
      if (latest.current.length >= 20000) { stopWatch(); setGpsMessage('Recording stopped at this local trip’s 20,000-point limit. Save your trip.'); return; }
      const next = [...latest.current, point]; latest.current = next; setPoints(next); setGpsMessage(`Recording · GPS accuracy ${Math.round(point.accuracy)} m`);
    }, err => { setError(err.code === 1 ? 'Location permission was declined. You can still plan journeys without recording.' : 'A location fix is unavailable. Check your device’s location settings and try again.'); stopWatch(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }
  async function save() {
    stopWatch(); setError('');
    if (!started || points.length < 2) { setError('At least two accurate location samples are needed to save a trip. Continue recording or discard this attempt.'); return; }
    setSaving(true);
    try {
      await send('/trips', { name: tripName, startedAt: started, endedAt: new Date().toISOString(), points, contributeToRoadDiscovery: contribute } satisfies TripDraft);
      stopWatch(); setPoints([]); latest.current = []; setStarted(null); setGpsMessage(''); await reload(); notify('Trip saved locally.');
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
    <div className="section-heading"><div><span className="eyebrow">THE JOURNEYS YOU MAKE</span><h1>Your activity</h1></div><Activity size={23} /></div><p className="muted">A personal picture of your trips, recorded only when you choose.</p>
    <div className="activity-stats"><div><strong>{state.trips.length}</strong><span>saved trips</span></div><div><strong>{distance(totalMeters)}</strong><span>recorded distance</span></div><div><strong>{totalSeconds ? duration(totalSeconds) : '0 min'}</strong><span>travel time</span></div></div>
    <section className={`record-card ${recording ? 'is-recording' : ''}`}><div className="row between"><h2><LocateFixed size={18} />Record a trip</h2>{recording && <span className="tag red"><span className="record-dot" />Recording</span>}</div>
      <label className="field-label">Trip name<input value={tripName} maxLength={120} onChange={e => setTripName(e.target.value)} /></label>
      {!started && <><label className="check-row"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I want to save this trip’s precise location history on this computer.</label><label className="check-row"><input type="checkbox" checked={contribute} onChange={e => setContribute(e.target.checked)} />Also mark this trip as available for future road-discovery review.</label><p className="small muted">Contribution is separate and optional. No road is added automatically and no trace is uploaded to a crowd dataset.</p></>}
      {started && <><p className="gps-status">{gpsMessage || 'Recording paused.'}</p><p className="small muted">{points.length} accurate samples · Started {dateTime(started)}</p></>}
      {!started ? <button className="primary-button full" disabled={!consent || !tripName.trim()} onClick={() => start()}><Play size={16} />Start recording</button> : <div className="stack"><button className="primary-button full" disabled={saving || !tripName.trim()} onClick={save}><CircleStop size={17} />{saving ? 'Saving trip…' : 'Finish and save'}</button>{recording ? <button className="text-button full centered" onClick={stopWatch}>Pause recording</button> : <button className="text-button full centered" disabled={saving} onClick={() => start(true)}>Resume recording</button>}<button className="text-button full centered" disabled={saving} onClick={() => { stopWatch(); setPoints([]); latest.current = []; setStarted(null); setGpsMessage(''); setError(''); }}><X size={14} />Discard this recording</button></div>}
    </section>
    {error && <div className="error-box" role="alert">{error}</div>}
    <div className="section-heading compact"><h2>Trip history</h2><span className="small muted">On this computer</span></div>
    {!state.trips.length && <div className="empty-state compact-empty"><Map size={29} /><h3>Every journey has a story</h3><p>Your recorded routes, distance and time will appear here. GPS samples require a real device location.</p></div>}
    {state.trips.map(trip => <article className="trip-card" key={trip.id}><div className="row between"><h3>{trip.name}</h3><button className="icon-button small" aria-label={`Delete ${trip.name}`} onClick={() => setDeleteId(deleteId === trip.id ? null : trip.id)}><Trash2 size={15} /></button></div><span className="small muted">{dateTime(trip.startedAt)}</span><div className="trip-metrics"><strong>{distance(trip.distanceMeters)}</strong><span>{duration(trip.durationSeconds)}</span><span>{(trip.pointCount ?? trip.points.length) ? `${(trip.pointCount ?? trip.points.length)} points` : 'Summary only'}</span></div>{trip.gaps > 0 && <p className="small muted">{trip.gaps} recording gap{trip.gaps > 1 ? 's' : ''}; distance may be incomplete.</p>}{trip.contributeToRoadDiscovery && <span className="tag neutral">Road review consent</span>}<div className="row"><button className="text-button" disabled={!(trip.pointCount ?? trip.points.length)} onClick={() => fullTrip(trip, 'view')}>View on map<ArrowUpRight size={14} /></button><button className="text-button" disabled={!(trip.pointCount ?? trip.points.length)} onClick={() => fullTrip(trip, 'export')}><Download size={14} />Export</button></div>{deleteId === trip.id && <div className="delete-confirm"><p>Delete this trip and its saved trace?</p><button className="danger-button" onClick={() => remove(trip.id)}>Delete trip</button><button className="text-button" onClick={() => setDeleteId(null)}>Keep it</button></div>}</article>)}
    <div className="notice-box soft"><ShieldCheck size={18} /><p>Foreground recording only. Raw points are kept for 30 days; summaries for 90 days. You can export or delete a trip. Local database files are excluded from Git.</p></div>
  </>;
}
