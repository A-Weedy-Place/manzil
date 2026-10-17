import { useEffect, useState } from 'react';
import { BarChart3, Fuel } from 'lucide-react';
import type { AppState, TravelStatistics, TripStatistics } from '../../shared/types';
import { api } from '../lib/api';
import { distance, duration } from '../lib/format';
import { rupees } from '../lib/fuel';
import { t } from '../lib/language';

/** Reads private aggregate summaries only. Opening statistics never starts location capture. */
export default function MonthlyStatistics({ state, active = true }: { state: AppState; active?: boolean }) {
  const [summary, setSummary] = useState<TripStatistics | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [attempt, setAttempt] = useState(0);
  const tripRevision = state.trips.map(trip => `${trip.id}:${trip.createdAt}:${trip.distanceMeters}:${trip.fuelEstimate?.costPkr ?? ''}`).join('|');
  const calendarDate = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const owner = state.membership?.uid ?? state.profile.createdAt;
  useEffect(() => {
    if (!active) return;
    let current = true;
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 30000);
    setLoading(true); setError(''); setSummary(null);
    api<TravelStatistics>('/trips/statistics', { signal: controller.signal }).then(result => {
      if (!result?.month || result.month.period !== 'month') throw new Error('Trip statistics are unavailable.');
      if (current) setSummary(result.month);
    }).catch(() => { if (current) setError('Could not load monthly statistics.'); })
      .finally(() => { window.clearTimeout(timeout); if (current) setLoading(false); });
    return () => { current = false; window.clearTimeout(timeout); controller.abort(); };
  }, [active, tripRevision, attempt, calendarDate, owner]);
  return <section className="monthly-statistics" aria-label={t('Monthly statistics')}>
    <div className="monthly-statistics-title"><BarChart3 size={19} /><h2>{t('This month')}</h2><span className="tag neutral">{t('Private')}</span></div>
    {loading && <p className="small muted" role="status">{t('Loading trip totals…')}</p>}
    {error && <div className="error-box" role="alert"><p>{t(error)}</p><button className="text-button" onClick={() => setAttempt(value => value + 1)}>{t('Retry')}</button></div>}
    {summary && <>
      <div className="activity-stats"><div><strong>{summary.tripCount}</strong><span>{t('saved trips')}</span></div><div><strong>{distance(summary.distanceMeters)}</strong><span>{t('recorded distance')}</span></div><div><strong>{summary.durationSeconds ? duration(summary.durationSeconds) : t('0 min')}</strong><span>{t('travel time')}</span></div></div>
      <div className="fuel-spending-summary"><div><span><Fuel size={16} />{t('Estimated fuel cost')}</span><strong>{summary.pricedTripCount ? `≈ ${rupees(summary.costPkr)}` : '—'}</strong></div><p className="small muted">{summary.pricedTripCount} {t('priced trips')} · {summary.litres.toFixed(2)} {t('litres')}{summary.unpricedTripCount > 0 && <> · {summary.unpricedTripCount} {t('trips without a fuel estimate')}</>}</p>{summary.unpricedTripCount > 0 && <p className="small muted">{t('Trips without an estimate are excluded from cost totals. Older trips are not repriced after changing your vehicle.')}</p>}<p className="small muted">{t('Based on recorded distance, saved mileage and prices at the time. Estimates, not fuel receipts.')}</p></div>
      {!summary.tripCount && <p className="monthly-statistics-empty">{t('No recorded trips this month.')}</p>}
      {!summary.complete && <p className="small muted" role="status">{t('Partial totals: the retained-history limit was reached.')}</p>}
      <p className="small muted">{t('Month uses PKT and the trip departure date. History is retained for up to 90 days.')}</p>
    </>}
  </section>;
}
