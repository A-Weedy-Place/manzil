import { useEffect, useRef, useState } from 'react';
import { BarChart3, Bell, Camera, Car, Check, ChevronRight, Fuel, History, Inbox, Map, Moon, Pencil, ShieldCheck, Sun, UserRound, X, type LucideIcon } from 'lucide-react';
import type { AppState, FrequentRouteProposal, LocalProfile } from '../../shared/types';
import { api, send } from '../lib/api';
import { t } from '../lib/language';
import { enableBrowserNotifications } from '../lib/notifications';
import { MapStyleChoices } from './MapStylePicker';
import { useLanguage } from '../lib/useLanguage';
import type { AccountUser } from '../lib/auth';
import { AUTH_MODE, getAuthSession } from '../lib/auth';
import { fileToPhotoDataUrl } from '../lib/images';
import VehicleSettings from './VehicleSettings';
import FuelPrices from './FuelPrices';
import ProfileSettingsDialog, { profileSectionTitle, type ProfileSection } from './ProfileSettingsDialog';
import PakistanCitySelect from './PakistanCitySelect';
export type { ProfileSection } from './ProfileSettingsDialog';

interface Props { account?: AccountUser | null; onSignOut?: () => void; personalFeaturesAvailable?: boolean; onSignIn?: () => void; onTour?: () => void; state: AppState; reload: () => Promise<void>; notify: (text: string) => void; onSources: () => void; onActivity: () => void; onStatistics?: () => void; section?: ProfileSection | null; onSectionChange?: (section: ProfileSection | null) => void; onSaveProposal: (proposal: FrequentRouteProposal) => Promise<void> }
type ProfilePatch = Partial<Omit<LocalProfile, 'id' | 'createdAt' | 'updatedAt'>>;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const notificationPermission = () => 'Notification' in window ? window.Notification.permission : 'unsupported' as const;
function near(a: number[], b: number[]) { return Math.hypot((a[0] - b[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), a[1] - b[1]) * 111195 <= 250; }
export default function ProfilePanel({ account, onSignOut, personalFeaturesAvailable = false, onSignIn, onTour, state, reload, notify, onSources, onActivity, onStatistics, section, onSectionChange, onSaveProposal }: Props) {
  const { language, setLanguage } = useLanguage(), profile = state.profile;
  const role = account && state.membership?.uid === account.uid ? state.membership.role : account?.role;
  const displayName = profile.displayName !== 'Traveller' ? profile.displayName : account?.displayName ?? profile.displayName;
  const [localSection, setLocalSection] = useState<ProfileSection | null>(null);
  const activeSection = section === undefined ? localSection : section, editing = activeSection === 'identity';
  const [name, setName] = useState(profile.displayName), [city, setCity] = useState(profile.city ?? ''), [location, setLocation] = useState(profile.location ?? ''), [photoDraft, setPhotoDraft] = useState(profile.photoDataUrl ?? '');
  const draftOwner = useRef<string | null>(null), photoGeneration = useRef(0);
  const panelGeneration = useRef(0);
  const [busy, setBusy] = useState(false), [preparingPhoto, setPreparingPhoto] = useState(false), [error, setError] = useState('');
  const [proposals, setProposals] = useState<FrequentRouteProposal[]>([]), [proposalLoading, setProposalLoading] = useState(false), [proposalError, setProposalError] = useState(''), [proposalAttempt, setProposalAttempt] = useState(0), [permission, setPermission] = useState(notificationPermission);
  const tripRevision = state.trips.map(trip => `${trip.id}:${trip.pointCount ?? trip.points.length}:${trip.endedAt}`).sort().join('|');
  const accountId = account?.uid ?? getAuthSession().user?.uid;
  useEffect(() => { setLocalSection(null); setError(''); setBusy(false); draftOwner.current = null; photoGeneration.current++; panelGeneration.current++; setName(profile.displayName); setCity(profile.city ?? ''); setLocation(profile.location ?? ''); setPhotoDraft(profile.photoDataUrl ?? ''); }, [accountId]);
  useEffect(() => {
    panelGeneration.current++; photoGeneration.current++; setPreparingPhoto(false); setError('');
    if (editing) { draftOwner.current = getAuthSession().user?.uid ?? null; setName(displayName); setCity(profile.city ?? ''); setLocation(profile.location ?? ''); setPhotoDraft(profile.photoDataUrl ?? ''); }
    else { draftOwner.current = null; }
    // A newly opened panel starts from the saved profile; poll refreshes do not erase an open draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, accountId]);
  useEffect(() => { if (!editing) { setName(profile.displayName); setCity(profile.city ?? ''); setLocation(profile.location ?? ''); setPhotoDraft(profile.photoDataUrl ?? ''); } }, [editing, profile.displayName, profile.city, profile.location, profile.photoDataUrl]);
  useEffect(() => () => { photoGeneration.current++; }, []);
  useEffect(() => { const refresh = () => setPermission(notificationPermission()); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, []);
  useEffect(() => {
    let current = true;
    if (!profile.collectTravelData || !profile.inferFrequentRoutes || !personalFeaturesAvailable) { setProposals([]); setProposalLoading(false); setProposalError(''); return; }
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 30000);
    setProposalLoading(true); setProposalError('');
    api<FrequentRouteProposal[]>('/frequent-routes', { signal: controller.signal }).then(items => { if (current) setProposals(items); }).catch(() => { if (current) { setProposals([]); setProposalError('Could not refresh learned journeys. Your recorded trips are retained.'); } }).finally(() => { window.clearTimeout(timeout); if (current) setProposalLoading(false); });
    return () => { current = false; window.clearTimeout(timeout); controller.abort(); };
  }, [personalFeaturesAvailable, profile.collectTravelData, profile.inferFrequentRoutes, tripRevision, proposalAttempt, accountId]);
  async function update(patch: ProfilePatch): Promise<boolean> {
    if (busy) return false;
    const owner = getAuthSession().user?.uid, generation = panelGeneration.current; setError(''); setBusy(true);
    try { await send('/profile', patch, 'PATCH'); if (getAuthSession().user?.uid !== owner) return false; try { await reload(); } catch { throw new Error('Preferences were saved, but the app could not refresh. Reconnect and reload to see them.'); } if (getAuthSession().user?.uid !== owner) return false; notify('Preferences saved.'); return true; }
    catch (e) { if (getAuthSession().user?.uid === owner && generation === panelGeneration.current) setError(e instanceof Error ? e.message : 'Could not save preferences.'); return false; }
    finally { if (getAuthSession().user?.uid === owner) setBusy(false); }
  }
  function closeSection() { photoGeneration.current++; setPreparingPhoto(false); setError(''); if (onSectionChange) onSectionChange(null); else setLocalSection(null); }
  function openSection(next: ProfileSection) {
    if (activeSection === next) { closeSection(); return; }
    setError('');
    if (onSectionChange) onSectionChange(next);
    else if (next === 'statistics') (onStatistics ?? onActivity)();
    else if (next === 'history') onActivity();
    else setLocalSection(next);
  }
  async function saveProfile() {
    if (draftOwner.current !== (getAuthSession().user?.uid ?? null)) { setError('Account changed. Edit your profile again.'); return; }
    const patch: ProfilePatch = { displayName: name.trim(), city: city.trim(), location: location.trim() };
    if (photoDraft !== (profile.photoDataUrl ?? '')) patch.photoDataUrl = photoDraft;
    const generation = panelGeneration.current;
    if (await update(patch) && generation === panelGeneration.current) closeSection();
  }
  async function photo(file: File | undefined) {
    if (!file || busy || preparingPhoto) return;
    const owner = getAuthSession().user?.uid, generation = ++photoGeneration.current; setPreparingPhoto(true); setError('');
    try { const value = await fileToPhotoDataUrl(file); if (generation !== photoGeneration.current) return; if (!owner || getAuthSession().user?.uid !== owner || draftOwner.current !== owner) throw new Error('Account changed. Choose the photo again.'); setPhotoDraft(value); }
    catch (e) { if (generation === photoGeneration.current) setError(e instanceof Error ? e.message : 'Could not prepare this photo.'); }
    finally { if (generation === photoGeneration.current) setPreparingPhoto(false); }
  }
  async function notifications(allowInThisBrowser = false) {
    if (busy) return;
    if (profile.browserNotifications && !allowInThisBrowser) { await update({ browserNotifications: false }); return; }
    const owner = getAuthSession().user?.uid, generation = panelGeneration.current; setError(''); setBusy(true);
    try { await enableBrowserNotifications(); if (owner !== getAuthSession().user?.uid) return; setPermission(notificationPermission()); await send('/profile', { browserNotifications: true }, 'PATCH'); try { await reload(); } catch { throw new Error('The notification preference was saved, but the app could not refresh. Reconnect and reload.'); } if (owner === getAuthSession().user?.uid) notify('Browser notifications enabled for new journey alerts.'); }
    catch (e) { if (owner === getAuthSession().user?.uid && generation === panelGeneration.current) setError(e instanceof Error ? e.message : 'Could not enable notifications.'); }
    finally { if (owner === getAuthSession().user?.uid) { setPermission(notificationPermission()); setBusy(false); } }
  }
  const ownDialog = activeSection && activeSection !== 'statistics' && activeSection !== 'history' && (personalFeaturesAvailable || activeSection === 'appearance' || activeSection === 'fuel') ? activeSection : null;
  const pending = busy || preparingPhoto;
  const mapName = t(profile.mapStyle === 'minimal' ? 'Minimal' : !profile.mapStyle || profile.mapStyle === 'night' ? 'Night' : 'Classic');
  const demoData = !!profile.demoData;
  function settingsRow(key: ProfileSection, Icon: LucideIcon, summary: string, badge?: string) {
    return <button className={`settings-link profile-setting-link ${activeSection === key ? 'is-active' : ''}`} aria-label={t(profileSectionTitle[key])} aria-haspopup="dialog" aria-expanded={activeSection === key} onClick={() => openSection(key)}>
      <span className="profile-setting-icon"><Icon size={20} /></span><span><strong>{t(profileSectionTitle[key])}</strong><small>{summary}</small></span>{badge && <span className={`tag ${profile.collectTravelData ? 'green' : 'neutral'}`}>{badge}</span>}<ChevronRight size={18} />
    </button>;
  }
  return <div className="profile-workspace">
    <div className="section-heading profile-heading"><h1>{t('User profile')}</h1>{personalFeaturesAvailable && <button className="secondary-button profile-edit-button" aria-haspopup="dialog" aria-expanded={editing} onClick={() => openSection('identity')}><Pencil size={15} />{t('Edit')}</button>}</div>
    <section className="profile-account-card">
      <div className="profile-identity"><span className="profile-avatar">{personalFeaturesAvailable && profile.photoDataUrl ? <img src={profile.photoDataUrl} alt={t('Your profile photo')} /> : displayName.trim().slice(0, 1).toUpperCase()}</span><div><h2>{personalFeaturesAvailable ? displayName : t('Guest')}</h2><p>{personalFeaturesAvailable ? account?.email ?? t('Personal profile') : t('Guest preferences')}</p>{personalFeaturesAvailable && (profile.city || profile.location) && <p>{[profile.location, profile.city].filter(Boolean).join(', ')}</p>}</div></div>
      {demoData && <p className="profile-demo-badge"><span className="tag amber">{t('Demo data')}</span><span>{t('Synthetic journeys. No GPS collected.')}</span></p>}
      {account && <div className="profile-session-actions"><span className="tag neutral">{t(role === 'admin' ? 'Admin user' : role === 'verified' ? 'Verified contributor' : 'Normal user')}</span><button className="text-button" onClick={onSignOut}>{t('Sign out')}</button></div>}
      {!personalFeaturesAvailable && <button className="secondary-button full" onClick={onSignIn}>{t('Sign in for personal features')}</button>}
    </section>
    <nav className="profile-settings-menu" aria-label={t('Profile settings')}>
      {personalFeaturesAvailable && <>
        {settingsRow('data', ShieldCheck, t('History & data preferences'), t(profile.collectTravelData ? 'On' : 'Off'))}
        {settingsRow('statistics', BarChart3, t('This month'))}
        {settingsRow('history', History, t('Recorded journeys'))}
        {settingsRow('vehicle', Car, profile.vehicle ? [profile.vehicle.label || t(profile.vehicle.kind === 'motorcycle' ? 'Motorcycle' : 'Car'), profile.vehicle.kmPerLitre ? `${profile.vehicle.kmPerLitre} ${t('km/litre')}` : t('Mileage not set')].join(' · ') : t('Add a car or motorcycle'))}
      </>}
      {settingsRow('fuel', Fuel, t(state.fuel?.records.length ? 'Dated PSO reference prices' : 'Unavailable'))}
      {settingsRow('appearance', Sun, `${t(profile.theme === 'light' ? 'Light' : !profile.theme || profile.theme === 'dark' ? 'Dark' : 'System')} · ${mapName} · ${language === 'ur' ? 'اردو' : 'English'}`)}
      {personalFeaturesAvailable && settingsRow('alerts', Bell, t(profile.browserNotifications ? 'Browser notifications on' : 'Browser notifications off'))}
    </nav>
    <section className="profile-utilities"><button className="settings-link" onClick={onTour}><UserRound size={19} /><span>{t('Replay tour')}</span><ChevronRight size={18} /></button>{role === 'admin' && <button className="settings-link" onClick={onSources}><Inbox size={20} /><span>{t('Source updates & collector')}</span><ChevronRight size={18} /></button>}{AUTH_MODE === 'development' && <p className="small muted">{t('Development accounts share this local workspace.')}</p>}</section>
    {ownDialog && <ProfileSettingsDialog section={ownDialog} onClose={closeSection}>
      {busy && <p className="small muted" role="status">{t('Saving changes…')}</p>}{preparingPhoto && <p className="small muted" role="status">{t('Preparing photo…')}</p>}{error && <div className="error-box" role="alert">{t(error)}</div>}
      {ownDialog === 'identity' && <form className="profile-details-form" aria-label={t('Edit profile')} aria-busy={pending} onSubmit={event => { event.preventDefault(); if (!pending) void saveProfile(); }}>
        <div className="profile-edit-photo"><span className="profile-avatar">{photoDraft ? <img src={photoDraft} alt={t('Your profile photo')} /> : name.trim().slice(0, 1).toUpperCase()}</span><div className="profile-photo-actions"><label className="secondary-button"><Camera size={17} />{t('Change photo')}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={t('Choose profile photo')} disabled={pending} onChange={event => { void photo(event.target.files?.[0]); event.target.value = ''; }} /></label>{photoDraft && <button type="button" className="text-button" disabled={pending} onClick={() => setPhotoDraft('')}>{t('Remove photo')}</button>}</div></div>
        <label className="field-label">{t('Your name')}<input value={name} disabled={pending} onChange={event => setName(event.target.value)} maxLength={60} required autoComplete="nickname" /></label><PakistanCitySelect value={city} disabled={pending} onChange={setCity} /><label className="field-label">{t('Area (optional)')}<input value={location} disabled={pending} onChange={event => setLocation(event.target.value)} maxLength={120} placeholder={t('Sector or neighbourhood')} /></label>
        <div className="row profile-panel-actions"><button className="primary-button" disabled={pending || !name.trim()}><Check size={17} />{t('Save profile')}</button><button type="button" className="secondary-button" disabled={busy} onClick={closeSection}><X size={16} />{t('Cancel')}</button></div>
      </form>}
      {ownDialog === 'vehicle' && <VehicleSettings vehicle={profile.vehicle} status={state.fuel} busy={busy} showFuelPrices={false} onSave={async vehicle => { await update({ vehicle }); }} />}
      {ownDialog === 'fuel' && <FuelPrices status={state.fuel} expanded />}
      {ownDialog === 'data' && <section className={`travel-consent-card profile-consent ${profile.collectTravelData ? 'is-enabled' : ''}`}><div className="row between"><ShieldCheck size={24} /><span className={`tag ${profile.collectTravelData ? 'green' : 'neutral'}`}>{t(profile.collectTravelData ? 'On' : 'Off')}</span></div><p>{t('Optional GPS history for your statistics and usual-route alerts. Foreground only.')}</p><button className={profile.collectTravelData ? 'secondary-button full' : 'primary-button full'} disabled={busy} onClick={() => update({ collectTravelData: !profile.collectTravelData, inferFrequentRoutes: !profile.collectTravelData, travelDataChoiceMade: true })}>{t(profile.collectTravelData ? 'Stop collecting trip data' : 'Allow personal trip data & usual-route alerts')}</button>{!profile.collectTravelData && state.trips.length > 0 && <p className="small muted">{t('Existing trips remain in Activity, where you can export or delete them.')}</p>}</section>}
      {ownDialog === 'appearance' && <>
        <label className="field-label">{t('Language')}<select value={language} onChange={event => setLanguage(event.target.value === 'ur' ? 'ur' : 'en')}><option value="en">English</option><option value="ur">اردو</option></select></label>
        <span className="field-label">{t('App theme')}</span><div className="segmented-control" role="group" aria-label={t('App theme')}>{(['light', 'dark', 'system'] as const).map(theme => <button disabled={busy} key={theme} className={(profile.theme ?? 'dark') === theme ? 'selected' : ''} aria-pressed={(profile.theme ?? 'dark') === theme} onClick={() => update({ theme })}>{theme === 'dark' ? <Moon size={17} /> : theme === 'light' ? <Sun size={17} /> : <Map size={17} />}{t(theme[0].toUpperCase() + theme.slice(1))}</button>)}</div>
        <h3 className="profile-map-style-heading">{t('Map style')}</h3><MapStyleChoices value={profile.mapStyle ?? 'night'} disabled={busy} onChange={mapStyle => update({ mapStyle })} />
        <label className="field-label map-detail-setting">{t('Map detail')}<select value={profile.mapDetail} disabled={busy} onChange={event => update({ mapDetail: event.target.value as LocalProfile['mapDetail'] })}><option value="clean">{t('Clean · essential roads and places')}</option><option value="standard">{t('Detailed · more labels and places')}</option></select></label>
      </>}
      {ownDialog === 'alerts' && <>
        <div className="setting-row"><Bell size={20} /><div><strong>{t('Browser notifications')}</strong><p>{t('Keep Manzil open for alerts.')}</p></div><button className={`setting-toggle ${profile.browserNotifications ? 'enabled' : ''}`} role="switch" aria-checked={profile.browserNotifications} aria-label={t('Browser notifications')} disabled={busy || permission === 'unsupported' && !profile.browserNotifications} onClick={() => notifications()}><span /></button></div>
        {permission === 'unsupported' && <p className="small muted">{t('This browser does not support system notifications. Your in-app inbox still works.')}</p>}{permission === 'denied' && <p className="small muted">{t("Notifications are blocked in this browser. Change this site's notification permission in browser settings; in-app alerts still work.")}</p>}{profile.browserNotifications && permission === 'default' && <button className="text-button" disabled={busy} onClick={() => notifications(true)}>{t('Allow notifications in this browser')}</button>}
        <div className="setting-row"><History size={20} /><div><strong>{t('Learn my usual journeys')}</strong><p>{t('Requires personal trip data.')}</p></div><button className={`setting-toggle ${profile.collectTravelData && profile.inferFrequentRoutes ? 'enabled' : ''}`} role="switch" aria-checked={!!profile.collectTravelData && profile.inferFrequentRoutes} aria-label={t('Learn usual journeys and alert me')} disabled={busy || !profile.collectTravelData} onClick={() => update({ inferFrequentRoutes: !profile.inferFrequentRoutes })}><span /></button></div>
        {profile.collectTravelData && profile.inferFrequentRoutes && <p className="small muted">{t('Needs at least 3 matching trips on separate days. Learning uses your recorded trips and does not add roads to the map.')}</p>}
        {profile.collectTravelData && profile.inferFrequentRoutes && proposalLoading && <p className="small muted" role="status">{t('Checking your recorded journey patterns…')}</p>}
        {profile.collectTravelData && profile.inferFrequentRoutes && proposalError && <div className="error-box" role="alert">{t(proposalError)}<button className="text-button" disabled={busy || proposalLoading} onClick={() => setProposalAttempt(value => value + 1)}>{t('Retry')}</button></div>}
        {profile.collectTravelData && profile.inferFrequentRoutes && !proposalLoading && !proposalError && !proposals.length && <p className="small muted">{t('No repeated journey qualifies yet. Record matching journeys on 3 separate days; inaccurate or interrupted traces are excluded.')}</p>}
        {profile.collectTravelData && profile.inferFrequentRoutes && proposals.map(proposal => {
          const saved = state.commutes.some(commute => commute.departureTime === proposal.departureTime && commute.days.length === proposal.days.length && proposal.days.every(day => commute.days.includes(day)) && near(commute.origin.coordinate, proposal.origin.coordinate) && near(commute.destination.coordinate, proposal.destination.coordinate));
          return <article className="frequent-route-card" key={proposal.id}><strong>{t('Usual journey · ')}{proposal.departureTime} {t('PKT')}</strong><p>{proposal.origin.name} {t('→ ')}{proposal.destination.name}</p><p>{proposal.days.map(day => t(DAYS[day])).join(', ')} {t('· ')}{proposal.sampleCount} {t('recorded days')}</p><span className="small muted">{t('Scheduled closure checks enabled')}</span><button className="secondary-button full" disabled={busy || saved} onClick={async () => { if (busy) return; const owner = getAuthSession().user?.uid, generation = panelGeneration.current; setError(''); setBusy(true); try { await onSaveProposal(proposal); } catch (e) { if (owner === getAuthSession().user?.uid && generation === panelGeneration.current) setError(e instanceof Error ? e.message : 'Could not save journey.'); } finally { if (owner === getAuthSession().user?.uid) setBusy(false); } }}>{saved ? t('Already saved as a commute') : t('Save as a regular commute')}</button></article>;
        })}
      </>}
    </ProfileSettingsDialog>}
  </div>;
}
