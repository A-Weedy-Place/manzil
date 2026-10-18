import { useEffect, useState } from 'react';
import { Check, ChevronDown, Clock3, Image, MapPin, Pencil, ShieldCheck, UserRound, X } from 'lucide-react';
import type { Closure, ClosureReason } from '../../shared/types';
import { api } from '../lib/api';
import { closureState, dayDate, time } from '../lib/format';
import { t } from '../lib/language';

interface Props {
  closures: Closure[]; at: string; selectedId?: string | null; reviewer: boolean;
  canEdit: (closure: Closure) => boolean; onSelect: (closure: Closure) => void;
  onEdit: (closure: Closure) => void; onCancel: (closure: Closure) => void;
  onReview: (closure: Closure, decision: 'approve' | 'reject') => Promise<void>;
}
export function closurePlace(closure: Closure) {
  return closure.title.replace(/^Demo\s*[·:]\s*/i, '').replace(/\s+street detour$/i, '') || t('Road closure');
}
const reasonLabels: Record<ClosureReason, string> = { other: 'Road restriction', protest: 'Protest / gathering', vip: 'VIP movement', construction: 'Roadworks', accident: 'Accident / obstruction' };
export default function ClosureList(props: Props) {
  if (!props.closures.length) return <div className="empty-state"><MapPin size={28} /><h3>{t('No closures here')}</h3></div>;
  return <div className="community-closures">{props.closures.map(closure => <ClosureCard key={closure.id} closure={closure} {...props} />)}</div>;
}
function ClosureCard({ closure, at, selectedId, reviewer, canEdit, onSelect, onEdit, onCancel, onReview }: Props & { closure: Closure }) {
  const [expanded, setExpanded] = useState(selectedId === closure.id);
  const [detail, setDetail] = useState<Closure | null>(null), [loadError, setLoadError] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => { if (selectedId === closure.id) setExpanded(true); }, [selectedId, closure.id]);
  useEffect(() => {
    if (!expanded) return;
    const abort = new AbortController(); setDetail(null); setLoadError(''); setError('');
    api<Closure>(`/closures/${encodeURIComponent(closure.id)}`, { signal: abort.signal }).then(value => { if (!abort.signal.aborted) setDetail(value); }).catch(reason => { if (!abort.signal.aborted) setLoadError(reason instanceof Error ? reason.message : 'Details unavailable.'); });
    return () => abort.abort();
  }, [expanded, closure.id, closure.revision, loadAttempt]);
  const loaded = detail?.id === closure.id && detail.revision >= closure.revision;
  const current = loaded ? detail : closure;
  const state = current.status === 'cancelled' ? 'cancelled' : current.moderation === 'pending' ? 'Pending review' : current.moderation === 'rejected' ? 'Rejected' : closureState(current, at);
  const isDemo = /^Demo\s*[·:]/i.test(closure.title);
  const notes = current.description.replace(/\[manzil[^\]]*\]\s*/gi, '').trim();
  async function review(decision: 'approve' | 'reject') {
    if (!loaded || busy || current.status !== 'draft' || current.moderation !== 'pending') return;
    setBusy(true); setError('');
    try { await onReview(current, decision); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not review this report.'); } finally { setBusy(false); }
  }
  return <article className={`community-closure ${selectedId === closure.id ? 'selected' : ''}`}>
    <button className="closure-summary" aria-expanded={expanded} onClick={() => { setExpanded(value => !value); if (!expanded) onSelect(closure); }}>
      <MapPin size={20} aria-hidden="true" /><span><strong>{closurePlace(closure)}</strong><span className="closure-badges"><span className={`tag ${state === 'active' ? 'red' : state === 'Pending review' ? 'orange' : 'neutral'}`}>{t(state)}</span>{current.restrictionType && <span className="tag neutral">{t(current.restrictionType === 'blockade' ? 'Blockade' : 'Road closure')}</span>}{isDemo && <span className="tag neutral">{t('Demo')}</span>}{!!(closure.photoCount ?? closure.photos?.length) && <span className="closure-photo-count"><Image size={13} aria-hidden="true" />{closure.photoCount ?? closure.photos?.length}</span>}</span></span><ChevronDown size={17} className={expanded ? 'turned' : ''} aria-hidden="true" />
    </button>
    <div className="closure-period"><div><span>{t('From')}</span><strong>{time(current.startsAt)}</strong><small>{dayDate(current.startsAt)}</small></div><Clock3 size={17} aria-hidden="true" /><div><span>{t('Until')}</span><strong>{current.endsAt ? time(current.endsAt) : t('Unknown')}</strong><small>{current.endsAt ? dayDate(current.endsAt) : t('Open-ended')}</small></div></div>
    {expanded && <div className="closure-expanded" aria-busy={!loaded && !loadError}>
      <div className="closure-detail-actions"><span className="closure-reason">{t(reasonLabels[current.reason])}</span><button className="text-button" onClick={() => onSelect(current)}><MapPin size={15} aria-hidden="true" />{t('View on map')}</button></div>
      <div className="closure-reporter"><UserRound size={17} aria-hidden="true" /><span>{current.author?.displayName ?? t('Existing record')}<small>{t(current.author?.role === 'admin' ? 'Admin' : current.author?.role === 'verified' ? 'Verified contributor' : current.author ? 'Community member' : 'Reporter not recorded')}</small></span></div>
      {notes && <p className="closure-description">{notes}</p>}
      {!!current.photos?.length && <div className="closure-evidence-grid">{current.photos.map((photo, index) => <img className="closure-evidence" key={`${index}-${current.revision}`} src={photo} alt={`${t('Closure photo')} ${index + 1}`} loading="lazy" />)}</div>}
      {!loaded && !loadError && <p className="small muted" role="status">{t('Loading report…')}</p>}
      {loadError && <div className="closure-load-error"><p className="error-box" role="alert">{t(loadError)}</p><button className="secondary-button" onClick={() => setLoadAttempt(value => value + 1)}>{t('Retry')}</button></div>}
      {current.reviewedBy && <p className="small muted"><ShieldCheck size={14} aria-hidden="true" /> {t('Reviewed by')} {current.reviewedBy.displayName}</p>}
      {current.sourceUrl && <a className="text-button" href={current.sourceUrl} target="_blank" rel="noreferrer">{t('Source')}</a>}
      {reviewer && current.status === 'draft' && current.moderation === 'pending' && <div className="row wrap"><button className="primary-button" disabled={busy || !loaded} onClick={() => review('approve')}><Check size={16} />{t('Approve')}</button><button className="secondary-button danger-text" disabled={busy || !loaded} onClick={() => review('reject')}><X size={16} />{t('Reject')}</button></div>}
      {canEdit(current) && <div className="row wrap"><button className="text-button" onClick={() => onEdit(current)}><Pencil size={15} />{t('Edit')}</button>{current.status !== 'cancelled' && <button className="text-button danger-text" onClick={() => onCancel(current)}><X size={15} />{t('Cancel restriction')}</button>}</div>}
      {error && <p className="error-box" role="alert">{t(error)}</p>}
    </div>}
  </article>;
}
