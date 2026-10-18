import { t } from '../lib/language';
import { useEffect, useId, useRef, useState } from 'react';
import { Crosshair, LocateFixed, MapPin, Search, X } from 'lucide-react';
import type { Place } from '../../shared/types';
import { api } from '../lib/api';
import { getAuthSession } from '../lib/auth';
import { requestLocation } from '../lib/location';

interface Props { label: string; letter: string; value: Place | null; onChange: (place: Place | null) => void; onPick: () => void; active: boolean; locationContext?: number }
export default function PlaceInput({ label, letter, value, onChange, onPick, active, locationContext }: Props) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(value?.name ?? ''), [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]), [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(''), [locationError, setLocationError] = useState('');
  const [resultsFor, setResultsFor] = useState<string | null>(null), [activeIndex, setActiveIndex] = useState(-1);
  const [locating, setLocating] = useState(false);
  const editing = useRef(false), locationSequence = useRef(0), blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelLocation = useRef<(() => void) | undefined>(undefined);
  function cancelPendingLocation() { locationSequence.current++; cancelLocation.current?.(); setLocating(false); }
  useEffect(() => {
    cancelPendingLocation(); setLocationError('');
    if (value) { setQuery(value.name); editing.current = false; }
    else if (!editing.current) setQuery('');
  }, [value]);
  useEffect(() => { cancelPendingLocation(); }, [locationContext]);
  useEffect(() => () => { locationSequence.current++; cancelLocation.current?.(); clearTimeout(blurTimer.current); }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); let deadline: ReturnType<typeof setTimeout> | undefined;
    setPlaces([]); setResultsFor(null); setActiveIndex(-1); setLoading(true); setSearchError('');
    const coord = query.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
    if (coord) {
      const latitude = Number(coord[1]), longitude = Number(coord[2]);
      const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
      setPlaces(valid ? [{ name: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, coordinate: [longitude, latitude] }] : []);
      setSearchError(valid ? '' : 'Enter latitude from -90 to 90 and longitude from -180 to 180.');
      setResultsFor(query); setLoading(false); return () => controller.abort();
    }
    const timer = setTimeout(async () => {
      deadline = setTimeout(() => {
        if (controller.signal.aborted) return;
        setPlaces([]); setSearchError('Place search timed out. Try again or choose on map.'); setLoading(false); controller.abort();
      }, 10000);
      try {
        const result = await api<Place[]>(`/places?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!controller.signal.aborted) { setPlaces(result.slice(0, 7)); setResultsFor(query); }
      } catch (error) { if (!controller.signal.aborted) { setPlaces([]); setSearchError(error instanceof Error ? error.message : 'Search unavailable.'); } }
      finally { clearTimeout(deadline); if (!controller.signal.aborted) setLoading(false); }
    }, 220);
    return () => { clearTimeout(timer); clearTimeout(deadline); controller.abort(); };
  }, [query, open]);
  const canSelect = !loading && resultsFor === query;
  const count = 2 + (canSelect ? places.length : 0);
  function select(place: Place) { cancelPendingLocation(); setLocationError(''); editing.current = false; onChange(place); setQuery(place.name); setOpen(false); setActiveIndex(-1); }
  function pick() { cancelPendingLocation(); setOpen(false); onPick(); }
  function locate() {
    if (locating) return;
    setLocationError('');
    if (!navigator.geolocation) { setLocationError('Location is unavailable in this browser. Choose on map instead.'); return; }
    const sequence = ++locationSequence.current, owner = getAuthSession().user?.uid;
    const current = () => sequence === locationSequence.current && owner === getAuthSession().user?.uid;
    setLocating(true);
    cancelLocation.current?.();
    cancelLocation.current = requestLocation({
      onSuccess: fix => { if (current()) select({ name: t(`Current location · ±${Math.ceil(fix.accuracy)} m`), coordinate: fix.coordinate }); },
      onError: reason => {
        if (!current()) return;
        setLocating(false); setLocationError(reason === 'denied' ? 'Location permission was declined. Choose on map instead.' : reason === 'timeout' ? 'Location timed out. Try again or choose on map.' : 'Location is unavailable. Try again or choose on map.');
      },
    });
  }
  return <div className={`place-field ${active ? 'picking' : ''}`} data-endpoint={letter} data-tour={letter === 'A' ? 'starting-point' : letter === 'B' ? 'destination' : undefined} onBlur={event => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    blurTimer.current = setTimeout(() => setOpen(false), 140);
  }}>
    <label htmlFor={id}><span className={`endpoint-letter ${letter === 'B' ? 'destination' : ''}`}>{letter}</span>{t(label)}</label>
    <div className="place-input-row">
      <input ref={input} id={id} value={query} placeholder={t('Search a place or address')} autoComplete="off" role="combobox" aria-expanded={open} aria-controls={open ? `${id}-options` : undefined} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        onFocus={() => { clearTimeout(blurTimer.current); setOpen(true); }}
        onChange={event => { cancelPendingLocation(); setLocationError(''); editing.current = true; setQuery(event.target.value); setPlaces([]); setResultsFor(null); setActiveIndex(-1); setLoading(true); if (value) onChange(null); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && open) { event.preventDefault(); setActiveIndex(index => event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : index < 0 ? event.key === 'ArrowDown' ? 0 : count - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + count) % count); }
          if (event.key === 'Enter' && open) {
            event.preventDefault();
            // Typing a place and pressing Enter must never request GPS implicitly.
            const index = activeIndex < 0 ? query.trim() ? 2 : -1 : activeIndex;
            if (index === 0) locate(); else if (index === 1) pick(); else if (canSelect && places[index - 2]) select(places[index - 2]);
          }
        }} />
      {query && <button type="button" className="icon-button small" title={t(`Clear ${label.toLowerCase()}`)} aria-label={t(`Clear ${label.toLowerCase()}`)} onClick={() => { cancelPendingLocation(); editing.current = false; setQuery(''); onChange(null); input.current?.focus(); }}><X size={15} /></button>}
      <button type="button" className={`icon-button pick-button ${active ? 'selected' : ''}`} title={t(`Choose ${label.toLowerCase()} on map`)} aria-label={t(`Choose ${label.toLowerCase()} on map`)} aria-pressed={active} onClick={pick}><Crosshair size={19} /></button>
    </div>
    {locationError && <p className="place-location-error" role="alert">{t(locationError)}</p>}
    {open && <div className="place-options" id={`${id}-options`} role="listbox" aria-label={`${t(label)} ${t('suggestions')}`}>
      <button type="button" role="option" tabIndex={-1} id={`${id}-option-0`} aria-selected={activeIndex === 0} className={`place-location-option ${activeIndex === 0 ? 'keyboard-active' : ''}`} disabled={locating} onMouseDown={event => event.preventDefault()} onClick={locate}><LocateFixed size={19} aria-hidden="true" /><span>{t(locating ? 'Finding your location…' : 'Use current location')}</span></button>
      <button type="button" role="option" tabIndex={-1} id={`${id}-option-1`} aria-selected={activeIndex === 1} className={activeIndex === 1 ? 'keyboard-active' : ''} onMouseDown={event => event.preventDefault()} onClick={pick}><Crosshair size={19} aria-hidden="true" /><span>{t('Choose on map')}</span></button>
      {loading ? <div className="place-hint" role="status">{t('Searching places…')}</div> : places.length ? places.map((place, index) => <button type="button" id={`${id}-option-${index + 2}`} role="option" tabIndex={-1} aria-selected={activeIndex === index + 2} className={activeIndex === index + 2 ? 'keyboard-active' : ''} disabled={!canSelect} key={`${place.id ?? place.name}-${index}`} onMouseDown={event => event.preventDefault()} onClick={() => { if (canSelect) select(place); }}>
        <MapPin size={18} aria-hidden="true" /><span>{place.name}</span>
      </button>) : <div className="place-hint" role="status"><Search size={16} />{t(searchError || 'No match. Choose on map or enter lat, lng.')}</div>}
    </div>}
  </div>;
}
