import { useEffect, useId, useState } from 'react';
import { BarChart3, Fuel, Info } from 'lucide-react';
import type { AppState, FuelPriceStatus, TravelStatistics, TripStatistics, TripStatisticsDay } from '../../shared/types';
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

function DailyChart({ days, period }: { days: TripStatisticsDay[] | undefined; period: 'week' | 'month' }) {
  const id = useId(), [valuesOpen, setValuesOpen] = useState(false);
  const title = 'Distance travelled', unit = 'km';
  const value = (day: TripStatisticsDay) => day.distanceMeters / 1000;
  // A missing older-server series is unavailable, never fabricated from an overall total.
  const valid = days && days.length > 0 && days.length <= 31 && days.every(day => /^\d{4}-\d{2}-\d{2}$/.test(day.date) && Number.isFinite(value(day)) && value(day) >= 0);
  const locale = getLanguage() === 'ur' ? 'ur-PK' : 'en-GB';
  const date = (day: TripStatisticsDay, short = false) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Karachi', ...(short && period === 'week' ? { weekday: 'short' } : short ? { day: 'numeric' } : { day: 'numeric', month: 'short' }) }).format(new Date(`${day.date}T00:00:00+05:00`));
  const max = valid ? Math.max(1, ...days.map(value)) : 1;
  const ceiling = Math.ceil(max / (max > 10 ? 5 : max > 2 ? 1 : .5)) * (max > 10 ? 5 : max > 2 ? 1 : .5);
  const chartWidth = 280, top = 14, height = 84, bottom = top + height, step = valid ? chartWidth / days.length : 0;
  return <section className="statistics-chart statistics-chart-distance" aria-labelledby={`${id}-heading`}>
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

function FuelPriceHistory({ status, summary, fuelType }: { status?: FuelPriceStatus; summary: TripStatistics; fuelType: 'petrol' | 'diesel' }) {
  const id = useId(), [product, setProduct] = useState(fuelType);
  const locale = getLanguage() === 'ur' ? 'ur-PK' : 'en-GB', end = Date.parse(summary.until), pkt = 5 * 3600_000, day = 86400_000;
  const local = new Date(end + pkt), today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - pkt;
  const from = summary.from === null ? summary.period === 'week' ? today - ((local.getUTCDay() + 6) % 7) * day : Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - pkt : Date.parse(summary.from);
  const price = (record: NonNullable<FuelPriceStatus['records']>[number]) => product === 'petrol' ? record.petrolPerLitre : record.dieselPerLitre;
  const known = [...new Map((status?.records ?? []).slice(0, 400).filter(record => Number.isFinite(Date.parse(record.effectiveFrom)) && Date.parse(record.effectiveFrom) <= end && Number.isFinite(price(record)) && price(record) > 0).map(record => [record.effectiveFrom, record])).values()].sort((a, b) => Date.parse(a.effectiveFrom) - Date.parse(b.effectiveFrom));
  const initial = [...known].reverse().find(record => Date.parse(record.effectiveFrom) <= from);
  const changes = known.filter(record => Date.parse(record.effectiveFrom) > from);
  const records = initial ? [initial, ...changes] : changes;
  const cached = status?.state !== 'fresh' || !status.nextCheckAt || Date.parse(status.nextCheckAt) <= end;
  const date = (at: number, short = false) => new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Karachi', day: 'numeric', ...(short ? {} : { month: 'short' }) }).format(new Date(at));
  const low = records.length ? Math.min(...records.map(price)) : 0, high = records.length ? Math.max(...records.map(price)) : 0;
  const margin = Math.max(1, (high - low) * .18), minimum = Math.max(0, low - margin), maximum = high + margin;
  const x = (at: number) => 37 + (Math.max(from, at) - from) / Math.max(1, end - from) * 273;
  const y = (amount: number) => 98 - (amount - minimum) / Math.max(1, maximum - minimum) * 80;
  const line = records.map((record, index) => `${index ? 'H' : 'M'}${x(Date.parse(record.effectiveFrom)).toFixed(2)}${index ? ' V' : ' '}${y(price(record)).toFixed(2)}`).join(' ') + (records.length ? ` H${x(end).toFixed(2)}` : '');
  return <section className="statistics-chart statistics-chart-prices" aria-labelledby={`${id}-heading`}>
    <div className="statistics-price-heading"><div><h3 id={`${id}-heading`}>{t('Fuel price history')}</h3><span>{t('PKR / litre')}</span></div><Information label="About fuel price history">Published PSO reference prices at their effective dates. The line stays flat until the next known price; no daily changes are invented. Earlier uncached prices are unavailable. Outlet freight is excluded.</Information></div>
    <div className="statistics-fuel-products" role="group" aria-label={t('Fuel product')}><button type="button" aria-pressed={product === 'petrol'} onClick={() => setProduct('petrol')}>{t('Petrol')}</button><button type="button" aria-pressed={product === 'diesel'} onClick={() => setProduct('diesel')}>{t('Diesel')}</button></div>
    {!records.length ? <p className="small muted" role="status">{t('Fuel price history unavailable for this period.')}</p> : <>
      {cached && <p className="statistics-price-status" role="status">{t('Cached reference')}</p>}
      <svg className="statistics-chart-svg" viewBox="0 0 320 133" role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{t('Fuel price history')} · {t(product === 'petrol' ? 'Petrol' : 'Diesel')}</title><desc id={`${id}-description`}>{t('Stepped at published effective dates. Use View price history for exact prices.')}</desc>
        {[0, .5, 1].map(level => <g key={level}><line x1="37" x2="310" y1={98 - level * 80} y2={98 - level * 80} className="statistics-gridline" /><text x="31" y={101 - level * 80} textAnchor="end" className="statistics-axis-label">{(minimum + level * (maximum - minimum)).toLocaleString(locale, { maximumFractionDigits: 1 })}</text></g>)}
        <path d={line} className="statistics-price-line" />
        {records.map(record => <circle key={record.effectiveFrom} cx={x(Date.parse(record.effectiveFrom))} cy={y(price(record))} r="3" className="statistics-price-point"><title>{date(Date.parse(record.effectiveFrom))}: {rupees(price(record))} / {t('litre')}</title></circle>)}
        {[from, from + (end - from) / 2, end].map((at, index) => <text key={index} x={x(at)} y="117" textAnchor={index === 0 ? 'start' : index === 2 ? 'end' : 'middle'} className="statistics-axis-label">{date(at)}</text>)}
      </svg>
      <details className="statistics-chart-values"><summary>{t('View price history')}</summary><div className="statistics-table-scroll"><table><caption className="sr-only">{t('Fuel price history')}</caption><thead><tr><th scope="col">{t('Effective from')}</th><th scope="col">{t('PKR / litre')}</th></tr></thead><tbody>{records.map(record => <tr key={record.effectiveFrom}><th scope="row">{date(Date.parse(record.effectiveFrom))}</th><td>{price(record).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>)}</tbody></table></div></details>
      <a className="statistics-price-source" href={records.at(-1)!.sourceUrl} target="_blank" rel="noreferrer">{t('PSO reference prices')}</a>
    </>}
  </section>;
}

/** Reads private aggregate summaries only. Opening statistics never starts location capture. */
export default function MonthlyStatistics({ state, active = true, showCharts = true }: { state: AppState; active?: boolean; showCharts?: boolean }) {
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
  return <section className={`monthly-statistics${showCharts ? '' : ' statistics-summary-only'}`} aria-label={t('Personal statistics')}>
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
        <div className="statistics-metrics"><div><strong>{summary.tripCount}</strong><span>{t('saved trips')}</span></div><div><strong>{distance(summary.distanceMeters)}</strong><span>{t('recorded distance')}</span></div><div><strong>{summary.durationSeconds ? duration(summary.durationSeconds) : t('0 min')}</strong><span>{t('travel time')}</span></div>{!showCharts && <div className="statistics-summary-cost"><strong>{summary.pricedTripCount ? `≈ ${rupees(summary.costPkr)}` : '—'}</strong><span>{t('Estimated fuel cost')}</span><Information label="About fuel estimates">Based on recorded distance, saved mileage and prices at the time. Estimates, not fuel receipts. Trips without an estimate are excluded; changing your vehicle never reprices history.</Information></div>}</div>
        {showCharts && <div className="statistics-fuel-card"><div className="statistics-fuel-heading"><span><Fuel size={17} aria-hidden="true" />{t('Estimated fuel cost')}</span><Information label="About fuel estimates">Based on recorded distance, saved mileage and prices at the time. Estimates, not fuel receipts. Trips without an estimate are excluded; changing your vehicle never reprices history.</Information></div><strong>{summary.pricedTripCount ? `≈ ${rupees(summary.costPkr)}` : '—'}</strong><p>{summary.pricedTripCount} {t('priced trips')} · {summary.litres.toFixed(2)} {t('litres')}</p>{summary.unpricedTripCount > 0 && <p className="statistics-unpriced">{summary.unpricedTripCount} {t('trips without a fuel estimate')}</p>}</div>}
        {!showCharts && summary.unpricedTripCount > 0 && <p className="small muted">{summary.unpricedTripCount} {t('trips without a fuel estimate')}</p>}
        {!summary.tripCount && <p className="monthly-statistics-empty">{t(period === 'week' ? 'No recorded trips this week.' : 'No recorded trips this month.')}</p>}
        {showCharts && <><div className="statistics-chart-section-heading"><h3>{t('Daily activity')}</h3><Information label="About daily charts">Distance includes all saved trips. Quiet days show zero; missing trip data is unavailable.</Information></div>
          <DailyChart days={summary.daily} period={period} /><FuelPriceHistory status={state.fuel} summary={summary} fuelType={state.profile.vehicle?.fuelType ?? 'petrol'} /></>}
        {!summary.complete && <p className="small muted" role="status">{t('Partial totals: the retained-history limit was reached.')}</p>}
        <p className="statistics-footnote">{t('PKT · Trip departure dates · Up to 90 days of history')}</p>
      </>}
    </div>
  </section>;
}
