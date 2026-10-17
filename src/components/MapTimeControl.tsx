import { CalendarClock } from 'lucide-react';
import { dayDate, time } from '../lib/format';
import { t } from '../lib/language';

interface Props {
  at: string;
  live: boolean;
  /** Retained for callers upgrading from the old header picker. */
  onChange?: (value: string | null) => void;
}

/** A status readout. Date selection belongs to the Plan ahead panel. */
export default function MapTimeControl({ at, live }: Props) {
  return <div className="map-time-status" data-mode={live ? 'live' : 'planned'}>
    <span className="map-time-status-label">
      {live ? <span className="map-time-live-dot" aria-hidden="true" /> : <CalendarClock size={14} aria-hidden="true" />}
      {t(live ? 'Live map' : 'Planned map')}
    </span>
    <time className="map-time-status-clock" dateTime={at}>{time(at)} <small>{t('PKT')}</small></time>
    <span className="map-time-status-date">{dayDate(at)}</span>
  </div>;
}
