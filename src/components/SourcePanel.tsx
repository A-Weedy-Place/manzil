import { t } from '../lib/language';
import { useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpRight, ChevronDown, Clock3, RefreshCw } from 'lucide-react';
import type { AppState, SourceNotice } from '../../shared/types';
import { send } from '../lib/api';
import { dateTime, inputISO, relative } from '../lib/format';
import AgentPanel from './AgentPanel';
import type { AgentProposal } from '../../shared/agent';
import { useAgentPipeline, type AgentPipelineState } from '../lib/useAgentPipeline';


interface Props { state: AppState; reload: () => Promise<void>; notify: (message: string) => void; onManualClosure: (notice: SourceNotice, proposal?: AgentProposal) => void;
  pipeline?: AgentPipelineState; onOpenReview?: () => void; services?: ReactNode }
export default function SourcePanel({ state, reload, notify, onManualClosure, pipeline: shared, onOpenReview, services }: Props) {
  const own = useAgentPipeline(state.notices,!shared), pipeline = shared ?? own;
  const [checking, setChecking] = useState(false), [importOpen, setImportOpen] = useState(false);
  const [text, setText] = useState(''), [url, setUrl] = useState(''), [published, setPublished] = useState('');
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const source = state.sourceStatus;
  async function check() {
    setChecking(true); setError('');
    try { await send('/source/check', {}); await reload(); await pipeline.refresh(); notify('Posts checked. New or edited posts wait for the next AI run.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Source check failed.'); await reload().catch(() => {}); }
    finally { setChecking(false); }
  }
  async function toggle() {
    try { await send('/source/settings', { enabled: !source.enabled }, 'PATCH'); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the collector.'); }
  }
  async function importNotice(event: React.FormEvent) {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      await send('/notices', { text, url: url || undefined, publishedAt: published ? inputISO(published) : null });
      setText(''); setUrl(''); setPublished(''); setImportOpen(false); await reload(); await pipeline.refresh(); notify('Post saved. It is waiting for AI analysis.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Import failed.'); }
    finally { setSaving(false); }
  }
  async function mark(notice: SourceNotice, status: SourceNotice['status']) {
    try { await send('/notices/' + notice.id, { status }, 'PATCH'); await reload(); await pipeline.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the notice.'); }
  }
  return <div className="source-pipeline">
    <details className="pipeline-service source-connection" aria-label={t('Post collection')}><summary><span><strong>{t('Champ Alerts')}</strong><small>{t(relative(source.lastSuccessAt))}</small></span><span className="tag neutral">{t(!source.enabled ? 'Paused' : source.state === 'checking' ? 'Fetching…' : source.state === 'error' || source.state === 'blocked' ? 'Needs attention' : 'Scheduled')}</span></summary><div className="pipeline-service-body">
      <div className="source-identity"><span className="source-avatar">X</span><div><strong>{t('Post collection')}</strong><a href={source.profileUrl} target="_blank" rel="noreferrer">@shaheryarhassan <ArrowUpRight size={12} /></a></div><span className={'tag ' + (source.state === 'error' || source.state === 'blocked' ? 'red' : 'neutral')}>{t(!source.enabled ? 'Paused' : source.state === 'checking' ? 'Fetching…' : source.state === 'error' || source.state === 'blocked' ? 'Needs attention' : 'Running')}</span></div>
      <div className="source-schedule"><Clock3 size={15} /><span>{t('Scheduled checks every ' + source.intervalMinutes + ' minutes')}</span></div>
      <div className="source-details"><span>{t('Last successful check')}<strong>{t(relative(source.lastSuccessAt))}</strong></span><span>{t('Next check')}<strong>{source.enabled && source.nextCheckAt ? dateTime(source.nextCheckAt) : t('Paused')}</strong></span></div>
      <p className="small muted">{t('Public-page coverage is partial. Missing posts do not mean roads are clear.')}</p>
      <div className="row source-actions"><button className="secondary-button" disabled={checking || source.state === 'checking'} onClick={check}><RefreshCw size={15} className={checking ? 'spin' : ''} />{t(checking || source.state === 'checking' ? 'Fetching…' : 'Fetch latest posts')}</button><button className="text-button" onClick={toggle}>{t(source.enabled ? 'Pause collector' : 'Resume collector')}</button></div>
      <details className="pipeline-technical"><summary>{t('Collection details')}</summary><p className="source-message">{source.message}</p></details>
    </div></details>
    {error && <div className="error-box" role="alert">{t(error)}</div>}
    <details className="pipeline-service"><summary><span><strong>{t('Gemini analysis')}</strong><small>{t('Administrator review required')}</small></span><span className="tag neutral">{t(pipeline.loading ? 'Loading…' : !pipeline.status ? 'Unavailable' : !pipeline.status.configured ? 'Not configured' : !pipeline.status.enabled ? 'Paused' : pipeline.status.processing ? 'Analysing' : pipeline.status.runtime?.errorCode ? 'Needs attention' : 'Scheduled')}</span></summary><div className="pipeline-service-body"><AgentPanel engineOnly notices={state.notices} onManualClosure={onManualClosure} onRefresh={reload} pipeline={pipeline} onOpenReview={onOpenReview} /></div></details>
    {services}
    <AgentPanel postsOnly notices={state.notices} onManualClosure={onManualClosure} onRefresh={reload} onMark={mark} pipeline={pipeline} onOpenReview={onOpenReview} />
    <button className="text-button full" onClick={() => setImportOpen(!importOpen)} aria-expanded={importOpen}><ArrowDownToLine size={16} />{t('Import a notice manually')}<ChevronDown size={15} /></button>
    {importOpen && <form className="inline-form" onSubmit={importNotice}><p className="small muted">{t('Paste source text and its original link. It joins the same queue as collected posts.')}</p><label className="field-label">{t('Notice text')}<textarea required rows={5} maxLength={20000} value={text} onChange={event => setText(event.target.value)} placeholder={t('Paste the original announcement…')} /></label><label className="field-label">{t('Original source link')}<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…" /></label><label className="field-label">{t('Original publication time · PKT ')}<span className="optional">{t('if known')}</span><input type="datetime-local" value={published} onInput={event => setPublished(event.currentTarget.value)} /></label><button className="primary-button full" disabled={saving || !text.trim()}>{t(saving ? 'Importing…' : 'Add to inbox')}</button></form>}
  </div>;
}
