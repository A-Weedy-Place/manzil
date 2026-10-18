import { Activity } from 'lucide-react';
import type { AppState, Trip } from '../../shared/types';
import { t } from '../lib/language';
import MonthlyStatistics from './MonthlyStatistics';
import TripHistory from './TripHistory';

interface Props {
  active?: boolean; state: AppState; reload: () => Promise<void>; notify: (message: string) => void;
  onView: (trip: Trip) => void; onSaveJourney?: (trip: Trip) => void;
}

/** Read-only overview. Consented foreground navigation owns trip capture. */
export default function ActivityPanel({ active = true, state, reload, notify, onView, onSaveJourney }: Props) {
  return <>
    <div className="section-heading"><h1>{t('Your activity')}</h1><Activity size={23} aria-hidden="true" /></div>
    <MonthlyStatistics state={state} active={active} showCharts={false} />
    <TripHistory state={state} reload={reload} notify={notify} onView={onView} onSaveJourney={onSaveJourney} />
  </>;
}
