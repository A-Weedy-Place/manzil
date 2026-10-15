import { t } from './lib/language';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Palette } from 'lucide-react';
import type { LocalProfile, MapStyleId } from '../shared/types';
import { Activity, ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, ArrowUpRight, Bell, Bookmark, CalendarClock, Check, ChevronRight, Clock3, Download, ExternalLink, Eye, EyeOff, Flag, Inbox, Layers2, LocateFixed, MapPinned, Navigation, Pencil, Plus, RefreshCw, Repeat2, Route, Search, ShieldCheck, SlidersHorizontal, Trash2, TriangleAlert, Upload, UserRound, WifiOff, X } from 'lucide-react';
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
import MapStylePicker from './components/MapStylePicker';
import MapTimeControl from './components/MapTimeControl';
import DemoClosures from './components/DemoClosures';
import NavigationPanel from './components/NavigationPanel';
import AccountPanel, { PersonalFeatureGate } from './components/AccountPanel';
import WelcomeTour, { needsTour } from './components/WelcomeTour';
import { useLanguage } from './lib/useLanguage';
import { signOut, useAuth } from './lib/auth';
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
interface StreetRouteDemo { id: string; title: string; origin: Place; destination: Place; closure: ClosureDraft; closureId?: string; streetNames: string[]; expectedStreetMeters: number }

