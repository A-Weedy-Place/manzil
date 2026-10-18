import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BusFront, MapPin, ShieldCheck, X } from 'lucide-react';
import type { AgentProposal, AgentProposalDecision, AgentResult } from '../../shared/agent';
import type { SourceNotice } from '../../shared/types';
import type { TransitDisruptionDraft, TransitNetwork } from '../../shared/transit';
import { api, send } from '../lib/api';
import { getAuthSession } from '../lib/auth';
import { dateTime, inputISO, localInput } from '../lib/format';
import { getLanguage, subscribeLanguage, t } from '../lib/language';
import '../transit-proposal.css';

interface Props {
  notice: SourceNotice; result: AgentResult; proposal: AgentProposal;
  onDecision: (decision: AgentProposalDecision) => void | Promise<void>; onClose: () => void;
  onPreview?: (routeId: string, fromStopId?: string, toStopId?: string) => void;
}
const copy: Record<string, string> = {
  'Review bus service': 'بس سروس کا جائزہ', 'Bus line': 'بس لائن', 'Choose a line': 'لائن منتخب کریں',
  'Suspension scope': 'معطلی کا حصہ', 'Choose scope': 'متاثرہ حصہ منتخب کریں', 'Entire line': 'پوری لائن',
  'Between stops': 'اسٹاپس کے درمیان', 'Choose direction': 'سمت منتخب کریں', 'Preview bus line': 'بس لائن نقشے پر دیکھیں',
  'I confirmed the line, direction and affected stops against the source.': 'میں نے ماخذ کے مطابق لائن، سمت اور متاثرہ اسٹاپس کی تصدیق کر لی ہے۔',
  'Approve suspension': 'معطلی منظور کریں', 'Approve service resumption': 'سروس کی بحالی منظور کریں',
  'Loading bus lines…': 'بس لائنیں لوڈ ہو رہی ہیں…', 'Could not load bus lines.': 'بس لائنیں لوڈ نہیں ہو سکیں۔',
  'Choose both ordered stops.': 'درست ترتیب میں دونوں اسٹاپ منتخب کریں۔',
  'Confirm the affected service scope.': 'متاثرہ سروس کے حصے کی تصدیق کریں۔',
  'This reopening needs a confirmed source time and matching current service notice.': 'بحالی کے لیے ماخذ سے تصدیق شدہ وقت اور متعلقہ موجودہ سروس اطلاع درکار ہے۔',
  'Source evidence': 'اصل ماخذ', 'Extracted quote': 'اخذ کردہ اقتباس',
};
const tr = (value: string) => getLanguage() === 'ur' ? copy[value] ?? t(value) : value;
const local = (value?: string) => value && Number.isFinite(Date.parse(value)) ? localInput(new Date(value)) : '';

/** This form publishes a service notice, never road geometry. The parent owns
 * its adjacent-panel/dialog positioning and focus restoration. */
