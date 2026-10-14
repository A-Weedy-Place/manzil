import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownUp, ArrowRight, ArrowUpRight, Bell, Bookmark, CalendarClock, Check, ChevronRight, Clock3, Download, ExternalLink, Eye, EyeOff, Flag, Inbox, Layers2, LocateFixed, MapPinned, Navigation, Pencil, Plus, RefreshCw, Repeat2, Route, Search, ShieldCheck, SlidersHorizontal, Trash2, TriangleAlert, Upload, UserRound, WifiOff, X } from 'lucide-react';
import type { Polygon } from 'geojson';
import type { AppState, Closure, ClosureDraft, Commute, CommuteImpact, Coordinate, Drawing, FrequentRouteProposal, MapFocus, MapMode, Place, PlanResponse, RecordedPoint, RouteOption, SourceNotice, Trip } from '../shared/types';
const MapView = lazy(() => import('./components/MapView'));
import PlaceInput from './components/PlaceInput';
import ClosureEditor from './components/ClosureEditor';
import RouteResults from './components/RouteResults';
import SourcePanel from './components/SourcePanel';
import CommutePanel from './components/CommutePanel';
import ActivityPanel from './components/ActivityPanel';
import ProfilePanel from './components/ProfilePanel';
import NavigationPanel from './components/NavigationPanel';
import { useAlertNotifications } from './lib/notifications';
import { api, send } from './lib/api';
import { closureState, dateTime, dayDate, distance, downloadJSON, inputISO, localInput, relative, time } from './lib/format';

