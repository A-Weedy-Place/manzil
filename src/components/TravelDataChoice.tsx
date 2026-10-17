import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { LocalProfile } from '../../shared/types';
import { send } from '../lib/api';
import { clearTravelDataChoicePrompt, getAuthSession } from '../lib/auth';
import { t } from '../lib/language';
import Modal from './Modal';

/** Registration asks once; granting this preference never starts a GPS watcher. */
export default function TravelDataChoice({ uid, onComplete }: {
  uid: string;
  onComplete: (profile?: LocalProfile) => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function choose(allow: boolean) {
    if (busy || getAuthSession().user?.uid !== uid) return;
    setBusy(true); setError('');
    try {
      const profile = await send<LocalProfile>('/profile', {
        travelDataChoiceMade: true, collectTravelData: allow, inferFrequentRoutes: allow,
      }, 'PATCH');
      if (getAuthSession().user?.uid !== uid) return;
      clearTravelDataChoicePrompt(uid); onComplete(profile);
    } catch {
      if (getAuthSession().user?.uid !== uid) return;
      // A lost response may follow a committed write. Do not claim a preference
      // changed until the API confirms it; retrying either choice is safe.
      setError('Could not confirm your choice. Please try again.');
    } finally { setBusy(false); }
  }
  return <Modal titleId="travel-choice-title" onClose={() => { void choose(false); }} className="travel-choice-modal">
    <span className="travel-choice-icon"><ShieldCheck size={28} aria-hidden="true" /></span>
    <h1 id="travel-choice-title">{t('Personal trip data')}</h1>
    <p>{t('Save your trips for monthly statistics and alerts on your usual journeys?')}</p>
    <p className="small muted">{t('Optional. Only during navigation or recording while Manzil is visible. You can change this in your profile.')}</p>
    <div className="travel-choice-actions" aria-busy={busy}>
      <button className="primary-button full" disabled={busy} onClick={() => { void choose(true); }}>{t('Allow personal trip data')}</button>
      <button className="secondary-button full" disabled={busy} onClick={() => { void choose(false); }}>{t('Not now')}</button>
    </div>
    {busy && <p className="small muted" role="status">{t('Saving changes…')}</p>}
    {error && <p className="error-box" role="alert">{t(error)}</p>}
  </Modal>;
}
