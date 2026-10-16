import { t } from '../lib/language';
import { useEffect, useState } from 'react';
import { Bell, Check, ChevronRight, History, Inbox, Map, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import type { AppState, FrequentRouteProposal, LocalProfile } from '../../shared/types';
import { api, send } from '../lib/api';
import { enableBrowserNotifications } from '../lib/notifications';
import { MapStyleChoices } from './MapStylePicker';
import { useLanguage } from '../lib/useLanguage';
import type { AccountUser } from '../lib/auth';
import { AUTH_MODE } from '../lib/auth';

interface Props { account?: AccountUser | null; onSignOut?: () => void; personalFeaturesAvailable?: boolean; onSignIn?: () => void; onTour?: () => void; state: AppState; reload: () => Promise<void>; notify: (text: string) => void; onSources: () => void; onActivity: () => void; onSaveProposal: (proposal: FrequentRouteProposal) => Promise<void> }
type ProfilePatch = Partial<Omit<LocalProfile, 'id' | 'createdAt' | 'updatedAt'>>;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const notificationPermission = () => 'Notification' in window ? window.Notification.permission : 'unsupported' as const;
function near(a: number[], b: number[]) {
  return Math.hypot((a[0] - b[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), a[1] - b[1]) * 111195 <= 250;
}
export default function ProfilePanel({ account, onSignOut, personalFeaturesAvailable = false, onSignIn, onTour, state, reload, notify, onSources, onActivity, onSaveProposal }: Props) {
  const { language, setLanguage } = useLanguage();
  const profile = state.profile;
  const [name, setName] = useState(profile.displayName);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [proposals, setProposals] = useState<FrequentRouteProposal[]>([]);
  const [proposalLoading, setProposalLoading] = useState(false); const [proposalError, setProposalError] = useState('');
  const [proposalAttempt, setProposalAttempt] = useState(0);
  const [permission, setPermission] = useState(notificationPermission);
  const tripRevision = state.trips.map(trip => `${trip.id}:${trip.pointCount ?? trip.points.length}:${trip.endedAt}`).sort().join('|');
  useEffect(() => { setName(profile.displayName); }, [profile.displayName]);
  useEffect(() => {
    const refresh = () => setPermission(notificationPermission());
    window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh);
  }, []);
  useEffect(() => {
    let current = true;
    if (!profile.inferFrequentRoutes || !personalFeaturesAvailable) { setProposals([]); setProposalLoading(false); setProposalError(''); return; }
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 30000);
    setProposalLoading(true); setProposalError('');
    api<FrequentRouteProposal[]>('/frequent-routes', { signal: controller.signal }).then(items => { if (current) setProposals(items); })
      .catch(() => { if (current) { setProposals([]); setProposalError('Could not refresh learned journeys. Your recorded trips are retained.'); } })
      .finally(() => { window.clearTimeout(timeout); if (current) setProposalLoading(false); });
    return () => { current = false; window.clearTimeout(timeout); controller.abort(); };
  }, [personalFeaturesAvailable, profile.inferFrequentRoutes, tripRevision, proposalAttempt]);
  async function update(patch: ProfilePatch) {
    if (busy) return;
    setError(''); setBusy(true);
    try {
      await send('/profile', patch, 'PATCH');
      try { await reload(); } catch { throw new Error('Preferences were saved, but the app could not refresh. Reconnect and reload to see them.'); }
      notify('Preferences saved.');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save preferences.'); }
    finally { setBusy(false); }
  }
  async function notifications(allowInThisBrowser = false) {
    if (busy) return;
    if (profile.browserNotifications && !allowInThisBrowser) { await update({ browserNotifications: false }); return; }
    setError(''); setBusy(true);
    try {
      await enableBrowserNotifications(); setPermission(notificationPermission());
      await send('/profile', { browserNotifications: true }, 'PATCH');
      try { await reload(); } catch { throw new Error('The notification preference was saved, but the app could not refresh. Reconnect and reload.'); }
      notify('Browser notifications enabled for new journey alerts.');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not enable notifications.'); }
    finally { setPermission(notificationPermission()); setBusy(false); }
  }
  return <>
    <div className="section-heading"><div><span className="eyebrow">{t("MAKE IT YOURS")}</span><h1>{t("Profile & settings")}</h1></div><UserRound size={24} /></div>
    <div className="profile-identity"><span className="profile-avatar">{profile.displayName.trim().slice(0, 1).toUpperCase()}</span><div><h2>{personalFeaturesAvailable ? t(account?.displayName ?? profile.displayName) : t('Guest')}</h2><p>{t(personalFeaturesAvailable ? account?.provider === 'firebase' ? 'Personal profile · your account' : 'Personal profile · this device' : 'Guest preferences')}</p></div><span className="tag green">{t(AUTH_MODE === 'firebase' ? 'Cloud' : 'Local')}</span></div>
    {account && <div className="dev-session"><span className="tag orange">{account.provider === 'development' ? 'DEV · ' : AUTH_MODE === 'emulator' ? 'EMULATOR · ' : ''}{t(account.role === 'admin' ? 'Admin user' : 'Normal user')}</span><p className="small muted">{t(account.provider === 'development' ? 'Development accounts share the local database. Admin tools are being planned.' : 'Personal records are scoped to your signed-in account. Admin tools are being planned.')}</p><button className="secondary-button" onClick={onSignOut}>{t('Sign out')}</button></div>}
    {personalFeaturesAvailable && <form className="profile-name-form" aria-busy={busy} onSubmit={e => { e.preventDefault(); void update({ displayName: name.trim() }); }}><label className="field-label">{t("Your name")}<input value={name} disabled={busy} onChange={e => setName(e.target.value)} maxLength={60} required autoComplete="nickname" /></label><button className="secondary-button" disabled={busy || !name.trim() || name.trim() === profile.displayName}><Check size={17} />{t("Save name")}</button></form>}
    {busy && <p className="small muted" role="status">{t("Saving changes…")}</p>}
    {error && <div className="error-box" role="alert">{t(error)}</div>}
    <section className="settings-section"><label className="field-label">{t('Language')}<select value={language} onChange={event => setLanguage(event.target.value === 'ur' ? 'ur' : 'en')}><option value="en">English</option><option value="ur">اردو</option></select></label><button className="secondary-button full" onClick={onTour}>{t('Replay tour')}</button>{!personalFeaturesAvailable && <button className="text-button" onClick={onSignIn}>{t('Sign in for personal features')}</button>}</section>
    <section className="settings-section"><h2>{t("Appearance")}</h2><p>{t("Clear roads, comfortable colours.")}</p><span className="field-label">{t("App theme")}</span><div className="segmented-control" role="group" aria-label={t("App theme")}>{(['light', 'dark', 'system'] as const).map(theme => <button disabled={busy} key={theme} className={profile.theme === theme ? 'selected' : ''} aria-pressed={profile.theme === theme} onClick={() => update({ theme })}>{theme === 'dark' ? <Moon size={17} /> : theme === 'light' ? <Sun size={17} /> : <Map size={17} />}{t(theme[0].toUpperCase() + theme.slice(1))}</button>)}</div>
      <h3 className="profile-map-style-heading">{t("Map style")}</h3><p className="small muted">{t("Pick the map’s colours independently of your app theme.")}</p><MapStyleChoices value={profile.mapStyle ?? 'streets'} disabled={busy} onChange={mapStyle => update({ mapStyle })} />
      <label className="field-label map-detail-setting">{t("Map detail")}<select value={profile.mapDetail} disabled={busy} onChange={e => update({ mapDetail: e.target.value as LocalProfile['mapDetail'] })}><option value="clean">{t("Clean · essential roads and places")}</option><option value="standard">{t("Detailed · more labels and places")}</option></select></label>
    </section>
    {personalFeaturesAvailable && <section className="settings-section"><h2>{t("Journey alerts")}</h2><p>{t("Alerts update when your saved journeys are checked.")}</p><div className="setting-row"><Bell size={20} /><div><strong>{t("Browser notifications")}</strong><p>{t("New alerts outside the page, when allowed by your browser. Keep the app open.")}</p></div><button className={`setting-toggle ${profile.browserNotifications ? 'enabled' : ''}`} role="switch" aria-checked={profile.browserNotifications} aria-label={t("Browser notifications")} disabled={busy || permission === 'unsupported' && !profile.browserNotifications} onClick={() => notifications()}><span /></button></div>
      {permission === 'unsupported' && <p className="small muted">{t("This browser does not support system notifications. Your in-app inbox still works.")}</p>}
      {permission === 'denied' && <p className="small muted">{t("Notifications are blocked in this browser. Change this site's notification permission in browser settings; in-app alerts still work.")}</p>}
      {profile.browserNotifications && permission === 'default' && <button className="text-button" disabled={busy} onClick={() => notifications(true)}>{t("Allow notifications in this browser")}</button>}
      <div className="setting-row"><History size={20} /><div><strong>{t("Learn my usual journeys")}</strong><p>{t("Use my saved GPS trips to find repeated journeys and alert me about closures on those routes. Off by default.")}</p></div><button className={`setting-toggle ${profile.inferFrequentRoutes ? 'enabled' : ''}`} role="switch" aria-checked={profile.inferFrequentRoutes} aria-label={t("Learn usual journeys and alert me")} disabled={busy} onClick={() => update({ inferFrequentRoutes: !profile.inferFrequentRoutes })}><span /></button></div>
      {profile.inferFrequentRoutes && <div className="learning-status"><ShieldCheck size={18} /><p>{t("Needs at least 3 matching trips on separate days. Learning uses your recorded trips and does not add roads to the map.")}</p></div>}
      {profile.inferFrequentRoutes && proposalLoading && <p className="small muted" role="status">{t("Checking your recorded journey patterns…")}</p>}
      {profile.inferFrequentRoutes && proposalError && <div className="error-box" role="alert">{t(proposalError)}<button className="text-button" disabled={busy || proposalLoading} onClick={() => setProposalAttempt(value => value + 1)}>{t("Retry")}</button></div>}
      {profile.inferFrequentRoutes && !proposalLoading && !proposalError && !proposals.length && <p className="small muted">{t("No repeated journey qualifies yet. Record matching journeys on 3 separate days; inaccurate or interrupted traces are excluded.")}</p>}
      {profile.inferFrequentRoutes && proposals.map(proposal => {
        const saved = state.commutes.some(commute => commute.departureTime === proposal.departureTime && commute.days.length === proposal.days.length && proposal.days.every(day => commute.days.includes(day)) && near(commute.origin.coordinate, proposal.origin.coordinate) && near(commute.destination.coordinate, proposal.destination.coordinate));
        return <article className="frequent-route-card" key={proposal.id}><strong>{t("Usual journey · ")}{proposal.departureTime} {t("PKT")}</strong><p>{proposal.origin.name} {t("→ ")}{proposal.destination.name}</p><p>{proposal.days.map(day => DAYS[day]).join(', ')} {t("· ")}{proposal.sampleCount} {t("recorded days")}</p><span className="small muted">{t("Scheduled closure checks enabled")}</span><button className="secondary-button full" disabled={busy || saved} onClick={async () => { if (busy) return; setError(''); setBusy(true); try { await onSaveProposal(proposal); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save journey.'); } finally { setBusy(false); } }}>{saved ? t("Already saved as a commute") : t("Save as a regular commute")}</button></article>;
      })}
    </section>
    }<section className="settings-section"><h2>{t("Your workspace")}</h2><button className="settings-link" onClick={onActivity}><History size={20} /><span>{t("Recorded trips & personal history")}</span><ChevronRight size={18} /></button><button className="settings-link" onClick={onSources}><Inbox size={20} /><span>{t("Source updates & collector")}</span><ChevronRight size={18} /></button><div className="profile-boundary"><ShieldCheck size={17} /><p>{t(AUTH_MODE === 'emulator' ? 'This development session stores records in local Firebase emulators.' : AUTH_MODE === 'firebase' ? 'Personal records are stored in your account. GPS recording remains optional.' : 'Your profile and preferences are stored on this local server. Cloud accounts and cross-device sign-in are a later deployment step.')}</p></div></section>
  </>;
}
