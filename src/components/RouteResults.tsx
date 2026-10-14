import { ArrowRight, Bookmark, ChevronDown, Clock3, Navigation, Route, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { PlanResponse, RouteOption } from '../../shared/types';
import { distance, duration, time } from '../lib/format';

interface Props { plan: PlanResponse; selectedId: string | null; onSelect: (route: RouteOption) => void; onSaveCommute: () => void; onNavigate: () => void; onDemo: () => void; demoBusy: boolean }
export default function RouteResults({ plan, selectedId, onSelect, onSaveCommute, onNavigate, onDemo, demoBusy }: Props) {
  const selected = plan.options.find(option => option.id === selectedId) ?? plan.options[0];
  const driving = plan.options.filter(option => ['direct', 'detour', 'alternative'].includes(option.kind));
  const departures = plan.options.filter(option => ['leave_earlier', 'leave_later'].includes(option.kind));
  const via = (option: RouteOption) => [...new Set(option.steps.map(s => s.roadName).filter(name => name && !/unnamed|local road/i.test(name)))].slice(0, 3).join(' · ') || 'Local roads';
  function card(option: RouteOption, index: number) { return <button className={`route-option ${selected?.id === option.id ? 'selected' : ''}`} key={option.id} onClick={() => onSelect(option)} aria-pressed={selected?.id === option.id}>
    <span className="route-radio">{selected?.id === option.id && <span />}</span><span className="route-option-body"><span className="route-option-title"><span>{option.kind === 'alternative' ? option.label : ['leave_earlier', 'leave_later'].includes(option.kind) ? option.label : 'Recommended route'}</span><span className={`tag ${option.kind === 'detour' ? 'red' : 'blue'}`}>{option.kind === 'detour' ? 'Avoids closure' : option.kind === 'alternative' ? 'Alternative' : option.kind === 'direct' ? 'Recommended' : 'Time option'}</span></span><span className="route-timing"><strong>{duration(option.durationSeconds)}</strong><span>{distance(option.distanceMeters)}</span><span className="arrival">Arrive {time(option.arrivalAt)}</span></span><span className="route-via">Via {via(option)}</span><span className="small muted">Leave {time(option.departureAt)}{option.kind === 'leave_later' ? ' · later departure' : ''}</span></span>
  </button>; }
  return <section className="route-results" aria-label="Journey results">
    <div className="section-heading compact"><h2>{plan.options.length ? 'Choose your route' : 'No clear route found'}</h2><span className="route-count">{driving.length} route{driving.length !== 1 ? 's' : ''}</span></div>
    {plan.conflicts.length > 0 && <div className="notice-box closure-impact"><TriangleAlert size={20} /><div><strong>{plan.conflicts.length} closure{plan.conflicts.length !== 1 ? 's' : ''} on the original route</strong><p>{plan.conflicts.map(c => c.title).join(' · ')}</p></div></div>}
    {!plan.options.length && <div className="error-box">{plan.unavailableReason ?? 'A connected route could not be validated. Adjust the endpoints, schedule or closure geometry.'}</div>}
    <div className="route-options">{driving.map(card)}</div>
    {driving.length === 1 && <p className="small muted">Only one sufficiently different clear driving route was found.</p>}
    {departures.length > 0 && <details className="departure-alternatives"><summary><Clock3 size={17} />Compare departure times<span>{departures.length}</span><ChevronDown size={16} /></summary><div className="route-options">{departures.map(card)}</div></details>}
    {selected && <><div className="route-clear"><ShieldCheck size={17} /><span>Checked against your published closures</span></div><button className="primary-button full start-navigation" onClick={onNavigate}><Navigation size={19} />Preview & navigate<ArrowRight size={18} /></button><button className="secondary-button full save-route-button" onClick={onSaveCommute}><Bookmark size={18} />Save journey & get closure alerts</button>
      <details className="road-sequence"><summary>Road sequence <ChevronDown size={16} /></summary><ol>{selected.steps.map((step, index) => <li key={index}><span>{step.instruction || step.roadName || 'Continue on local road'}</span><small>{distance(step.distanceMeters)}</small></li>)}</ol></details>
      {selected.warnings.map((warning, i) => <p className="small muted" key={i}>{warning}</p>)}
    </>}
    <p className="estimate-note">Time estimates use road speeds, without live traffic.</p>
    {plan.warnings.length > 0 && <details className="planning-notes"><summary>Planning notes ({plan.warnings.length})</summary>{plan.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</details>}
    <details className="demo-section"><summary><Route size={18} />Test a demo closure</summary><p>Add a synthetic restriction to test rerouting.</p><button className="text-button" disabled={!plan.baseline || demoBusy} onClick={onDemo}>{demoBusy ? 'Adding demo…' : 'Try a demo restriction'}<ArrowRight size={15} /></button></details>
  </section>;
}
