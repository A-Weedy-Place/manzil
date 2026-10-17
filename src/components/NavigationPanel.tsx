import { t } from '../lib/language';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Flag, LocateFixed, Navigation, RefreshCw, Square, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import type { Coordinate, RouteOption } from '../../shared/types';
import { buildGuidance, GuidanceSession, meters, navigationFix, nextGuidanceStep, projectOnRoute, routeMeasure, type NavigationFix } from '../lib/navigation';
import { distance, duration } from '../lib/format';
import { NavigationSpeaker } from '../lib/speech';
import { RerouteTracker, StopTracker } from '../lib/rerouting';
import { speechText, type Language, type SpeechPrompt } from '../../shared/speech';
import { useLanguage } from '../lib/useLanguage';

interface Props { route: RouteOption; destination: string; stops?: Coordinate[]; stale: boolean; onVisitedStops?: (count: number) => void; onBack: () => void; onPosition: (point: Coordinate | null) => void; onSample?: (point: import('../../shared/types').RecordedPoint | null) => void; savesTravelData?: boolean; onReplan: (coordinate: Coordinate, visitedStops: number) => Promise<RouteOption>; onFocus: (coordinates: Coordinate[]) => void }
const recent = (fix: NavigationFix | null) => !!fix && Date.now() - fix.timestamp <= 15000 && fix.timestamp - Date.now() <= 5000;

