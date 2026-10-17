import type { FuelPriceStatus } from '../../shared/types';
import { dateTime } from '../lib/format';
import { fuelDate, rupees } from '../lib/fuel';
import { t } from '../lib/language';

export default function FuelPrices({ status }: { status?: FuelPriceStatus }) {
  const now = Date.now();
  const latest = [...status?.records ?? []].filter(record => Date.parse(record.effectiveFrom) <= now).sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0];
  const stale = status?.state === 'stale' || status?.state === 'error' || !!status?.nextCheckAt && Date.parse(status.nextCheckAt) <= now;
  return <details className="fuel-price-details"><summary>{t('Fuel prices')}<span className={`tag ${latest && !stale ? 'green' : 'neutral'}`}>{t(!latest ? 'Unavailable' : stale ? 'Cached reference' : 'Updated daily')}</span></summary>
    {latest ? <><dl className="fuel-price-grid"><div><dt>{t('Petrol')}</dt><dd>{rupees(latest.petrolPerLitre, 2)} {t('/ litre')}</dd></div><div><dt>{t('Diesel')}</dt><dd>{rupees(latest.dieselPerLitre, 2)} {t('/ litre')}</dd></div></dl><p className="small muted">{t('Effective from')} {fuelDate(latest.effectiveFrom)}</p><a href={latest.sourceUrl} target="_blank" rel="noreferrer">{latest.sourceName}</a><p className="small muted">{t('PSO reference price; outlet freight and driving conditions can change cost.')}</p>{stale && <p className="small muted">{t('The latest check is overdue or failed. Estimates use the saved reference price.')}</p>}</> : <p className="small muted">{t('No verified fuel price is available. Fuel costs will appear after a successful price check.')}</p>}
    {status?.lastCheckedAt && <p className="small muted">{t('Last checked')} {dateTime(status.lastCheckedAt)}</p>}
  </details>;
}
