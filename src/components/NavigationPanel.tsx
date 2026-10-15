import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Flag, LocateFixed, Navigation, RefreshCw, Square, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import type { Coordinate, RouteOption } from '../../shared/types';
import { buildGuidance, GuidanceSession, meters, navigationFix, nextGuidanceStep, projectOnRoute, routeMeasure, type NavigationFix } from '../lib/navigation';
import { distance, duration } from '../lib/format';

interface Props { route: RouteOption; destination: string; stale: boolean; onBack: () => void; onPosition: (point: Coordinate | null) => void; onReplan: (coordinate: Coordinate) => Promise<RouteOption>; onFocus: (coordinates: Coordinate[]) => void }
const cancelSpeech = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
const recent = (fix: NavigationFix | null) => !!fix && Date.now() - fix.timestamp <= 15000 && fix.timestamp - Date.now() <= 5000;

export default function NavigationPanel({ route, destination, stale, onBack, onPosition, onReplan, onFocus }: Props) {
  const hasStops = !!route.snappedWaypoints?.length;
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
  const callbacks = useRef({ onPosition, onReplan, onFocus }); callbacks.current = { onPosition, onReplan, onFocus };
  const spoken = useRef('');

  function stop() {
    gate.current.stop();
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null; firstFix.current = false; fix.current = null;
    setLive(false); setBusy(false); setAccepted(null); setMatched(false); setGpsCurrent(false); setOffRoute(false);
    callbacks.current.onPosition(null); cancelSpeech();
  }
  useEffect(() => () => {
    gate.current.stop();
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null; callbacks.current.onPosition(null); cancelSpeech();
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
    if (stale) { stop(); setMessage('A restriction changed. Replan before continuing guidance.'); }
  }, [stale]);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (gate.current.running && !recent(fix.current)) {
        setGpsCurrent(false); setMatched(false); cancelSpeech();
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
  const arrived = ready && measure.total > 0 && remaining < 30 && !!fix.current && fix.current.accuracy <= 30 && meters(fix.current.coordinate, route.snappedDestination) < 30;
  useEffect(() => {
    if (!ready || !voice || !step || !('speechSynthesis' in window)) { cancelSpeech(); return; }
    const key = `${route.departureAt}:${route.id}:${stepIndex}:${arrived}`;
    if (spoken.current === key) return;
    spoken.current = key; cancelSpeech();
    const utterance = new SpeechSynthesisUtterance(arrived ? 'You appear to be near the destination road point. Check the road and stopping place.' : step.instruction);
    utterance.lang = 'en-PK'; window.speechSynthesis.speak(utterance);
  }, [ready, stepIndex, voice, arrived, route, step]);

  function applyFix(sample: NavigationFix, currentRoute: RouteOption) {
    if (!gate.current.running || gate.current.busy || gate.current.acceptedRoute !== currentRoute || staleRef.current) return;
    const elapsed = lastProgressTime.current ? Math.max(0, (sample.timestamp - lastProgressTime.current) / 1000) : 0;
    const advance = lastProgressTime.current ? Math.max(100, Math.min(1200, elapsed * 65 + sample.accuracy * 2)) : 300;
    const projection = projectOnRoute(currentRoute, sample.coordinate, latestProgress.current, advance);
    const close = projection.valid && projection.distance <= 65;
    badFixes.current = close ? 0 : badFixes.current + 1;
    const off = badFixes.current >= 3;
    setMatched(close); setOffRoute(off);
    if (close) {
      latestProgress.current = Math.max(latestProgress.current, projection.progress);
      lastProgressTime.current = sample.timestamp; setProgress(latestProgress.current);
      setMessage(`GPS estimate · reported accuracy about ${Math.round(sample.accuracy)} m`);
    } else {
      cancelSpeech();
      setMessage(off ? 'Your location does not match the mapped route. Recalculate when safely stopped.' : 'The location could not be matched near the route. Direction prompts are paused.');
    }
  }
  async function replan(sample: NavigationFix) {
    if (!recent(sample) || staleRef.current) { setMessage('Get a fresh location fix before recalculating.'); return; }
    const token = gate.current.beginReplan(); if (!token) return;
    setBusy(true); setAccepted(null); setMatched(false); setOffRoute(false); setReplanFailed(false); badFixes.current = 0;
    cancelSpeech(); setMessage('Finding a fresh clear route…');
    try {
      const freshRoute = await callbacks.current.onReplan(sample.coordinate);
      if (!gate.current.isCurrent(token) || staleRef.current) return;
      if (!gate.current.accept(token, freshRoute)) throw new Error('The updated route could not support guidance. Replan in the journey planner.');
      setAccepted(freshRoute); latestProgress.current = 0; lastProgressTime.current = 0; setProgress(0); spoken.current = '';
      if (recent(fix.current)) applyFix(fix.current!, freshRoute);
      else { setGpsCurrent(false); setMessage('Route updated. Waiting for a fresh location fix before giving directions.'); }
    } catch (error) {
      if (gate.current.reject(token) && !staleRef.current) {
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
    firstFix.current = true; fix.current = null; latestProgress.current = 0; lastProgressTime.current = 0; badFixes.current = 0;
    setLive(true); setBusy(false); setAccepted(null); setMatched(false); setGpsCurrent(false); setOffRoute(false); setReplanFailed(false); setProgress(0); spoken.current = '';
    setMessage('Waiting for a recent GPS fix before recalculating. Your position is not saved as trip history.');
    watch.current = navigator.geolocation.watchPosition(position => {
      if (!gate.current.isSession(session) || staleRef.current) return;
      const sample = navigationFix(position);
      if (!sample) { setGpsCurrent(false); setMatched(false); cancelSpeech(); if (!gate.current.busy) setMessage('Waiting for a recent location fix with reported accuracy of 60 m or better.'); return; }
      if (fix.current && sample.timestamp <= fix.current.timestamp) return;
      fix.current = sample; setGpsCurrent(true); callbacks.current.onPosition(sample.coordinate);
      if (firstFix.current) { firstFix.current = false; void replan(sample); return; }
      if (gate.current.busy) return;
      const currentRoute = gate.current.acceptedRoute;
      if (!currentRoute) { setMatched(false); setMessage('No fresh route is ready. Recalculate when safely stopped; the previous plan is not being used for guidance.'); return; }
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
  const heading = stale ? 'Restrictions changed' : !measure.valid ? 'Route guidance unavailable' : busy ? 'Updating your route' : waiting ? replanFailed ? 'Fresh route unavailable' : !gpsCurrent ? 'Waiting for location' : offRoute ? 'Off the mapped route' : accepted !== route ? 'A fresh route is needed' : 'Location not matched' : arrived ? 'Near the destination road point' : step?.instruction;
  const Icon = arrived || !waiting && step?.turn === 'arrive' ? Flag : waiting || stale ? TriangleAlert : step?.turn === 'left' ? ArrowLeft : step?.turn === 'right' ? ArrowRight : ArrowUp;
  return <>
    <button className="text-button nav-back" onClick={() => { stop(); onBack(); }}><ChevronLeft size={18} />Back to routes</button>
    <div className="section-heading"><h1>{live ? 'Navigation' : 'Route preview'}</h1><Navigation size={24} /></div>
    <p className="muted">To {destination}</p>
    <div className={`guidance-card ${waiting || stale ? 'guidance-warning' : ''}`}><Icon size={42} strokeWidth={2.5} /><div><span>{ready && step ? `${distance(Math.max(0, step.atMeters - progress))} ahead` : waiting || stale ? 'Direction prompts paused' : `Step ${Math.max(0, stepIndex + 1)} of ${steps.length}`}</span><h2>{heading}</h2></div></div>
    <div className="navigation-metrics"><div><strong>{waiting || stale || !measure.valid ? '—' : duration(remainingSeconds)}</strong><span>estimated remaining</span></div><div><strong>{waiting || stale || !measure.valid ? '—' : distance(remaining)}</strong><span>to destination</span></div></div>
    <div className="navigation-progress"><span style={{ width: `${!stale && (!live || ready) && measure.total ? Math.max(0, Math.min(100, (1 - remaining / measure.total) * 100)) : 0}%` }} /></div>
    <p className="gps-status" role="status">{busy ? 'Finding a fresh clear route…' : message}</p>
    {!live ? <><button className="primary-button full" disabled={stale || busy || !measure.valid || hasStops} onClick={start}><LocateFixed size={19} />Start GPS guidance</button><p className="small muted navigation-consent">{hasStops ? 'Routes with stops: preview available. GPS guidance coming later.' : 'Uses location while this view is open. GPS history is not saved.'}</p>{!stale && <div className="preview-buttons"><button className="secondary-button" disabled={preview <= 0} onClick={() => previewStep(preview - 1)}><ChevronLeft size={18} />Previous</button><button className="secondary-button" disabled={preview >= steps.length - 1} onClick={() => previewStep(preview + 1)}>Next step<ChevronRight size={18} /></button></div>}</> : <div className="stack"><button className="secondary-button full" disabled={busy || !gpsCurrent || !recent(fix.current)} onClick={() => fix.current && replan(fix.current)}><RefreshCw size={18} />Recalculate from here</button><button className="secondary-button full" onClick={() => { stop(); setMessage('Guidance stopped. Route preview remains available.'); }}><Square size={17} />Stop guidance</button></div>}
    <button className="settings-link voice-setting" onClick={() => { setVoice(!voice); if (voice) cancelSpeech(); }} aria-pressed={voice}>{voice ? <Volume2 size={20} /> : <VolumeX size={20} />}<span>Voice guidance</span><strong>{voice ? 'On' : 'Off'}</strong></button>
    {!stale && (!live || ready) && <details className="road-sequence" open={!live}><summary>Route guidance steps</summary><ol>{steps.map((item, index) => <li key={index}><button className={index === stepIndex ? 'current-guidance-step' : ''} disabled={live} onClick={() => previewStep(index)}>{item.instruction}<small>{distance(item.atMeters)} from start</small></button></li>)}</ol></details>}
    <div className="notice-box soft"><TriangleAlert size={19} /><p>Directions are inferred from mapped road geometry and approximate GPS. Follow signs and road conditions. No lane guidance or live traffic. Keep the page visible; use controls only when safely stopped.</p></div>
  </>;
}
