import { ArrowRight, Check, ChevronDown, Clock3, Route, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { PlanResponse, RouteOption } from '../../shared/types';
import { distance, duration, time } from '../lib/format';

interface Props { plan: PlanResponse; selectedId: string | null; onSelect: (route: RouteOption) => void; onSaveCommute: () => void; onDemo: () => void; demoBusy: boolean }
export default function RouteResults({ plan, selectedId, onSelect, onSaveCommute, onDemo, demoBusy }: Props) {
  const selected = plan.options.find(option => option.id === selectedId) ?? plan.options[0];
  return <section className="route-results" aria-label="Journey results">
    <div className="section-heading compact"><h2>{plan.options.length ? 'A way forward' : 'No clear route found'}</h2><span className="small muted">{plan.options.length} option{plan.options.length !== 1 ? 's' : ''}</span></div>
    {plan.conflicts.length > 0 && <div className="notice-box warning"><TriangleAlert size={17} /><div><strong>{plan.conflicts.length} restriction{plan.conflicts.length !== 1 ? 's' : ''} on the original route</strong><p>{plan.conflicts.map(c => c.title).join(' · ')}</p></div></div>}
    {!plan.options.length && <div className="error-box">{plan.unavailableReason ?? 'A connected route could not be validated. Adjust the endpoints, schedule or closure geometry.'}</div>}
    <div className="route-options">{plan.options.map((option, index) => <button className={`route-option ${selected?.id === option.id ? 'selected' : ''}`} key={option.id} onClick={() => onSelect(option)} aria-pressed={selected?.id === option.id}>
      <span className="route-radio">{selected?.id === option.id && <span />}</span><span className="route-option-body"><span className="route-option-title">{option.label}<span className={`tag ${option.kind === 'detour' ? 'orange' : 'green'}`}>{option.kind === 'detour' ? 'Detour' : option.kind === 'direct' ? 'Clear route' : 'Time change'}</span></span><span className="route-timing"><strong>{duration(option.durationSeconds)}</strong><span>{distance(option.distanceMeters)}</span><span className="arrival">Arrive {time(option.arrivalAt)}</span></span><span className="small muted">Leave {time(option.departureAt)}{option.kind === 'leave_later' ? ' · includes a later departure' : ''}</span></span>
    </button>)}</div>
    {selected && <><div className="route-clear"><ShieldCheck size={16} /><span>No overlap with your published restrictions</span></div>
      <details className="road-sequence"><summary>Road sequence <ChevronDown size={15} /></summary><ol>{selected.steps.map((step, index) => <li key={index}><span>{step.instruction || step.roadName || 'Continue on local road'}</span><small>{distance(step.distanceMeters)}</small></li>)}</ol><p className="small muted">Planning reference. Follow road signs and current conditions.</p></details>
      {selected.warnings.map((warning, i) => <p className="small muted" key={i}>{warning}</p>)}
      <button className="secondary-button full" onClick={onSaveCommute}><Clock3 size={17} />Save as a regular commute<ArrowRight size={16} /></button>
    </>}
    {plan.warnings.length > 0 && <details className="planning-notes"><summary>Planning notes ({plan.warnings.length})</summary>{plan.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</details>}
    <div className="demo-section"><Route size={18} /><div><strong>See rerouting in action</strong><p>Add a clearly labelled demo closure on this route.</p><button className="text-button" disabled={!plan.baseline || demoBusy} onClick={onDemo}>{demoBusy ? 'Adding demo…' : 'Try a demo restriction'}<ArrowRight size={14} /></button></div></div>
  </section>;
}
