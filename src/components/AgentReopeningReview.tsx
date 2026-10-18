import { useState } from 'react';
import type { AgentProposal } from '../../shared/agent';
import { t } from '../lib/language';
import { dateTime } from '../lib/format';
export default function AgentReopeningReview({ proposal, onApprove, onReject, onCancel }: {
  proposal: AgentProposal; onApprove: () => Promise<void>; onReject: () => Promise<void>; onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function decide(action: () => Promise<void>) { setBusy(true); try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not review reopening.'); } finally { setBusy(false); } }
  return <section className="editor-form"><h1>{t('Review reopening')}</h1><h2>{proposal.draft.title}</h2><p>{t('Approval cancels the existing restriction. It does not create a new blockade.')}</p><p>{t('Starts · PKT')}: {proposal.draft.startsAt ? dateTime(proposal.draft.startsAt) : t('Unknown — needs review')}</p><p className="notice-text" dir="auto">{proposal.draft.description}</p>{proposal.issues.map((issue, index) => <p className="small muted" key={index}>{t(issue)}</p>)}{error && <p className="error-box" role="alert">{error}</p>}
    <button className="primary-button full" disabled={busy || proposal.mapping !== 'existing'} onClick={() => void decide(onApprove)}>{t('Approve reopening')}</button>
    <button className="secondary-button full" disabled={busy} onClick={() => void decide(onReject)}>{t('Reject proposal')}</button><button className="text-button full" disabled={busy} onClick={onCancel}>{t('Cancel')}</button></section>;
}
