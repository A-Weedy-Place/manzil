import { Banknote, ChevronDown, CircleHelp, ExternalLink } from 'lucide-react';
import type { TransitJourney, TransitNetwork, TransitRideLeg } from '../../shared/transit';
import type { TransitJourneyFare } from '../../shared/transit-fares';
import { getLanguage } from '../lib/language';
import { transitRouteLabel } from '../lib/transitMap';
import '../transit-fares.css';

const words = {
  'Fare estimate': 'تخمینی کرایہ', 'Fare unavailable': 'کرایہ دستیاب نہیں', 'Fare incomplete': 'مکمل کرایہ دستیاب نہیں',
  'Fare details': 'کرائے کی تفصیل', 'Base fare': 'بنیادی کرایہ', 'Known subtotal': 'معلوم کرایے کا مجموعہ',
  'Checked': 'جانچ کی تاریخ', 'Reported reference': 'خبر میں درج حوالہ', 'Published': 'اشاعت',
  'Single-boarding adult reference fares. Discounts and through-ticketing are not applied.': 'یہ فی سواری بالغ فرد کے بنیادی کرایوں کے حوالے ہیں۔ رعایت یا مشترکہ ٹکٹ شامل نہیں۔',
  'These are reference estimates, not live ticket prices.': 'یہ حوالوں پر مبنی تخمینے ہیں، موجودہ ٹکٹ کی حتمی قیمت نہیں۔',
  'Historical fare unavailable': 'اس تاریخ کا کرایہ دستیاب نہیں', 'Additional fare may apply after 75 minutes': '۷۵ منٹ کے بعد اضافی کرایہ لاگو ہو سکتا ہے',
} as const;
const text = (value: keyof typeof words) => getLanguage() === 'ur' ? words[value] : value;
const amount = (value: number) => `PKR ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(value)}`;
const day = (value: string) => new Intl.DateTimeFormat(getLanguage() === 'ur' ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }).format(new Date(`${value}T00:00:00Z`));

export function TransitFareBadge({ fare }: { fare?: TransitJourneyFare }) {
  return <span className={`transit-fare-badge ${fare?.status === 'complete' ? '' : 'is-unknown'}`}><Banknote size={15} aria-hidden="true" />{fare?.status === 'complete' && fare.total !== null ? <><span>{text('Fare estimate')}</span><bdi>{amount(fare.total)}</bdi></> : text(fare?.status === 'partial' ? 'Fare incomplete' : 'Fare unavailable')}</span>;
}

export function TransitRideFare({ leg }: { leg: TransitRideLeg }) {
  return <span className="transit-ride-fare"><Banknote size={14} aria-hidden="true" />{leg.fare?.amount != null ? <><bdi>{amount(leg.fare.amount)}</bdi><small>{text('Base fare')}</small></> : text('Fare unavailable')}</span>;
}

export function TransitFareDetails({ journey, network }: { journey: TransitJourney; network: TransitNetwork }) {
  const rides = journey.legs.filter((leg): leg is TransitRideLeg => leg.kind === 'ride');
  const references = [...new Map(rides.flatMap(leg => leg.fare?.reference ? [[leg.fare.reference.id, leg.fare.reference] as const] : [])).values()];
  return <div className="transit-fare-summary"><TransitFareBadge fare={journey.fare} /><details className="transit-fare-details"><summary><CircleHelp size={15} aria-hidden="true" />{text('Fare details')}<ChevronDown size={14} aria-hidden="true" /></summary><div>
    {journey.fare?.status === 'partial' && <p className="transit-fare-subtotal"><span>{text('Known subtotal')}</span><bdi>{amount(journey.fare.knownSubtotal)}</bdi></p>}
    <ul>{rides.map((leg, index) => <li key={`${leg.patternId}-${index}`}><span>{transitRouteLabel(network.routes.find(route => route.id === leg.routeId)?.shortName ?? leg.routeId)}</span><span>{leg.fare?.amount != null ? <bdi>{amount(leg.fare.amount)}</bdi> : text(leg.fare?.reason === 'historical-price-unavailable' ? 'Historical fare unavailable' : leg.fare?.reason === 'additional-fare-possible' ? 'Additional fare may apply after 75 minutes' : 'Fare unavailable')}</span></li>)}</ul>
    <p>{text('Single-boarding adult reference fares. Discounts and through-ticketing are not applied.')}</p><p>{text('These are reference estimates, not live ticket prices.')}</p>
    {references.map(reference => <div className="transit-fare-reference" key={reference.id}><a href={reference.url} target="_blank" rel="noreferrer">{reference.label}<ExternalLink size={12} aria-hidden="true" /></a>{reference.evidence === 'government-report' && <span>{text('Reported reference')}{reference.publishedOn ? ` · ${text('Published')} ${day(reference.publishedOn)}` : ''}</span>}<small>{text('Checked')} {day(reference.checkedOn)}</small></div>)}
  </div></details></div>;
}
