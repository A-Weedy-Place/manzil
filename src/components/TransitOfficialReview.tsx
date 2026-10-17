import { ExternalLink } from 'lucide-react';
import type { TransitOfficialReview as Review } from '../../shared/transit';
import { dateTime } from '../lib/format';
import { t } from '../lib/language';

export default function TransitOfficialReview({ review }: { review?: Review }) {
  if (!review) return null;
  const status = review.status === 'consistent' ? 'Stops compared' : review.status === 'differences' ? 'Differences noted' : review.status === 'reference-only' ? 'Reference only' : 'No route-level confirmation';
  return <details className="transit-source-details">
    <summary>{t('Official references')} · {t(status)}</summary>
    <p>{review.summary}</p>
    <small>{t('Checked')} {dateTime(review.checkedAt)}</small>
    <ul>{review.references.map(reference => <li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.label}<ExternalLink size={12} /></a></li>)}</ul>
    <small>{t('This comparison does not certify map coordinates or live service.')}</small>
  </details>;
}
