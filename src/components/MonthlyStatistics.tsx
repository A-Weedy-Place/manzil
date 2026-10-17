import { useEffect, useId, useState } from 'react';
import { BarChart3, Fuel, Info } from 'lucide-react';
import type { AppState, TravelStatistics, TripStatistics, TripStatisticsDay } from '../../shared/types';
import { api } from '../lib/api';
import { distance, duration } from '../lib/format';
import { rupees } from '../lib/fuel';
import { getLanguage, t } from '../lib/language';

function Information({ label, children }: { label: string; children: string }) {
  const id = useId(), [open, setOpen] = useState(false);
  return <span className="statistics-information" data-escape-scope={open ? 'open' : undefined} onMouseEnter={() => setOpen(true)} onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setOpen(false); }}>
    <button className="statistics-info-button" type="button" aria-label={t(label)} aria-expanded={open} aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}><Info size={16} aria-hidden="true" /></button>
    {open && <span className="statistics-information-tip" id={id} role="tooltip">{t(children)}</span>}
  </span>;
}

function DailyChart({ days, metric, period }: { days: TripStatisticsDay[] | undefined; metric: 'distance' | 'fuel'; period: 'week' | 'month' }) {
  const id = useId(), [valuesOpen, setValuesOpen] = useState(false);
  const title = metric === 'distance' ? 'Distance travelled' : 'Estimated fuel used';
  const unit = metric === 'distance' ? 'km' : 'L';
  const value = (day: TripStatisticsDay) => metric === 'distance' ? day.distanceMeters / 1000 : day.litres;
  // A missing older-server series is unavailable, never fabricated from an overall total.
  const valid = days && days.length > 0 && days.length <= 31 && days.every(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date) && Number.isFinite(value(day)) && value(day) >= 0);
  const locale = getLanguage() === 'ur' ? 'ur-PK' : 'en-GB';
  const date = (day: TripStatisticsDay, short = false) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Karachi', ...(short && period === 'week' ? { weekday: 'short' } : short ? { day: 'numeric' } : { day: 'numeric', month: 'short' }) }).format(new Date(`${day.date}T00:00:00+05:00`));
  const max = valid ? Math.max(1, ...days.map(value)) : 1;
  const ceiling = Math.ceil(max / (max > 10 ? 5 : max > 2 ? 1 : .5)) * (max > 10 ? 5 : max > 2 ? 1 : .5);
  const chartWidth = 280, top = 14, height = 84, bottom = top + height, step = valid ? chartWidth / days.length : 0;
  return <section className={`statistics-chart statistics-chart-${metric}`} aria-labelledby={`${id}-heading`}>
    <div className="statistics-chart-heading"><h3 id={`${id}-heading`}>{t(title)}</h3><span>{unit}</span></div>
    {!valid ? <p className="small muted" role="status">{t('Daily chart unavailable.')}</p> : <>
      <svg className="statistics-chart-svg" viewBox="0 0 320 133" role="img" aria-labelledby={`${id}-chart-title ${id}-chart-description`}>
        <title id={`${id}-chart-title`}>{t(title)}</title>
        <desc id={`${id}-chart-description`}>{t('Daily totals by PKT departure date. Use View daily values for exact amounts.')}</desc>
        {[0, .5, 1].map(level => <g key={level}><line x1="31" x2="311" y1={bottom - level * height} y2={bottom - level * height} className="statistics-gridline" /><text x="25" y={bottom - level * height + 3} textAnchor="end" className="statistics-axis-label">{(ceiling * level).toLocaleString(locale, { maximumFractionDigits: 1 })}</text></g>)}
        {days.map((day, index) => {
          const amount = value(day), barHeight = amount / ceiling * height;
          return <g key={day.date}><rect x={32 + index * step + Math.min(3, step / 5)} y={bottom - barHeight} width={Math.max(1, step - Math.min(6, step / 2))} height={barHeight} rx={Math.min(3, step / 5)} className="statistics-bar"><title>{date(day)}: {amount.toLocaleString(locale, { maximumFractionDigits: 2 })} {unit}</title></rect>
            {(index === 0 || index === days.length - 1 || (index % Math.ceil(days.length / 6) === 0 && index < days.length - Math.ceil(days.length / 6))) && <text x={32 + (index + .5) * step} y="117" textAnchor="middle" className="statistics-axis-label">{date(day, true)}</text>}</g>;
        })}
      </svg>
      <details open={valuesOpen} onToggle={event => setValuesOpen(event.currentTarget.open)} className="statistics-chart-values"><summary>{t('View daily values')}</summary><div className="statistics-table-scroll"><table><caption className="sr-only">{t(title)}</caption><thead><tr><th scope="col">{t('Date')}</th><th scope="col">{unit}</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><th scope="row">{date(day)}</th><td>{value(day).toLocaleString(locale, { maximumFractionDigits: 2 })}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}

