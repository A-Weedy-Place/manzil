import { ArrowRight, Bookmark, ChevronDown, Clock3, Navigation, Route, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { PlanResponse, RouteOption } from '../../shared/types';
import { dateTime, distance, duration, time } from '../lib/format';

interface Props { plan: PlanResponse; selectedId: string | null; onSelect: (route: RouteOption) => void; onSaveCommute: () => void; onNavigate: () => void; onDemo: () => void; demoBusy: boolean; streetDemoNames?: string[]; onReopenDemo?: () => void }
export default function RouteResults({ plan, selectedId, onSelect, onSaveCommute, onNavigate, onDemo, demoBusy, streetDemoNames = [], onReopenDemo }: Props) {
  const driving = plan.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind));
  const selected = driving.find(option => option.id === selectedId) ?? driving[0];
  const departures = plan.options.filter(option => ['leave_earlier', 'leave_later'].includes(option.kind));
  const demoStreets = [...new Set(selected?.steps.map(step => step.roadName).filter(name => streetDemoNames.includes(name)) ?? [])];
  const via = (option: RouteOption) => [...new Set(option.steps.map(s => s.roadName).filter(name => name && !/unnamed|local road/i.test(name)))].slice(0, 3).join(' · ') || 'Local roads';
  function card(option: RouteOption, index: number) { return <button className={`route-option ${selected?.id === option.id ? 'selected' : ''}`} key={option.id} onClick={() => onSelect(option)} aria-pressed={selected?.id === option.id}>
    <span className="route-radio">{selected?.id === option.id && <span />}</span><span className="route-option-body"><span className="route-option-title"><span>{option.kind === 'alternative' ? option.label : ['leave_earlier', 'leave_later'].includes(option.kind) ? option.label : 'Recommended route'}</span><span className={`tag ${option.kind === 'detour' ? 'red' : 'blue'}`}>{option.kind === 'detour' ? 'Avoids closure' : option.kind === 'alternative' ? 'Alternative' : option.kind === 'direct' ? 'Recommended' : 'Time option'}</span></span><span className="route-timing"><strong>{duration(option.durationSeconds)}</strong><span>{distance(option.distanceMeters)}</span><span className="arrival">Arrive {time(option.arrivalAt)}</span></span><span className="route-via">Via {via(option)}</span><span className="small muted">Leave {time(option.departureAt)}{option.kind === 'leave_later' ? ' · later departure' : ''}</span></span>
  </button>; }
  return <section className="route-results" aria-label="Journey results">
    <div className="section-heading compact"><h2>{driving.length ? 'Choose your route' : 'No route at this time'}</h2><span className="route-count">{driving.length} route{driving.length !== 1 ? 's' : ''}</span></div>
    {!!demoStreets.length && <div className="street-route-proof"><Route size={17} aria-hidden="true" /><span>Via {demoStreets.join(' → ')}</span></div>}
    {onReopenDemo && <button className="text-button" onClick={onReopenDemo}>Reopen demo road<ArrowRight size={15} aria-hidden="true" /></button>}
    {plan.conflicts.length > 0 && <div className="notice-box closure-impact"><TriangleAlert size={20} /><div><strong>{plan.conflicts.length} closure{plan.conflicts.length !== 1 ? 's' : ''} on the original route</strong><p>{plan.conflicts.map(c => c.title).join(' · ')}</p></div></div>}
    {!!plan.upcoming?.length && <div className="upcoming-route-notice"><Clock3 size={17} /><span>Original route: {plan.upcoming.map(item => `${item.title} · closes ${dateTime(item.startsAt)}`).join(' / ')}</span></div>}
    {!driving.length && <div className="error-box">{plan.unavailableReason ?? 'No clear route at this time. Choose another departure.'}</div>}
    <div className="route-options">{driving.map(card)}</div>
    {!!plan.conflicts.length && plan.baseline && <div className="blocked-route-card" aria-label="Original route blocked"><TriangleAlert size={18} /><span><strong>Original route · Blocked</strong><small>{duration(plan.baseline.durationSeconds)} · {distance(plan.baseline.distanceMeters)}</small></span></div>}
    {departures.length > 0 && <details className="departure-alternatives"><summary><Clock3 size={17} />Compare departure times<span>{departures.length}</span><ChevronDown size={16} /></summary><div className="route-options">{departures.map(card)}</div></details>}
    {selected && <><button className="primary-button full start-navigation" onClick={onNavigate}><Navigation size={19} />Navigate<ArrowRight size={18} /></button><button className="secondary-button full save-route-button" onClick={onSaveCommute}><Bookmark size={18} />Save journey</button>
      <details className="road-sequence"><summary>Road sequence <ChevronDown size={16} /></summary><ol>{selected.steps.map((step, index) => <li key={index}><span>{step.instruction || step.roadName || 'Continue on local road'}</span><small>{distance(step.distanceMeters)}</small></li>)}</ol></details>
    </>}
    <p className="estimate-note">Time estimates use road speeds, without live traffic.</p>
    {plan.warnings.length > 0 && <details className="planning-notes"><summary>Route details</summary>{[...new Set([...plan.warnings, ...selected?.warnings ?? []])].map((warning, i) => <p key={i}>{warning}</p>)}</details>}
    <button className="text-button full centered" disabled={!plan.baseline || demoBusy} onClick={onDemo}><PlusDemo />{demoBusy ? 'Adding…' : 'Block a point on this route'}</button>
  </section>;
}
function PlusDemo() { return <Route size={17} aria-hidden="true" />; }