type View = 'journey' | 'closures' | 'commutes' | 'activity' | 'sources' | 'alerts' | 'profile' | 'navigation';
const NAV = [
  { id: 'journey', label: 'Map', icon: MapPinned },
  { id: 'closures', label: 'Closures', icon: Flag },
  { id: 'commutes', label: 'Saved', icon: Bookmark },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'profile', label: 'Profile', icon: UserRound },
] as const;
const EXAMPLE_ORIGIN: Place = { id: 'faisal-mosque', name: 'Faisal Mosque · approach road', coordinate: [73.0376503, 33.7314163] };
const EXAMPLE_DESTINATION: Place = { id: 'centaurus', name: 'Centaurus · Nazimuddin Road', coordinate: [73.0492744, 33.7081776] };

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>(window.location.hash === '#alerts' ? 'alerts' : 'journey');
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [online, setOnline] = useState(true); const [startupError, setStartupError] = useState('');
  const [origin, setOrigin] = useState<Place | null>(EXAMPLE_ORIGIN);
  const [destination, setDestination] = useState<Place | null>(EXAMPLE_DESTINATION);
  const [departure, setDeparture] = useState(localInput());
  const [departureMode, setDepartureMode] = useState<'now' | 'scheduled'>('now');
  const [compare, setCompare] = useState(true);
  const [mode, setMode] = useState<MapMode>('browse');
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false); const [planError, setPlanError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false); const [editing, setEditing] = useState<Closure | null>(null);
  const [editorSeed, setEditorSeed] = useState<Partial<ClosureDraft> | undefined>();
  const [editorKey, setEditorKey] = useState(0);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [selectedClosure, setSelectedClosure] = useState<string | null>(null);
  const [showClosures, setShowClosures] = useState(true); const [showBaseline, setShowBaseline] = useState(false);
  const [systemDark, setSystemDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [navigationPosition, setNavigationPosition] = useState<Coordinate | null>(null);
  const [closureFilter, setClosureFilter] = useState('current');
  const [toast, setToast] = useState(''); const [demoBusy, setDemoBusy] = useState(false);
  const [commuteOpen, setCommuteOpen] = useState(0);
  const [recordedPoints, setRecordedPoints] = useState<RecordedPoint[]>([]);
  const [historyTrace, setHistoryTrace] = useState<RecordedPoint[]>([]);
  const [historyName, setHistoryName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const planSequence = useRef(0);
  const reloadSequence = useRef(0);
  const latestView = useRef(view); latestView.current = view;
  const theme = state?.profile?.theme === 'system' || !state?.profile?.theme ? systemDark ? 'dark' : 'light' : state.profile.theme;
  useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: dark)'); const changed = () => setSystemDark(media.matches); media.addEventListener('change', changed); return () => media.removeEventListener('change', changed); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useAlertNotifications(state, () => setView('alerts'));
  useEffect(() => { if (!('serviceWorker' in navigator)) return; const opened = (event: MessageEvent) => { if (event.data?.type === 'OPEN_ALERTS') setView('alerts'); }; navigator.serviceWorker.addEventListener('message', opened); return () => navigator.serviceWorker.removeEventListener('message', opened); }, []);
  const notify = useCallback((message: string) => setToast(message), []);
  const reload = useCallback(async () => {
    const sequence = ++reloadSequence.current;
    try { const next = await api<AppState>('/state'); if (sequence !== reloadSequence.current) return; setState(next); setOnline(true); setStartupError(''); }
    catch (e) { if (sequence !== reloadSequence.current) return; setOnline(false); setStartupError(e instanceof Error ? e.message : 'The local API is unavailable. Start the server and retry.'); throw e; }
  }, []);
  useEffect(() => { reload().catch(() => {}); const timer = setInterval(() => reload().catch(() => {}), 20000); return () => clearInterval(timer); }, [reload]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [view, editorOpen]);
  useEffect(() => { if (plan && view === 'journey') panelRef.current?.scrollTo({ top: 0 }); }, [plan]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMode('browse'); };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, []);
  const focusPoints = useCallback((coordinates: Coordinate[]) => setFocus({ coordinates, token: Date.now() + Math.random() }), []);
  const departureISO = (() => { try { return departureMode === 'now' ? new Date().toISOString() : inputISO(departure); } catch { return new Date().toISOString(); } })();
  const stale = !!plan && !!state && plan.eventRevision !== state.eventRevision;
  const routeForGuidance = plan?.options.find(option => option.id === selectedRouteId) ?? plan?.options[0] ?? null;
  const selectedRoute = !stale ? routeForGuidance : null;
  const mapDepartureAt = ['journey', 'navigation'].includes(view) && selectedRoute ? selectedRoute.departureAt : departureISO;
  const visibleClosures = state?.closures.filter(closure => {
    const status = closureState(closure, departureISO);
    return closureFilter === 'all' || closureFilter === 'current' && ['active', 'scheduled', 'draft'].includes(status) || status === closureFilter;
  }) ?? [];
  const activeCount = state?.closures.filter(c => closureState(c, departureISO) === 'active').length ?? 0;
  const upcomingCount = state?.closures.filter(c => closureState(c, departureISO) === 'scheduled').length ?? 0;
  const unread = state?.alerts.filter(alert => !alert.read).length ?? 0;
  function navigate(next: View) {
    if (next === 'journey' && view === 'navigation' && plan?.options.length) focusPoints(plan.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind)).flatMap(option => option.geometry.coordinates as Coordinate[]));
    setView(next); setMode('browse');
  }
  function changeEndpoint(letter: 'A' | 'B', coordinate: Coordinate) {
    const place = { name: `Map point · ${coordinate[1].toFixed(4)}, ${coordinate[0].toFixed(4)}`, coordinate };
    if (letter === 'A') setOrigin(place); else setDestination(place);
    invalidatePlan();
  }
  function invalidatePlan() { planSequence.current++; setPlanning(false); setPlan(null); setPlanError(''); setHistoryTrace([]); }
  function pick(coordinate: Coordinate) {
    if (mode === 'origin') changeEndpoint('A', coordinate);
    if (mode === 'destination') changeEndpoint('B', coordinate);
    setMode('browse');
  }
  async function calculate(event?: React.FormEvent) {
    event?.preventDefault(); setPlanError('');
    if (!origin || !destination) { setPlanError('Choose a start and destination first.'); return; }
    const sequence = ++planSequence.current; setPlanning(true); setMode('browse'); setHistoryTrace([]);
    try {
      const requestedDeparture = departureMode === 'now' ? new Date().toISOString() : inputISO(departure);
      if (departureMode === 'now') setDeparture(localInput(new Date(requestedDeparture)));
      const result = await send<PlanResponse>('/plan', { origin, destination, departureAt: requestedDeparture, compareDepartures: compare });
      if (sequence !== planSequence.current) return;
      setPlan(result); setSelectedRouteId(result.options[0]?.id ?? null); setPanelExpanded(false);
      if (result.options[0]) { const paths = result.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind)); focusPoints((paths.length ? paths : [result.options[0]]).flatMap(option => option.geometry.coordinates as Coordinate[])); }
      else if (result.baseline) focusPoints(result.baseline.geometry.coordinates as Coordinate[]);
      else focusPoints([origin.coordinate, destination.coordinate]);
    } catch (e) { if (sequence === planSequence.current) setPlanError(e instanceof Error ? e.message : 'Could not calculate your route.'); }
    finally { if (sequence === planSequence.current) setPlanning(false); }
  }
  function beginClosure(seed?: Partial<ClosureDraft>) {
    setView('closures'); setEditing(null); setEditorSeed(seed); setSelectedClosure(null);
    setDrawing({ kind: 'line', coordinates: [], widthMeters: 35 }); setMode('line'); setEditorOpen(true); setEditorKey(key => key + 1);
  }
  function editClosure(closure: Closure) {
    setEditing(closure); setEditorSeed(undefined); setSelectedClosure(closure.id); setView('closures');
    setDrawing(closure.drawing ?? { kind: 'polygon', coordinates: closure.geometry.coordinates[0].slice(0, -1) as Coordinate[], widthMeters: 35 });
    setMode('browse'); setEditorOpen(true); setEditorKey(key => key + 1); focusPoints(closure.geometry.coordinates[0] as Coordinate[]);
  }
  function cancelEditor() { setEditorOpen(false); setDrawing(null); setEditing(null); setEditorSeed(undefined); setMode('browse'); }
  async function saveClosure(draft: ClosureDraft) {
    const result = editing ? await send<Closure>(`/closures/${editing.id}`, { ...draft, revision: editing.revision }, 'PUT') : await send<Closure>('/closures', draft);
    cancelEditor(); setSelectedClosure(result.id); await reload(); focusPoints(result.geometry.coordinates[0] as Coordinate[]); notify(editing ? 'Restriction updated. Replan to use the latest schedule.' : 'Restriction saved. It will apply during its scheduled period.');
  }
  async function cancelClosure(closure: Closure) {
    try { await api(`/closures/${closure.id}`, { method: 'DELETE' }); await reload(); notify('Restriction cancelled. It no longer affects routing.'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Could not cancel the restriction.'); }
  }
  async function addDemo() {
    if (!plan?.baseline) return; setDemoBusy(true);
    try {
      const coords = plan.baseline.geometry.coordinates; const point = coords[Math.floor(coords.length / 2)] as Coordinate;
      const demoDrawing: Drawing = { kind: 'point', coordinates: [point], widthMeters: 25 };
      const geometry = await send<Polygon>('/geometry', demoDrawing);
      const departureAt = inputISO(departure);
      const closure = await send<Closure>('/closures', { title: 'Demo · planned road restriction', reason: 'other', description: 'Synthetic test event created on this route to demonstrate rerouting. Not a real-world traffic notice.', startsAt: new Date(Date.parse(departureAt) - 15 * 60000).toISOString(), endsAt: new Date(Date.parse(departureAt) + 45 * 60000).toISOString(), status: 'published', geometry, drawing: demoDrawing } satisfies ClosureDraft);
      setSelectedClosure(closure.id); await reload(); await calculate(); notify('Demo restriction added and route recalculated. Cancel it from Closures when finished.');
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not create the demo restriction.'); }
    finally { setDemoBusy(false); }
  }
  function exportClosures() {
    downloadJSON('manzil-restrictions.geojson', { type: 'FeatureCollection', features: state?.closures.map(({ geometry, ...properties }) => ({ type: 'Feature', geometry, properties })) ?? [] });
  }
  async function importClosures(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return; let saved = 0;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a GeoJSON file smaller than 2 MB.');
      const collection = JSON.parse(await file.text());
      if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) || collection.features.length > 100) throw new Error('Use a GeoJSON FeatureCollection with up to 100 polygon restrictions.');
      for (const feature of collection.features) {
        if (feature.type !== 'Feature' || feature.geometry?.type !== 'Polygon') throw new Error('Every imported restriction must have a Polygon geometry.');
        const p = feature.properties ?? {};
        await send('/closures', { title: p.title ?? 'Imported restriction', description: p.description ?? '', reason: p.reason ?? 'other', startsAt: p.startsAt ?? new Date().toISOString(), endsAt: p.endsAt ?? null, status: ['draft', 'published', 'cancelled'].includes(p.status) ? p.status : 'draft', geometry: feature.geometry, drawing: p.drawing, sourceUrl: p.sourceUrl }); saved++;
      }
      await reload(); notify(`Imported ${saved} restriction${saved !== 1 ? 's' : ''}.`);
    } catch (e) { await reload().catch(() => {}); notify(`${saved ? `${saved} imported before the error. ` : ''}${e instanceof Error ? e.message : 'Import failed.'}`); }
    finally { event.target.value = ''; }
  }
  function locate() {
    if (!navigator.geolocation) { notify('Location is unavailable in this browser. Select a point on the map instead.'); return; }
    navigator.geolocation.getCurrentPosition(position => { const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude]; setOrigin({ name: 'My location', coordinate }); invalidatePlan(); focusPoints([coordinate]); notify('Location set as your starting point.'); }, () => notify('Location is unavailable or permission was declined. You can still select any point on the map.'), { maximumAge: 30000, timeout: 15000 });
  }
  async function markAlert(id: string) { try { await send(`/alerts/${id}`, { read: true }, 'PATCH'); await reload(); } catch (e) { notify(e instanceof Error ? e.message : 'Could not mark this alert read.'); } }
  function selectCommute(commute: Commute, impact: CommuteImpact) {
    if (latestView.current !== 'commutes') { notify('Commute check finished. Its relevant alerts are available in the inbox.'); return; }
    planSequence.current++; setPlanning(false); setHistoryTrace([]); setMode('browse'); setPlanError('');
    setOrigin(commute.origin); setDestination(commute.destination); setDepartureMode('scheduled'); setDeparture(localInput(new Date(impact.occurrenceAt))); setPlan(impact.plan); setSelectedRouteId(impact.plan.options[0]?.id ?? null); setView('journey');
    if (impact.plan.options[0]) focusPoints(impact.plan.options[0].geometry.coordinates as Coordinate[]);
  }
  async function saveProposal(proposal: FrequentRouteProposal) {
    await send('/commutes', { name: `Usual journey · ${proposal.departureTime}`, origin: proposal.origin, destination: proposal.destination, departureTime: proposal.departureTime, days: proposal.days, enabled: true });
    await reload(); navigate('commutes'); notify('Usual journey saved. You can check its next departure here.');
  }
  async function replanFromGPS(coordinate: Coordinate) {
    if (!destination) throw new Error('Choose a destination before starting guidance.');
    const sequence = ++planSequence.current, now = new Date().toISOString();
    const start: Place = { name: 'Current GPS location', coordinate };
    const result = await send<PlanResponse>('/plan', { origin: start, destination, departureAt: now, compareDepartures: false });
    if (sequence !== planSequence.current || latestView.current !== 'navigation') throw new Error('Guidance view changed.');
    if (!result.options.length) throw new Error(result.unavailableReason ?? 'No clear connected route was found from your location.');
    await reload();
    if (sequence !== planSequence.current || latestView.current !== 'navigation') throw new Error('Guidance view changed.');
    setOrigin(start); setDepartureMode('now'); setDeparture(localInput(new Date(now))); setPlan(result); setSelectedRouteId(result.options[0].id); setPlanning(false);
    return result.options[0];
  }
  const mapInstructions = mode === 'origin' ? 'Click the map to choose your start' : mode === 'destination' ? 'Click the map to choose your destination' : ['point', 'line', 'polygon'].includes(mode) ? `Draw ${mode === 'point' ? 'a point restriction' : mode === 'line' ? 'the affected road' : 'the affected area'} · Esc to pause` : '';
  return <div className="app-shell">
    <a className="skip-link" href="#workspace-panel">Skip to controls</a>
    <header className="app-header"><button className="brand" onClick={() => navigate('journey')} aria-label="Manzil journey planner"><img src="/manzil-logo.png" width="42" height="42" alt="Manzil Urdu calligraphy" /><span className="brand-name">manzil<span className="brand-dot">.</span></span><span className="brand-divider" /><span className="brand-tagline">Your way, planned ahead.</span></button><div className="header-actions"><span className="local-badge"><span className={online ? 'status-dot' : 'status-dot offline'} />Islamabad</span><button className={`icon-button notification-button ${view === 'alerts' ? 'selected' : ''}`} aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`} onClick={() => navigate('alerts')}><Bell size={22} />{unread > 0 && <span className="notification-count">{unread}</span>}</button><button className="workspace-avatar" aria-label="Open profile and settings" onClick={() => navigate('profile')}>{(state?.profile?.displayName ?? 'M').slice(0, 1).toUpperCase()}</button></div></header>
    <div className="workspace">
      <nav className="nav-rail" aria-label="Main navigation">{NAV.map(({ id, icon: Icon, label }) => <button className={`nav-item ${view === id || id === 'journey' && view === 'navigation' || id === 'profile' && view === 'sources' ? 'active' : ''}`} key={id} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={23} strokeWidth={1.9} aria-hidden="true" /><span>{label}</span></button>)}<div className="rail-bottom"><span>منزل</span><small>ISB</small></div></nav>
      <aside ref={panelRef} className={`side-panel ${panelExpanded ? 'is-expanded' : ''}`} id="workspace-panel" aria-label={`${view} controls`}>
        <button className="sheet-size-toggle" aria-label={panelExpanded ? 'Show more of the map' : 'Expand controls'} aria-expanded={panelExpanded} onClick={() => setPanelExpanded(!panelExpanded)}><span /></button>
        {!state ? <div className="panel-content"><span className="eyebrow">MANZIL LOCAL</span><h1>Getting the road ready.</h1><p className="muted">Connecting to your local workspace…</p>{startupError && <><div className="error-box">{startupError}</div><button className="secondary-button" onClick={() => reload().catch(() => {})}><RefreshCw size={16} />Retry connection</button><p className="small muted">Run <code>npm run dev</code> from the project folder.</p></>}</div> : <>
          {!online && <div className="offline-banner"><WifiOff size={16} />Connection lost. Showing the last loaded data.</div>}
          <div className="panel-content" hidden={view !== 'journey'}>
            <div className="section-heading"><div><span className="eyebrow">PLAN AHEAD</span><h1>{plan && !stale ? 'A clearer way there.' : 'Where do you want to go?'}</h1></div><Route size={25} /></div><p className="muted intro">{plan && !stale ? 'Compare routes. Pick the one that works for you.' : 'Find a route around current and scheduled closures.'}</p>
            <details className="journey-search" open={!plan || stale}><summary><Route size={20} /><span><strong>{origin?.name ?? 'Choose a starting point'}</strong><small>to {destination?.name ?? 'your destination'}</small></span><Pencil size={17} /></summary><form className="journey-form" onSubmit={calculate}>
              <div className="endpoints"><PlaceInput label="Starting point" letter="A" value={origin} active={mode === 'origin'} onPick={() => setMode(mode === 'origin' ? 'browse' : 'origin')} onChange={place => { setOrigin(place); invalidatePlan(); }} /><button type="button" className="swap-button" aria-label="Swap starting point and destination" onClick={() => { setOrigin(destination); setDestination(origin); invalidatePlan(); }}><ArrowDownUp size={16} /></button><PlaceInput label="Destination" letter="B" value={destination} active={mode === 'destination'} onPick={() => setMode(mode === 'destination' ? 'browse' : 'destination')} onChange={place => { setDestination(place); invalidatePlan(); }} /></div>
              <div className="departure-label"><label htmlFor="departure"><CalendarClock size={16} />Departure</label><button type="button" className="text-button" aria-pressed={departureMode === 'now'} onClick={() => { setDepartureMode('now'); setDeparture(localInput()); invalidatePlan(); }}>Leave now</button></div><input id="departure" className="departure-input" type="datetime-local" required value={departure} onInput={e => { setDepartureMode('scheduled'); setDeparture(e.currentTarget.value); invalidatePlan(); }} /><span className="field-hint">{departureMode === 'now' ? 'Leaving now · time updates when you search' : 'Scheduled departure'} · Pakistan time</span>
              <label className="check-row compare-check"><input type="checkbox" checked={compare} onChange={e => { setCompare(e.target.checked); invalidatePlan(); }} />Also compare leaving earlier or later</label>
              <button className="primary-button full plan-button" disabled={planning || !origin || !destination || !state.graph.ready}><Navigation size={18} />{planning ? 'Finding a clear route…' : 'Find my route'}{!planning && <ArrowRight size={17} />}</button>
            </form></details>
            {planError && <div className="error-box" role="alert">{planError}</div>}
            {!state.graph.ready && <div className="error-box">The Islamabad road graph is unavailable. Run <code>npm run data:import</code> and restart the API. No synthetic routes are used.</div>}
            {stale && <div className="notice-box warning"><RefreshCw size={17} /><div><strong>Restrictions changed</strong><p>Replan this journey to use the latest map and schedule.</p></div></div>}
            {plan && !stale ? <RouteResults plan={plan} selectedId={selectedRouteId} onSelect={option => { setSelectedRouteId(option.id); }} onNavigate={() => { setNavigationPosition(null); navigate('navigation'); }} onSaveCommute={() => { setCommuteOpen(n => n + 1); navigate('commutes'); }} onDemo={addDemo} demoBusy={demoBusy} /> : !stale && <div className="journey-empty compact-empty"><ShieldCheck size={26} /><h2>Know before you leave.</h2><p>Choose a departure to check closures along your route. Save a regular journey to get advance alerts.</p></div>}
            <div className="panel-footnote"><span className="status-dot" />Local OSM routing · No live traffic feed</div>
          </div>
          <div className="panel-content" hidden={view !== 'closures'}>
            {editorOpen && drawing ? <ClosureEditor key={editorKey} closure={editing} seed={editorSeed} drawing={drawing} onDraw={setDrawing} mode={mode} setMode={setMode} onSave={saveClosure} onCancel={cancelEditor} /> : <>
              <div className="section-heading"><div><span className="eyebrow">MAKE THE MAP YOURS</span><h1>Road restrictions</h1></div><Flag size={22} /></div><p className="muted">A road closed now, or a blockage planned for later. Put it on your map.</p><button className="primary-button full" onClick={() => beginClosure()}><Plus size={18} />Add a restriction</button>
              <div className="row import-export"><button className="text-button" onClick={exportClosures} disabled={!state.closures.length}><Download size={15} />Export GeoJSON</button><button className="text-button" onClick={() => fileInput.current?.click()}><Upload size={15} />Import</button><input ref={fileInput} type="file" accept=".geojson,.json,application/geo+json,application/json" hidden onChange={importClosures} /></div>
              <div className="filter-row"><span className="small muted">At {time(departureISO)} · {dayDate(departureISO)}</span><select className="small-select" aria-label="Filter restrictions" value={closureFilter} onChange={e => setClosureFilter(e.target.value)}><option value="current">Current & upcoming</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="draft">Drafts</option><option value="all">All restrictions</option></select></div>
              {!visibleClosures.length && <div className="empty-state"><Flag size={32} /><h3>A clean slate</h3><p>No restrictions in this view. Add a point, draw along a road or outline an area.</p><button className="text-button" onClick={() => beginClosure()}>Create your first restriction<ArrowRight size={15} /></button></div>}
              {visibleClosures.map(closure => { const status = closureState(closure, departureISO); return <article key={closure.id} className={`closure-card ${selectedClosure === closure.id ? 'selected' : ''}`}><button className="closure-main" onClick={() => { setSelectedClosure(closure.id); focusPoints(closure.geometry.coordinates[0] as Coordinate[]); }}><span className={`closure-symbol ${status}`}><Flag size={17} /></span><span><span className="closure-title">{closure.title}</span><span className={`tag ${status === 'active' ? 'red' : status === 'scheduled' ? 'orange' : 'neutral'}`}>{status}</span></span><ChevronRight size={16} /></button><div className="closure-card-details"><span><CalendarClock size={14} />{dateTime(closure.startsAt)}</span><span><Clock3 size={14} />{closure.endsAt ? `Until ${dateTime(closure.endsAt)}` : 'Until cancelled · end unknown'}</span>{closure.description && <p>{closure.description}</p>}{closure.sourceUrl && <a className="text-button" href={closure.sourceUrl} target="_blank" rel="noreferrer">Source<ArrowUpRight size={13} /></a>}<div className="row"><button className="text-button" onClick={() => editClosure(closure)}><Pencil size={14} />Edit</button>{closure.status !== 'cancelled' && <button className="text-button danger-text" onClick={() => cancelClosure(closure)}><X size={14} />Cancel restriction</button>}</div></div></article>; })}
              <div className="notice-box soft"><Layers2 size={18} /><p>Restrictions are your own map layer. They change Manzil’s routing, rather than editing the underlying basemap.</p></div>
            </>}
          </div>
          <div className="panel-content" hidden={view !== 'commutes'}><CommutePanel key={`commutes-${commuteOpen}`} state={state} origin={origin} destination={destination} initialOpen={commuteOpen > 0} reload={reload} notify={notify} onPlan={selectCommute} onSelectEndpoints={() => navigate('journey')} /></div>
          <div className="panel-content" hidden={view !== 'activity'}><ActivityPanel state={state} points={recordedPoints} setPoints={points => { setRecordedPoints(points); if (points.length) setHistoryTrace([]); }} reload={reload} notify={notify} onView={trip => { setHistoryTrace(trip.points); setHistoryName(trip.name); focusPoints(trip.points.map(p => p.coordinate)); }} /></div>
          <div className="panel-content" hidden={view !== 'sources'}><SourcePanel state={state} reload={reload} notify={notify} onManualClosure={notice => beginClosure({ title: 'Review · imported notice', description: notice.text, sourceUrl: notice.url || undefined })} /></div>
          <div className="panel-content" hidden={view !== 'profile'}>{state.profile && <ProfilePanel state={state} reload={reload} notify={notify} onSources={() => navigate('sources')} onActivity={() => navigate('activity')} onSaveProposal={saveProposal} />}</div>
          {view === 'navigation' && <div className="panel-content">{routeForGuidance && destination ? <NavigationPanel route={routeForGuidance} destination={destination.name} stale={stale} onBack={() => navigate('journey')} onPosition={setNavigationPosition} onReplan={replanFromGPS} onFocus={focusPoints} /> : <><h1>Choose a route first</h1><button className="primary-button" onClick={() => navigate('journey')}>Open the planner</button></>}</div>}
          <div className="panel-content" hidden={view !== 'alerts'}>
            <div className="section-heading"><div><span className="eyebrow">YOUR HEAD START</span><h1>Journey alerts</h1></div><Bell size={24} /></div><p className="muted">Closures affecting saved journeys, or usual routes learned with your permission.</p>
            <button className="secondary-button full" onClick={() => navigate('profile')}><SlidersHorizontal size={18} />Notification preferences</button>
            {!state.alerts.length && <div className="empty-state"><Bell size={31} /><h3>No journey alerts yet</h3><p>Save a regular commute, or opt into learning from recorded trips in your profile.</p></div>}
            {state.alerts.map(alert => <article className={`alert-card ${!alert.read ? 'unread' : ''}`} key={alert.id}><span className="small muted">{relative(alert.createdAt)}{alert.frequentRouteId ? ' · Usual journey' : ' · Saved journey'}</span><h3>{alert.title}</h3><p>{alert.message}</p><div className="row wrap">{alert.closureId && state.closures.some(c => c.id === alert.closureId) && <button className="text-button" onClick={() => { const closure = state.closures.find(c => c.id === alert.closureId)!; setSelectedClosure(closure.id); focusPoints(closure.geometry.coordinates[0] as Coordinate[]); navigate('closures'); }}><Flag size={16} />View closure</button>}{!alert.read && <button className="text-button" onClick={() => markAlert(alert.id)}><Check size={16} />Mark read</button>}</div></article>)}
            <div className="notice-box soft"><Clock3 size={18} /><p>The server checks journeys automatically. Enable browser notifications in Profile for new alerts while the app is open. Closed-app push remains a deployment step.</p></div>
          </div>
        </>}
      </aside>
      <main className="map-workspace" aria-label="Journey map"><Suspense fallback={<div className="map-status" role="status">Loading the map…</div>}>
        <MapView theme={theme} mapDetail={state?.profile?.mapDetail ?? 'clean'} navigationPosition={navigationPosition} followPosition={view === 'navigation'} routeOptions={view === 'navigation' ? (selectedRoute ? [selectedRoute] : []) : stale ? [] : plan?.options ?? []} onRouteSelect={id => setSelectedRouteId(id)} mode={mode} origin={origin} destination={destination} closures={state?.closures ?? []} selectedClosureId={selectedClosure} selectedRoute={selectedRoute} baseline={stale ? null : plan?.baseline ?? null} drawing={editorOpen && view === 'closures' ? drawing : null} departureAt={mapDepartureAt} focus={focus} showClosures={showClosures} showBaseline={showBaseline} recordedPoints={recordedPoints.length ? recordedPoints : historyTrace} onPick={pick} onDraw={setDrawing} onEndpointMove={changeEndpoint} onClosureSelect={id => { if (editorOpen) { notify('Finish or cancel the current edit before selecting another restriction.'); return; } setSelectedClosure(id); navigate('closures'); }} />
        <div className="map-topline"><div className="city-chip"><MapPinned size={17} /><span>Islamabad<span className="city-chip-country">, Pakistan</span></span><span className="city-chip-dot" /></div><div className="map-layer-controls"><button aria-label="Show restrictions layer" aria-pressed={showClosures} className={showClosures ? 'active' : ''} onClick={() => setShowClosures(!showClosures)}><Flag size={15} /><span>Restrictions</span>{activeCount + upcomingCount > 0 && <b>{activeCount + upcomingCount}</b>}</button>{plan?.baseline && <button aria-label="Show original route layer" aria-pressed={showBaseline} className={showBaseline ? 'active' : ''} onClick={() => setShowBaseline(!showBaseline)}>{showBaseline ? <Eye size={15} /> : <EyeOff size={15} />}<span>Original route</span></button>}</div></div>
        {mapInstructions && <div className="map-instructions" role="status"><span className="status-dot" />{mapInstructions}<button className="icon-button small" aria-label="Stop map selection" onClick={() => setMode('browse')}><X size={16} /></button></div>}
        <div className="map-actions"><button className="map-action" aria-label="Use my location as start" title="Use my location as start" onClick={locate}><LocateFixed size={20} /></button><button className={`map-action ${editorOpen ? 'active' : ''}`} aria-label="Add restriction on map" title="Add restriction" onClick={() => beginClosure()}><Plus size={21} /></button><button className="map-action" aria-label="Fit journey on map" title="Fit journey" onClick={() => { if (selectedRoute) focusPoints(selectedRoute.geometry.coordinates as Coordinate[]); else if (origin && destination) focusPoints([origin.coordinate, destination.coordinate]); else focusPoints([[72.97, 33.60], [73.16, 33.75]]); }}><MapPinned size={20} /></button></div>
        <div className="map-bottom-info"><div className="map-legend"><span><i className="legend-line" />Your route</span><span><i className="legend-block" />Restriction</span><span><i className="legend-upcoming" />Scheduled</span></div><div className="map-context">{historyTrace.length && !recordedPoints.length ? <><Activity size={14} />{historyName}<button className="icon-button small" aria-label="Hide recorded trip" onClick={() => setHistoryTrace([])}><X size={13} /></button></> : <><Clock3 size={14} />{dayDate(mapDepartureAt)} · {time(mapDepartureAt)} PKT</>}</div></div>
      </Suspense></main>
    </div>
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button className="icon-button small" aria-label="Dismiss message" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}