export default function NavigationPanel({ route, destination, stops = [], stale, onVisitedStops, onBack, onPosition, onSample, savesTravelData = false, onReplan, onFocus }: Props) {
  const { language } = useLanguage();
  const [voiceLanguage, setVoiceLanguage] = useState<Language>(() => { try { const saved = localStorage.getItem('manzil-voice-language'); return saved === 'ur' || saved === 'en' ? saved : language; } catch { return language; } });
  const [voiceStatus, setVoiceStatus] = useState('');
  const speaker = useRef(new NavigationSpeaker()), deviation = useRef(new RerouteTracker()), stopTracker = useRef(new StopTracker());
  const allStops = useRef(stops); allStops.current = stops;
  const acceptedStopOffset = useRef(0);
  const validatedAt = useRef(0);
  const cancelSpeech = () => speaker.current.cancel();
  const steps = useMemo(() => buildGuidance(route), [route]);
  const measure = useMemo(() => routeMeasure(route), [route]);
  const [preview, setPreview] = useState(0), [live, setLive] = useState(false);
  const [progress, setProgress] = useState(0), [gpsCurrent, setGpsCurrent] = useState(false);
  const [matched, setMatched] = useState(false), [offRoute, setOffRoute] = useState(false), [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<RouteOption | null>(null), [replanFailed, setReplanFailed] = useState(false);
  const [message, setMessage] = useState('Preview the route, or start foreground GPS guidance.');
  const [voice, setVoice] = useState(false);
  const watch = useRef<number | null>(null), gate = useRef(new GuidanceSession());
  const firstFix = useRef(false), latestProgress = useRef(0), lastProgressTime = useRef(0), badFixes = useRef(0);
  const fix = useRef<NavigationFix | null>(null), staleRef = useRef(stale); staleRef.current = stale;
  const callbacks = useRef({ onPosition, onSample, onReplan, onFocus }); callbacks.current = { onPosition, onSample, onReplan, onFocus };
  const spoken = useRef('');

  function stop() {
    gate.current.stop();
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null; firstFix.current = false; fix.current = null;
    setLive(false); setBusy(false); setAccepted(null); setMatched(false); setGpsCurrent(false); setOffRoute(false);
    callbacks.current.onPosition(null); callbacks.current.onSample?.(null); cancelSpeech();
  }
  useEffect(() => () => {
    gate.current.stop();
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null; callbacks.current.onPosition(null); callbacks.current.onSample?.(null); cancelSpeech();
  }, []);
  useEffect(() => {
    setPreview(0);
    if (!gate.current.running) { setProgress(0); latestProgress.current = 0; return; }
    if (!gate.current.busy && gate.current.acceptedRoute !== route) {
      gate.current.invalidateRoute(); setAccepted(null); setMatched(false); cancelSpeech();
      setMessage('The route selection changed. Recalculate from a fresh location before continuing guidance.');
    }
  }, [route]);
  useEffect(() => {
    if (stale && gate.current.running) {
      gate.current.invalidateRoute(); setAccepted(null); setMatched(false); cancelSpeech();
      setMessage('A restriction changed. Replan before continuing guidance.');
      if (recent(fix.current)) void replan(fix.current!);
    }
  }, [stale]);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (gate.current.running && !recent(fix.current)) {
        setGpsCurrent(false); setMatched(false);
        if (!gate.current.busy) setMessage('Waiting for a recent location fix. Direction prompts are paused.');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [live]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden && gate.current.running) { stop(); setMessage('GPS guidance stopped while the page was hidden. Start again when you can keep it visible.'); }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  const ready = live && !stale && !busy && accepted === route && gpsCurrent && matched && !offRoute;
  const stepIndex = live ? nextGuidanceStep(steps, progress) : Math.min(preview, steps.length - 1);
  const step = steps[stepIndex];
  const remaining = live ? Math.max(0, measure.total - progress) : Math.max(0, measure.total - (step?.atMeters ?? 0));
  const remainingSeconds = measure.total ? route.durationSeconds * remaining / measure.total : 0;
  const arrived = ready && stopTracker.current.visited >= allStops.current.length && measure.total > 0 && remaining < 30 && !!fix.current && fix.current.accuracy <= 30 && meters(fix.current.coordinate, route.snappedDestination) < 30;
  useEffect(() => {
    if (!ready || !voice || !step) { cancelSpeech(); return; }
    const ahead = Math.max(0, step.atMeters - progress);
    const phase = arrived ? 'arrival' : ahead <= 35 ? 'now' : ahead <= 220 ? 'ahead' : 'far';
    if (phase === 'far') return;
    const key = `${route.departureAt}:${route.id}:${stepIndex}:${phase}:${voiceLanguage}`;
    if (spoken.current === key) return;
    spoken.current = key; cancelSpeech();
    const prompt: SpeechPrompt = { kind: 'turn', turn: arrived ? 'arrive' : step.turn === 'arrive' ? 'straight' : step.turn, road: step.roadName, distance: phase === 'ahead' ? Math.round(ahead / 25) * 25 : 0 };
    void speaker.current.speak(prompt, voiceLanguage, setVoiceStatus);
    const next = steps[stepIndex + 1];
    if (next) speaker.current.prepare({ kind: 'turn', turn: next.turn, road: next.roadName, distance: 200 }, voiceLanguage);
  }, [ready, stepIndex, voice, arrived, route, step, progress, voiceLanguage]);
  useEffect(() => {
    if (!live || !voice) return;
    const kind = busy ? 'rerouting' : replanFailed ? 'unavailable' : !gpsCurrent ? 'gps_lost' : null;
    if (kind) void speaker.current.speak({ kind }, voiceLanguage, setVoiceStatus);
  }, [live, voice, busy, replanFailed, gpsCurrent, voiceLanguage]);

  function applyFix(sample: NavigationFix, currentRoute: RouteOption) {
    if (!gate.current.running || gate.current.busy || gate.current.acceptedRoute !== currentRoute || staleRef.current) return;
    const elapsed = lastProgressTime.current ? Math.max(0, (sample.timestamp - lastProgressTime.current) / 1000) : 0;
    const advance = lastProgressTime.current ? Math.max(100, Math.min(1200, elapsed * 65 + sample.accuracy * 2)) : 300;
    const projection = projectOnRoute(currentRoute, sample.coordinate, latestProgress.current, advance);
    const observation = deviation.current.observe(sample, projection);
    const close = observation.matched, off = observation.offRoute;
    const routeStops = currentRoute.snappedWaypoints ?? [], nextStop = routeStops[stopTracker.current.visited - acceptedStopOffset.current];
    if (nextStop) {
      const positions = routeMeasure(currentRoute);
      const vertex = positions.coordinates.findIndex(point => meters(point, nextStop) < 2);
      const alongRoute = vertex >= 0 && Math.abs(projection.progress - positions.cumulative[vertex]) <= 35;
      const targets = [...allStops.current]; targets[stopTracker.current.visited] = nextStop;
      const before = stopTracker.current.visited;
      const visited = stopTracker.current.observe(sample, targets, close && alongRoute);
      if (visited !== before) onVisitedStops?.(visited);
    }
    setMatched(close); setOffRoute(off);
    if (close) {
      latestProgress.current = Math.max(latestProgress.current, projection.progress);
      lastProgressTime.current = sample.timestamp; setProgress(latestProgress.current);
      setMessage(`GPS estimate · reported accuracy about ${Math.round(sample.accuracy)} m`);
    } else {
      cancelSpeech();
      setMessage(off ? 'Your location does not match the mapped route. Recalculate when safely stopped.' : 'The location could not be matched near the route. Direction prompts are paused.');
    }
    const measurement = routeMeasure(currentRoute);
    const expectedSeconds = measurement.total ? currentRoute.durationSeconds * projection.progress / measurement.total : 0;
    const delayed = (sample.timestamp - Date.parse(currentRoute.departureAt)) / 1000 - expectedSeconds > 30;
    if (observation.reroute || close && delayed && sample.timestamp - validatedAt.current >= 60000 && deviation.current.canRetry(sample.timestamp)) void replan(sample);
  }
  async function replan(sample: NavigationFix, initial = false) {
    if (!recent(sample)) { setMessage('Get a fresh location fix before recalculating.'); return; }
    const token = gate.current.beginReplan(); if (!token) return;
    if (!initial) deviation.current.attempting(sample.timestamp);
    setBusy(true); setAccepted(null); setMatched(false); setOffRoute(false); setReplanFailed(false); badFixes.current = 0;
    cancelSpeech(); setMessage('Finding a fresh clear route…');
    try {
      const completedStops = stopTracker.current.visited;
      const freshRoute = await callbacks.current.onReplan(sample.coordinate, completedStops);
      if (!gate.current.isCurrent(token)) return;
      if (!gate.current.accept(token, freshRoute)) throw new Error('The updated route could not support guidance. Replan in the journey planner.');
      setAccepted(freshRoute); latestProgress.current = 0; lastProgressTime.current = 0; setProgress(0); spoken.current = '';
      acceptedStopOffset.current = completedStops;
      validatedAt.current = Date.now();
      deviation.current.succeeded();
      if (recent(fix.current)) applyFix(fix.current!, freshRoute);
      else { setGpsCurrent(false); setMessage('Route updated. Waiting for a fresh location fix before giving directions.'); }
    } catch (error) {
      if (gate.current.reject(token)) {
        deviation.current.failed(Date.now());
        setAccepted(null); setMatched(false); setReplanFailed(true); cancelSpeech();
        setMessage(error instanceof Error ? error.message : 'Could not find a fresh clear route. Guidance remains paused.');
      }
    } finally { if (gate.current.isCurrent(token)) setBusy(false); }
  }
  function start() {
    if (gate.current.running) return;
    if (staleRef.current || !measure.valid) { setMessage('Choose a current valid route before starting guidance.'); return; }
    if (!navigator.geolocation) { setMessage('GPS is unavailable in this browser. Route preview still works.'); return; }
    const session = gate.current.start();
    deviation.current.reset();
    firstFix.current = true; fix.current = null; latestProgress.current = 0; lastProgressTime.current = 0; badFixes.current = 0;
    setLive(true); setBusy(false); setAccepted(null); setMatched(false); setGpsCurrent(false); setOffRoute(false); setReplanFailed(false); setProgress(0); spoken.current = '';
    setMessage(savesTravelData ? 'Waiting for a recent GPS fix. Personal trip history is enabled.' : 'Waiting for a recent GPS fix before recalculating. Your position is not saved as trip history.');
    watch.current = navigator.geolocation.watchPosition(position => {
      if (!gate.current.isSession(session)) return;
      const sample = navigationFix(position);
      if (!sample) { setGpsCurrent(false); setMatched(false); cancelSpeech(); if (!gate.current.busy) setMessage('Waiting for a recent location fix with reported accuracy of 60 m or better.'); return; }
      if (fix.current && sample.timestamp <= fix.current.timestamp) return;
      fix.current = sample; setGpsCurrent(true); callbacks.current.onPosition(sample.coordinate);
      callbacks.current.onSample?.({ coordinate: sample.coordinate, timestamp: new Date(sample.timestamp).toISOString(), accuracy: sample.accuracy });
      if (firstFix.current) { firstFix.current = false; void replan(sample, true); return; }
      if (gate.current.busy) return;
      const currentRoute = gate.current.acceptedRoute;
      if (!currentRoute) { setMatched(false); if (deviation.current.canRetry(sample.timestamp)) void replan(sample); return; }
      applyFix(sample, currentRoute);
    }, error => {
      if (!gate.current.isSession(session)) return;
      stop(); setMessage(error.code === 1 ? 'Location permission was declined. You can still preview the route.' : 'GPS could not provide a location. Check location services and try again.');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }
  function previewStep(index: number) {
    if (stale || live) return;
    const selected = steps[index]; if (!selected) return;
    setPreview(index); callbacks.current.onPosition(selected.coordinate); callbacks.current.onFocus([selected.coordinate]);
  }
  const waiting = live && !ready;
  const heading = stale ? 'Restrictions changed' : !measure.valid ? 'Route guidance unavailable' : busy ? 'Updating your route' : waiting ? replanFailed ? 'Fresh route unavailable' : !gpsCurrent ? 'Waiting for location' : offRoute ? 'Off the mapped route' : accepted !== route ? 'A fresh route is needed' : 'Location not matched' : arrived ? 'Near the destination road point' : step ? speechText({ kind: 'turn', turn: step.turn === 'arrive' && !arrived ? 'straight' : step.turn, road: step.roadName }, language) : '';
  const Icon = arrived || !waiting && step?.turn === 'arrive' ? Flag : waiting || stale ? TriangleAlert : step?.turn === 'left' ? ArrowLeft : step?.turn === 'right' ? ArrowRight : ArrowUp;
  return <>
    <button className="text-button nav-back" onClick={() => { stop(); onBack(); }}><ChevronLeft size={18} />{t("Back to routes")}</button>
    <div className="section-heading"><h1>{live ? t("Navigation") : t("Route preview")}</h1><Navigation size={24} /></div>
    <p className="muted">{t("To ")}{destination}</p>
    <div className={`guidance-card ${waiting || stale ? 'guidance-warning' : ''}`}><Icon size={42} strokeWidth={2.5} /><div><span>{ready && step ? `${distance(Math.max(0, step.atMeters - progress))} ahead` : waiting || stale ? t("Direction prompts paused") : `Step ${Math.max(0, stepIndex + 1)} of ${steps.length}`}</span><h2>{t(heading ?? '')}</h2></div></div>
    <div className="navigation-metrics"><div><strong>{waiting || stale || !measure.valid ? t("—") : duration(remainingSeconds)}</strong><span>{t("estimated remaining")}</span></div><div><strong>{waiting || stale || !measure.valid ? t("—") : distance(remaining)}</strong><span>{t("to destination")}</span></div></div>
    <div className="navigation-progress"><span style={{ width: `${!stale && (!live || ready) && measure.total ? Math.max(0, Math.min(100, (1 - remaining / measure.total) * 100)) : 0}%` }} /></div>
    <p className="gps-status" role="status">{busy ? t("Finding a fresh clear route…") : message}</p>
    {!live ? <><button className="primary-button full" disabled={stale || busy || !measure.valid} onClick={start}><LocateFixed size={19} />{t("Start GPS guidance")}</button><p className="small muted navigation-consent">{t(savesTravelData ? 'Saves your foreground navigation trips for personal statistics. Manage permission in Profile.' : 'Uses location while this view is open. GPS history is not saved.')}</p>{!stale && <div className="preview-buttons"><button className="secondary-button" disabled={preview <= 0} onClick={() => previewStep(preview - 1)}><ChevronLeft size={18} />{t("Previous")}</button><button className="secondary-button" disabled={preview >= steps.length - 1} onClick={() => previewStep(preview + 1)}>{t("Next step")}<ChevronRight size={18} /></button></div>}</> : <div className="stack"><button className="secondary-button full" disabled={busy || !gpsCurrent || !recent(fix.current)} onClick={() => fix.current && replan(fix.current)}><RefreshCw size={18} />{t("Recalculate from here")}</button><button className="secondary-button full" onClick={() => { stop(); setMessage('Guidance stopped. Route preview remains available.'); }}><Square size={17} />{t("Stop guidance")}</button></div>}
    <button className="settings-link voice-setting" onClick={() => { setVoice(!voice); if (voice) cancelSpeech(); }} aria-pressed={voice}>{voice ? <Volume2 size={20} /> : <VolumeX size={20} />}<span>{t("Voice guidance")}</span><strong>{voice ? t("On") : t("Off")}</strong></button>
    <label className="field-label">{t('Voice language')}<select value={voiceLanguage} onChange={event => { const value = event.target.value as Language; setVoiceLanguage(value); spoken.current = ''; cancelSpeech(); try { localStorage.setItem('manzil-voice-language', value); } catch {} }}><option value="en">English</option><option value="ur">اردو</option></select></label>
    <div className="row wrap"><button className="secondary-button" onClick={() => { spoken.current = ''; void speaker.current.speak({ kind: 'test' }, voiceLanguage, setVoiceStatus); }}>{t('Test voice')}</button><button className="text-button" disabled={!ready || !step} onClick={() => { if (step) void speaker.current.speak({ kind: 'turn', turn: step.turn, road: step.roadName }, voiceLanguage, setVoiceStatus); }}>{t('Repeat instruction')}</button></div>
    {voiceStatus && <p className="small muted" role="status">{t(voiceStatus)}</p>}
    {!stale && (!live || ready) && <details className="road-sequence" open={!live}><summary>{t("Route guidance steps")}</summary><ol>{steps.map((item, index) => <li key={index}><button className={index === stepIndex ? 'current-guidance-step' : ''} disabled={live} onClick={() => previewStep(index)}>{speechText({ kind: 'turn', turn: item.turn, road: item.roadName }, language)}<small>{distance(item.atMeters)} {t("from start")}</small></button></li>)}</ol></details>}
    <div className="notice-box soft"><TriangleAlert size={19} /><p>{t("Directions are inferred from mapped road geometry and approximate GPS. Follow signs and road conditions. No lane guidance or live traffic. Keep the page visible; use controls only when safely stopped.")}</p></div>
  </>;
}
