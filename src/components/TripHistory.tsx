import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookmarkPlus, Clock3, Map, Route, Share2, Trash2 } from 'lucide-react';
import type { AppState, Trip } from '../../shared/types';
import { api } from '../lib/api';
import { getAuthSession } from '../lib/auth';
import { dateTime, distance, duration } from '../lib/format';
import { fuelDate, rupees } from '../lib/fuel';
import { t } from '../lib/language';
import { usableTracePoints } from '../lib/tripTrace';
import TripShareDialog from './TripShareDialog';
import './trip-history.css';

interface Props {
  state: AppState;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  onView: (trip: Trip) => void;
  onSaveJourney?: (trip: Trip) => void;
  showHeading?: boolean;
}

/** Browsing is summary-only; View, Share and Save journey explicitly request one private trace. */
export default function TripHistory({ state, reload, notify, onView, onSaveJourney, showHeading = true }: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [share, setShare] = useState<{ owner: string; trip: Trip } | null>(null);
  // Standalone storage membership describes its shared local server, not the UI account.
  const owner = getAuthSession().user?.uid ?? null;
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const mounted = useRef(false), epoch = useRef(0), request = useRef<AbortController | null>(null);
  const timeout = useRef<number | undefined>(undefined);
  useEffect(() => {
    mounted.current = true; epoch.current++; request.current?.abort(); window.clearTimeout(timeout.current);
    setDeleteId(null); setBusy(false); setError(''); setShare(null);
    return () => { mounted.current = false; epoch.current++; request.current?.abort(); window.clearTimeout(timeout.current); };
  }, [owner]);

  function begin() {
    const uid = getAuthSession().user?.uid;
    if (!uid || uid !== currentOwner.current) { setError('Sign in for personal trip history.'); return null; }
    request.current?.abort(); window.clearTimeout(timeout.current);
    const controller = new AbortController(); request.current = controller;
    const deadline = window.setTimeout(() => controller.abort(), 30000); timeout.current = deadline;
    const operation = ++epoch.current; setBusy(true); setError('');
    return { signal: controller.signal, finish: () => window.clearTimeout(deadline), current: () => mounted.current && operation === epoch.current && uid === currentOwner.current && uid === getAuthSession().user?.uid };
  }

  async function remove(id: string) {
    const operation = begin(); if (!operation) return;
    try {
      await api(`/trips/${encodeURIComponent(id)}`, { method: 'DELETE', signal: operation.signal });
      if (!operation.current()) return;
      setDeleteId(null); await reload();
      if (operation.current()) notify('Trip deleted.');
    } catch (e) { if (operation.current()) setError(e instanceof Error ? e.message : 'Could not delete this trip.'); }
    finally { operation.finish(); if (operation.current()) setBusy(false); }
  }

  async function fullTrip(trip: Trip, action: 'view' | 'share' | 'save') {
    const operation = begin(); if (!operation) return;
    try {
      const full = await api<Trip>(`/trips/${encodeURIComponent(trip.id)}`, { signal: operation.signal });
      if (!operation.current()) return;
      if (full.id !== trip.id || !full.points || usableTracePoints(full.points).length < 2) throw new Error('This trip’s saved trace is no longer available.');
      if (action === 'view') onView(full);
      else if (action === 'save') onSaveJourney?.(full);
      else setShare({ owner: getAuthSession().user!.uid, trip: full });
    } catch (e) { if (operation.current()) setError(e instanceof Error ? e.message : 'Could not load this trip.'); }
    finally { operation.finish(); if (operation.current()) setBusy(false); }
  }

  if (share && share.owner === owner) return <TripShareDialog trip={share.trip} owner={share.owner} mapStyle={state.profile.mapStyle} onClose={() => setShare(null)} />;

  return <section className="trip-history" aria-label={t('Trip history')} aria-busy={busy}>
    {showHeading && <div className="section-heading compact"><h2>{t('Trip history')}</h2><span className="small muted">{t('Private')}</span></div>}
    {error && <div className="error-box" role="alert">{t(error)}</div>}
    {state.trips.length >= 50 && <p className="small muted">{t('Showing the 50 most recent trips. Totals include retained history beyond this list.')}</p>}
    {!state.trips.length && <div className="empty-state compact-empty"><Map size={29} /><h3>{t('Every journey has a story')}</h3><p>{t('Your recorded routes, distance and time will appear here. GPS samples require a real device location.')}</p></div>}
    {state.trips.map(trip => <article className="trip-card" key={trip.id}>
      <div className="trip-card-heading"><div><h3>{trip.name}</h3><time className="trip-date" dateTime={trip.startedAt}>{dateTime(trip.startedAt)}</time></div><button className="icon-button" disabled={busy} aria-label={`${t('Delete')} ${trip.name}`} onClick={() => setDeleteId(deleteId === trip.id ? null : trip.id)}><Trash2 size={17} /></button></div>
      <div className="trip-metrics"><div><Route size={16} aria-hidden="true" /><strong>{distance(trip.distanceMeters)}</strong><span>{t('Distance')}</span></div><div><Clock3 size={16} aria-hidden="true" /><strong>{duration(trip.durationSeconds)}</strong><span>{t('Travel time')}</span></div></div>
      <TripFuel trip={trip} />
      {trip.gaps > 0 && <p className="small muted">{trip.gaps} {t('recording gap')}{trip.gaps > 1 ? t('s') : t('')}{t('; distance may be incomplete.')}</p>}
      {trip.contributeToRoadDiscovery && <span className="tag neutral">{t('Road review consent')}</span>}
      {!(trip.pointCount ?? trip.points.length) && <span className="trip-summary-only">{t('Saved trace unavailable')}</span>}
      <div className="trip-card-actions"><button className="text-button" disabled={busy || !(trip.pointCount ?? trip.points.length)} onClick={() => fullTrip(trip, 'view')}><ArrowUpRight size={16} />{t('View on map')}</button>{onSaveJourney && <button className="text-button" disabled={busy || !(trip.pointCount ?? trip.points.length)} onClick={() => fullTrip(trip, 'save')}><BookmarkPlus size={16} />{t('Save journey')}</button>}<button className="text-button" disabled={busy || !(trip.pointCount ?? trip.points.length)} onClick={() => fullTrip(trip, 'share')}><Share2 size={16} />{t('Share')}</button></div>
      {deleteId === trip.id && <div className="delete-confirm"><p>{t('Delete this trip and its saved trace?')}</p><button className="danger-button" disabled={busy} onClick={() => remove(trip.id)}>{t('Delete trip')}</button><button className="text-button" disabled={busy} onClick={() => setDeleteId(null)}>{t('Keep it')}</button></div>}
    </article>)}
  </section>;
}