export default function App() {
  const { language, setLanguage } = useLanguage();
  const { user } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false), [helpOpen, setHelpOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => !user || needsTour());
  useEffect(() => { if (!user) setTourOpen(true); }, [user]);
  const visitedStops = useRef(0);
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr'; }, [language]);
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>(window.location.hash === '#alerts' ? 'alerts' : 'journey');
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [mapStylesOpen, setMapStylesOpen] = useState(false);
  const [mapStyleBusy, setMapStyleBusy] = useState(false);
  const [online, setOnline] = useState(true); const [startupError, setStartupError] = useState('');
  const [origin, setOrigin] = useState<Place | null>(EXAMPLE_ORIGIN);
  const [destination, setDestination] = useState<Place | null>(EXAMPLE_DESTINATION);
  const [waypoints, setWaypoints] = useState<(Place | null)[]>([]);
  const [pickingWaypoint, setPickingWaypoint] = useState(0);
  const [departure, setDeparture] = useState(localInput());
  const [departureMode, setDepartureMode] = useState<'now' | 'scheduled'>('now');
  const [clock, setClock] = useState(() => new Date().toISOString());
  const [planWanted, setPlanWanted] = useState(false);
  const [planSnapshotKey, setPlanSnapshotKey] = useState('');
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
  const [showClosures, setShowClosures] = useState(true); const [showBaseline, setShowBaseline] = useState(true);
  const [systemDark, setSystemDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [navigationPosition, setNavigationPosition] = useState<Coordinate | null>(null);
  const [closureFilter, setClosureFilter] = useState('current');
  const [toast, setToast] = useState(''); const [demoBusy, setDemoBusy] = useState(false);
  const [streetDemoBusy, setStreetDemoBusy] = useState(false);
  const [demoStreetNames, setDemoStreetNames] = useState<string[]>([]);
  const [streetDemoClosureId, setStreetDemoClosureId] = useState<string | null>(null);
  const [commuteOpen, setCommuteOpen] = useState(0);
  const [recordedPoints, setRecordedPoints] = useState<RecordedPoint[]>([]);
  const [historyTrace, setHistoryTrace] = useState<RecordedPoint[]>([]);
  const [historyName, setHistoryName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const planSequence = useRef(0);
  const lastPlanKey = useRef('');
  const reloadSequence = useRef(0);
  const lastLoadedState = useRef<AppState | null>(null);
  const latestView = useRef(view); latestView.current = view;
  const theme = state?.profile?.theme === 'system' || !state?.profile?.theme ? systemDark ? 'dark' : 'light' : state.profile.theme;
  useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: dark)'); const changed = () => setSystemDark(media.matches); media.addEventListener('change', changed); return () => media.removeEventListener('change', changed); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { const tick = () => setClock(new Date().toISOString()); const timer = setInterval(tick, 60000); window.addEventListener('focus', tick); return () => { clearInterval(timer); window.removeEventListener('focus', tick); }; }, []);
  useEffect(() => {
    if (departureMode !== 'now' || !state) return;
    const now = Date.now(), next = state.closures.filter(item => item.status === 'published').flatMap(item => [Date.parse(item.startsAt), item.endsAt ? Date.parse(item.endsAt) : Infinity]).filter(value => value > now).sort((a, b) => a - b)[0];
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setClock(new Date().toISOString()), Math.min(next - now + 25, 60_000)); return () => clearTimeout(timer);
  }, [departureMode, state?.closures, clock]);
  const notificationState = useMemo(() => state && !user ? { ...state, profile: { ...state.profile, browserNotifications: false } } : state, [state, user]);
  useAlertNotifications(notificationState, () => setView('alerts'));
  useEffect(() => { if (!('serviceWorker' in navigator)) return; const opened = (event: MessageEvent) => { if (event.data?.type === 'OPEN_ALERTS') setView('alerts'); }; navigator.serviceWorker.addEventListener('message', opened); return () => navigator.serviceWorker.removeEventListener('message', opened); }, []);
  const notify = useCallback((message: string) => setToast(message), []);
  const reload = useCallback(async () => {
    const sequence = ++reloadSequence.current;
    try { const next = await api<AppState>('/state'); if (sequence !== reloadSequence.current) return; lastLoadedState.current = next; setState(current => current && current.closures.length === next.closures.length && current.closures.every((item, index) => item.id === next.closures[index].id && item.revision === next.closures[index].revision) ? JSON.stringify(current) === JSON.stringify(next) ? current : { ...next, closures: current.closures } : next); setOnline(true); setStartupError(''); }
    catch (e) { if (sequence !== reloadSequence.current) return; setOnline(false); setStartupError(e instanceof Error ? e.message : 'The local API is unavailable. Start the server and retry.'); throw e; }
  }, []);
  useEffect(() => { reload().catch(() => {}); const timer = setInterval(() => reload().catch(() => {}), 20000); return () => clearInterval(timer); }, [reload]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [view, editorOpen]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMode('browse'); };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, []);
  const focusPoints = useCallback((coordinates: Coordinate[]) => setFocus({ coordinates, token: Date.now() + Math.random() }), []);
  const departureISO = departureMode === 'now' ? clock : inputISO(departure);
  const timelineKey = departureMode === 'now' ? `now-${departureISO}` : departureISO;
  const requestKey = JSON.stringify([timelineKey, origin, waypoints, destination, compare, state?.eventRevision]);
  const stale = !!plan && !!state && (plan.eventRevision !== state.eventRevision || view !== 'navigation' && planSnapshotKey !== requestKey);
  const sameTimeRoutes = useMemo(() => plan?.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind)) ?? [], [plan]);
  const routeForGuidance = sameTimeRoutes.find(option => option.id === selectedRouteId) ?? sameTimeRoutes[0] ?? null;
  const selectedRoute = !stale ? routeForGuidance : null;
  const mapRouteOptions = useMemo(() => view === 'navigation' ? selectedRoute ? [selectedRoute] : [] : sameTimeRoutes, [view, selectedRoute, stale, sameTimeRoutes]);
  const mapDepartureAt = departureISO;
  const visibleClosures = state?.closures.filter(closure => {
    const status = closureState(closure, departureISO);
    return closureFilter === 'all' || closureFilter === 'current' && ['active', 'scheduled', 'draft'].includes(status) || status === closureFilter;
  }) ?? [];
  const activeCount = state?.closures.filter(c => closureState(c, departureISO) === 'active').length ?? 0;
  const upcomingCount = state?.closures.filter(c => closureState(c, departureISO) === 'scheduled').length ?? 0;
  const unread = state?.alerts.filter(alert => !alert.read).length ?? 0;
  const streetDemoClosure = demoStreetNames.length ? state?.closures.find(closure => closure.id === streetDemoClosureId && closure.status === 'published') : null;
  useEffect(() => {
    if (view !== 'navigation' && planWanted && lastPlanKey.current !== requestKey && origin && destination && waypoints.every(Boolean)) void calculate(undefined, true);
  }, [requestKey, planWanted, view]);
  function navigate(next: View) {
    if (view === 'navigation' && next !== 'navigation' && plan) setPlanWanted(true);
    if (next === 'journey' && view === 'navigation' && plan?.options.length) focusPoints(plan.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind)).flatMap(option => option.geometry.coordinates as Coordinate[]));
    if (view === 'navigation' && next !== 'navigation') { const count = visitedStops.current; if (count) setWaypoints(current => current.slice(count)); visitedStops.current = 0; }
    setView(next); setMode('browse');
  }
  function changeEndpoint(letter: 'A' | 'B', coordinate: Coordinate) {
    const place = { name: `Map point · ${coordinate[1].toFixed(4)}, ${coordinate[0].toFixed(4)}`, coordinate };
    if (letter === 'A') setOrigin(place); else setDestination(place);
    invalidatePlan();
  }
  function invalidatePlan(resetWanted = true) { planSequence.current++; setPlanning(false); setPlan(null); setPlanError(''); setHistoryTrace([]); if (resetWanted) { setPlanWanted(false); setDemoStreetNames([]); } }
  function changeMapTime(value: string | null) {
    if (value && departureMode === 'scheduled' && inputISO(value) === departureISO && view !== 'navigation') return;
    lastPlanKey.current = '';
    invalidatePlan(false); setView(current => current === 'navigation' ? 'journey' : current);
    if (plan) setPlanWanted(true);
    setDepartureMode(value ? 'scheduled' : 'now'); setDeparture(value ?? localInput()); setClock(new Date().toISOString());
  }
  function changeWaypoint(index: number, place: Place | null) { setWaypoints(current => current.map((item, i) => i === index ? place : item)); invalidatePlan(); }
  const moveWaypointOnMap = useCallback((index: number, coordinate: Coordinate) => {
    setWaypoints(current => current.map((place, i) => i === index ? { name: `Stop ${index + 1}`, coordinate } : place));
    planSequence.current++; setPlanning(false); setPlan(null); setPlanError(''); setPlanWanted(false);
  }, []);
  function moveWaypoint(index: number, direction: number) {
    setWaypoints(current => { const next = [...current], target = index + direction; [next[index], next[target]] = [next[target], next[index]]; return next; }); setMode('browse'); invalidatePlan();
  }
  function selectRoute(option: RouteOption) {
    if (['leave_earlier', 'leave_later'].includes(option.kind)) changeMapTime(localInput(new Date(option.departureAt)));
    else setSelectedRouteId(option.id);
  }
  function pick(coordinate: Coordinate) {
    if (mode === 'origin') changeEndpoint('A', coordinate);
    if (mode === 'destination') changeEndpoint('B', coordinate);
    if (mode === 'waypoint') changeWaypoint(pickingWaypoint, { name: `Stop ${pickingWaypoint + 1}`, coordinate });
    setMode('browse');
  }
  async function calculate(event?: React.FormEvent, preserveView = false) {
    event?.preventDefault(); setPlanError('');
    if (!origin || !destination || waypoints.some(place => !place)) { setPlanError('Choose a start, every stop, and a destination.'); return; }
    lastPlanKey.current = requestKey; setPlanWanted(true);
    const sequence = ++planSequence.current; setPlanning(true); setMode('browse'); setHistoryTrace([]);
    try {
      const requestedDeparture = departureISO;
      if (departureMode === 'now') setDeparture(localInput(new Date(requestedDeparture)));
      const result = await send<PlanResponse>('/plan', { origin, destination, waypoints, departureAt: requestedDeparture, compareDepartures: compare });
      if (sequence !== planSequence.current) return;
      const driving = result.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind));
      setPlan(result); setPlanSnapshotKey(requestKey); setSelectedRouteId(previous => preserveView && driving.some(option => option.id === previous) ? previous : driving[0]?.id ?? null);
      if (!preserveView) {
        panelRef.current?.scrollTo({ top: 0 });
        setPanelExpanded(false);
        if (driving.length) focusPoints(driving.flatMap(option => option.geometry.coordinates as Coordinate[]));
        else if (result.baseline) focusPoints(result.baseline.geometry.coordinates as Coordinate[]);
        else focusPoints([origin.coordinate, destination.coordinate]);
      }
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
      const departureAt = departureISO;
      const closure = await send<Closure>('/closures', { title: 'Demo · planned road restriction', reason: 'other', description: 'Synthetic test event created on this route to demonstrate rerouting. Not a real-world traffic notice.', startsAt: new Date(Date.parse(departureAt) - 15 * 60000).toISOString(), endsAt: new Date(Date.parse(departureAt) + 45 * 60000).toISOString(), status: 'published', geometry, drawing: demoDrawing } satisfies ClosureDraft);
      setSelectedClosure(closure.id); await reload(); notify('Demo closure added.');
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not create the demo restriction.'); }
    finally { setDemoBusy(false); }
  }
  async function loadStreetDemo() {
    if (streetDemoBusy) return;
    invalidatePlan(); const sequence = planSequence.current; setStreetDemoBusy(true);
    try {
      const demo = await send<StreetRouteDemo>('/demos/street-route', { at: departureISO });
      await reload();
      if (sequence !== planSequence.current || latestView.current !== 'journey') return;
      setOrigin(demo.origin); setDestination(demo.destination); setWaypoints([]); setDemoStreetNames(demo.streetNames);
      setSelectedClosure(demo.closureId ?? null); setStreetDemoClosureId(demo.closureId ?? null); setDrawing(null); setEditorOpen(false); setMode('browse');
      lastPlanKey.current = ''; setPlanWanted(true); setPanelExpanded(false);
      focusPoints([demo.origin.coordinate, demo.destination.coordinate]);
      notify('F-8 street detour demo loaded.');
    } catch (error) { if (sequence === planSequence.current) setPlanError(error instanceof Error ? error.message : 'Could not load the street demo.'); }
    finally { setStreetDemoBusy(false); }
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
    setOrigin(commute.origin); setDestination(commute.destination); setWaypoints(commute.waypoints ?? []); setDepartureMode('scheduled'); setDeparture(localInput(new Date(impact.occurrenceAt))); setPlanWanted(true); setPlan(null); lastPlanKey.current = ''; setView('journey');
    if (impact.plan.options[0]) focusPoints(impact.plan.options[0].geometry.coordinates as Coordinate[]);
  }
  async function saveProposal(proposal: FrequentRouteProposal) {
    await send('/commutes', { name: `Usual journey · ${proposal.departureTime}`, origin: proposal.origin, destination: proposal.destination, departureTime: proposal.departureTime, days: proposal.days, enabled: true });
    await reload(); navigate('commutes'); notify('Usual journey saved. You can check its next departure here.');
  }
  async function changeMapStyle(mapStyle: MapStyleId) {
    if (mapStyleBusy || !state || state.profile.mapStyle === mapStyle) return;
    setMapStyleBusy(true);
    try {
      const profile = await send<LocalProfile>('/profile', { mapStyle }, 'PATCH');
      setState(current => current ? { ...current, profile } : current);
      await reload();
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not change the map style.'); }
    finally { setMapStyleBusy(false); }
  }
  async function replanFromGPS(coordinate: Coordinate, completedStops = 0) {
    if (!destination) throw new Error('Choose a destination before starting guidance.');
    const remainingStops = waypoints.slice(completedStops);
    if (remainingStops.some(stop => !stop)) throw new Error('Choose every remaining stop before navigation.');
    const sequence = ++planSequence.current, now = new Date().toISOString();
    const start: Place = { name: 'Current GPS location', coordinate };
    const result = await send<PlanResponse>('/plan', { origin: start, destination, waypoints: remainingStops, departureAt: now, compareDepartures: false });
    if (sequence !== planSequence.current || latestView.current !== 'navigation') throw new Error('Guidance view changed.');
    if (!result.options.length) throw new Error(result.unavailableReason ?? 'No clear connected route was found from your location.');
    await reload();
    if (lastLoadedState.current?.eventRevision !== result.eventRevision) throw new Error('Restrictions changed while updating. Trying again shortly.');
    visitedStops.current = completedStops;
    if (sequence !== planSequence.current || latestView.current !== 'navigation') throw new Error('Guidance view changed.');
    setOrigin(start); setDepartureMode('now'); setDeparture(localInput(new Date(now))); setClock(now); setPlan(result); setPlanWanted(false); const nextKey = JSON.stringify([`now-${now}`, start, waypoints, destination, compare, result.eventRevision]); setPlanSnapshotKey(nextKey); lastPlanKey.current = nextKey; setSelectedRouteId(result.options[0].id); setPlanning(false);
    return result.options[0];
  }
  const mapInstructions = mode === 'origin' ? 'Choose start' : mode === 'destination' ? 'Choose destination' : mode === 'waypoint' ? `Choose stop ${pickingWaypoint + 1}` : ['point', 'line', 'polygon'].includes(mode) ? `Draw ${mode === 'point' ? 'a restriction' : mode === 'line' ? 'the closed road' : 'the closed area'} · Esc to pause` : '';
  return <div className="app-shell">
    <a className="skip-link" href="#workspace-panel">{t("Skip to controls")}</a>
    <header className="app-header"><button className="brand" onClick={() => navigate('journey')} aria-label={t("Manzil journey planner")}><img src="/manzil-logo.png" width="42" height="42" alt={t("Manzil Urdu calligraphy")} /><span className="brand-name">{t("manzil")}<span className="brand-dot">{t(".")}</span></span></button><MapTimeControl at={mapDepartureAt} live={departureMode === 'now'} onChange={changeMapTime} /><div className="header-actions"><button className="language-switch" data-tour="language" lang={language === 'en' ? 'ur' : 'en'} onClick={() => setLanguage(language === 'en' ? 'ur' : 'en')} aria-label={language === 'en' ? 'اردو میں دیکھیں' : 'View in English'}>{language === 'en' ? 'اردو' : 'English'}</button><button className="text-button account-trigger" onClick={() => user ? navigate('profile') : setAccountOpen(true)}>{user ? t(user.displayName ?? 'Guest') : t("Sign in")}</button><button className={`icon-button notification-button ${view === 'alerts' ? 'selected' : ''}`} aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`} onClick={() => navigate('alerts')}><Bell size={22} />{unread > 0 && <span className="notification-count">{unread}</span>}</button><button className="workspace-avatar" aria-label={t("Open profile and settings")} onClick={() => navigate('profile')}>{(user?.displayName ?? 'M').slice(0, 1).toUpperCase()}</button></div></header>
    {mapStylesOpen && state && <MapStylePicker value={state.profile.mapStyle ?? 'streets'} disabled={mapStyleBusy} onChange={changeMapStyle} onClose={() => setMapStylesOpen(false)} />}
    <div className="workspace">
      <nav className="nav-rail" aria-label={t("Main navigation")}>{NAV.filter(item => item.id !== 'activity' || !!user).map(({ id, icon: Icon, label }) => <button className={`nav-item ${view === id || id === 'journey' && view === 'navigation' || id === 'profile' && view === 'sources' ? 'active' : ''}`} key={id} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={23} strokeWidth={1.9} aria-hidden="true" /><span>{t(label)}</span></button>)}<div className="rail-bottom"><span>{t("منزل")}</span><small>{t("ISB")}</small></div></nav>
      <aside ref={panelRef} className={`side-panel ${panelExpanded ? 'is-expanded' : ''}`} id="workspace-panel" aria-label={`${view} controls`}>
        <button className="sheet-size-toggle" aria-label={panelExpanded ? 'Show more of the map' : 'Expand controls'} aria-expanded={panelExpanded} onClick={() => setPanelExpanded(!panelExpanded)}><span /></button>
        {!state ? <div className="panel-content"><span className="eyebrow">{t("MANZIL LOCAL")}</span><h1>{t("Getting the road ready.")}</h1><p className="muted">{t("Connecting to your local workspace…")}</p>{startupError && <><div className="error-box">{t(startupError)}</div><button className="secondary-button" onClick={() => reload().catch(() => {})}><RefreshCw size={16} />{t("Retry connection")}</button><p className="small muted">{t("Run ")}<code>{t("npm run dev")}</code> {t("from the project folder.")}</p></>}</div> : <>
          {!online && <div className="offline-banner"><WifiOff size={16} />{t("Connection lost. Showing the last loaded data.")}</div>}
          <div className="panel-content" hidden={view !== 'journey'}>
            <div className="section-heading journey-heading"><h1>{plan ? t("Your routes") : t("Where to?")}</h1><button className="text-button" data-tour="help" onClick={() => setHelpOpen(!helpOpen)} aria-expanded={helpOpen}>{t("Help & demos")}</button></div>
            <button className="secondary-button full" disabled={streetDemoBusy} onClick={loadStreetDemo}><FlaskConical size={18} />{t('Try street detour')}</button>
            <details className="journey-search" open={!plan}><summary><Route size={20} /><span><strong>{origin?.name ?? t('Choose a starting point')}</strong><small>{t("to ")}{destination?.name ?? t('your destination')}{waypoints.length ? ` · ${waypoints.length} stop${waypoints.length === 1 ? t("") : t("s")}` : t("")}</small></span><Pencil size={17} /></summary><form className="journey-form" data-tour="search" onSubmit={calculate}>
              <div className="endpoints"><PlaceInput label={t("Starting point")} letter="A" value={origin} active={mode === 'origin'} onPick={() => setMode(mode === 'origin' ? 'browse' : 'origin')} onChange={place => { setOrigin(place); invalidatePlan(); }} /><button type="button" className="swap-button" aria-label={t("Reverse journey")} onClick={() => { setOrigin(destination); setDestination(origin); setWaypoints(current => [...current].reverse()); setMode('browse'); invalidatePlan(); }}><ArrowDownUp size={16} /></button>
                {waypoints.map((place, index) => <div className="waypoint-row" key={index}><PlaceInput label={`Stop ${index + 1}`} letter={`${index + 1}`} value={place} active={mode === 'waypoint' && pickingWaypoint === index} onPick={() => { setPickingWaypoint(index); setMode(mode === 'waypoint' && pickingWaypoint === index ? 'browse' : 'waypoint'); }} onChange={next => changeWaypoint(index, next)} /><div className="waypoint-actions"><button type="button" className="icon-button small" aria-label={`Move stop ${index + 1} earlier`} disabled={index === 0} onClick={() => moveWaypoint(index, -1)}><ArrowUp size={15} /></button><button type="button" className="icon-button small" aria-label={`Move stop ${index + 1} later`} disabled={index === waypoints.length - 1} onClick={() => moveWaypoint(index, 1)}><ArrowDown size={15} /></button><button type="button" className="icon-button small danger-text" aria-label={`Remove stop ${index + 1}`} onClick={() => { setWaypoints(current => current.filter((_, i) => i !== index)); setMode('browse'); invalidatePlan(); }}><X size={16} /></button></div></div>)}
                <PlaceInput label={t("Destination")} letter="B" value={destination} active={mode === 'destination'} onPick={() => setMode(mode === 'destination' ? 'browse' : 'destination')} onChange={place => { setDestination(place); invalidatePlan(); }} /></div>
              <button className="text-button add-stop" type="button" disabled={waypoints.length >= 5} onClick={() => { setWaypoints(current => [...current, null]); invalidatePlan(); }}><Plus size={17} />{t("Add stop")}{waypoints.length > 0 && <span className="small muted">{waypoints.length}{t("/5")}</span>}</button>
              <label className="check-row compare-check"><input type="checkbox" checked={compare} onChange={e => { setCompare(e.target.checked); invalidatePlan(); }} />{t("Also compare leaving earlier or later")}</label>
              <button className="primary-button full plan-button" disabled={planning || !origin || !destination || waypoints.some(place => !place) || !state.graph.ready}><Navigation size={18} />{planning ? t("Finding routes…") : t("Find routes")}{!planning && <ArrowRight size={17} />}</button>
            </form></details>
            {planError && <div className="error-box" role="alert">{t(planError)}</div>}
            {!state.graph.ready && <div className="error-box">{t("The Islamabad road graph is unavailable. Run ")}<code>{t("npm run data:import")}</code> {t("and restart the API. No synthetic routes are used.")}</div>}
            {stale && <div className="notice-box warning"><RefreshCw size={17} /><div><strong>{t("Restrictions changed")}</strong><p>{t("Replan this journey to use the latest map and schedule.")}</p></div></div>}
            {plan && <RouteResults updating={stale} plan={plan} selectedId={selectedRouteId} onSelect={selectRoute} onNavigate={() => { setNavigationPosition(null); navigate('navigation'); }} onSaveCommute={() => { setCommuteOpen(n => n + 1); navigate('commutes'); }} onDemo={addDemo} demoBusy={demoBusy} showDemo streetDemoNames={demoStreetNames} onReopenDemo={streetDemoClosure ? () => { void cancelClosure(streetDemoClosure); } : undefined} />}
            {view === 'journey' && <DemoClosures at={departureISO} revision={state.eventRevision} reload={reload} notify={notify} onFocus={focusPoints} />}
            {view === 'journey' && helpOpen && <div className="help-panel"><button className="text-button" onClick={() => { navigate('journey'); setTourOpen(true); }}>{t('Replay tour')}</button><button className="text-button" onClick={() => navigate('closures')}>{t('Road closures')}</button><button className="text-button" onClick={() => navigate('sources')}>{t('Source updates')}</button></div>}
          </div>
          <div className="panel-content" hidden={view !== 'closures'}>
            {editorOpen && drawing ? <ClosureEditor key={editorKey} closure={editing} seed={editorSeed} drawing={drawing} onDraw={setDrawing} mode={mode} setMode={setMode} onSave={saveClosure} onCancel={cancelEditor} /> : <>
              <div className="section-heading"><h1>{t("Road closures")}</h1><Flag size={22} /></div><button className="primary-button full" onClick={() => beginClosure()}><Plus size={18} />{t("Add closure")}</button>
              <div className="row import-export"><button className="text-button" onClick={exportClosures} disabled={!state.closures.length}><Download size={15} />{t("Export GeoJSON")}</button><button className="text-button" onClick={() => fileInput.current?.click()}><Upload size={15} />{t("Import")}</button><input ref={fileInput} type="file" accept=".geojson,.json,application/geo+json,application/json" hidden onChange={importClosures} /></div>
              <div className="filter-row"><span className="small muted">{t("At ")}{time(departureISO)} {t("· ")}{dayDate(departureISO)}</span><select className="small-select" aria-label={t("Filter restrictions")} value={closureFilter} onChange={e => setClosureFilter(e.target.value)}><option value="current">{t("Current & upcoming")}</option><option value="active">{t("Active")}</option><option value="scheduled">{t("Scheduled")}</option><option value="draft">{t("Drafts")}</option><option value="all">{t("All restrictions")}</option></select></div>
              {!visibleClosures.length && <div className="empty-state"><Flag size={32} /><h3>{t("A clean slate")}</h3><p>{t("No restrictions in this view. Add a point, draw along a road or outline an area.")}</p><button className="text-button" onClick={() => beginClosure()}>{t("Create your first restriction")}<ArrowRight size={15} /></button></div>}
              {visibleClosures.map(closure => { const status = closureState(closure, departureISO); return <article key={closure.id} className={`closure-card ${selectedClosure === closure.id ? 'selected' : ''}`}><button className="closure-main" onClick={() => { setSelectedClosure(closure.id); focusPoints(closure.geometry.coordinates[0] as Coordinate[]); }}><span className={`closure-symbol ${status}`}><Flag size={17} /></span><span><span className="closure-title">{closure.title}</span><span className={`tag ${status === 'active' ? 'red' : status === 'scheduled' ? 'orange' : 'neutral'}`}>{t(status)}</span></span><ChevronRight size={16} /></button><div className="closure-card-details"><span><CalendarClock size={14} />{dateTime(closure.startsAt)}</span><span><Clock3 size={14} />{closure.endsAt ? `Until ${dateTime(closure.endsAt)}` : t("Until cancelled · end unknown")}</span>{closure.description && <p>{closure.description}</p>}{closure.sourceUrl && <a className="text-button" href={closure.sourceUrl} target="_blank" rel="noreferrer">{t("Source")}<ArrowUpRight size={13} /></a>}<div className="row"><button className="text-button" onClick={() => editClosure(closure)}><Pencil size={14} />{t("Edit")}</button>{closure.status !== 'cancelled' && <button className="text-button danger-text" onClick={() => cancelClosure(closure)}><X size={14} />{t("Cancel restriction")}</button>}</div></div></article>; })}
              {view === 'closures' && <DemoClosures at={departureISO} revision={state.eventRevision} reload={reload} notify={notify} onFocus={focusPoints} />}
            </>}
          </div>
          <div className="panel-content" hidden={view !== 'commutes'}>{!user ? <PersonalFeatureGate onSignIn={() => setAccountOpen(true)} /> : <CommutePanel key={`commutes-${commuteOpen}`} state={state} origin={origin} destination={destination} waypoints={waypoints} initialOpen={commuteOpen > 0} reload={reload} notify={notify} onPlan={selectCommute} onSelectEndpoints={() => navigate('journey')} />}</div>
          <div className="panel-content" hidden={view !== 'activity'}>{!user ? <PersonalFeatureGate onSignIn={() => setAccountOpen(true)} /> : <ActivityPanel state={state} points={recordedPoints} setPoints={points => { setRecordedPoints(points); if (points.length) setHistoryTrace([]); }} reload={reload} notify={notify} onView={trip => { setHistoryTrace(trip.points); setHistoryName(trip.name); focusPoints(trip.points.map(p => p.coordinate)); }} />}</div>
          <div className="panel-content" hidden={view !== 'sources'}><SourcePanel state={state} reload={reload} notify={notify} onManualClosure={notice => beginClosure({ title: 'Review · imported notice', description: notice.text, sourceUrl: notice.url || undefined })} /></div>
          <div className="panel-content" hidden={view !== 'profile'}>{state.profile && <ProfilePanel account={user} onSignOut={() => { signOut(); setRecordedPoints([]); setHistoryTrace([]); navigate('journey'); }} personalFeaturesAvailable={!!user} onSignIn={() => setAccountOpen(true)} onTour={() => { navigate('journey'); setTourOpen(true); }} state={state} reload={reload} notify={notify} onSources={() => navigate('sources')} onActivity={() => navigate('activity')} onSaveProposal={saveProposal} />}</div>
          {view === 'navigation' && <div className="panel-content">{routeForGuidance && destination ? <NavigationPanel onVisitedStops={count => { visitedStops.current = count; }} stops={waypoints.filter((place): place is Place => !!place).map(place => place.coordinate)} route={routeForGuidance} destination={destination.name} stale={stale} onBack={() => navigate('journey')} onPosition={setNavigationPosition} onReplan={replanFromGPS} onFocus={focusPoints} /> : <><h1>{t("Choose a route first")}</h1><button className="primary-button" onClick={() => navigate('journey')}>{t("Open the planner")}</button></>}</div>}
          <div className="panel-content" hidden={view !== 'alerts'}>{!user ? <PersonalFeatureGate onSignIn={() => setAccountOpen(true)} /> : <>
            <div className="section-heading"><h1>{t("Journey alerts")}</h1><Bell size={24} /></div>
            <button className="secondary-button full" onClick={() => navigate('profile')}><SlidersHorizontal size={18} />{t("Notification preferences")}</button>
            {!state.alerts.length && <div className="empty-state"><Bell size={31} /><h3>{t("No journey alerts yet")}</h3><p>{t("Save a regular commute, or opt into learning from recorded trips in your profile.")}</p></div>}
            {state.alerts.map(alert => <article className={`alert-card ${!alert.read ? 'unread' : ''}`} key={alert.id}><span className="small muted">{relative(alert.createdAt)}{alert.frequentRouteId ? t(" · Usual journey") : t(" · Saved journey")}</span><h3>{alert.title}</h3><p>{alert.message}</p><div className="row wrap">{alert.closureId && state.closures.some(c => c.id === alert.closureId) && <button className="text-button" onClick={() => { const closure = state.closures.find(c => c.id === alert.closureId)!; setSelectedClosure(closure.id); focusPoints(closure.geometry.coordinates[0] as Coordinate[]); navigate('closures'); }}><Flag size={16} />{t("View closure")}</button>}{!alert.read && <button className="text-button" onClick={() => markAlert(alert.id)}><Check size={16} />{t("Mark read")}</button>}</div></article>)}
            <div className="notice-box soft"><Clock3 size={18} /><p>{t("The server checks journeys automatically. Enable browser notifications in Profile for new alerts while the app is open. Closed-app push remains a deployment step.")}</p></div>
          </>}</div>
        </>}
      </aside>
      <main className="map-workspace" aria-label={t("Journey map")}><Suspense fallback={<div className="map-status" role="status">{t("Loading the map…")}</div>}>
        <MapView updating={stale} theme={theme} mapStyle={state?.profile?.mapStyle ?? 'streets'} mapDetail={state?.profile?.mapDetail ?? 'clean'} navigationPosition={navigationPosition} followPosition={view === 'navigation'} routeOptions={mapRouteOptions} onRouteSelect={id => { if (!stale) setSelectedRouteId(id); }} mode={mode} origin={origin} destination={destination} waypoints={waypoints} onWaypointMove={moveWaypointOnMap} closures={state?.closures ?? []} selectedClosureId={selectedClosure} selectedRoute={selectedRoute} baseline={stale || !plan?.conflicts.length ? null : plan.baseline} drawing={editorOpen && view === 'closures' ? drawing : null} departureAt={mapDepartureAt} focus={focus} showClosures={showClosures} showBaseline={showBaseline} recordedPoints={recordedPoints.length ? recordedPoints : historyTrace} onPick={pick} onDraw={setDrawing} onEndpointMove={changeEndpoint} onClosureSelect={id => { if (editorOpen) { notify('Finish or cancel the current edit before selecting another restriction.'); return; } setSelectedClosure(id); navigate('closures'); }} />
        <div className="map-topline"><div className="city-chip"><MapPinned size={17} /><span>{t("Islamabad")}</span></div><div className="map-layer-controls"><button type="button" className="map-style-trigger" aria-label={t("Choose map style")} aria-expanded={mapStylesOpen} aria-controls="map-style-picker" onClick={() => setMapStylesOpen(!mapStylesOpen)}><Palette size={17} /><span>{t("Style")}</span></button><button aria-label={t("Show restrictions layer")} aria-pressed={showClosures} className={showClosures ? 'active' : ''} onClick={() => setShowClosures(!showClosures)}><Flag size={15} /><span>{t("Closures")}</span>{activeCount > 0 && <b>{activeCount}</b>}</button>{!!plan?.conflicts.length && !stale && <button aria-label={t("Show blocked route layer")} aria-pressed={showBaseline} className={showBaseline ? 'active blocked-toggle' : ''} onClick={() => setShowBaseline(!showBaseline)}>{showBaseline ? <Eye size={15} /> : <EyeOff size={15} />}<span>{t("Blocked route")}</span></button>}</div></div>
        {mapInstructions && <div className="map-instructions" role="status"><span className="status-dot" />{t(mapInstructions)}<button className="icon-button small" aria-label={t("Stop map selection")} onClick={() => setMode('browse')}><X size={16} /></button></div>}
        <div className="map-actions"><button className="map-action" aria-label={t("Use my location as start")} title={t("Use my location as start")} onClick={locate}><LocateFixed size={20} /></button><button className={`map-action ${editorOpen ? 'active' : ''}`} aria-label={t("Add restriction on map")} title={t("Add restriction")} onClick={() => beginClosure()}><Plus size={21} /></button><button className="map-action" aria-label={t("Fit journey on map")} title={t("Fit journey")} onClick={() => { if (selectedRoute) focusPoints(selectedRoute.geometry.coordinates as Coordinate[]); else if (origin && destination) focusPoints([origin.coordinate, destination.coordinate]); else focusPoints([[72.97, 33.60], [73.16, 33.75]]); }}><MapPinned size={20} /></button></div>
        <div className="map-bottom-info"><div className="map-legend"><span><i className="legend-line" />{t("Route")}</span><span><i className="legend-block" />{t("Closed")}</span><span><i className="legend-upcoming" />{t("Upcoming")}</span>{!!plan?.conflicts.length && <span><i className="legend-blocked-route" />{t("Blocked route")}</span>}</div>{!!historyTrace.length && !recordedPoints.length && <div className="map-context"><Activity size={14} />{historyName}<button className="icon-button small" aria-label={t("Hide recorded trip")} onClick={() => setHistoryTrace([])}><X size={13} /></button></div>}</div>
      </Suspense></main>
    </div>
    {accountOpen && <AccountPanel onClose={() => setAccountOpen(false)} />}
    {tourOpen && state && !accountOpen && <WelcomeTour onClose={() => setTourOpen(false)} />}
    {toast && <div className="toast" role="status"><Check size={17} /><span>{t(toast)}</span><button className="icon-button small" aria-label={t("Dismiss message")} onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}
