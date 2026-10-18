import { useEffect, useState } from 'react';
import { CloudSun, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AppState, Closure, SourceNotice } from '../../shared/types';
import { api, send } from '../lib/api';
import { dateTime, relative } from '../lib/format';
import { t } from '../lib/language';
import ClosureList from './ClosureList';
import SourcePanel from './SourcePanel';
import FuelPrices from './FuelPrices';
import type { AgentProposal } from '../../shared/agent';
import AgentPanel from './AgentPanel';
import { useAgentPipeline } from '../lib/useAgentPipeline';
import type { AgentPipelineState } from '../lib/useAgentPipeline';
import type { WeatherResponse } from '../../shared/weather';

interface Member { uid: string; email?: string; displayName?: string; disabled: boolean; role: 'user' | 'verified' | 'admin'; verified: boolean; createdAt?: string; lastSignInAt?: string; city?: string; travelDataSharing?: boolean | null }
interface Directory { users: Member[]; nextPageToken?: string }
interface Props {
  state: AppState; at: string; selectedId: string | null; reload: () => Promise<void>; notify: (message: string) => void;
  onSelect: (closure: Closure) => void; onEdit: (closure: Closure) => void; onCancel: (closure: Closure) => void;
  onReview: (closure: Closure, decision: 'approve' | 'reject') => Promise<void>; onManualClosure: (notice: SourceNotice, proposal?: AgentProposal) => void;
  pipeline?: AgentPipelineState; initialTab?: 'reports' | 'users' | 'pipeline' | 'review'; onTabChange?: (tab: 'reports' | 'users' | 'pipeline' | 'review') => void;
}
export default function AdminPanel(props: Props) {
  const tab = props.initialTab ?? 'pipeline';
  const own = useAgentPipeline(props.state.notices,!props.pipeline), pipeline = props.pipeline ?? own;
  const pending = props.state.closures.filter(item => item.status === 'draft' && item.moderation === 'pending');
  const titles = { users: 'Users', review: 'Review queue', reports: 'Road closures', pipeline: 'Pipelines' };
  return <>
    <div className="section-heading"><h1>{t(titles[tab])}</h1><ShieldCheck size={24} /></div>
    {tab === 'review' && <section role="tabpanel" aria-label={t('Review queue')} className="source-pipeline">
      <AgentPanel notices={props.state.notices} pipeline={pipeline} reviewOnly onManualClosure={props.onManualClosure} onRefresh={props.reload}
        onMark={async (notice,status) => { await send('/notices/' + encodeURIComponent(notice.id),{status},'PATCH'); await props.reload(); await pipeline.refresh(); }} />
      <h2>{t('Community reports')} ({pending.length})</h2><ClosureList closures={pending} at={props.at} selectedId={props.selectedId} reviewer canEdit={() => true} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} />
    </section>}
    {tab === 'reports' && <section role="tabpanel" aria-label={t('Blockades')}><div className="filter-row"><button className="icon-button" aria-label={t('Refresh reports')} onClick={() => props.reload().catch(reason => props.notify(String(reason)))}><RefreshCw size={17} /></button></div><ClosureList closures={props.state.closures} at={props.at} selectedId={props.selectedId} reviewer canEdit={() => true} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} /></section>}
    {tab === 'users' && <section role="tabpanel" aria-label={t('Users')}><UserDirectory currentUid={props.state.membership?.uid} /></section>}
    {tab === 'pipeline' && <section role="tabpanel" aria-label={t('Pipeline')}><SourcePanel state={props.state} reload={props.reload} notify={props.notify} onManualClosure={props.onManualClosure} pipeline={pipeline} onOpenReview={() => props.onTabChange?.('review')} services={<><WeatherPipeline /><details className="pipeline-service"><summary><span><strong>{t('Daily fuel prices')}</strong><small>{t(props.state.fuel?.lastCheckedAt ? relative(props.state.fuel.lastCheckedAt) : 'Not checked')}</small></span><span className="tag neutral">{t(props.state.fuel?.records.length ? 'Reference prices' : 'Unavailable')}</span></summary><div className="pipeline-service-body"><FuelPipeline state={props.state} reload={props.reload} /></div></details></>} /></section>}
  </>;
}
function WeatherPipeline() {
  const [weather,setWeather] = useState<WeatherResponse | null>(null), [error,setError] = useState(false);
  useEffect(() => { const controller = new AbortController(); let live = true;
    api<WeatherResponse>('/weather', { signal: controller.signal }).then(value => { if(live) setWeather(value); }).catch(() => { if(live) setError(true); });
    return () => { live = false; controller.abort(); };
  },[]);
  return <details className="pipeline-service"><summary><span><strong>{t('Weather')} · {t('Islamabad')}</strong><small>{t('Hourly')} · Open-Meteo</small></span><span className="tag neutral">{t(error ? 'Unavailable' : !weather ? 'Loading…' : weather.state === 'fresh' ? 'Fresh' : weather.state === 'stale' ? 'Cached' : 'Unavailable')}</span></summary><div className="pipeline-service-body"><CloudSun size={24} /><dl className="pipeline-status-list"><div><dt>{t('Last successful check')}</dt><dd>{weather?.fetchedAt ? relative(weather.fetchedAt) : t('Not checked')}</dd></div><div><dt>{t('Next check')}</dt><dd>{weather?.nextRefreshAt ? dateTime(weather.nextRefreshAt) : t('Unknown')}</dd></div></dl><a className="text-button" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></div></details>;
}

