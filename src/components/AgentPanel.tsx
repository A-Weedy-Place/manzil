import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { AgentProposal, AgentResult } from '../../shared/agent';
import type { SourceNotice } from '../../shared/types';
import { api, send } from '../lib/api';
import { getLanguage, t } from '../lib/language';
import { dateTime, relative } from '../lib/format';
import { pipelineCounts, pipelineRows, type PipelineStage as Stage } from '../lib/pipeline';
import { useAgentPipeline, type AgentPipelineState } from '../lib/useAgentPipeline';

interface Props {
  notices: SourceNotice[]; onManualClosure: (notice: SourceNotice, proposal?: AgentProposal) => void;
  onRefresh?: () => Promise<void>; onMark?: (notice: SourceNotice, status: SourceNotice['status']) => Promise<void>;
  pipeline?: AgentPipelineState; reviewOnly?: boolean; onOpenReview?: () => void;
}
const labels: Record<Stage, string> = { waiting: 'Waiting for AI', processing: 'Analysing', failed: 'Analysis failed', review: 'Needs review', applied: 'Map updated', dismissed: 'Archived', handled: 'Handled', rejected: 'Proposals rejected' };
export default function AgentPanel({ notices, onManualClosure, onRefresh, onMark, pipeline: shared, reviewOnly = false, onOpenReview }: Props) {
  const own = useAgentPipeline(notices, !shared), pipeline = shared ?? own;
  const { status, results } = pipeline;
  const [error,setError] = useState(''), [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  const [running,setRunning] = useState(false);
  const [filter,setFilter] = useState<'all' | 'waiting' | 'review' | 'map' | 'archived'>('all');
  useEffect(() => { if (!running) return; const timer = setInterval(() => { if (!document.hidden) void pipeline.refresh(); },4000); return () => clearInterval(timer); },[running,pipeline.refresh]);
  async function refresh() { setBusy(true); setError(''); try { await onRefresh?.(); await pipeline.refresh(); } catch (reason) { setError(String(reason)); } finally { setBusy(false); } }
  async function toggle() {
    if (!status) return; setBusy(true); setError('');
    try { await send('/agent/settings', { enabled: !status.enabled, autoPublish: false }, 'PATCH'); await pipeline.refresh(); }
    catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  }
  async function run() {
    setBusy(true); setRunning(true); setError(''); setMessage('');
    try {
      const result = await send<{ processed?: number }>('/agent/run', {});
      setMessage(result?.processed ? 'Analysis batch finished. Review the prepared drafts below.' : 'No posts were ready in this batch. Check the queue, cooldown and daily allowance.');
      await onRefresh?.(); await pipeline.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); setRunning(false); }
  }
  const rows = pipelineRows(notices,results), counts = pipelineCounts(notices,results);
  const matches = (row: typeof rows[number], key: typeof filter) => key === 'all' || key === 'waiting' && ['waiting','processing'].includes(row.state) ||
    key === 'review' && ['review','failed'].includes(row.state) || key === 'map' && row.result?.noticeRevision === row.notice.revision && !!row.result.closureIds?.length || key === 'archived' && ['dismissed','handled','rejected'].includes(row.state);
  const visible = rows.filter(row => reviewOnly ? row.state === 'review' : matches(row,filter));
  return <>
    {!reviewOnly && <section className="pipeline-engine" aria-label={t('AI processing')}>
      <div className="section-heading compact"><h2><Sparkles size={17} /> {t('2. Gemini analysis')}</h2><span className="tag neutral">{t(!status ? error || pipeline.error ? 'Unavailable' : 'Loading…' : !status.configured ? 'Not configured' : !status.enabled ? 'Paused' : status.processing || running ? 'Analysing' : status.runtime?.errorCode ? 'Needs attention' : status.dailyLimitReached ? 'Daily limit reached' : 'Scheduled')}</span></div>
      <p className="small">{t('Gemini prepares map drafts. An administrator approves or rejects each change.')}</p>
      {status && <>
        <p className="small muted">{t('AI attempts today')}: {status.attemptedToday}/{status.dailyLimit} · {t('Last analysis')}: {t(relative(status.runtime?.lastFinishedAt ?? null))}</p>
        <p className="small muted">{t('Review mode is on. AI results do not automatically change routes.')}</p>
        <p className="small muted">{t('Last worker check')}: {t(relative(status.runtime?.lastTickAt ?? null))}</p>
        {status.dailyLimitReached && <p className="small muted">{t('Daily allowance reached. Saved posts remain in the queue for a later run.')}</p>}
        {status.runtime?.errorCode && <p className="error-box">{t('AI needs attention. Saved evidence has been retained.')} ({status.runtime.errorCode})</p>}
        {status.processing && <p className="pipeline-live" role="status">{t(status.runtime?.stage === 'interpreting' ? 'Gemini is interpreting the post and images.' : status.runtime?.stage === 'mapping' ? 'The agent is resolving the location and preparing map drafts.' : 'The worker is reading saved evidence.')}</p>}
        {!!status.backoffUntil && status.backoffUntil > Date.now() && <p className="small muted">{t('Model calls are cooling down until')}: {dateTime(new Date(status.backoffUntil).toISOString())}</p>}
      </>}
      <div className="row pipeline-controls">
        {status?.canRunHere && <button className="primary-button" disabled={busy || status.processing || !status.enabled || !status.configured || status.dailyLimitReached || !status.pending || (status.backoffUntil ?? 0) > Date.now()} onClick={run}><Sparkles size={16} />{t(running ? 'Analysing…' : 'Run Gemini now')}</button>}
        <button className="secondary-button" disabled={busy} aria-label={t('Refresh Gemini results')} onClick={() => void refresh()}><RefreshCw size={15} />{t('Refresh results')}</button>
        {status?.configured && <button className="text-button" disabled={busy} onClick={toggle}>{t(status.enabled ? 'Pause Gemini' : 'Resume Gemini')}</button>}
      </div>
      <p className="small">{t(status?.pending ? 'Run now analyses up to two waiting posts using the same daily allowance as the scheduled worker.' : 'No posts are waiting for analysis. Finished posts can still be awaiting your review.')}</p>
      {counts.review > 0 && <button className="secondary-button full" onClick={() => onOpenReview ? onOpenReview() : setFilter('review')}>{t('Open awaiting review')} ({counts.review})</button>}
      {message && <p className="pipeline-live" role="status">{t(message)}</p>}
      <p className="small muted">{t('Refresh results only reloads saved results. It does not call Gemini.')}</p>
    </section>}
    {(error || pipeline.error) && <p className="error-box" role="alert">{error || pipeline.error}</p>}
    <div className="section-heading compact"><h2>{t(reviewOnly ? 'Agent post reviews' : 'Posts & outcomes')}</h2><span className="small muted">{reviewOnly ? counts.review : notices.length} {t('loaded')}</span></div>
    {!reviewOnly && <div className="pipeline-filters" role="group" aria-label={t('Filter posts')}>{([['all','All posts'],['waiting','Waiting for AI'],['review','Needs attention'],['map','Map changes'],['archived','Archived']] as const).map(([key,label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{t(label)} <span>{rows.filter(row => matches(row,key)).length}</span></button>)}</div>}
    <p className="small muted">{t('Waiting for AI means saved, not yet analysed. Needs review means AI has finished, but a person must check it.')}</p>
    {!visible.length && <div className="empty-state compact-empty"><h3>{t(reviewOnly ? 'No agent posts await review' : !notices.length ? 'No posts collected yet' : filter === 'waiting' ? 'Nothing waiting for AI' : 'No posts in this view')}</h3><p>{t(!notices.length ? 'Fetch latest posts or import an original notice.' : reviewOnly ? 'New agent proposals appear here after analysis.' : 'Choose All posts to see processed posts and their outcomes.')}</p></div>}
    {visible.map(row => <PostCard key={row.notice.id + ':' + row.notice.revision} {...row} onManualClosure={onManualClosure} onMark={onMark} onUpdate={pipeline.update} />)}
  </>;
}
function PostCard({ notice, result, state, onManualClosure, onMark, onUpdate }: { notice: SourceNotice; result?: AgentResult; state: Stage; onUpdate: (result: AgentResult) => void } & Pick<Props, 'onManualClosure' | 'onMark'>) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function prepare() {
    setBusy(true); setError('');
    try { const next = await send<AgentResult>(`/agent/notices/${encodeURIComponent(notice.id)}/prepare`, { revision: notice.revision }); onUpdate(next);
      if (next.proposals?.length === 1 && next.proposals[0].state === 'pending') onManualClosure(notice, next.proposals[0]); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not prepare map draft.'); } finally { setBusy(false); }
  }
  async function reject(proposal: AgentProposal) {
    setBusy(true); setError('');
    try { const next = await send<{ result: AgentResult }>(`/agent/notices/${encodeURIComponent(notice.id)}/review`,
      { noticeRevision: notice.revision, index: proposal.index, version: proposal.version, decision: 'reject' }); onUpdate(next.result); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not reject map draft.'); } finally { setBusy(false); }
  }
  async function refine() { setBusy(true); setError(''); try {
    onUpdate(await send<AgentResult>('/agent/notices/' + encodeURIComponent(notice.id) + '/refine',{revision:notice.revision}));
  } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); } }
  const current = result?.noticeRevision === notice.revision, analysis = result?.extraction;
  const summary = analysis ? getLanguage() === 'ur' && analysis.summaryUrdu ? analysis.summaryUrdu : analysis.summary : notice.text;
  const changed = current && !!result.closureIds?.length;
  return <details className="pipeline-post">
    <summary><div className="row between"><span className={'tag ' + (state === 'applied' ? 'green' : state === 'failed' ? 'red' : 'neutral')}>{t(labels[state])}</span><span className="small muted">{t(notice.source === 'x' ? 'Champ Alerts' : 'Manual import')} · v{notice.revision}</span></div><strong className="pipeline-post-title">{current && analysis ? summary : notice.text.slice(0, 170)}</strong><span className="small muted">{t('Open to compare the original post, AI analysis and map outcome.')}</span></summary>
    <section className="pipeline-post-section"><h3>{t('Original post')}</h3><p className="notice-text" dir="auto">{notice.text}</p><div className="small muted">{t('Published')}: {notice.publishedAt ? dateTime(notice.publishedAt) : t('Unknown — not inferred from collection time')}</div><div className="small muted">{t('Collected')}: {dateTime(notice.receivedAt)}</div>{notice.sourceTimestamp?.kind === 'edited' && <div className="small muted">{t('Source edited')}: {dateTime(notice.sourceTimestamp.at)}</div>}
      {notice.url && <a className="text-button" href={notice.url} target="_blank" rel="noreferrer">{t('View original source')}</a>}{notice.mediaUrls.length > 0 && <EvidenceImages key={notice.id + ':' + notice.revision} id={notice.id} />}
    </section>
    <section className="pipeline-post-section"><h3>{t('Gemini analysis')} {result && !current && <span className="tag orange">{t('Older version')}</span>}</h3>
      {result && !current && <p className="small muted">{t('This analysis belongs to an earlier version. The updated post needs a new AI run.')}</p>}
      {analysis ? <><p dir="auto">{summary}</p>{analysis.warnings.map((warning, index) => <p className="small muted" key={index}>{warning}</p>)}{analysis.events.map((event, index) => <div className="pipeline-event" key={index}><strong>{event.title}</strong><dl><div><dt>{t('Place')}</dt><dd>{[event.location.city, event.location.road, event.location.from, event.location.to, event.location.point].filter(Boolean).join(' · ') || t('Unknown')}</dd></div><div><dt>{t('Starts · PKT')}</dt><dd>{event.startsAt ? dateTime(event.startsAt) : t('Unknown')}</dd></div><div><dt>{t('Ends · PKT')}</dt><dd>{event.endsAt ? dateTime(event.endsAt) : t('Unknown — needs review')}</dd></div></dl><span className="small muted">{t('Quoted evidence')}</span><blockquote dir="auto">{event.quote}</blockquote>{event.uncertainties.map((issue, index) => <p className="small muted" key={index}>{issue}</p>)}</div>)}
        {analysis.fuel.map((fuel, index) => <div className="pipeline-event" key={index}><strong>{t(fuel.fuelType === 'petrol' ? 'Petrol' : 'Diesel')}: PKR {fuel.pricePerLitre}/L</strong><p className="small muted">{t('Effective from')}: {fuel.effectiveAt ? dateTime(fuel.effectiveAt) : t('Unknown')}</p><p className="small muted">{t('Unconfirmed announcement. Fuel estimates keep using verified reference prices.')}</p><blockquote dir="auto">{fuel.quote}</blockquote></div>)}</> : <p className="small muted">{t(state === 'processing' ? 'Gemini is reading this post.' : state === 'failed' ? 'Analysis failed. The original post is still saved.' : state === 'waiting' ? 'Saved successfully. Waiting for a scheduled AI run.' : 'No AI interpretation is loaded for this post.')}</p>}
    </section>
    <section className="pipeline-outcome"><h3>{t('Map outcome')}</h3><strong>{t(!current ? 'Map outcome not available yet' : changed ? 'Map updated' : 'No map change recorded for this post version')}</strong><p className="small">{t(changed ? 'Validated changes were saved. Their location and active time determine the effect on routes.' : state === 'review' ? 'AI found an update, but the evidence needs a person to check it.' : state === 'dismissed' ? 'This post is archived. Archiving a post does not cancel an existing blockade.' : 'Saving or analysing a post does not by itself create a blockade.')}</p>
      {current && state === 'failed' && <p className="small muted">{t((result.attempts ?? 0) >= 3 ? 'This version reached its retry limit. Inspect the source; the agent will not spend more model requests on it automatically.' : 'Next eligible model retry')}{(result.attempts ?? 0) < 3 && result.retryAt ? ': ' + dateTime(new Date(result.retryAt).toISOString()) : ''}</p>}
      {current && result.issues.map((issue, index) => <p className="small muted" key={index}>{issue}</p>)}
      {changed && <details className="pipeline-technical"><summary>{t('Changed blockade IDs')}</summary>{result!.closureIds.map(id => <code key={id}>{id}</code>)}</details>}
      {current && analysis && state !== 'dismissed' && <>
        {result.proposals?.map(proposal => <div className="pipeline-event" key={proposal.index}><strong>{proposal.draft.title}</strong><p className="small">{t(proposal.state === 'approved' ? 'Approved by administrator' : proposal.state === 'rejected' ? 'Rejected by administrator' : proposal.mapping === 'unresolved' ? 'Draft ready; map location needs your help.' : 'Map draft prepared; awaiting approval.')}</p>
          <p className="small muted">{t(proposal.action === 'reopening' ? 'Proposed action: reopen an existing road' : proposal.targetRevision !== null ? 'Proposed action: update an existing blockade' : 'Proposed action: create a blockade')}</p>
          {proposal.state === 'pending' && <p className="small muted">{t(!proposal.draft.geometry ? 'Your input needed: select the affected location.' : !proposal.draft.startsAt ? 'Your input needed: confirm the start time.' : !proposal.draft.endsAt && proposal.action !== 'reopening' ? 'Your input needed: set expiry or confirm until cancelled.' : 'Next: check the map preview and approve or reject.')}</p>}
          {proposal.steps?.length ? <details className="pipeline-technical"><summary>{t('Agent work log')}</summary><ol className="agent-work-log">{proposal.steps.map((step,index) => <li key={index} data-state={step.state}><strong>{t(step.tool.replaceAll('_',' '))}</strong><span>{t(step.detail)}</span><small>{t(step.state === 'done' ? 'Done' : step.state === 'blocked' ? 'Needs details' : 'Check required')}</small></li>)}</ol></details> : null}
          {proposal.state === 'pending' && <div className="row pipeline-controls"><button className="secondary-button" disabled={busy} onClick={() => onManualClosure(notice, proposal)}>{t('Review on map')}</button><button className="text-button" disabled={busy} onClick={() => void reject(proposal)}>{t('Reject proposal')}</button></div>}
          {proposal.state === 'pending' && proposal.mapping === 'unresolved' && (analysis.events[proposal.index]?.location.point || analysis.events[proposal.index]?.location.road && analysis.events[proposal.index]?.location.from && analysis.events[proposal.index]?.location.to) && <><button className="text-button" disabled={busy || (proposal.mappingAttempts ?? 1) >= 3 || (proposal.mappingRetryAt ?? 0) > Date.now()} onClick={() => void refine()}>{t('Retry map tools')}</button><p className="small muted">{t('Mapping retries reuse the saved interpretation. They do not call Gemini again.')}</p></>}
        </div>)}
        {!result.proposals && analysis.category === 'traffic' && analysis.events.length > 0 && <><p className="small muted">{t('Prepare the map draft from the saved interpretation. This does not call Gemini again.')}</p><button className="secondary-button" disabled={busy} onClick={() => void prepare()}>{t(busy ? 'Preparing map draft…' : 'Review on map')}</button></>}
      </>}
      {(!result || current && !analysis) && state !== 'dismissed' && <button className="secondary-button" onClick={() => onManualClosure(notice)}>{t('Create manual restriction')}</button>}
      {error && <p className="error-box" role="alert">{error}</p>}
    </section>
    {onMark && <details className="pipeline-technical pipeline-post-section"><summary>{t('Inbox actions')}</summary><p className="small muted">{t('These actions change the inbox only. Edit or cancel published blockades in Blockades.')}</p><div className="row">{notice.status === 'pending_agent' && <button className="text-button" onClick={() => void onMark(notice, 'reviewed')}>{t('Mark handled without AI')}</button>}{notice.status !== 'dismissed' && <button className="text-button" onClick={() => void onMark(notice, 'dismissed')}>{t('Archive post')}</button>}</div></details>}
  </details>;
}
function EvidenceImages({ id }: { id: string }) {
  const [images, setImages] = useState<{ mimeType: string; data: string; kind: string }[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function load() { setBusy(true); try { setImages((await api<{ images: NonNullable<typeof images> }>('/source/media/' + encodeURIComponent(id))).images); } catch (reason) { setError(String(reason)); } finally { setBusy(false); } }
  return <div>{images === null && <button className="text-button" disabled={busy} onClick={load}>{t('View source images')}</button>}{error && <p className="small muted">{error}</p>}{images?.map((image, index) => <figure key={index}><img src={'data:' + image.mimeType + ';base64,' + image.data} alt={t('Source evidence')} /><figcaption className="small muted">{t(image.kind === 'video_thumbnail' ? 'Video thumbnail; not the full video' : 'Source photo')}</figcaption></figure>)}{images?.length === 0 && <p className="small muted">{t('No retained image available. Open the original source.')}</p>}</div>;
}
