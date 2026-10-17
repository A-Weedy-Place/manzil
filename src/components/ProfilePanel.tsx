import { useEffect, useRef, useState } from 'react';
import { BarChart3, Bell, Camera, Car, Check, ChevronDown, ChevronRight, History, Inbox, Map, Moon, Pencil, ShieldCheck, Sun, UserRound, X } from 'lucide-react';
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

interface Props { account?: AccountUser | null; onSignOut?: () => void; personalFeaturesAvailable?: boolean; onSignIn?: () => void; onTour?: () => void; state: AppState; reload: () => Promise<void>; notify: (text: string) => void; onSources: () => void; onActivity: () => void; onStatistics?: () => void; onSaveProposal: (proposal: FrequentRouteProposal) => Promise<void> }
type ProfilePatch = Partial<Omit<LocalProfile, 'id' | 'createdAt' | 'updatedAt'>>;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const notificationPermission = () => 'Notification' in window ? window.Notification.permission : 'unsupported' as const;
function near(a: number[], b: number[]) { return Math.hypot((a[0] - b[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), a[1] - b[1]) * 111195 <= 250; }
export default function ProfilePanel({ account, onSignOut, personalFeaturesAvailable = false, onSignIn, onTour, state, reload, notify, onSources, onActivity, onStatistics, onSaveProposal }: Props) {
  const { language, setLanguage } = useLanguage(), profile = state.profile;
  const role = account && state.membership?.uid === account.uid ? state.membership.role : account?.role;
  const displayName = profile.displayName !== 'Traveller' ? profile.displayName : account?.displayName ?? profile.displayName;
  const [editing, setEditing] = useState(false), [name, setName] = useState(profile.displayName), [city, setCity] = useState(profile.city ?? ''), [location, setLocation] = useState(profile.location ?? ''), [photoDraft, setPhotoDraft] = useState(profile.photoDataUrl ?? '');
  const draftOwner = useRef<string | null>(null), photoGeneration = useRef(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [proposals, setProposals] = useState<FrequentRouteProposal[]>([]), [proposalLoading, setProposalLoading] = useState(false), [proposalError, setProposalError] = useState(''), [proposalAttempt, setProposalAttempt] = useState(0), [permission, setPermission] = useState(notificationPermission);
  const tripRevision = state.trips.map(trip => `${trip.id}:${trip.pointCount ?? trip.points.length}:${trip.endedAt}`).sort().join('|');
  const accountId = account?.uid ?? getAuthSession().user?.uid;
  useEffect(() => { setEditing(false); setError(''); setBusy(false); draftOwner.current = null; photoGeneration.current++; setName(profile.displayName); setCity(profile.city ?? ''); setLocation(profile.location ?? ''); setPhotoDraft(profile.photoDataUrl ?? ''); }, [accountId]);
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
    const owner = getAuthSession().user?.uid; setError(''); setBusy(true);
    try { await send('/profile', patch, 'PATCH'); if (getAuthSession().user?.uid !== owner) return false; try { await reload(); } catch { throw new Error('Preferences were saved, but the app could not refresh. Reconnect and reload to see them.'); } if (getAuthSession().user?.uid !== owner) return false; notify('Preferences saved.'); return true; }
    catch (e) { if (getAuthSession().user?.uid === owner) setError(e instanceof Error ? e.message : 'Could not save preferences.'); return false; }
    finally { if (getAuthSession().user?.uid === owner) setBusy(false); }
  }
  function editProfile() { draftOwner.current = getAuthSession().user?.uid ?? null; setName(displayName); setCity(profile.city ?? ''); setLocation(profile.location ?? ''); setPhotoDraft(profile.photoDataUrl ?? ''); setError(''); setEditing(true); }
  async function saveProfile() {
    if (draftOwner.current !== (getAuthSession().user?.uid ?? null)) { setError('Account changed. Edit your profile again.'); return; }
    const patch: ProfilePatch = { displayName: name.trim(), city: city.trim(), location: location.trim() };
    if (photoDraft !== (profile.photoDataUrl ?? '')) patch.photoDataUrl = photoDraft;
    if (await update(patch)) setEditing(false);
  }
  async function photo(file: File | undefined) {
    if (!file || busy) return;
    const owner = getAuthSession().user?.uid, generation = ++photoGeneration.current; setBusy(true); setError('');
    try { const value = await fileToPhotoDataUrl(file); if (generation !== photoGeneration.current) return; if (!owner || getAuthSession().user?.uid !== owner || draftOwner.current !== owner) throw new Error('Account changed. Choose the photo again.'); setPhotoDraft(value); }
    catch (e) { if (generation === photoGeneration.current) setError(e instanceof Error ? e.message : 'Could not prepare this photo.'); }
    finally { if (generation === photoGeneration.current) setBusy(false); }
  }
  async function notifications(allowInThisBrowser = false) {
    if (busy) return;
    if (profile.browserNotifications && !allowInThisBrowser) { await update({ browserNotifications: false }); return; }
    const owner = getAuthSession().user?.uid; setError(''); setBusy(true);
    try { await enableBrowserNotifications(); if (owner !== getAuthSession().user?.uid) return; setPermission(notificationPermission()); await send('/profile', { browserNotifications: true }, 'PATCH'); try { await reload(); } catch { throw new Error('The notification preference was saved, but the app could not refresh. Reconnect and reload.'); } if (owner === getAuthSession().user?.uid) notify('Browser notifications enabled for new journey alerts.'); }
    catch (e) { if (owner === getAuthSession().user?.uid) setError(e instanceof Error ? e.message : 'Could not enable notifications.'); }
    finally { if (owner === getAuthSession().user?.uid) { setPermission(notificationPermission()); setBusy(false); } }
  }
  return <div className="profile-workspace">
    <div className="section-heading profile-heading"><h1>{t('User profile')}</h1>{personalFeaturesAvailable && !editing && <button className="secondary-button profile-edit-button" onClick={editProfile}><Pencil size={15} />{t('Edit')}</button>}</div>
    <section className="profile-account-card">
      <div className="profile-identity"><span className="profile-avatar">{personalFeaturesAvailable && (editing ? photoDraft : profile.photoDataUrl) ? <img src={editing ? photoDraft : profile.photoDataUrl} alt={t('Your profile photo')} /> : displayName.trim().slice(0, 1).toUpperCase()}</span><div><h2>{personalFeaturesAvailable ? t(displayName) : t('Guest')}</h2><p>{personalFeaturesAvailable ? account?.email ?? t('Personal profile') : t('Guest preferences')}</p>{personalFeaturesAvailable && (profile.city || profile.location) && <p>{[profile.location, profile.city].filter(Boolean).join(', ')}</p>}</div></div>
      {account && <div className="profile-session-actions"><span className="tag neutral">{t(role === 'admin' ? 'Admin user' : role === 'verified' ? 'Verified contributor' : 'Normal user')}</span><button className="text-button" onClick={onSignOut}>{t('Sign out')}</button></div>}
      {!personalFeaturesAvailable && <button className="secondary-button full" onClick={onSignIn}>{t('Sign in for personal features')}</button>}
      {personalFeaturesAvailable && editing && <form className="profile-details-form" aria-label={t('Edit profile')} aria-busy={busy} onSubmit={event => { event.preventDefault(); void saveProfile(); }}>
        <div className="profile-photo-actions"><label className="secondary-button"><Camera size={17} />{t('Change photo')}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={t('Choose profile photo')} disabled={busy} onChange={event => { void photo(event.target.files?.[0]); event.target.value = ''; }} /></label>{photoDraft && <button type="button" className="text-button" disabled={busy} onClick={() => setPhotoDraft('')}>{t('Remove photo')}</button>}</div>
        <label className="field-label">{t('Your name')}<input value={name} disabled={busy} onChange={event => setName(event.target.value)} maxLength={60} required autoComplete="nickname" /></label><label className="field-label">{t('City')}<input value={city} disabled={busy} onChange={event => setCity(event.target.value)} maxLength={80} autoComplete="address-level2" /></label><label className="field-label">{t('Area (optional)')}<input value={location} disabled={busy} onChange={event => setLocation(event.target.value)} maxLength={120} placeholder={t('Sector or neighbourhood')} /></label>
        <div className="row"><button className="primary-button" disabled={busy || !name.trim()}><Check size={17} />{t('Save profile')}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { photoGeneration.current++; setEditing(false); setError(''); }}><X size={16} />{t('Cancel')}</button></div>
      </form>}
    </section>
    {busy && <p className="small muted" role="status">{t('Saving changes…')}</p>}{error && <div className="error-box" role="alert">{t(error)}</div>}
    {personalFeaturesAvailable && <>
      <section className={`settings-section travel-consent-card profile-consent ${profile.collectTravelData ? 'is-enabled' : ''}`}><div className="row between"><h2><ShieldCheck size={19} />{t('Personal trip data')}</h2><span className={`tag ${profile.collectTravelData ? 'green' : 'neutral'}`}>{t(profile.collectTravelData ? 'On' : 'Off')}</span></div><p>{t('Optional GPS history for your statistics and usual-route alerts. Foreground only.')}</p><button className={profile.collectTravelData ? 'secondary-button full' : 'primary-button full'} disabled={busy} onClick={() => update({ collectTravelData: !profile.collectTravelData, inferFrequentRoutes: !profile.collectTravelData, travelDataChoiceMade: true })}>{t(profile.collectTravelData ? 'Stop collecting trip data' : 'Allow personal trip data & usual-route alerts')}</button>{!profile.collectTravelData && state.trips.length > 0 && <p className="small muted">{t('Existing trips remain in Activity, where you can export or delete them.')}</p>}</section>
      <div className="profile-data-links"><button className="settings-link" aria-label={t('Personal statistics')} onClick={onStatistics ?? onActivity}><BarChart3 size={20} /><span>{t('Personal statistics')}<small>{t('This month')}</small></span><ChevronRight size={18} /></button><button className="settings-link" onClick={onActivity}><History size={20} /><span>{t('Trip history')}</span><ChevronRight size={18} /></button></div>
      <details className="profile-settings-group"><summary><Car size={20} /><span>{t('Your vehicle')}</span><ChevronDown size={17} /></summary><div className="profile-settings-content"><VehicleSettings vehicle={profile.vehicle} status={state.fuel} busy={busy} showFuelPrices={false} onSave={async vehicle => { await update({ vehicle }); }} /></div></details>
      <section className="profile-fuel-section"><FuelPrices status={state.fuel} expanded /></section>
    </>}
    <details className="profile-settings-group"><summary><Sun size={20} /><span>{t('Appearance & language')}</span><ChevronDown size={17} /></summary><div className="profile-settings-content">
      <label className="field-label">{t('Language')}<select value={language} onChange={event => setLanguage(event.target.value === 'ur' ? 'ur' : 'en')}><option value="en">English</option><option value="ur">اردو</option></select></label>
      <span className="field-label">{t('App theme')}</span><div className="segmented-control" role="group" aria-label={t('App theme')}>{(['light', 'dark', 'system'] as const).map(theme => <button disabled={busy} key={theme} className={profile.theme === theme ? 'selected' : ''} aria-pressed={profile.theme === theme} onClick={() => update({ theme })}>{theme === 'dark' ? <Moon size={17} /> : theme === 'light' ? <Sun size={17} /> : <Map size={17} />}{t(theme[0].toUpperCase() + theme.slice(1))}</button>)}</div>
      <h3 className="profile-map-style-heading">{t('Map style')}</h3><MapStyleChoices value={profile.mapStyle ?? 'outdoors'} disabled={busy} onChange={mapStyle => update({ mapStyle })} />
      <label className="field-label map-detail-setting">{t('Map detail')}<select value={profile.mapDetail} disabled={busy} onChange={event => update({ mapDetail: event.target.value as LocalProfile['mapDetail'] })}><option value="clean">{t('Clean · essential roads and places')}</option><option value="standard">{t('Detailed · more labels and places')}</option></select></label>
    </div></details>
    {personalFeaturesAvailable && <details className="profile-settings-group"><summary><Bell size={20} /><span>{t('Journey alerts')}</span><ChevronDown size={17} /></summary><div className="profile-settings-content">
      <div className="setting-row"><Bell size={20} /><div><strong>{t('Browser notifications')}</strong><p>{t('Keep Manzil open for alerts.')}</p></div><button className={`setting-toggle ${profile.browserNotifications ? 'enabled' : ''}`} role="switch" aria-checked={profile.browserNotifications} aria-label={t('Browser notifications')} disabled={busy || permission === 'unsupported' && !profile.browserNotifications} onClick={() => notifications()}><span /></button></div>
      {permission === 'unsupported' && <p className="small muted">{t('This browser does not support system notifications. Your in-app inbox still works.')}</p>}{permission === 'denied' && <p className="small muted">{t("Notifications are blocked in this browser. Change this site's notification permission in browser settings; in-app alerts still work.")}</p>}{profile.browserNotifications && permission === 'default' && <button className="text-button" disabled={busy} onClick={() => notifications(true)}>{t('Allow notifications in this browser')}</button>}
      <div className="setting-row"><History size={20} /><div><strong>{t('Learn my usual journeys')}</strong><p>{t('Requires personal trip data.')}</p></div><button className={`setting-toggle ${profile.collectTravelData && profile.inferFrequentRoutes ? 'enabled' : ''}`} role="switch" aria-checked={!!profile.collectTravelData && profile.inferFrequentRoutes} aria-label={t('Learn usual journeys and alert me')} disabled={busy || !profile.collectTravelData} onClick={() => update({ inferFrequentRoutes: !profile.inferFrequentRoutes })}><span /></button></div>
      {profile.collectTravelData && profile.inferFrequentRoutes && <p className="small muted">{t('Needs at least 3 matching trips on separate days. Learning uses your recorded trips and does not add roads to the map.')}</p>}
      {profile.collectTravelData && profile.inferFrequentRoutes && proposalLoading && <p className="small muted" role="status">{t('Checking your recorded journey patterns…')}</p>}
      {profile.collectTravelData && profile.inferFrequentRoutes && proposalError && <div className="error-box" role="alert">{t(proposalError)}<button className="text-button" disabled={busy || proposalLoading} onClick={() => setProposalAttempt(value => value + 1)}>{t('Retry')}</button></div>}
      {profile.collectTravelData && profile.inferFrequentRoutes && !proposalLoading && !proposalError && !proposals.length && <p className="small muted">{t('No repeated journey qualifies yet. Record matching journeys on 3 separate days; inaccurate or interrupted traces are excluded.')}</p>}
      {profile.collectTravelData && profile.inferFrequentRoutes && proposals.map(proposal => {
        const saved = state.commutes.some(commute => commute.departureTime === proposal.departureTime && commute.days.length === proposal.days.length && proposal.days.every(day => commute.days.includes(day)) && near(commute.origin.coordinate, proposal.origin.coordinate) && near(commute.destination.coordinate, proposal.destination.coordinate));
        return <article className="frequent-route-card" key={proposal.id}><strong>{t('Usual journey · ')}{proposal.departureTime} {t('PKT')}</strong><p>{proposal.origin.name} {t('→ ')}{proposal.destination.name}</p><p>{proposal.days.map(day => t(DAYS[day])).join(', ')} {t('· ')}{proposal.sampleCount} {t('recorded days')}</p><span className="small muted">{t('Scheduled closure checks enabled')}</span><button className="secondary-button full" disabled={busy || saved} onClick={async () => { if (busy) return; setError(''); setBusy(true); try { await onSaveProposal(proposal); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save journey.'); } finally { setBusy(false); } }}>{saved ? t('Already saved as a commute') : t('Save as a regular commute')}</button></article>;
      })}
    </div></details>}
    <section className="profile-utilities"><button className="settings-link" onClick={onTour}><UserRound size={19} /><span>{t('Replay tour')}</span><ChevronRight size={18} /></button>{role === 'admin' && <button className="settings-link" onClick={onSources}><Inbox size={20} /><span>{t('Source updates & collector')}</span><ChevronRight size={18} /></button>}{AUTH_MODE === 'development' && <p className="small muted">{t('Development accounts share this local workspace.')}</p>}</section>
  </div>;
}
