import { t } from '../lib/language';
import { useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, ChevronDown, Clock3, RefreshCw } from 'lucide-react';
import type { AppState, SourceNotice } from '../../shared/types';
import { send } from '../lib/api';
import { dateTime, inputISO, relative } from '../lib/format';
import AgentPanel from './AgentPanel';
import type { AgentProposal } from '../../shared/agent';
import { useAgentPipeline, type AgentPipelineState } from '../lib/useAgentPipeline';
import { pipelineCounts } from '../lib/pipeline';

interface Props { state: AppState; reload: () => Promise<void>; notify: (message: string) => void; onManualClosure: (notice: SourceNotice, proposal?: AgentProposal) => void;
  pipeline?: AgentPipelineState; onOpenReview?: () => void }
export default function SourcePanel({ state, reload, notify, onManualClosure, pipeline: shared, onOpenReview }: Props) {
  const own = useAgentPipeline(state.notices,!shared), pipeline = shared ?? own;
  const counts = pipelineCounts(state.notices,pipeline.results);
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
    <div className="pipeline-board" aria-label={t('Pipeline progress')}>
      <div><strong>{counts.collected}</strong><span>{t('Collected posts')}</span></div><div><strong>{counts.waiting + counts.processing}</strong><span>{t('Waiting / analysing')}</span></div>
      <button disabled={!onOpenReview} onClick={onOpenReview}><strong>{counts.review}</strong><span>{t('Posts awaiting review')}</span></button><div><strong>{counts.changed}</strong><span>{t('Posts with map changes')}</span></div>
    </div>
    <div className="section-heading"><div><h2>{t('Champ Alerts updates')}</h2><p className="small muted">{t('Follow a post from its original source to a map decision.')}</p></div></div>
    <ol className="pipeline-steps" aria-label={t('How posts reach the map')}>
      <li><span>1</span><div><strong>{t('Collect')}</strong><p>{t('Save the original post and images.')}</p></div></li>
      <li><span>2</span><div><strong>{t('Understand')}</strong><p>{t('Gemini extracts the place, time and type of update.')}</p></div></li>
      <li><span>3</span><div><strong>{t('Decide')}</strong><p>{t('Review the prepared map draft, then approve or reject it.')}</p></div></li>
    </ol>
    <details className="pipeline-help"><summary>{t('How to demo this flow')}</summary><ol>
      <li>{t('Fetch latest posts saves new or edited evidence. It does not run Gemini or create a blockade.')}</li>
      <li>{t('Choose Run Gemini now to analyse waiting posts, or let the five-minute schedule run. Watch the live processing status.')}</li>
      <li>{t('Open a post below. Compare Original post with Gemini analysis, including its place, time and uncertainty.')}</li>
      <li>{t('Open Review on map to check the prepared location, details and times. Approve to update routes, or reject to keep the map unchanged.')}</li>
    </ol><p>{t('In production, collection and AI run on separate five-minute schedules. AI runs two minutes after collection, subject to its daily limit.')}</p><p>{t('Unchanged posts are not analysed again. A changed post gets a new version and returns to the AI queue.')}</p></details>
    <section className="source-connection" aria-label={t('Post collection')}>
      <div className="source-identity"><span className="source-avatar">X</span><div><strong>{t('1. Post collection')}</strong><a href={source.profileUrl} target="_blank" rel="noreferrer">@shaheryarhassan <ArrowUpRight size={12} /></a></div><span className={'tag ' + (source.state === 'error' || source.state === 'blocked' ? 'red' : 'neutral')}>{t(!source.enabled ? 'Paused' : source.state === 'checking' ? 'Fetching…' : source.state === 'error' || source.state === 'blocked' ? 'Needs attention' : 'Running')}</span></div>
      <p className="small">{t('Fetching saves evidence only. It does not change the map.')}</p>
      <div className="source-schedule"><Clock3 size={15} /><span>{t('Scheduled checks every ' + source.intervalMinutes + ' minutes')}</span></div>
      <div className="source-details"><span>{t('Last successful check')}<strong>{t(relative(source.lastSuccessAt))}</strong></span><span>{t('Next check')}<strong>{source.enabled && source.nextCheckAt ? dateTime(source.nextCheckAt) : t('Paused')}</strong></span></div>
      <p className="small muted">{t('Public-page coverage is partial. Missing posts do not mean roads are clear.')}</p>
      <div className="row source-actions"><button className="secondary-button" disabled={checking || source.state === 'checking'} onClick={check}><RefreshCw size={15} className={checking ? 'spin' : ''} />{t(checking || source.state === 'checking' ? 'Fetching…' : 'Fetch latest posts')}</button><button className="text-button" onClick={toggle}>{t(source.enabled ? 'Pause collector' : 'Resume collector')}</button></div>
      <details className="pipeline-technical"><summary>{t('Collection details')}</summary><p className="source-message">{source.message}</p></details>
    </section>
    {error && <div className="error-box" role="alert">{t(error)}</div>}
    <AgentPanel notices={state.notices} onManualClosure={onManualClosure} onRefresh={reload} onMark={mark} pipeline={pipeline} onOpenReview={onOpenReview} />
    <button className="text-button full" onClick={() => setImportOpen(!importOpen)} aria-expanded={importOpen}><ArrowDownToLine size={16} />{t('Import a notice manually')}<ChevronDown size={15} /></button>
    {importOpen && <form className="inline-form" onSubmit={importNotice}><p className="small muted">{t('Paste source text and its original link. It joins the same queue as collected posts.')}</p><label className="field-label">{t('Notice text')}<textarea required rows={5} maxLength={20000} value={text} onChange={event => setText(event.target.value)} placeholder={t('Paste the original announcement…')} /></label><label className="field-label">{t('Original source link')}<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…" /></label><label className="field-label">{t('Original publication time · PKT ')}<span className="optional">{t('if known')}</span><input type="datetime-local" value={published} onInput={event => setPublished(event.currentTarget.value)} /></label><button className="primary-button full" disabled={saving || !text.trim()}>{t(saving ? 'Importing…' : 'Add to inbox')}</button></form>}
  </div>;
}
