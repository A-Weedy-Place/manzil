import type { FuelPriceStatus } from '../../shared/types';
import { dateTime } from '../lib/format';
import { fuelDate, rupees } from '../lib/fuel';
import { t } from '../lib/language';

export default function FuelPrices({ status, expanded = false }: { status?: FuelPriceStatus; expanded?: boolean }) {
  const now = Date.now();
  const latest = [...status?.records ?? []].filter(record => Date.parse(record.effectiveFrom) <= now).sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0];
  const stale = status?.state === 'stale' || status?.state === 'error' || !!status?.nextCheckAt && Date.parse(status.nextCheckAt) <= now;
  return <details className="fuel-price-details" open={expanded || undefined}><summary>{t('Fuel prices')}<span className={`tag ${latest && !stale ? 'green' : 'neutral'}`}>{t(!latest ? 'Unavailable' : stale ? 'Cached reference' : 'Checked daily')}</span></summary>
    <div className="fuel-price-content">
      {latest ? <>
        <p className="fuel-effective-date"><span>{t('Effective from')}</span><time dateTime={latest.effectiveFrom}>{fuelDate(latest.effectiveFrom)}</time></p>
        <dl className="fuel-price-grid">
          <div><dt>{t('Petrol')}</dt><dd><span dir="ltr">{rupees(latest.petrolPerLitre, 2)}</span><small>{t('/ litre')}</small></dd></div>
          <div><dt>{t('Diesel')}</dt><dd><span dir="ltr">{rupees(latest.dieselPerLitre, 2)}</span><small>{t('/ litre')}</small></dd></div>
        </dl>
        <a className="fuel-reference-link" href={latest.sourceUrl} target="_blank" rel="noreferrer">{t('PSO reference prices')}</a>
        {stale && <p className="fuel-price-warning small" role="status">{t('The latest check is overdue or failed. Estimates use the saved reference price.')}</p>}
      </> : <p className="small muted" role="status">{t('No verified fuel price is available. Fuel costs will appear after a successful price check.')}</p>}
      {status?.lastCheckedAt && <p className="fuel-last-checked">{t('Last checked')} <time dateTime={status.lastCheckedAt}>{dateTime(status.lastCheckedAt)}</time></p>}
    </div>
  </details>;
}
