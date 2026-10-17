import { t } from '../lib/language';
import { ArrowRight, Bookmark, ChevronDown, Clock3, Navigation, Route, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { PlanResponse, RouteOption } from '../../shared/types';
import { dateTime, distance, duration, time } from '../lib/format';

interface Props { updating?: boolean; showDemo?: boolean; plan: PlanResponse; selectedId: string | null; onSelect: (route: RouteOption) => void; onSaveCommute: () => void; onNavigate: () => void; onDemo: () => void; demoBusy: boolean }
export default function RouteResults({ updating = false, showDemo = false, plan, selectedId, onSelect, onSaveCommute, onNavigate, onDemo, demoBusy }: Props) {
  const driving = plan.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind));
  const selected = driving.find(option => option.id === selectedId) ?? driving[0];
  const departures = plan.options.filter(option => ['leave_earlier', 'leave_later'].includes(option.kind));
  const via = (option: RouteOption) => [...new Set(option.steps.map(s => s.roadName).filter(name => name && !/unnamed|local road/i.test(name)))].slice(0, 3).join(' · ') || 'Local roads';
  function card(option: RouteOption, index: number) { return <button className={`route-option ${selected?.id === option.id ? 'selected' : ''}`} key={option.id} onClick={() => onSelect(option)} aria-pressed={selected?.id === option.id}>
    <span className="route-radio">{selected?.id === option.id && <span />}</span><span className="route-option-body"><span className="route-option-title"><span>{option.kind === 'alternative' ? t(option.label) : ['leave_earlier', 'leave_later'].includes(option.kind) ? t(option.label) : t("Recommended route")}</span><span className={`tag ${option.kind === 'detour' ? 'red' : 'blue'}`}>{option.kind === 'detour' ? t("Avoids closure") : option.kind === 'alternative' ? t("Alternative") : option.kind === 'direct' ? t("Recommended") : t("Time option")}</span></span><span className="route-timing"><strong>{duration(option.durationSeconds)}</strong><span>{distance(option.distanceMeters)}</span><span className="arrival">{t("Arrive ")}{time(option.arrivalAt)}</span></span><span className="route-via">{t("Via ")}{via(option)}</span><span className="small muted">{t("Leave ")}{time(option.departureAt)}{option.kind === 'leave_later' ? t(" · later departure") : t("")}</span></span>
  </button>; }
  return <section className={`route-results ${updating ? 'is-updating' : ''}`} aria-busy={updating} aria-label={t("Journey results")}><fieldset className="route-result-controls" disabled={updating}>
    <div className="section-heading compact"><h2>{driving.length ? t("Choose your route") : t("No route at this time")}</h2><span className="route-count">{driving.length} {t("route")}{driving.length !== 1 ? t("s") : t("")}</span></div>
    {plan.conflicts.length > 0 && <div className="notice-box closure-impact"><TriangleAlert size={20} /><div><strong>{plan.conflicts.length} {t("closure")}{plan.conflicts.length !== 1 ? t("s") : t("")} {t("on the original route")}</strong><p>{plan.conflicts.map(c => c.title).join(' · ')}</p></div></div>}
    {!!plan.upcoming?.length && <div className="upcoming-route-notice"><Clock3 size={17} /><span>{t("Original route: ")}{plan.upcoming.map(item => `${item.title} · closes ${dateTime(item.startsAt)}`).join(' / ')}</span></div>}
    {!driving.length && <div className="error-box">{t(plan.unavailableReason ?? 'No clear route at this time. Choose another departure.')}</div>}
    <div className="route-options">{driving.map(card)}</div>
    {!!plan.conflicts.length && plan.baseline && <div className="blocked-route-card" aria-label={t("Original route blocked")}><TriangleAlert size={18} /><span><strong>{t("Original route · Blocked")}</strong><small>{duration(plan.baseline.durationSeconds)} {t("· ")}{distance(plan.baseline.distanceMeters)}</small></span></div>}
    {departures.length > 0 && <details className="departure-alternatives"><summary><Clock3 size={17} />{t("Compare departure times")}<span>{departures.length}</span><ChevronDown size={16} /></summary><div className="route-options">{departures.map(card)}</div></details>}
    {selected && <><button className="primary-button full start-navigation" onClick={onNavigate}><Navigation size={19} />{t("Navigate")}<ArrowRight size={18} /></button><button className="secondary-button full save-route-button" onClick={onSaveCommute}><Bookmark size={18} />{t("Save journey")}</button>
      <details className="road-sequence"><summary>{t("Road sequence ")}<ChevronDown size={16} /></summary><ol>{selected.steps.map((step, index) => <li key={index}><span>{t(step.instruction || step.roadName || 'Continue on local road')}</span><small>{distance(step.distanceMeters)}</small></li>)}</ol></details>
    </>}
    <p className="estimate-note">{t("Time estimates use road speeds, without live traffic.")}</p>
    <p className="estimate-note">{t("Tolls and checkposts are not listed; charges and waiting times are not included.")}</p>
    {plan.warnings.length > 0 && <details className="planning-notes"><summary>{t("Route details")}</summary>{[...new Set([...plan.warnings, ...selected?.warnings ?? []])].map((warning, i) => <p key={i}>{t(warning)}</p>)}</details>}
    {showDemo && <button className="text-button full centered" disabled={!plan.baseline || demoBusy} onClick={onDemo}><PlusDemo />{demoBusy ? t("Adding…") : t("Block a point on this route")}</button>}
  </fieldset></section>;
}
function PlusDemo() { return <Route size={17} aria-hidden="true" />; }
