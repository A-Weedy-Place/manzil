import { t } from '../lib/language';
import { useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, Clock3, Inbox, RefreshCw, Sparkles, X } from 'lucide-react';
import type { AppState, SourceNotice } from '../../shared/types';
import { send } from '../lib/api';
import { dateTime, inputISO, relative } from '../lib/format';

interface Props { state: AppState; reload: () => Promise<void>; notify: (message: string) => void; onManualClosure: (notice: SourceNotice) => void }
export default function SourcePanel({ state, reload, notify, onManualClosure }: Props) {
  const [checking, setChecking] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [text, setText] = useState(''); const [url, setUrl] = useState(''); const [published, setPublished] = useState('');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'pending_agent' | 'all'>('pending_agent');
  const source = state.sourceStatus;
  async function check() {
    setChecking(true); setError('');
    try { await send('/source/check', {}); await reload(); notify('Source check finished. Coverage details are shown below.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Source check failed.'); await reload().catch(() => {}); }
    finally { setChecking(false); }
  }
  async function toggle() {
    try { await send('/source/settings', { enabled: !source.enabled, intervalMinutes: 15 }, 'PATCH'); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update the collector.'); }
  }
  async function importNotice(event: React.FormEvent) {
    event.preventDefault(); setError(''); setSaving(true);
    try { await send('/notices', { text, url: url || undefined, publishedAt: published ? inputISO(published) : null }); setText(''); setUrl(''); setPublished(''); setImportOpen(false); await reload(); notify('Notice added to the agent-ready inbox.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); }
    finally { setSaving(false); }
  }
  async function mark(notice: SourceNotice, status: SourceNotice['status']) {
    try { await send(`/notices/${notice.id}`, { status }, 'PATCH'); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update the notice.'); }
  }
  const notices = state.notices.filter(n => filter === 'all' || n.status === 'pending_agent');
  return <>
    <div className="section-heading"><div><span className="eyebrow">{t("LOCAL INTELLIGENCE")}</span><h1>{t("Updates inbox")}</h1></div><Inbox size={23} /></div>
    <p className="muted">{t("New Champ updates, ready for the Gemini agent you’ll connect next.")}</p>
    <div className="source-connection"><div className="source-identity"><span className="source-avatar">{t("X")}</span><div><strong>{t("Champ Alerts")}</strong><a href={source.profileUrl} target="_blank" rel="noreferrer">{t("@shaheryarhassan ")}<ArrowUpRight size={12} /></a></div><span className={`tag ${source.state === 'healthy' ? 'green' : source.state === 'error' || source.state === 'blocked' ? 'red' : 'neutral'}`}>{t(source.state)}</span></div>
      <div className="source-schedule"><Clock3 size={15} /><span>{t("Checks every 15 minutes while the local server runs")}</span></div>
      <div className="source-details"><span>{t("Last successful check")}<strong>{relative(source.lastSuccessAt)}</strong></span><span>{t("Next check")}<strong>{source.enabled && source.nextCheckAt ? dateTime(source.nextCheckAt) : t("Paused")}</strong></span></div>
      <p className="source-message">{t(source.message)}</p><span className="small muted">{t("Coverage: partial public-page access. A successful check does not prove every post was available.")}</span>
      <div className="row source-actions"><button className="secondary-button" disabled={checking || source.state === 'checking'} onClick={check}><RefreshCw size={15} className={checking ? 'spin' : ''} />{checking || source.state === 'checking' ? t("Checking…") : t("Check now")}</button><button className="text-button" onClick={toggle}>{source.enabled ? t("Pause collector") : t("Resume collector")}</button></div>
    </div>
    <div className="notice-box soft"><Sparkles size={19} /><div><strong>{t("Agent connection is ready")}</strong><p>{t("Posts are stored as pending notices. Gemini interpretation and automatic event proposals are not enabled yet.")}</p></div></div>
    <button className="secondary-button full" onClick={() => setImportOpen(!importOpen)} aria-expanded={importOpen}><ArrowDownToLine size={16} />{t("Import a notice manually")}<ChevronDown size={15} /></button>
    {importOpen && <form className="inline-form" onSubmit={importNotice}><label className="field-label">{t("Notice text")}<textarea required rows={5} maxLength={20000} value={text} onChange={e => setText(e.target.value)} placeholder={t("Paste the original announcement…")} /></label><label className="field-label">{t("Original source link")}<input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder={t("https://…")} /></label><label className="field-label">{t("Original publication time · PKT ")}<span className="optional">{t("if known")}</span><input type="datetime-local" value={published} onInput={e => setPublished(e.currentTarget.value)} /></label><button className="primary-button full" disabled={saving || !text.trim()}>{saving ? t("Importing…") : t("Add to inbox")}</button></form>}
    {error && <div className="error-box" role="alert">{t(error)}</div>}
    <div className="section-heading compact"><h2>{t("Collected notices")}</h2><select aria-label={t("Filter notices")} className="small-select" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="pending_agent">{t("Pending agent")}</option><option value="all">{t("All notices")}</option></select></div>
    {!notices.length && <div className="empty-state compact-empty"><Inbox size={27} /><h3>{t("A quiet inbox, for now")}</h3><p>{t("Check the public profile or import a notice. Source access failures stay visible above.")}</p></div>}
    {notices.map(notice => <article className="notice-card" key={notice.id}><div className="row between"><span className="tag neutral">{notice.source === 'x' ? t("X · Champ") : t("Manual import")}</span><span className="small muted">{t("v")}{notice.revision}</span></div><p className="notice-text">{notice.text}</p><div className="small muted">{notice.publishedAt ? `Published ${dateTime(notice.publishedAt)}` : t("Original publication time unknown")}</div><div className="small muted">{t("Received ")}{dateTime(notice.receivedAt)}</div>{notice.mediaUrls.length > 0 && <p className="small muted">{notice.mediaUrls.length} {t("media reference")}{notice.mediaUrls.length > 1 ? t("s") : t("")}{t("; text may not contain every detail.")}</p>}<div className="notice-card-actions">{notice.url && <a className="text-button" href={notice.url} target="_blank" rel="noreferrer">{t("View source")}<ArrowUpRight size={14} /></a>}<button className="text-button" onClick={() => onManualClosure(notice)}>{t("Review on map")}</button><button className="icon-button small" aria-label={t("Mark notice reviewed")} title={t("Mark reviewed")} onClick={() => mark(notice, 'reviewed')}><Check size={15} /></button><button className="icon-button small" aria-label={t("Dismiss notice")} title={t("Dismiss")} onClick={() => mark(notice, 'dismissed')}><X size={15} /></button></div></article>)}
  </>;
}
