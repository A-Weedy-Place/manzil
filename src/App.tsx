import { t } from './lib/language';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BusFront, Moon, Palette, Sun } from 'lucide-react';
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
import ProfilePanel, { type ProfileSection } from './components/ProfilePanel';
import ProfileSettingsDialog from './components/ProfileSettingsDialog';
import TripHistory from './components/TripHistory';
import MonthlyStatistics from './components/MonthlyStatistics';
import TravelDataChoice from './components/TravelDataChoice';
import MapStylePicker from './components/MapStylePicker';
import MapTimeControl from './components/MapTimeControl';
import HeaderLanguage from './components/HeaderLanguage';
import PlanAheadTime from './components/PlanAheadTime';
import DemoClosures from './components/DemoClosures';
import NavigationPanel from './components/NavigationPanel';
import AccountPanel, { PersonalFeatureGate } from './components/AccountPanel';
import WelcomeTour, { type TourView } from './components/WelcomeTour';
import { useLanguage } from './lib/useLanguage';
import { clearRegistrationTour, clearTravelDataChoicePrompt, getAuthSession, isCreatingAccount, needsRegistrationTour, needsTravelDataChoice, signOut, useAuth } from './lib/auth';
import { useAlertNotifications } from './lib/notifications';
import { api, send } from './lib/api';
import { closureState, dateTime, dayDate, distance, downloadJSON, inputISO, localInput, relative, time } from './lib/format';
import { normalizeMapStyleId } from './lib/mapStyle';
import AdminPanel from './components/AdminPanel';
import ClosureList from './components/ClosureList';
import { useTravelCapture } from './lib/useTravelCapture';
import { usableTracePoints } from './lib/tripTrace';
import TransitPanel from './components/TransitPanel';
import { useTransit } from './lib/useTransit';
import { transitPatternCoordinates } from './lib/transitMap';

type View = 'journey' | 'planning' | 'local' | 'closures' | 'commutes' | 'activity' | 'sources' | 'alerts' | 'profile' | 'navigation' | 'admin';
const NAV = [
  { id: 'admin', label: 'Admin', icon: ShieldCheck },
  { id: 'journey', label: 'Map', icon: MapPinned },
  { id: 'planning', label: 'Plan ahead', icon: CalendarClock },
  { id: 'local', label: 'Local', icon: BusFront },
  { id: 'closures', label: 'Closures', icon: Flag },
  { id: 'commutes', label: 'Saved', icon: Bookmark },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'profile', label: 'Profile', icon: UserRound },
] as const;

