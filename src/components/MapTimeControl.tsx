import { useEffect, useRef, useState } from 'react';
import { CalendarClock, ChevronDown, Clock3, RotateCcw, X } from 'lucide-react';
import { dayDate, inputISO, localInput, time } from '../lib/format';

interface Props { at: string; live: boolean; onChange: (value: string | null) => void }
export default function MapTimeControl({ at, live, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(localInput(new Date(at)));
  const [error, setError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <div className="map-time-control" ref={container}>
    <button ref={trigger} className={`map-time-trigger ${live ? 'is-live' : 'is-scheduled'}`} aria-label={`Map time: ${live ? 'Now, ' : ''}${dayDate(at)}, ${time(at)} Pakistan time. Change date and time`} aria-expanded={open} aria-controls="map-time-picker" onClick={() => { setValue(localInput(new Date(at))); setError(''); setOpen(!open); }}>
      {live ? <Clock3 size={23} aria-hidden="true" /> : <CalendarClock size={23} aria-hidden="true" />}<span><small>{live ? 'LIVE · NOW' : 'VIEWING · SCHEDULED'}</small><strong>{time(at)} <em>PKT</em></strong><span>{dayDate(at)}</span></span><ChevronDown size={17} aria-hidden="true" />
    </button>
    {open && <form id="map-time-picker" className="map-time-picker" aria-label="Choose map time" onSubmit={event => { event.preventDefault(); try { inputISO(value); onChange(value); close(); } catch { setError('Choose a valid date and time.'); } }}>
      <div className="row between"><strong>Map time</strong><button type="button" className="icon-button small" aria-label="Close map time" onClick={close}><X size={17} /></button></div>
      <label className="field-label" htmlFor="map-date-time">Date & time · Pakistan<input id="map-date-time" autoFocus type="datetime-local" required value={value} onInput={event => setValue(event.currentTarget.value)} /></label>
      {error && <p className="error-box" role="alert">{error}</p>}
      <button className="primary-button full" type="submit">View this time</button>
      <button className="text-button full centered" type="button" onClick={() => { onChange(null); close(); }}><RotateCcw size={16} />Back to now</button>
    </form>}
  </div>;
}
