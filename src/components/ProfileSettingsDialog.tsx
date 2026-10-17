import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from '../lib/language';
import Modal from './Modal';

export type ProfileSection = 'identity' | 'vehicle' | 'data' | 'appearance' | 'alerts' | 'fuel' | 'statistics' | 'history';
export const profileSectionTitle: Record<ProfileSection, string> = {
  identity: 'Personal information', vehicle: 'Your vehicle', data: 'Personal trip data',
  appearance: 'Appearance & language', alerts: 'Journey alerts', fuel: 'Fuel prices',
  statistics: 'Personal statistics', history: 'Trip history',
};

/** One adjacent, keyboard-accessible panel for every personal setting. */
export default function ProfileSettingsDialog({ section, onClose, children, closeLabel = 'Close settings' }: { section: ProfileSection; onClose: () => void; children: ReactNode; closeLabel?: string }) {
  const titleId = useId();
  return <Modal titleId={titleId} onClose={onClose} className="profile-settings-dialog profile-statistics-dialog">
    <div className="statistics-dialog-heading"><h1 id={titleId}>{t(profileSectionTitle[section])}</h1><button className="icon-button" aria-label={t(closeLabel)} onClick={onClose}><X size={20} /></button></div>
    <div className={`profile-section-content profile-section-${section}`}>{children}</div>
  </Modal>;
}
