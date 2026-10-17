import { useEffect, useState } from 'react';
import { Flag, RefreshCw, ShieldCheck, Users, Workflow } from 'lucide-react';
import type { AppState, Closure, SourceNotice } from '../../shared/types';
import { api, send } from '../lib/api';
import { closureState, relative } from '../lib/format';
import { t } from '../lib/language';
import ClosureList from './ClosureList';
import SourcePanel from './SourcePanel';

interface Member { uid: string; email?: string; displayName?: string; disabled: boolean; role: 'user' | 'verified' | 'admin'; verified: boolean; createdAt?: string; lastSignInAt?: string }
interface Directory { users: Member[]; nextPageToken?: string }
interface Props {
  state: AppState; at: string; selectedId: string | null; reload: () => Promise<void>; notify: (message: string) => void;
  onSelect: (closure: Closure) => void; onEdit: (closure: Closure) => void; onCancel: (closure: Closure) => void;
  onReview: (closure: Closure, decision: 'approve' | 'reject') => Promise<void>; onManualClosure: (notice: SourceNotice) => void;
}
export default function AdminPanel(props: Props) {
  const [tab, setTab] = useState<'reports' | 'users' | 'pipeline'>('reports');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const pending = props.state.closures.filter(item => item.status === 'draft' && item.moderation === 'pending');
  return <>
    <div className="section-heading"><div><span className="eyebrow">{t('ADMIN WORKSPACE')}</span><h1>{t('Control centre')}</h1></div><ShieldCheck size={25} /></div>
    <div className="admin-stats"><div><strong>{pending.length}</strong><span>{t('Awaiting review')}</span></div><div><strong>{props.state.closures.filter(item => closureState(item, props.at) === 'active').length}</strong><span>{t('Active closures')}</span></div></div>
    <div className="admin-tabs" role="tablist" aria-label={t('Admin sections')}>{([['reports', Flag, 'Blockades'], ['users', Users, 'People'], ['pipeline', Workflow, 'Pipeline']] as const).map(([key, Icon, label]) => <button role="tab" aria-selected={tab === key} key={key} onClick={() => setTab(key)}><Icon size={16} aria-hidden="true" />{t(label)}</button>)}</div>
    {tab === 'reports' && <section role="tabpanel" aria-label={t('Blockades')}><div className="filter-row"><select aria-label={t('Report filter')} value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="pending">{t('Awaiting review')}</option><option value="all">{t('All blockades')}</option></select><button className="icon-button" aria-label={t('Refresh reports')} onClick={() => props.reload().catch(reason => props.notify(String(reason)))}><RefreshCw size={17} /></button></div><ClosureList closures={filter === 'pending' ? pending : props.state.closures} at={props.at} selectedId={props.selectedId} reviewer canEdit={() => true} onSelect={props.onSelect} onEdit={props.onEdit} onCancel={props.onCancel} onReview={props.onReview} /></section>}
    {tab === 'users' && <section role="tabpanel" aria-label={t('People')}><UserDirectory /></section>}
    {tab === 'pipeline' && <section role="tabpanel" aria-label={t('Pipeline')}><SourcePanel state={props.state} reload={props.reload} notify={props.notify} onManualClosure={props.onManualClosure} /></section>}
  </>;
}
function UserDirectory() {
  const [directory, setDirectory] = useState<Directory>({ users: [] }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function load(append = false) {
    setBusy(true); setError('');
    try { const page = await api<Directory>(`/admin/users${append && directory.nextPageToken ? `?pageToken=${encodeURIComponent(directory.nextPageToken)}` : ''}`); setDirectory(current => ({ ...page, users: append ? [...current.users, ...page.users.filter(member => !current.users.some(existing => existing.uid === member.uid))] : page.users })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load users.'); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function verify(member: Member) {
    setBusy(true); setError('');
    try { const result = await send<Pick<Member, 'uid' | 'role' | 'verified'>>(`/admin/users/${encodeURIComponent(member.uid)}`, { verified: !member.verified }, 'PATCH'); setDirectory(current => ({ ...current, users: current.users.map(value => value.uid === result.uid ? { ...value, ...result } : value) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update verification.'); } finally { setBusy(false); }
  }
  return <><div className="section-heading compact"><h2>{t('Community members')}</h2><button className="icon-button" disabled={busy} aria-label={t('Refresh users')} onClick={() => load()}><RefreshCw size={17} /></button></div>{error && <p className="error-box" role="alert">{t(error)}</p>}{busy && <p className="small muted" role="status">{t('Updating users…')}</p>}{directory.users.map(member => <article className="admin-member" key={member.uid}><span className="member-avatar">{(member.displayName ?? member.email ?? 'U').slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName ?? member.email ?? member.uid}</strong>{member.email && <small>{member.email}</small>}<span className={`tag ${member.verified ? 'green' : 'neutral'}`}>{t(member.role === 'admin' ? 'Admin' : member.verified ? 'Verified contributor' : 'Community member')}</span>{member.disabled && <small>{t('Account disabled')}</small>}{member.lastSignInAt && <small>{t('Last active')} · {relative(member.lastSignInAt)}</small>}</div>{member.role !== 'admin' && <button className="secondary-button" disabled={busy || member.disabled} onClick={() => verify(member)}>{t(member.verified ? 'Remove verification' : 'Verify')}</button>}</article>)}{directory.nextPageToken && <button className="secondary-button full" disabled={busy} onClick={() => load(true)}>{t('Load more')}</button>}</>;
}