export default function App() {
  const { language, setLanguage } = useLanguage();
  const { user, status: authStatus } = useAuth();
  const [entryAccepted, setEntryAccepted] = useState(() => { try { return sessionStorage.getItem('manzil-entry-guest') === 'yes'; } catch { return false; } });
  const [accountOpen, setAccountOpen] = useState(false), [helpOpen, setHelpOpen] = useState(false);
  const [travelChoiceUid, setTravelChoiceUid] = useState<string | null>(null);
  const [profileSection, setProfileSection] = useState<ProfileSection | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const tourReturnView = useRef<View>('journey');
  useEffect(() => {
    if (authStatus === 'loading') return;
    tourReturnView.current = 'journey';
    setTourOpen(!!user && user.role !== 'admin' && needsRegistrationTour(user.uid));
  }, [user?.uid, authStatus]);
  const visitedStops = useRef(0);
  const previousAccount = useRef(user?.uid);
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr'; }, [language]);
  const [loadedState, setState] = useState<AppState | null>(null);
  const [stateOwner, setStateOwner] = useState<string | null | undefined>();
  const state = stateOwner === (user?.uid ?? null) ? loadedState : null;
  const [view, setView] = useState<View>(window.location.hash === '#alerts' ? 'alerts' : 'journey');
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [mapStylesOpen, setMapStylesOpen] = useState(false);
  const [mapStyleBusy, setMapStyleBusy] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const locateSequence = useRef(0);
  const [online, setOnline] = useState(true); const [startupError, setStartupError] = useState('');
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [waypoints, setWaypoints] = useState<(Place | null)[]>([]);
  const [waypointLayout, setWaypointLayout] = useState(0);
  const [pickingWaypoint, setPickingWaypoint] = useState(0);
  const [departure, setDeparture] = useState(localInput());
  const [localDeparture, setLocalDeparture] = useState<string | null>(null);
  // A selected date affects only Plan ahead. Every other workspace is live.
  const departureMode = (tourOpen ? tourReturnView.current : view) === 'planning' ? 'scheduled' : 'now';
  const [clock, setClock] = useState(() => new Date().toISOString());
  const [planWanted, setPlanWanted] = useState(false);
  const [planSnapshotKey, setPlanSnapshotKey] = useState('');
  const [planContextKey, setPlanContextKey] = useState('');
  const [planTimeMode, setPlanTimeMode] = useState<'now' | 'scheduled'>('now');
  const [compare, setCompare] = useState(true);
  const compareDepartureTimes = departureMode === 'scheduled' && compare;
  const [mode, setMode] = useState<MapMode>('browse');
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [baselineSelected, setBaselineSelected] = useState(false);
  const [planning, setPlanning] = useState(false); const [planError, setPlanError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false); const [editing, setEditing] = useState<Closure | null>(null);
  const [editorSeed, setEditorSeed] = useState<Partial<ClosureDraft> | undefined>();
  const [editorKey, setEditorKey] = useState(0);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [selectedRoadName, setSelectedRoadName] = useState('');
  const [selectedClosure, setSelectedClosure] = useState<string | null>(null);
  const [showClosures, setShowClosures] = useState(true); const [showBaseline, setShowBaseline] = useState(true);
  const [systemDark, setSystemDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [navigationPosition, setNavigationPosition] = useState<Coordinate | null>(null);
  const [closureFilter, setClosureFilter] = useState('current');
  const [toast, setToast] = useState(''); const [demoBusy, setDemoBusy] = useState(false);
  const [commuteOpen, setCommuteOpen] = useState(0);
  const [commuteSeed, setCommuteSeed] = useState<{ name: string; departureTime: string } | undefined>();
  const [historyTrace, setHistoryTrace] = useState<RecordedPoint[]>([]);
  const showingHistory = historyTrace.length > 0;
  const [historyName, setHistoryName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const planSequence = useRef(0);
  const lastPlanKey = useRef('');
  const reloadSequence = useRef(0);
  const lastLoadedState = useRef<AppState | null>(null);
  const latestView = useRef(view); latestView.current = view;
  const theme = state?.profile?.theme === 'system' ? systemDark ? 'dark' : 'light' : state?.profile?.theme ?? 'dark';
  const mapStyle = normalizeMapStyleId(state?.profile.mapStyle);
  const profileName = state?.profile.displayName && state.profile.displayName !== 'Traveller' ? state.profile.displayName : user?.displayName ?? state?.profile.displayName ?? 'Guest';
  const membership = state?.membership?.uid === user?.uid ? state?.membership : null;
  const role = membership?.role ?? (user?.role === 'admin' ? 'admin' : user ? 'user' : 'guest');
  const isAdmin = role === 'admin', isReviewer = isAdmin || role === 'verified';
  const travelChoiceOpen = !!user && !!state && stateOwner === user.uid && travelChoiceUid === user.uid && state.profile.travelDataChoiceMade !== true;
  useEffect(() => {
    if (!user) { setTravelChoiceUid(null); return; }
    if (!state || stateOwner !== user.uid) return;
    if (state?.profile.travelDataChoiceMade) { clearTravelDataChoicePrompt(user.uid); setTravelChoiceUid(null); }
    else if (needsTravelDataChoice(user.uid)) setTravelChoiceUid(user.uid);
  }, [user?.uid, stateOwner, state?.profile.travelDataChoiceMade]);
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
    const ownerUid = getAuthSession().user?.uid ?? null;
    try { const next = await api<AppState>('/state'); if (sequence !== reloadSequence.current || ownerUid !== (getAuthSession().user?.uid ?? null)) return; lastLoadedState.current = next; setStateOwner(ownerUid); setState(current => current && current.closures.length === next.closures.length && current.closures.every((item, index) => item.id === next.closures[index].id && item.revision === next.closures[index].revision) ? JSON.stringify(current) === JSON.stringify(next) ? current : { ...next, closures: current.closures } : next); setOnline(true); setStartupError(''); }
    catch (e) { if (sequence !== reloadSequence.current) return; setOnline(false); setStartupError(e instanceof Error ? e.message : 'The local API is unavailable. Start the server and retry.'); throw e; }
  }, []);
  const travel = useTravelCapture({ userId: user?.uid, profile: state?.profile, tripName: origin && destination ? `${origin.name} → ${destination.name}` : undefined, onSaved: reload, onError: notify });
  useEffect(() => {
    if (previousAccount.current && previousAccount.current !== user?.uid) {
      planSequence.current++; setPlan(null); setPlanWanted(false); setSelectedRouteId(null);
      setOrigin(null); setDestination(null); setWaypoints([]); setNavigationPosition(null); setFocus(null); setView('journey'); setCommuteSeed(undefined);
    }
    previousAccount.current = user?.uid;
    locateSequence.current++; setLocating(false); setThemeBusy(false); setMapStyleBusy(false);
    if (user) { setEntryAccepted(true); setView(user.role === 'admin' ? 'admin' : 'journey'); }
    setState(null); setStateOwner(undefined); lastLoadedState.current = null; setHistoryTrace([]);
    setProfileSection(null);
    setEditorOpen(false); setEditing(null); setEditorSeed(undefined); setDrawing(null); setSelectedRoadName(''); setSelectedClosure(null); setBaselineSelected(false);
    setDeparture(localInput()); setClock(new Date().toISOString());
    reload().catch(() => {});
    const timer = setInterval(() => { if (!document.hidden) void reload().catch(() => {}); }, 20000);
    return () => { clearInterval(timer); reloadSequence.current++; locateSequence.current++; };
  }, [reload, user?.uid]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [view, editorOpen]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMode('browse'); };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, []);
  const focusPoints = useCallback((coordinates: Coordinate[]) => setFocus({ coordinates, token: Date.now() + Math.random() }), []);
  const localMap = view === 'local';
  const localAt = localDeparture ? inputISO(localDeparture) : clock;
  const transit = useTransit(localMap, localAt, state?.eventRevision ?? 0, state?.closures ?? [], focusPoints, localDeparture);
  useEffect(() => { transit.reset(); }, [user?.uid]);
  const departureISO = departureMode === 'now' ? clock : inputISO(departure);
  const timelineKey = departureMode === 'now' ? `now-${departureISO}` : `planned-${departureISO}`;
  const latestTimelineKey = useRef(timelineKey); latestTimelineKey.current = timelineKey;
  const previousTimeMode = useRef(departureMode);
  useEffect(() => {
    if (previousTimeMode.current === departureMode) return;
    previousTimeMode.current = departureMode;
    planSequence.current++; lastPlanKey.current = '';
    setPlanning(false); setPlan(null); setBaselineSelected(false); setPlanError('');
  }, [departureMode]);
  const journeyInputKey = JSON.stringify([timelineKey, origin, waypoints, destination, compareDepartureTimes, mode]);
  const latestJourneyInput = useRef(journeyInputKey); latestJourneyInput.current = journeyInputKey;
  const requestKey = JSON.stringify([timelineKey, origin, waypoints, destination, compareDepartureTimes, state?.eventRevision]);
  const routeContextKey = JSON.stringify([departureMode, departureMode === 'scheduled' ? departureISO : null, origin, waypoints, destination, compareDepartureTimes]);
  const stale = !!plan && !!state && (plan.eventRevision !== state.eventRevision || view !== 'navigation' && planSnapshotKey !== requestKey);
  // Same journey/time mode: keep the last verified display until its replacement
  // arrives. Starting guidance is still gated on the fresh revision below.
  const passiveRefresh = stale && planContextKey === routeContextKey;
  const sameTimeRoutes = useMemo(() => plan?.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind)) ?? [], [plan]);
  const routeForGuidance = sameTimeRoutes.find(option => option.id === selectedRouteId) ?? sameTimeRoutes[0] ?? null;
  const selectedRoute = !stale || passiveRefresh ? routeForGuidance : null;
  const mapRouteOptions = useMemo(() => planTimeMode !== departureMode ? [] : view === 'navigation' ? selectedRoute ? [selectedRoute] : [] : sameTimeRoutes, [view, selectedRoute, stale, sameTimeRoutes, planTimeMode, departureMode]);
  const baselineConflictIds = useMemo(() => plan?.conflicts.map(conflict => conflict.closureId) ?? [], [plan]);
  const mapDepartureAt = localMap ? localAt : departureISO;
  const visibleClosures = state?.closures.filter(closure => {
    const status = closureState(closure, mapDepartureAt);
    return closureFilter === 'all' || closureFilter === 'current' && ['active', 'scheduled', 'draft'].includes(status) || status === closureFilter;
  }) ?? [];
  const activeCount = state?.closures.filter(c => closureState(c, mapDepartureAt) === 'active').length ?? 0;
  const upcomingCount = state?.closures.filter(c => closureState(c, mapDepartureAt) === 'scheduled').length ?? 0;
  const unread = state?.alerts.filter(alert => !alert.read).length ?? 0;
  useEffect(() => {
    if (state && !tourOpen && (view === 'journey' || view === 'planning') && planWanted && lastPlanKey.current !== requestKey && origin && destination && waypoints.every(Boolean)) void calculate(undefined, true);
  }, [requestKey, planWanted, view, tourOpen, stateOwner]);
  const previewTourView = useCallback((next: TourView) => { setView(next); setMode('browse'); setProfileSection(null); }, []);
  function startTour() {
    tourReturnView.current = view === 'navigation' ? 'journey' : view;
    setProfileSection(null); setMapStylesOpen(false); setTourOpen(true);
  }
  function closeTour() {
    if (user) clearRegistrationTour(user.uid);
    setView(tourReturnView.current); setTourOpen(false);
  }
  function navigate(next: View) {
    if ((next === 'admin' || next === 'sources') && !isAdmin) return;
    if (next !== 'profile') setProfileSection(null);
    if (next === 'local' && view !== 'local') {
      const points = transit.network?.stops.map(stop => stop.coordinate) ?? [];
      focusPoints(points.length ? points : [[72.89, 33.53], [73.18, 33.78]]);
    }
    // Previewing a future route never starts GPS guidance against that snapshot.
    if (next === 'navigation' && view === 'planning') next = 'journey';
    if ((view === 'planning') !== (next === 'planning')) {
      const shouldReplan = planWanted || !!plan;
      invalidatePlan(false); lastPlanKey.current = ''; setPlanWanted(shouldReplan);
      if (next !== 'planning') setClock(new Date().toISOString());
    }
    if (view === 'navigation' && next !== 'navigation' && plan) setPlanWanted(true);
    if (next === 'journey' && view === 'navigation' && plan?.options.length) focusPoints(plan.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind)).flatMap(option => option.geometry.coordinates as Coordinate[]));
    if (view === 'navigation' && next !== 'navigation') { const count = visitedStops.current; if (count) setWaypoints(current => current.slice(count)); visitedStops.current = 0; }
    setView(next); setMode('browse');
  }
  function changeEndpoint(letter: 'A' | 'B', coordinate: Coordinate) {
    const place = { name: `Map point · ${coordinate[1].toFixed(4)}, ${coordinate[0].toFixed(4)}`, coordinate };
    if (view === 'local') { transit.changeEndpoint(letter, place); return; }
    if (letter === 'A') setOrigin(place); else setDestination(place);
    invalidatePlan();
  }
  function invalidatePlan(resetWanted = true) { planSequence.current++; setPlanning(false); setPlan(null); setBaselineSelected(false); setPlanError(''); setHistoryTrace([]); if (resetWanted) setPlanWanted(false); }
  function changeMapTime(value: string | null) {
    if (!value) { navigate('journey'); return; }
    if (departureMode === 'scheduled' && inputISO(value) === departureISO) return;
    lastPlanKey.current = '';
    invalidatePlan(false); setView('planning');
    if (plan) setPlanWanted(true);
    setDeparture(value);
  }
  function changeWaypoint(index: number, place: Place | null) { setWaypoints(current => current.map((item, i) => i === index ? place : item)); invalidatePlan(); }
  const moveWaypointOnMap = useCallback((index: number, coordinate: Coordinate) => {
    setWaypoints(current => current.map((place, i) => i === index ? { name: `Stop ${index + 1}`, coordinate } : place));
    planSequence.current++; setPlanning(false); setPlan(null); setPlanError(''); setPlanWanted(false);
  }, []);
  function moveWaypoint(index: number, direction: number) {
    setWaypointLayout(value => value + 1);
    setWaypoints(current => { const next = [...current], target = index + direction; [next[index], next[target]] = [next[target], next[index]]; return next; }); setMode('browse'); invalidatePlan();
  }
  function selectRoute(option: RouteOption) {
    setBaselineSelected(false);
    if (['leave_earlier', 'leave_later'].includes(option.kind)) changeMapTime(localInput(new Date(option.departureAt)));
    else setSelectedRouteId(option.id);
  }
  function pick(coordinate: Coordinate) {
    if (view === 'local') {
      if (mode === 'origin' || mode === 'destination') changeEndpoint(mode === 'origin' ? 'A' : 'B', coordinate);
      setMode('browse'); return;
    }
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
      const result = await send<PlanResponse>('/plan', { origin, destination, waypoints, departureAt: requestedDeparture, compareDepartures: compareDepartureTimes });
      if (sequence !== planSequence.current || latestTimelineKey.current !== timelineKey) return;
      const driving = result.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind));
      setPlanTimeMode(departureMode); setPlan(result); setPlanSnapshotKey(requestKey); setPlanContextKey(routeContextKey); setSelectedRouteId(previous => preserveView && driving.some(option => option.id === previous) ? previous : driving[0]?.id ?? null);
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
    if (!user) { setAccountOpen(true); return; }
    setView('closures'); setEditing(null); setEditorSeed(seed); setSelectedClosure(null);
    setSelectedRoadName(''); setDrawing({ kind: 'line', coordinates: [], widthMeters: 14 }); setMode('road'); setEditorOpen(true); setEditorKey(key => key + 1);
  }
  async function editClosure(closure: Closure) {
    const startingView = latestView.current;
    try { closure = await api<Closure>(`/closures/${encodeURIComponent(closure.id)}`); } catch (reason) { notify(reason instanceof Error ? reason.message : 'Could not load the report.'); return; }
    if (latestView.current !== startingView) return;
    setSelectedRoadName('');
    setEditing(closure); setEditorSeed(undefined); setSelectedClosure(closure.id); setView('closures');
    setDrawing(closure.drawing ?? { kind: 'polygon', coordinates: closure.geometry.coordinates[0].slice(0, -1) as Coordinate[], widthMeters: 35 });
    setMode('browse'); setEditorOpen(true); setEditorKey(key => key + 1); focusPoints(closure.geometry.coordinates[0] as Coordinate[]);
  }
  function cancelEditor() { setEditorOpen(false); setDrawing(null); setEditing(null); setEditorSeed(undefined); setMode('browse'); }
  async function saveClosure(draft: ClosureDraft) {
    const result = editing ? await send<Closure>(`/closures/${editing.id}`, { ...draft, revision: editing.revision }, 'PUT') : await send<Closure>('/closures', draft);
    cancelEditor(); setSelectedClosure(result.id); await reload(); focusPoints(result.geometry.coordinates[0] as Coordinate[]); notify(result.moderation === 'pending' ? 'Report submitted for review.' : editing ? 'Restriction updated. Replan to use the latest schedule.' : 'Restriction saved. It will apply during its scheduled period.');
  }
  function selectClosure(closure: Closure) { setSelectedClosure(closure.id); focusPoints(closure.geometry.coordinates[0] as Coordinate[]); }
  function canEditClosure(closure: Closure) { return isAdmin || !!user && closure.author?.uid === user.uid && (isReviewer || closure.moderation === 'pending'); }
  async function reviewClosure(closure: Closure, decision: 'approve' | 'reject') {
    try { await send(`/closures/${encodeURIComponent(closure.id)}/review`, { revision: closure.revision, decision }); notify(decision === 'approve' ? 'Report approved.' : 'Report rejected.'); }
    finally { await reload(); }
  }
  function continueAsGuest() { try { sessionStorage.setItem('manzil-entry-guest', 'yes'); } catch { /* This visit can still continue. */ } tourReturnView.current = 'journey'; setTourOpen(true); setEntryAccepted(true); }
  function leaveAccount() { try { sessionStorage.removeItem('manzil-entry-guest'); } catch { /* Memory-only entry still works. */ } setEntryAccepted(false); setAccountOpen(false); signOut(); setHistoryTrace([]); setView('journey'); }
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
  function tryDemoJourney(journey: { origin: Place; destination: Place }) {
    // A slow demo request must not replace choices edited while it was pending.
    if (latestJourneyInput.current !== journeyInputKey) return;
    invalidatePlan();
    setOrigin(journey.origin); setDestination(journey.destination); setWaypoints([]);
    setSelectedClosure(null); setDrawing(null); setEditorOpen(false); setMode('browse');
    lastPlanKey.current = ''; setPlanWanted(true); setView('journey'); setClock(new Date().toISOString()); setShowClosures(true); setPanelExpanded(false);
    focusPoints([journey.origin.coordinate, journey.destination.coordinate]);
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
    if (locating) return;
    if (!navigator.geolocation) { notify('Location is unavailable in this browser. Select a point on the map instead.'); return; }
    const sequence = ++locateSequence.current, owner = getAuthSession().user?.uid;
    const current = () => sequence === locateSequence.current && owner === getAuthSession().user?.uid;
    setLocating(true);
    const unavailable = () => { if (current()) { setLocating(false); notify('Location is unavailable or permission was declined. You can still select any point on the map.'); } };
    try { navigator.geolocation.getCurrentPosition(position => {
      if (!current()) return;
      const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude];
      if (!coordinate.every(Number.isFinite) || Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90) { unavailable(); return; }
      setLocating(false); focusPoints([coordinate]);
    }, unavailable, { maximumAge: 30000, timeout: 15000 }); } catch { unavailable(); }
  }
  async function markAlert(id: string) { try { await send(`/alerts/${id}`, { read: true }, 'PATCH'); await reload(); } catch (e) { notify(e instanceof Error ? e.message : 'Could not mark this alert read.'); } }
  function selectCommute(commute: Commute, impact: CommuteImpact) {
    if (latestView.current !== 'commutes') { notify('Commute check finished. Its relevant alerts are available in the inbox.'); return; }
    planSequence.current++; setPlanning(false); setHistoryTrace([]); setMode('browse'); setPlanError('');
    setOrigin(commute.origin); setDestination(commute.destination); setWaypoints(commute.waypoints ?? []); setDeparture(localInput(new Date(impact.occurrenceAt))); setPlanWanted(true); setPlan(null); lastPlanKey.current = ''; setView('planning');
    if (impact.plan.options[0]) focusPoints(impact.plan.options[0].geometry.coordinates as Coordinate[]);
  }
  async function saveProposal(proposal: FrequentRouteProposal) {
    await send('/commutes', { name: `Usual journey · ${proposal.departureTime}`, origin: proposal.origin, destination: proposal.destination, departureTime: proposal.departureTime, days: proposal.days, enabled: true });
    await reload(); navigate('commutes'); notify('Usual journey saved. You can check its next departure here.');
  }
  function saveHistoryJourney(trip: Trip) {
    const points = usableTracePoints(trip.points);
    if (!user || points.length < 2) return;
    const start = points[0].coordinate, end = points.at(-1)!.coordinate;
    const labels = trip.name.split(' → ');
    invalidatePlan(); setOrigin({ name: labels[0] || t('Trip starting point'), coordinate: start });
    setDestination({ name: labels[1] || t('Trip destination'), coordinate: end }); setWaypoints([]);
    setCommuteSeed({ name: trip.name, departureTime: localInput(new Date(trip.startedAt)).slice(11, 16) });
    setProfileSection(null); setCommuteOpen(value => value + 1); navigate('commutes');
  }
  async function changeMapStyle(mapStyle: MapStyleId) {
    if (mapStyleBusy || !state || normalizeMapStyleId(state.profile.mapStyle) === mapStyle) return;
    const owner = getAuthSession().user?.uid;
    setMapStyleBusy(true);
    try {
      await send<LocalProfile>('/profile', { mapStyle }, 'PATCH');
      if (owner !== getAuthSession().user?.uid) return;
      setState(current => current ? { ...current, profile: { ...current.profile, mapStyle } } : current);
      await reload();
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not change the map style.'); }
    finally { if (owner === getAuthSession().user?.uid) setMapStyleBusy(false); }
  }
  async function toggleTheme() {
    if (themeBusy || !state) return;
    const owner = getAuthSession().user?.uid;
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeBusy(true);
    try {
      await send<LocalProfile>('/profile', { theme: nextTheme }, 'PATCH');
      if (owner !== getAuthSession().user?.uid) return;
      setState(current => current ? { ...current, profile: { ...current.profile, theme: nextTheme } } : current);
      await reload();
    } catch (error) { if (owner === getAuthSession().user?.uid) notify(error instanceof Error ? error.message : 'Could not change the app theme.'); }
    finally { if (owner === getAuthSession().user?.uid) setThemeBusy(false); }
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
    setOrigin(start); setClock(now); setPlanTimeMode('now'); setPlan(result); setPlanWanted(false); const nextKey = JSON.stringify([`now-${now}`, start, waypoints, destination, false, result.eventRevision]); setPlanSnapshotKey(nextKey); setPlanContextKey(JSON.stringify(['now', null, start, waypoints, destination, false])); lastPlanKey.current = nextKey; setSelectedRouteId(result.options[0].id); setPlanning(false);
    return result.options[0];
  }
  const mapInstructions = mode === 'road' ? 'Select the start and end of the closed road section' : mode === 'origin' ? 'Choose start' : mode === 'destination' ? 'Choose destination' : mode === 'waypoint' ? `Choose stop ${pickingWaypoint + 1}` : ['point', 'line', 'polygon'].includes(mode) ? `Draw ${mode === 'point' ? 'a restriction' : mode === 'line' ? 'the closed road' : 'the closed area'} · Esc to pause` : '';
  if (authStatus === 'loading') return <div className="entry-loading" role="status">{t('Opening your account…')}</div>;
  const accountCreated = (uid: string) => { tourReturnView.current = 'journey'; setTravelChoiceUid(uid); setTourOpen(true); setAccountOpen(false); setEntryAccepted(true); };
  if (!entryAccepted && !user) return <AccountPanel entry onClose={continueAsGuest} onAuthenticated={() => setEntryAccepted(true)} onAccountCreated={accountCreated} />;
  return <div className="app-shell">
    <a className="skip-link" href="#workspace-panel">{t("Skip to controls")}</a>
    <header className="app-header">
      <button className="brand" onClick={() => navigate('journey')} aria-label={t('Manzil journey planner')}><img src="/manzil-logo.png" width="42" height="42" alt={t('Manzil Urdu calligraphy')} /><span className="brand-name">{t('manzil')}<span className="brand-dot">.</span></span></button>
      <MapTimeControl at={mapDepartureAt} live={localMap ? !localDeparture : departureMode === 'now'} />
      <div className="header-actions">
        <button type="button" className="icon-button header-theme" aria-label={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')} title={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')} disabled={themeBusy || !state} aria-busy={themeBusy} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>
        <HeaderLanguage value={language} onChange={setLanguage} />
        <button className={`icon-button notification-button ${view === 'alerts' ? 'selected' : ''}`} aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`} onClick={() => navigate('alerts')}><Bell size={22} />{unread > 0 && <span className="notification-count">{unread}</span>}</button>
        <button className="workspace-avatar" aria-label={t('Open profile')} onClick={() => navigate('profile')}>{user && state?.profile.photoDataUrl ? <img src={state.profile.photoDataUrl} alt={t('Your profile photo')} /> : (user ? profileName : 'M').slice(0, 1).toUpperCase()}</button>
      </div>
    </header>
    {mapStylesOpen && state && <MapStylePicker value={mapStyle} disabled={mapStyleBusy} onChange={changeMapStyle} onClose={() => setMapStylesOpen(false)} />}
    <div className="workspace">
      <nav className="nav-rail" aria-label={t("Main navigation")}>{NAV.filter(item => item.id === 'admin' ? isAdmin : item.id === 'activity' ? !!user && !isAdmin : item.id === 'commutes' ? !isAdmin : true).map(({ id, icon: Icon, label }) => <button className={`nav-item ${view === id || id === 'journey' && view === 'navigation' || id === 'profile' && view === 'sources' ? 'active' : ''}`} key={id} data-tour={id === 'planning' ? 'plan-ahead' : id === 'closures' ? 'nav-closures' : id === 'commutes' ? 'nav-saved' : id === 'profile' ? 'nav-profile' : undefined} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={23} strokeWidth={1.9} aria-hidden="true" /><span>{t(label)}</span></button>)}</nav>
      <aside ref={panelRef} className={`side-panel ${panelExpanded ? 'is-expanded' : ''}`} id="workspace-panel" aria-label={`${view} controls`}>
        <button className="sheet-size-toggle" aria-label={panelExpanded ? 'Show more of the map' : 'Expand controls'} aria-expanded={panelExpanded} onClick={() => setPanelExpanded(!panelExpanded)}><span /></button>
        {!state ? <div className="panel-content"><span className="eyebrow">{t("MANZIL LOCAL")}</span><h1>{t("Getting the road ready.")}</h1><p className="muted">{t("Connecting to your local workspace…")}</p>{startupError && <><div className="error-box">{t(startupError)}</div><button className="secondary-button" onClick={() => reload().catch(() => {})}><RefreshCw size={16} />{t("Retry connection")}</button><p className="small muted">{t("Run ")}<code>{t("npm run dev")}</code> {t("from the project folder.")}</p></>}</div> : <>
          {!online && <div className="offline-banner"><WifiOff size={16} />{t("Connection lost. Showing the last loaded data.")}</div>}
          {view === 'admin' && isAdmin && <div className="panel-content"><AdminPanel state={state} at={mapDepartureAt} selectedId={selectedClosure} reload={reload} notify={notify} onSelect={selectClosure} onEdit={editClosure} onCancel={cancelClosure} onReview={reviewClosure} onManualClosure={notice => beginClosure({ description: notice.text, sourceUrl: notice.url || undefined })} /></div>}
          {view === 'local' && <div className="panel-content"><TransitPanel transit={transit} mode={mode} setMode={setMode} onFocus={focusPoints} canReview={isReviewer} at={mapDepartureAt} planned={!!localDeparture} onDepartureChange={setLocalDeparture} /></div>}
          <div className="panel-content" hidden={view !== 'journey' && view !== 'planning'}>
            <div className="section-heading journey-heading"><h1>{view === 'planning' ? t('Plan ahead') : plan ? t("Your routes") : t("Where to?")}</h1><button className="text-button" data-tour="help" onClick={() => setHelpOpen(!helpOpen)} aria-expanded={helpOpen}>{t("Help & demos")}</button></div>
            {view === 'planning' && <PlanAheadTime at={departureISO} onChange={changeMapTime} onLive={() => navigate('journey')} />}
            <details className="journey-search" open={!plan}><summary><Route size={20} /><span><strong>{origin?.name ?? t('Choose a starting point')}</strong><small>{t("to ")}{destination?.name ?? t('your destination')}{waypoints.length ? ` · ${waypoints.length} stop${waypoints.length === 1 ? t("") : t("s")}` : t("")}</small></span><Pencil size={17} /></summary><form className="journey-form" data-tour="search" onSubmit={calculate}>
              <div className="endpoints"><PlaceInput label={t("Starting point")} letter="A" value={origin} active={mode === 'origin'} onPick={() => setMode(mode === 'origin' ? 'browse' : 'origin')} onChange={place => { setOrigin(place); invalidatePlan(); }} /><button type="button" className="swap-button" aria-label={t("Reverse journey")} onClick={() => { setOrigin(destination); setDestination(origin); setWaypointLayout(value => value + 1); setWaypoints(current => [...current].reverse()); setMode('browse'); invalidatePlan(); }}><ArrowDownUp size={16} /></button>
                {waypoints.map((place, index) => <div className="waypoint-row" key={index}><PlaceInput label={`Stop ${index + 1}`} letter={`${index + 1}`} locationContext={waypointLayout} value={place} active={mode === 'waypoint' && pickingWaypoint === index} onPick={() => { setPickingWaypoint(index); setMode(mode === 'waypoint' && pickingWaypoint === index ? 'browse' : 'waypoint'); }} onChange={next => changeWaypoint(index, next)} /><div className="waypoint-actions"><button type="button" className="icon-button small" aria-label={`Move stop ${index + 1} earlier`} disabled={index === 0} onClick={() => moveWaypoint(index, -1)}><ArrowUp size={15} /></button><button type="button" className="icon-button small" aria-label={`Move stop ${index + 1} later`} disabled={index === waypoints.length - 1} onClick={() => moveWaypoint(index, 1)}><ArrowDown size={15} /></button><button type="button" className="icon-button small danger-text" aria-label={`Remove stop ${index + 1}`} onClick={() => { setWaypointLayout(value => value + 1); setWaypoints(current => current.filter((_, i) => i !== index)); setMode('browse'); invalidatePlan(); }}><Trash2 size={16} /></button></div></div>)}
                <PlaceInput label={t("Destination")} letter="B" value={destination} active={mode === 'destination'} onPick={() => setMode(mode === 'destination' ? 'browse' : 'destination')} onChange={place => { setDestination(place); invalidatePlan(); }} /></div>
              <button className="text-button add-stop" data-tour="stops" type="button" disabled={waypoints.length >= 5} onClick={() => { setWaypoints(current => [...current, null]); invalidatePlan(); }}><Plus size={17} />{t("Add stop")}{waypoints.length > 0 && <span className="small muted">{waypoints.length}{t("/5")}</span>}</button>
              {view === 'planning' && <label className="check-row compare-check"><input type="checkbox" checked={compare} onChange={e => { setCompare(e.target.checked); invalidatePlan(); }} />{t("Also compare leaving earlier or later")}</label>}
              <button className="primary-button full plan-button" disabled={planning && !passiveRefresh || !origin || !destination || waypoints.some(place => !place)}><Navigation size={18} />{planning && !passiveRefresh ? t("Finding routes…") : t("Find routes")}{(!planning || passiveRefresh) && <ArrowRight size={17} />}</button>
            </form></details>
            {planError && <div className="error-box" role="alert">{t(planError)}</div>}
            {!state.graph.ready && <div className="error-box">{t("Local road data is unavailable. Online routing is available for Pakistan journeys.")}</div>}
            {stale && !passiveRefresh && <div className="notice-box warning"><RefreshCw size={17} /><div><strong>{t("Restrictions changed")}</strong><p>{t("Replan this journey to use the latest map and schedule.")}</p></div></div>}
            {plan && <RouteResults vehicle={user ? state.profile.vehicle : undefined} fuel={state.fuel} navigationDisabled={stale} updating={stale && !passiveRefresh} navigationLabel={view === 'planning' ? 'View live route' : 'Navigate'} plan={plan} selectedId={selectedRouteId} onSelect={selectRoute} onNavigate={() => { setNavigationPosition(null); navigate('navigation'); }} onSaveCommute={() => { setCommuteSeed(undefined); setCommuteOpen(n => n + 1); navigate('commutes'); }} onDemo={addDemo} demoBusy={demoBusy} showDemo={isAdmin} baselineSelected={baselineSelected} onBaselineSelect={() => setBaselineSelected(value => !value)} />}
            {(view === 'journey' || view === 'planning') && isAdmin && <DemoClosures at={departureISO} revision={state.eventRevision} reload={reload} notify={notify} onFocus={focusPoints} onTryJourney={tryDemoJourney} />}
            {(view === 'journey' || view === 'planning') && helpOpen && <div className="help-panel"><button className="text-button" onClick={startTour}>{t('Replay tour')}</button><button className="text-button" onClick={() => navigate('closures')}>{t('Road closures')}</button>{isAdmin && <button className="text-button" onClick={() => navigate('sources')}>{t('Source updates')}</button>}</div>}
          </div>
          <div className="panel-content" hidden={view !== 'closures'}>
            {editorOpen && drawing ? <ClosureEditor key={editorKey} closure={editing} seed={editorSeed} drawing={drawing} onDraw={setDrawing} mode={mode} setMode={setMode} onSave={saveClosure} onCancel={cancelEditor} canPublish={isReviewer} selectedRoadName={selectedRoadName} /> : <>
              <div className="section-heading"><h1>{t("Road closures")}</h1><Flag size={22} /></div><button className="primary-button full" onClick={() => beginClosure()}><Plus size={18} />{t("Add closure")}</button>
              {isAdmin && (<div className="row import-export"><button className="text-button" onClick={exportClosures} disabled={!state.closures.length}><Download size={15} />{t("Export GeoJSON")}</button><button className="text-button" onClick={() => fileInput.current?.click()}><Upload size={15} />{t("Import")}</button><input ref={fileInput} type="file" accept=".geojson,.json,application/geo+json,application/json" hidden onChange={importClosures} /></div>)}
              <div className="filter-row"><span className="small muted">{t("At ")}{time(departureISO)} {t("· ")}{dayDate(departureISO)}</span><select className="small-select" aria-label={t("Filter restrictions")} value={closureFilter} onChange={e => setClosureFilter(e.target.value)}><option value="current">{t("Current & upcoming")}</option><option value="active">{t("Active")}</option><option value="scheduled">{t("Scheduled")}</option><option value="draft">{t("Drafts")}</option><option value="all">{t("All restrictions")}</option></select></div>
              <ClosureList closures={visibleClosures} at={mapDepartureAt} selectedId={selectedClosure} reviewer={isReviewer} canEdit={canEditClosure} onSelect={selectClosure} onEdit={editClosure} onCancel={cancelClosure} onReview={reviewClosure} />
              {view === 'closures' && isAdmin && <DemoClosures at={departureISO} revision={state.eventRevision} reload={reload} notify={notify} onFocus={focusPoints} onTryJourney={tryDemoJourney} />}
            </>}
          </div>
          <div className="panel-content" hidden={view !== 'commutes'}>{!user ? <PersonalFeatureGate onSignIn={() => setAccountOpen(true)} /> : <CommutePanel key={`commutes-${commuteOpen}`} state={state} origin={origin} destination={destination} waypoints={waypoints} initialOpen={commuteOpen > 0} initialValues={commuteSeed} reload={reload} notify={notify} onPlan={selectCommute} onSelectEndpoints={() => navigate('journey')} />}</div>
          <div className="panel-content" hidden={view !== 'activity'}>{!user ? <PersonalFeatureGate onSignIn={() => setAccountOpen(true)} /> : <ActivityPanel key={user.uid} onSaveJourney={saveHistoryJourney} active={view === 'activity'} state={state} reload={reload} notify={notify} onView={trip => { setHistoryTrace(trip.points); setHistoryName(trip.name); focusPoints(usableTracePoints(trip.points).map(p => p.coordinate)); }} />}</div>
          <div className="panel-content" hidden={view !== 'sources'}>{isAdmin && <SourcePanel state={state} reload={reload} notify={notify} onManualClosure={notice => beginClosure({ title: 'Review · imported notice', description: notice.text, sourceUrl: notice.url || undefined })} />}</div>
          <div className="panel-content" hidden={view !== 'profile'}>{state.profile && <ProfilePanel account={user} onSignOut={leaveAccount} personalFeaturesAvailable={!!user} onSignIn={() => setAccountOpen(true)} onTour={startTour} state={state} reload={reload} notify={notify} onSources={() => navigate('sources')} onActivity={() => setProfileSection('history')} onStatistics={() => setProfileSection('statistics')} section={view === 'profile' && stateOwner === (user?.uid ?? null) ? profileSection : null} onSectionChange={setProfileSection} onSaveProposal={saveProposal} />}</div>
          {view === 'navigation' && <div className="panel-content">{routeForGuidance && destination ? <NavigationPanel key={user?.uid ?? 'guest'} onSample={travel.capture} savesTravelData={!!user && state.profile.collectTravelData === true} onVisitedStops={count => { visitedStops.current = count; }} stops={waypoints.filter((place): place is Place => !!place).map(place => place.coordinate)} route={routeForGuidance} destination={destination.name} stale={stale} onBack={() => navigate('journey')} onPosition={setNavigationPosition} onReplan={replanFromGPS} onFocus={focusPoints} /> : <><h1>{t("Choose a route first")}</h1><button className="primary-button" onClick={() => navigate('journey')}>{t("Open the planner")}</button></>}</div>}
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
        <MapView transit={localMap && transit.network ? { network: transit.network, selectedPatternId: transit.selectedPatternId, journey: transit.journey, stale: transit.stale } : null} onTransitPatternSelect={id => transit.selectPattern(id)} refreshing={!localMap && passiveRefresh} updating={!localMap && stale && !passiveRefresh} theme={theme} mapStyle={mapStyle} mapDetail={state?.profile?.mapDetail ?? 'clean'} navigationPosition={localMap ? null : navigationPosition} followPosition={view === 'navigation'} routeOptions={localMap || showingHistory ? [] : mapRouteOptions} onRouteSelect={id => { if (!stale || passiveRefresh) setSelectedRouteId(id); }} mode={mode} origin={localMap ? transit.origin : showingHistory ? null : origin} destination={localMap ? transit.destination : showingHistory ? null : destination} waypoints={localMap || showingHistory ? [] : waypoints} onWaypointMove={moveWaypointOnMap} closures={state?.closures ?? []} selectedClosureId={selectedClosure} selectedRoute={localMap || showingHistory ? null : selectedRoute} baseline={localMap || showingHistory || stale && !passiveRefresh || !plan?.conflicts.length ? null : plan.baseline} baselineSelected={baselineSelected} onBaselineSelect={() => { if (!stale && view !== 'navigation') { setBaselineSelected(true); navigate(view === 'planning' ? 'planning' : 'journey'); } }} baselineConflictIds={baselineConflictIds} drawing={editorOpen && view === 'closures' ? drawing : null} departureAt={mapDepartureAt} focus={focus} showClosures={showClosures} showBaseline={showBaseline} recordedPoints={localMap ? [] : historyTrace} onPick={pick} onDraw={setDrawing} onRoadSelection={section => setSelectedRoadName(section.roadNames.join(' · '))} onEndpointMove={changeEndpoint} onClosureSelect={id => { if (editorOpen) { notify('Finish or cancel the current edit before selecting another restriction.'); return; } setSelectedClosure(id); navigate('closures'); }} />
        <div className="map-topline"><div className="city-chip"><MapPinned size={17} /><span>{t("Pakistan")}</span></div><div className="map-layer-controls" data-tour="map-controls"><button type="button" className="map-style-trigger" aria-label={t("Choose map style")} aria-expanded={mapStylesOpen} aria-controls="map-style-picker" onClick={() => setMapStylesOpen(!mapStylesOpen)}><Palette size={17} /><span>{t("Style")}</span></button><button aria-label={t("Show restrictions layer")} aria-pressed={showClosures} className={showClosures ? 'active' : ''} onClick={() => setShowClosures(!showClosures)}><Flag size={15} /><span>{t("Closures")}</span>{activeCount > 0 && <b>{activeCount}</b>}</button>{!localMap && !!plan?.conflicts.length && !stale && <button aria-label={t("Show blocked route layer")} aria-pressed={showBaseline} className={showBaseline ? 'active blocked-toggle' : ''} onClick={() => setShowBaseline(!showBaseline)}>{showBaseline ? <Eye size={15} /> : <EyeOff size={15} />}<span>{t("Blocked route")}</span></button>}</div></div>
        {mapInstructions && <div className="map-instructions" role="status"><span className="status-dot" />{t(mapInstructions)}<button className="icon-button small" aria-label={t("Stop map selection")} onClick={() => setMode('browse')}><X size={16} /></button></div>}
        <div className="map-actions"><button className="map-action" aria-label={t('My location')} title={t('My location')} disabled={locating} aria-busy={locating} onClick={locate}><LocateFixed size={20} /></button><button className="map-action" aria-label={t("Fit journey on map")} title={t("Fit journey")} onClick={() => { if (localMap) { const selected = transit.network?.patterns.find(pattern => pattern.id === transit.selectedPatternId); const points = transit.journey?.legs.flatMap(leg => leg.geometry.coordinates as Coordinate[]) ?? (selected ? transitPatternCoordinates(selected) : transit.network?.stops.map(stop => stop.coordinate)) ?? []; if (points.length) focusPoints(points); } else if (showingHistory) focusPoints(usableTracePoints(historyTrace).map(point => point.coordinate)); else if (selectedRoute) focusPoints(selectedRoute.geometry.coordinates as Coordinate[]); else if (origin && destination) focusPoints([origin.coordinate, destination.coordinate]); else focusPoints([[72.97, 33.60], [73.16, 33.75]]); }}><MapPinned size={20} /></button></div>
        <div className="map-bottom-info"><div className="map-legend"><span><i className="legend-line" />{t(localMap ? "Bus route" : "Route")}</span><span><i className="legend-block" />{t("Closed")}</span><span><i className="legend-upcoming" />{t("Upcoming")}</span>{localMap && <span><i className="legend-transit-uncertain" />{t("Uncertain / suspended")}</span>}{!localMap && !!plan?.conflicts.length && <span><i className="legend-blocked-route" />{t("Blocked route")}</span>}</div>{!localMap && !!historyTrace.length && <div className="map-context"><Activity size={14} />{historyName}<button className="icon-button small" aria-label={t("Hide recorded trip")} onClick={() => setHistoryTrace([])}><X size={13} /></button></div>}</div>
      </Suspense></main>
    </div>
    {accountOpen && <AccountPanel onClose={() => { setAccountOpen(false); if (!user) continueAsGuest(); }} onAuthenticated={() => setAccountOpen(false)} onAccountCreated={accountCreated} />}
    {travelChoiceOpen && user && <TravelDataChoice key={user.uid} uid={user.uid} onComplete={profile => { if (profile) setState(current => current ? { ...current, profile } : current); setTravelChoiceUid(null); }} />}
    {profileSection === 'statistics' && view === 'profile' && user && state && stateOwner === user.uid && <ProfileSettingsDialog section="statistics" closeLabel="Close statistics" onClose={() => setProfileSection(null)}><MonthlyStatistics key={user.uid} state={state} /></ProfileSettingsDialog>}
    {profileSection === 'history' && view === 'profile' && user && state && stateOwner === user.uid && <ProfileSettingsDialog section="history" closeLabel="Close trip history" onClose={() => setProfileSection(null)}><TripHistory key={user.uid} onSaveJourney={saveHistoryJourney} state={state} showHeading={false} reload={reload} notify={notify} onView={trip => { setProfileSection(null); setHistoryTrace(trip.points); setHistoryName(trip.name); focusPoints(usableTracePoints(trip.points).map(point => point.coordinate)); }} /></ProfileSettingsDialog>}
    {tourOpen && state && stateOwner === (user?.uid ?? null) && !accountOpen && !travelChoiceOpen && !profileSection && !isCreatingAccount() && !(user && state.profile.travelDataChoiceMade !== true && needsTravelDataChoice(user.uid)) && <WelcomeTour onClose={closeTour} onViewChange={previewTourView} />}
    {toast && <div className="toast" role="status"><Check size={17} /><span>{t(toast)}</span><button className="icon-button small" aria-label={t("Dismiss message")} onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}