function TripFuel({ trip }: { trip: Trip }) {
  const estimate = trip.fuelEstimate;
  if (!estimate) return <p className="small muted trip-fuel-unavailable">{t('Fuel estimate unavailable for this trip.')}</p>;
  return <details className="trip-fuel-details">
    <summary><strong>≈ {rupees(estimate.costPkr)}</strong><span>{t('Estimated fuel cost')}</span></summary>
    <p className="small muted">{estimate.vehicle.label || t(estimate.vehicle.kind === 'motorcycle' ? 'Motorcycle' : 'Car')} · {t(estimate.vehicle.fuelType === 'diesel' ? 'Diesel' : 'Petrol')} · {estimate.vehicle.kmPerLitre} {t('km/litre')} · {estimate.litres.toFixed(2)} {t('litres')}</p>
    {estimate.rates.map(rate => <div key={`${rate.effectiveFrom}:${rate.sourceUrl}`}><p className="small muted">{trip.demoData ? <span title={t('Illustrative price used for a simulated trip.')}>{rupees(rate.pricePerLitre, 2)} {t('/ litre')}</span> : <a href={rate.sourceUrl} target="_blank" rel="noreferrer">{rupees(rate.pricePerLitre, 2)} {t('/ litre')}</a>} · {t('Effective from')} {fuelDate(rate.effectiveFrom)}</p>{rate.retrievedAt && !trip.demoData && <p className="small muted">{t('Reference checked')} {dateTime(rate.retrievedAt)}</p>}</div>)}
    <p className="small muted">{t('Saved estimate. Changes to your vehicle or fuel prices do not change this trip.')}</p>
  </details>;
}
