import { useEffect, useState } from 'react';
import type { AgentProposal, AgentResult } from '../../shared/agent';
import type { TransitDisruptionDraft, TransitNetwork } from '../../shared/transit';
import { api, send } from '../lib/api';
import { inputISO, localInput } from '../lib/format';
import { t } from '../lib/language';

export default function AgentTransitReview({ proposal, noticeId, revision, onUpdate }: {
  proposal: AgentProposal; noticeId: string; revision: number; onUpdate: (result: AgentResult) => void;
}) {
  const [network,setNetwork] = useState<TransitNetwork | null>(null), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const initial = proposal.transitDraft ?? {};
  const [route,setRoute] = useState(initial.routeId ?? ''), [direction,setDirection] = useState(initial.directionId ?? '');
  const [from,setFrom] = useState(initial.fromStopId ?? ''), [to,setTo] = useState(initial.toStopId ?? '');
  const [start,setStart] = useState(initial.startsAt ? localInput(new Date(initial.startsAt)) : ''), [end,setEnd] = useState(initial.endsAt ? localInput(new Date(initial.endsAt)) : '');
  useEffect(() => { let active = true; api<TransitNetwork>('/transit/network?at='+encodeURIComponent(new Date().toISOString())).then(value=>{if(active)setNetwork(value);}).catch(reason=>{if(active)setError(String(reason));});return()=>{active=false;}; },[]);
  const patterns = network?.patterns.filter(pattern=>pattern.routeId===route) ?? [], stopIds = new Set(patterns.filter(pattern=>!direction || pattern.directionId===direction).flatMap(pattern=>pattern.stopIds));
  async function approve(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);setError('');
    try {
      const transitDraft: TransitDisruptionDraft = { routeId: route, ...(initial.routeIds && route===initial.routeId && !direction && !from && !to ? {routeIds:initial.routeIds}:{}), ...(direction?{directionId:direction}:{}), ...(from?{fromStopId:from}:{}), ...(to?{toStopId:to}:{}),
        title: initial.title ?? proposal.draft.title ?? 'Reviewed service suspension', description: initial.description ?? '', startsAt:inputISO(start),endsAt:inputISO(end),status:proposal.action==='reopening'?'cancelled':'published',...(initial.sourceUrl?{sourceUrl:initial.sourceUrl}:{}) };
      const next = await send<{result:AgentResult}>(`/agent/notices/${encodeURIComponent(noticeId)}/review`,{noticeRevision:revision,index:proposal.index,version:proposal.version,decision:'approve',transitDraft});onUpdate(next.result);
    } catch(reason) {setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}
  }
  return <form className="pipeline-event" onSubmit={approve}>
    <p className="small">{t('Confirm the service, affected stops and time window against the original post. Times are Pakistan time.')}</p>
    <label>{t('Service')}<select required value={route} onChange={event=>{setRoute(event.target.value);setDirection('');setFrom('');setTo('');}}><option value="">{t('Choose a service')}</option>{network?.routes.map(item=><option key={item.id} value={item.id}>{item.shortName} · {item.name}</option>)}</select></label>
    {!!initial.routeIds?.length && route===initial.routeId && <p className="small muted">{t('Whole service includes these routes')}: {initial.routeIds.map(id=>network?.routes.find(item=>item.id===id)?.shortName??id).join(', ')}</p>}
    <label>{t('Direction')}<select value={direction} onChange={event=>{setDirection(event.target.value);setFrom('');setTo('');}}><option value="">{t('Both directions')}</option>{[...new Set(patterns.map(pattern=>pattern.directionId))].map(id=><option key={id} value={id}>{patterns.find(pattern=>pattern.directionId===id)?.headsign ?? id}</option>)}</select></label>
    {(['from','to'] as const).map(key=><label key={key}>{t(key==='from'?'From stop (optional)':'To stop (optional)')}<select value={key==='from'?from:to} onChange={event=>(key==='from'?setFrom:setTo)(event.target.value)}><option value="">{t('Whole service')}</option>{network?.stops.filter(stop=>stopIds.has(stop.id)).map(stop=><option key={stop.id} value={stop.id}>{stop.name}</option>)}</select></label>)}
    <label>{t('Starts at (PKT)')}<input required type="datetime-local" value={start} onChange={event=>setStart(event.target.value)} /></label>
    <label>{t('Ends at (PKT)')}<input required type="datetime-local" value={end} onChange={event=>setEnd(event.target.value)} /></label>
    {error&&<p className="error-box" role="alert">{error}</p>}
    <button className="primary-button" disabled={busy||!network}>{t(proposal.action==='reopening'?'Approve service restoration':'Approve service suspension')}</button>
  </form>;
}
