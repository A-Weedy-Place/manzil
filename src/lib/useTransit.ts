import { useEffect, useRef, useState } from 'react';
import type { TransitJourney, TransitNetwork, TransitPlanResponse } from '../../shared/transit';
import type { Closure, Coordinate, Place } from '../../shared/types';
import { api } from './api';
import { closureState } from './format';
import { transitPatternCoordinates } from './transitMap';

export function useTransit(enabled: boolean, at: string, eventRevision: number, closures: Closure[], onFocus: (points: Coordinate[]) => void, selectedTime: string | null = null) {
  const [network, setNetwork] = useState<TransitNetwork | null>(null), [networkError, setNetworkError] = useState('');
  const [networkLoading, setNetworkLoading] = useState(false), [retry, setRetry] = useState(0);
  const [updatesUnavailable, setUpdatesUnavailable] = useState(false);
  const [origin, setOrigin] = useState<Place | null>(null), [destination, setDestination] = useState<Place | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [result, setResult] = useState<TransitPlanResponse | null>(null), [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [resultContextKey, setResultContextKey] = useState('');
  const [showJourney, setShowJourney] = useState(false);
  const [planning, setPlanning] = useState(false), [planError, setPlanError] = useState('');
  const networkSequence = useRef(0), planSequence = useRef(0), wanted = useRef(false);
  const [loadedKey, setLoadedKey] = useState('');
  // A clock tick does not download the whole network. Only changed reports or
  // known restriction/service boundaries require a new availability snapshot.
  const roadTimeKey = closures.filter(closure => closureState(closure, at) === 'active').map(closure => `${closure.id}:${closure.revision}`).sort().join(',');
  const serviceTimeKey = (network?.disruptions ?? []).filter(item => item.status === 'published' && Date.parse(item.startsAt) <= Date.parse(at) && Date.parse(item.endsAt) > Date.parse(at)).map(item => `${item.id}:${item.revision}`).sort().join(',');
  const key = `${selectedTime ?? 'live'}:${eventRevision}:${roadTimeKey}:${serviceTimeKey}:${retry}`;
  const current = useRef({ enabled, at, key, origin, destination }); current.current = { enabled, at, key, origin, destination };
  const stale = !!network && (loadedKey !== key || updatesUnavailable);
  const freshResult = result && !stale && resultContextKey === key && result.eventRevision === eventRevision && result.datasetVersion === network?.version && result.disruptionRevision === network?.disruptionRevision ? result : null;
  const journey = showJourney ? freshResult?.options.find(option => option.id === selectedJourneyId) ?? freshResult?.options[0] ?? null : null;
  useEffect(() => {
    if (!enabled) return;
    const sequence = ++networkSequence.current, controller = new AbortController();
    setNetworkLoading(true); setNetworkError('');
    api<TransitNetwork>(`/transit/network?at=${encodeURIComponent(at)}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted || sequence !== networkSequence.current || current.current.key !== key) return;
      setNetwork(data); setLoadedKey(key); setUpdatesUnavailable(false);
      setSelectedPatternId(previous => data.patterns.some(pattern => pattern.id === previous) ? previous : null);
    }).catch(error => { if (!controller.signal.aborted && sequence === networkSequence.current) setNetworkError(error instanceof Error ? error.message : 'Local transport is unavailable.'); })
      .finally(() => { if (!controller.signal.aborted && sequence === networkSequence.current) setNetworkLoading(false); });
    return () => { controller.abort(); networkSequence.current++; };
  }, [enabled, key]);
  useEffect(() => {
    if (!enabled || !network) return;
    const controller = new AbortController(); let checking = false;
    const check = async () => {
      if (document.hidden || checking) return; checking = true;
      try {
        const revision = await api<{ version: string; eventRevision: number; disruptionRevision: number }>('/transit/revision', { signal: controller.signal });
        if (controller.signal.aborted) return;
        setUpdatesUnavailable(false);
        setNetworkError(previous => previous === 'Service updates unavailable. Refresh to retry.' ? '' : previous);
        if (revision.version !== network.version || revision.eventRevision !== network.eventRevision || revision.disruptionRevision !== network.disruptionRevision) setRetry(value => value + 1);
      } catch { if (!controller.signal.aborted) { setUpdatesUnavailable(true); setNetworkError('Service updates unavailable. Refresh to retry.'); } }
      finally { checking = false; }
    };
    const timer = setInterval(() => { void check(); }, 20000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [enabled, network]);
  function invalidate() { wanted.current = false; planSequence.current++; setResult(null); setPlanning(false); setPlanError(''); setSelectedJourneyId(null); setShowJourney(false); }
  function changeEndpoint(letter: 'A' | 'B', place: Place | null) { invalidate(); letter === 'A' ? setOrigin(place) : setDestination(place); }
  async function calculate(fit = true) {
    const snapshot = current.current;
    if (!snapshot.origin || !snapshot.destination || !snapshot.enabled) return;
    const sequence = ++planSequence.current, controller = new AbortController(); wanted.current = true;
    setPlanning(true); setPlanError('');
    try {
      const data = await api<TransitPlanResponse>('/transit/plan', { method: 'POST', body: JSON.stringify({ origin: snapshot.origin, destination: snapshot.destination, departureAt: snapshot.at }), signal: controller.signal });
      if (sequence !== planSequence.current || snapshot.key !== current.current.key || snapshot.at.slice(0, 16) !== current.current.at.slice(0, 16) || !current.current.enabled) return;
      setResult(data); setResultContextKey(snapshot.key); setSelectedJourneyId(data.options[0]?.id ?? null); if (fit) setShowJourney(true);
      if (fit && data.options.length) onFocus(data.options[0].legs.flatMap(leg => leg.geometry.coordinates as Coordinate[]));
    } catch (error) { if (sequence === planSequence.current && snapshot.key === current.current.key) setPlanError(error instanceof Error ? error.message : 'Could not find a local journey.'); }
    finally { if (sequence === planSequence.current) setPlanning(false); }
  }
  useEffect(() => { if (enabled && network && loadedKey === key && wanted.current && origin && destination) void calculate(false); }, [enabled, loadedKey, at.slice(0, 16)]);
  useEffect(() => { if (!enabled) { planSequence.current++; setPlanning(false); } }, [enabled]);
  function selectPattern(id: string) { setShowJourney(false); setSelectedPatternId(id); const pattern = network?.patterns.find(item => item.id === id); if (pattern && pattern.geometryQuality !== 'stops-only') onFocus(transitPatternCoordinates(pattern)); else if (pattern) onFocus(pattern.stopIds.flatMap(id => network?.stops.find(stop => stop.id === id)?.coordinate ? [network.stops.find(stop => stop.id === id)!.coordinate] : [])); }
  function selectJourney(option: TransitJourney) { setShowJourney(true); setSelectedJourneyId(option.id); onFocus(option.legs.flatMap(leg => leg.geometry.coordinates as Coordinate[])); }
  function reset() { invalidate(); setOrigin(null); setDestination(null); setSelectedPatternId(null); }
  return { network, networkLoading, networkError, stale, origin, destination, changeEndpoint, result: freshResult, journey, planning, planError, calculate, selectedPatternId, selectPattern, selectJourney, retry: () => setRetry(value => value + 1), reset };
}
export type TransitController = ReturnType<typeof useTransit>;