/** Reads private aggregate summaries only. Opening statistics never starts location capture. */
export default function MonthlyStatistics({ state, active = true }: { state: AppState; active?: boolean }) {
  const [result, setResult] = useState<{ owner: string; value: TravelStatistics } | null>(null), [period, setPeriod] = useState<'week' | 'month'>('month');
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [attempt, setAttempt] = useState(0);
  const panelId = useId();
  const tripRevision = state.trips.map(trip => `${trip.id}:${trip.createdAt}:${trip.distanceMeters}:${trip.fuelEstimate?.costPkr ?? ''}`).join('|');
  const calendarDate = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const owner = state.membership?.uid ?? state.profile.createdAt;
  const summary: TripStatistics | null = active && result?.owner === owner ? result.value[period] ?? null : null;
  useEffect(() => {
    if (!active) return;
    let current = true;
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 30000);
    setLoading(true); setError(''); setResult(null);
    api<TravelStatistics>('/trips/statistics', { signal: controller.signal }).then(value => {
      if (!value?.month || value.month.period !== 'month' || (value.week && value.week.period !== 'week')) throw new Error('Trip statistics are unavailable.');
      if (current) setResult({ owner, value });
    }).catch(() => { if (current) setError('Could not load personal statistics.'); })
      .finally(() => { window.clearTimeout(timeout); if (current) setLoading(false); });
    return () => { current = false; window.clearTimeout(timeout); controller.abort(); };
  }, [active, tripRevision, attempt, calendarDate, owner]);
  return <section className="monthly-statistics" aria-label={t('Personal statistics')}>
    <div className="statistics-period-tabs" role="tablist" aria-label={t('Statistics period')} onKeyDown={event => {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : period === 'week' ? 1 : 0;
      setPeriod(index === 0 ? 'week' : 'month'); buttons[index].focus();
    }}><button type="button" role="tab" id={`${panelId}-week`} aria-selected={period === 'week'} tabIndex={period === 'week' ? 0 : -1} aria-controls={panelId} onClick={() => setPeriod('week')}>{t('This week')}</button><button type="button" role="tab" id={`${panelId}-month`} aria-selected={period === 'month'} tabIndex={period === 'month' ? 0 : -1} aria-controls={panelId} onClick={() => setPeriod('month')}>{t('This month')}</button></div>
    <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-${period}`}>
      <div className="monthly-statistics-title"><BarChart3 size={19} aria-hidden="true" /><h2>{t(period === 'week' ? 'This week' : 'This month')}</h2><span className="tag neutral">{t('Private')}</span></div>
      {loading && <p className="small muted" role="status">{t('Loading trip totals…')}</p>}
      {error && <div className="error-box" role="alert"><p>{t(error)}</p><button className="text-button" onClick={() => setAttempt(value => value + 1)}>{t('Retry')}</button></div>}
      {!loading && !error && result?.owner === owner && !summary && <p role="status">{t('Statistics unavailable for this period.')}</p>}
      {summary && <>
        <div className="statistics-metrics"><div><strong>{summary.tripCount}</strong><span>{t('saved trips')}</span></div><div><strong>{distance(summary.distanceMeters)}</strong><span>{t('recorded distance')}</span></div><div><strong>{summary.durationSeconds ? duration(summary.durationSeconds) : t('0 min')}</strong><span>{t('travel time')}</span></div></div>
        <div className="statistics-fuel-card"><div className="statistics-fuel-heading"><span><Fuel size={17} aria-hidden="true" />{t('Estimated fuel cost')}</span><Information label="About fuel estimates">Based on recorded distance, saved mileage and prices at the time. Estimates, not fuel receipts. Trips without an estimate are excluded; changing your vehicle never reprices history.</Information></div><strong>{summary.pricedTripCount ? `≈ ${rupees(summary.costPkr)}` : '—'}</strong><p>{summary.pricedTripCount} {t('priced trips')} · {summary.litres.toFixed(2)} {t('litres')}</p>{summary.unpricedTripCount > 0 && <p className="statistics-unpriced">{summary.unpricedTripCount} {t('trips without a fuel estimate')}</p>}</div>
        {!summary.tripCount && <p className="monthly-statistics-empty">{t(period === 'week' ? 'No recorded trips this week.' : 'No recorded trips this month.')}</p>}
        <div className="statistics-chart-section-heading"><h3>{t('Daily activity')}</h3><Information label="About daily charts">Distance includes all saved trips. Fuel includes only trips with a saved estimate. Quiet days show zero; unavailable fuel estimates are excluded.</Information></div>
        <DailyChart days={summary.daily} metric="distance" period={period} /><DailyChart days={summary.daily} metric="fuel" period={period} />
        {!summary.complete && <p className="small muted" role="status">{t('Partial totals: the retained-history limit was reached.')}</p>}
        <p className="statistics-footnote">{t('PKT · Trip departure dates · Up to 90 days of history')}</p>
      </>}
    </div>
  </section>;
}