function FuelPipeline({ state, reload }: Pick<Props, 'state' | 'reload'>) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function check() {
    setBusy(true); setError('');
    try { await send('/fuel/check', {}); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not check fuel prices.'); }
    finally { setBusy(false); }
  }
  return <section className="fuel-pipeline"><div className="section-heading compact"><h2>{t('Daily fuel prices')}</h2><button className="secondary-button" disabled={busy} onClick={() => void check()}><RefreshCw size={16} />{t(busy ? 'Checking…' : 'Check fuel prices')}</button></div><FuelPrices status={state.fuel} />{error && <p className="error-box" role="alert">{t(error)}</p>}</section>;
}
function UserDirectory({ currentUid }: { currentUid?: string }) {
  const [directory, setDirectory] = useState<Directory>({ users: [] }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [message, setMessage] = useState('');
  const [roleChange, setRoleChange] = useState<{ uid: string; admin: boolean } | null>(null);
  async function load(append = false) {
    setBusy(true); setError(''); setMessage(''); setRoleChange(null);
    try { const page = await api<Directory>(`/admin/users${append && directory.nextPageToken ? `?pageToken=${encodeURIComponent(directory.nextPageToken)}` : ''}`); setDirectory(current => ({ ...page, users: append ? [...current.users, ...page.users.filter(member => !current.users.some(existing => existing.uid === member.uid))] : page.users })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load users.'); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function update(member: Member, change: { verified: boolean } | { admin: boolean }) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await send<Pick<Member, 'uid' | 'role' | 'verified'>>(`/admin/users/${encodeURIComponent(member.uid)}`, change, 'PATCH');
      setDirectory(current => ({ ...current, users: current.users.map(value => value.uid === result.uid ? { ...value, ...result } : value) }));
      setRoleChange(null); setMessage('User access updated.');
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update verification.'); } finally { setBusy(false); }
  }
  const matching = directory.users.filter(member => `${member.displayName ?? ''} ${member.email ?? ''} ${member.uid}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <>
    <div className="section-heading compact"><h2>{t('User management')}</h2><button className="icon-button" disabled={busy} aria-label={t('Refresh users')} onClick={() => void load()}><RefreshCw size={17} /></button></div>
    <label className="field"><span>{t('Search users')}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    {error && <p className="error-box" role="alert">{t(error)}</p>}
    <div role="status" aria-live="polite">{busy ? <p className="small muted">{t(directory.users.length ? 'Updating users…' : 'Loading users…')}</p> : message && <p className="small success">{t(message)}</p>}</div>
    <div aria-busy={busy}>{matching.map(member => <article className="admin-member" key={member.uid} aria-label={member.displayName ?? member.email ?? member.uid}>
      <span className="member-avatar" aria-hidden="true">{(member.displayName ?? member.email ?? 'U').slice(0, 1).toUpperCase()}</span>
      <div><strong>{member.displayName ?? member.email ?? member.uid}</strong>{member.email && <small>{member.email}</small>}{member.city && <small>{member.city}</small>}<small>{t('Trip data sharing')}: {t(member.travelDataSharing === true ? 'Allowed' : member.travelDataSharing === false ? 'Off' : 'Unknown')}</small><span className={`tag ${member.verified ? 'green' : 'neutral'}`}>{t(member.role === 'admin' ? 'Admin' : member.verified ? 'Verified contributor' : 'Not verified')}</span>{member.disabled && <small>{t('Account disabled')}</small>}{member.lastSignInAt && <small>{t('Last active')} · {relative(member.lastSignInAt)}</small>}</div>
      <div className="admin-member-actions">
        {member.role !== 'admin' && <button className="secondary-button" disabled={busy || member.disabled} onClick={() => void update(member, { verified: !member.verified })}>{t(member.verified ? 'Remove verification' : 'Verify')}</button>}
        {member.uid !== currentUid && <button className="secondary-button" disabled={busy || member.disabled} onClick={() => setRoleChange(current => current?.uid === member.uid ? null : { uid: member.uid, admin: member.role !== 'admin' })}>{t(member.role === 'admin' ? 'Remove admin' : 'Make admin')}</button>}
        {member.uid === currentUid && <small>{t('Your account')}</small>}
      </div>
      {roleChange?.uid === member.uid && <div className="admin-role-confirm" role="group" aria-label={t('Confirm role change')}><strong>{t(roleChange.admin ? 'Grant administrator access?' : 'Remove administrator access?')}</strong><div className="admin-member-actions"><button className="secondary-button" disabled={busy} onClick={() => setRoleChange(null)}>{t('Cancel')}</button><button className="primary-button" disabled={busy} onClick={() => void update(member, { admin: roleChange.admin })}>{t('Confirm')}</button></div></div>}
    </article>)}</div>
    {!busy && !matching.length && <p className="small muted">{t('No matching users')}</p>}
    {directory.nextPageToken && <button className="secondary-button full" disabled={busy} onClick={() => void load(true)}>{t('Load more users')}</button>}
  </>;
}