export default function TransitProposalEditor({ notice, result, proposal, onDecision, onClose, onPreview }: Props) {
  useSyncExternalStore(subscribeLanguage, getLanguage);
  const initial = proposal.transitDraft ?? {};
  const [network, setNetwork] = useState<TransitNetwork | null>(null), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
  const [routeId, setRouteId] = useState(initial.routeId ?? ''), [scope, setScope] = useState(initial.fromStopId ? 'segment' : proposal.transitScope === 'route' ? 'all' : '');
  const [direction, setDirection] = useState(initial.directionId ?? ''), [from, setFrom] = useState(initial.fromStopId ?? ''), [to, setTo] = useState(initial.toStopId ?? '');
  const [title, setTitle] = useState(initial.title ?? ''), [description, setDescription] = useState(initial.description ?? '');
  const [start, setStart] = useState(local(initial.startsAt)), [end, setEnd] = useState(local(initial.endsAt));
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const live = useRef(true), sequence = useRef(0), submitting = useRef(false), owner = getAuthSession().user?.uid, reopening = proposal.action === 'reopening';
  useEffect(() => {
    live.current = true; const operation = ++sequence.current, controller = new AbortController(); setLoading(true); setError('');
    const current = () => live.current && operation === sequence.current && getAuthSession().user?.uid === owner;
    void api<TransitNetwork>(`/transit/network?at=${encodeURIComponent(new Date().toISOString())}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
      .then(data => { if (current() && !controller.signal.aborted) { setNetwork(data); if (data.unavailableReason) setError(data.unavailableReason); } })
      .catch(() => { if (current() && !controller.signal.aborted) setError('Could not load bus lines.'); })
      .finally(() => { if (current()) setLoading(false); });
    return () => { live.current = false; sequence.current++; controller.abort(); };
  }, [owner, proposal.version, attempt]);
  const patterns = network?.patterns.filter(pattern => pattern.routeId === routeId) ?? [];
  const directions = [...new Map(patterns.map(pattern => [pattern.directionId, pattern])).values()];
  const pattern = patterns.find(item => item.directionId === direction) ?? (directions.length === 1 ? directions[0] : undefined);
  useEffect(() => {
    if (!network || direction || !from || !to) return;
    const matching = network.patterns.filter(item => item.routeId === routeId && item.stopIds.indexOf(from) >= 0 && item.stopIds.indexOf(to) > item.stopIds.indexOf(from));
    if (new Set(matching.map(item => item.directionId)).size === 1) setDirection(matching[0].directionId);
  }, [network, routeId, direction, from, to]);
  const routes = network?.routes ?? proposal.transitCandidates ?? [];
  const stops = pattern?.stopIds.map(id => network?.stops.find(stop => stop.id === id)).filter(item => item !== undefined) ?? [];
  function changeRoute(value: string) { setRouteId(value); setDirection(''); setFrom(''); setTo(''); setScope(''); setConfirmed(false); }
  async function decide(decision: 'approve' | 'reject') {
    if (submitting.current || getAuthSession().user?.uid !== owner) return;
    setError(''); let transitDraft: TransitDisruptionDraft | undefined;
    try {
      if (decision === 'approve') {
        if (!confirmed) throw new Error('Confirm the affected service scope.');
        if (reopening) {
          if (!initial.startsAt || proposal.targetRevision === null) throw new Error('This reopening needs a confirmed source time and matching current service notice.');
        } else {
          if (!routeId || !scope) throw new Error('Choose scope');
          if (scope === 'segment' && (!pattern || !from || !to || pattern.stopIds.indexOf(to) <= pattern.stopIds.indexOf(from))) throw new Error('Choose both ordered stops.');
          const startsAt = inputISO(start), endsAt = inputISO(end);
          if (endsAt <= startsAt) throw new Error('Choose an end after the start.');
          transitDraft = { routeId, title: title.trim(), description: description.trim(), startsAt, endsAt, status: 'published',
            ...(direction || scope === 'segment' ? { directionId: pattern?.directionId ?? direction } : {}),
            ...(scope === 'segment' ? { fromStopId: from, toStopId: to } : {}), ...(notice.url ? { sourceUrl: notice.url } : {}) };
        }
      }
      submitting.current = true; setBusy(true);
      const response = await send<AgentProposalDecision>(`/agent/notices/${encodeURIComponent(notice.id)}/review`, {
        noticeRevision: result.noticeRevision, index: proposal.index, version: proposal.version, decision,
        ...(decision === 'approve' ? { confirmTransitScope: true, ...(transitDraft ? { transitDraft } : {}) } : {}),
      });
      if (live.current && getAuthSession().user?.uid === owner) await onDecision(response);
    } catch (failure) { if (live.current && getAuthSession().user?.uid === owner) setError(failure instanceof Error ? failure.message : 'Could not save the decision.'); }
    finally { submitting.current = false; if (live.current && getAuthSession().user?.uid === owner) setBusy(false); }
  }
  return <section className="transit-proposal-editor" aria-label={tr('Review bus service')} aria-busy={busy}>
    <div className="section-heading"><h2><BusFront size={20} />{tr('Review bus service')}</h2><button type="button" className="icon-button small" onClick={onClose} aria-label={t('Close')} disabled={busy}><X size={18} /></button></div>
    <details className="transit-proposal-checks"><summary>{tr('Source evidence')}</summary><p className="transit-proposal-evidence" dir="auto">{notice.text}</p>{result.extraction?.events[proposal.index]?.quote && <><strong>{tr('Extracted quote')}</strong><blockquote dir="auto">{result.extraction.events[proposal.index].quote}</blockquote></>}{notice.url && <a href={notice.url} target="_blank" rel="noreferrer">{t('Original post')}</a>}</details>
    {loading ? <p role="status" className="small muted">{tr('Loading bus lines…')}</p> : !network && <button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>{t('Retry')}</button>}
    {!!proposal.issues.length && <details className="transit-proposal-checks"><summary>{t('Needs review')} · {proposal.issues.length}</summary><ul>{proposal.issues.map(issue => <li key={issue}>{t(issue)}</li>)}</ul></details>}
    <form onSubmit={event => { event.preventDefault(); void decide('approve'); }}>
      <fieldset disabled={busy || reopening}>
        <label className="field-label">{tr('Bus line')}<select value={routeId} required onChange={event => changeRoute(event.target.value)}><option value="">{tr('Choose a line')}</option>{routes.map(route => <option key={route.id} value={route.id}>{route.shortName} · {route.name}</option>)}</select></label>
        {!reopening && <><label className="field-label">{tr('Suspension scope')}<select value={scope} required onChange={event => { setScope(event.target.value); setFrom(''); setTo(''); setConfirmed(false); }}><option value="">{tr('Choose scope')}</option><option value="all">{tr('Entire line')}</option><option value="segment">{tr('Between stops')}</option></select></label>
          <label className="field-label">{t('Direction')}<select value={direction} required={scope === 'segment' && directions.length !== 1} onChange={event => { setDirection(event.target.value); setFrom(''); setTo(''); setConfirmed(false); }}><option value="">{scope === 'segment' ? tr('Choose direction') : t('Both directions')}</option>{directions.map(item => <option key={item.directionId} value={item.directionId}>{item.headsign}</option>)}</select></label>
          {scope === 'segment' && <div className="transit-proposal-stops"><label className="field-label">{t('From stop')}<select value={from} required onChange={event => { setFrom(event.target.value); setTo(''); setConfirmed(false); }}><option value="">{t('Choose a stop')}</option>{stops.map((stop, index) => <option key={`${stop.id}:${index}`} value={stop.id}>{stop.name}</option>)}</select></label><label className="field-label">{t('To stop')}<select value={to} required onChange={event => { setTo(event.target.value); setConfirmed(false); }}><option value="">{t('Choose a stop')}</option>{stops.filter(stop => pattern!.stopIds.indexOf(stop.id) > pattern!.stopIds.indexOf(from)).map((stop, index) => <option key={`${stop.id}:${index}`} value={stop.id}>{stop.name}</option>)}</select></label></div>}
          <label className="field-label">{t('Title')}<input value={title} maxLength={160} required onChange={event => setTitle(event.target.value)} /></label>
          <label className="field-label">{t('Details')}<textarea value={description} maxLength={1000} onChange={event => setDescription(event.target.value)} /></label>
          <label className="field-label">{t('From · Pakistan time')}<input type="datetime-local" value={start} required onChange={event => { setStart(event.target.value); setConfirmed(false); }} /></label>
          <label className="field-label">{t('Until · Pakistan time')}<input type="datetime-local" value={end} required onChange={event => { setEnd(event.target.value); setConfirmed(false); }} /></label></>}
      </fieldset>
      {reopening && <p className="small">{initial.startsAt ? dateTime(initial.startsAt) : tr('This reopening needs a confirmed source time and matching current service notice.')}</p>}
      {onPreview && routeId && <button type="button" className="secondary-button full" disabled={busy} onClick={() => onPreview(routeId, scope === 'segment' ? from || undefined : undefined, scope === 'segment' ? to || undefined : undefined)}><MapPin size={16} />{tr('Preview bus line')}</button>}
      <label className="check-row"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} />{tr('I confirmed the line, direction and affected stops against the source.')}</label>
      {error && <div className="error-box" role="alert">{tr(error)}</div>}
      <div className="transit-proposal-actions"><button type="submit" className="primary-button" disabled={busy || loading || !network || !confirmed || proposal.state !== 'pending'}><ShieldCheck size={17} />{t(busy ? 'Saving…' : reopening ? tr('Approve service resumption') : tr('Approve suspension'))}</button><button type="button" className="secondary-button" disabled={busy || proposal.state !== 'pending'} onClick={() => void decide('reject')}>{t('Reject proposal')}</button></div>
    </form>
  </section>;
}
