import { t } from '../lib/language';
import { useEffect, useId, useRef, useState } from 'react';
import { Crosshair, MapPin, Search, X } from 'lucide-react';
import type { Place } from '../../shared/types';
import { api } from '../lib/api';

interface Props { label: string; letter: string; value: Place | null; onChange: (place: Place | null) => void; onPick: () => void; active: boolean }
export default function PlaceInput({ label, letter, value, onChange, onPick, active }: Props) {
  const id = useId();
  const [query, setQuery] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const editing = useRef(false);
  useEffect(() => {
    if (value) { setQuery(value.name); editing.current = false; }
    else if (!editing.current) setQuery('');
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setPlaces([]); setResultsFor(null); setActiveIndex(-1); setLoading(true);
    const timer = setTimeout(async () => {
      setLoading(true); setSearchError('');
      try {
        const result = await api<Place[]>(`/places?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const coord = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
        if (coord && Math.abs(+coord[1]) <= 90 && Math.abs(+coord[2]) <= 180) {
          result.unshift({ name: `${(+coord[1]).toFixed(5)}, ${(+coord[2]).toFixed(5)}`, coordinate: [+coord[2], +coord[1]] });
        }
        setPlaces(result.slice(0, 7)); setResultsFor(query);
      } catch (error) { if (!controller.signal.aborted) { setPlaces([]); setSearchError(error instanceof Error ? error.message : 'Search unavailable.'); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);
  const canSelect = !loading && resultsFor === query;
  function select(place: Place) { editing.current = false; onChange(place); setQuery(place.name); setOpen(false); }
  return <div className={`place-field ${active ? 'picking' : ''}`}>
    <label htmlFor={id}><span className={`endpoint-letter ${letter === 'B' ? 'destination' : ''}`}>{letter}</span>{t(label)}</label>
    <div className="place-input-row">
      <input id={id} value={query} placeholder={t("Search a place or enter lat, lng")} autoComplete="off" role="combobox" aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 140)}
        onChange={e => { editing.current = true; setQuery(e.target.value); setPlaces([]); setResultsFor(null); setActiveIndex(-1); setLoading(true); if (value) onChange(null); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
          if (open && ['ArrowDown', 'ArrowUp'].includes(e.key) && canSelect && places.length) { e.preventDefault(); setActiveIndex(i => e.key === 'ArrowDown' ? Math.min(i + 1, places.length - 1) : Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && open) { e.preventDefault(); if (canSelect && places.length) select(places[Math.max(activeIndex, 0)]); }
        }} />
      {value && <button type="button" className="icon-button small" title={t(`Clear ${label.toLowerCase()}`)} aria-label={t(`Clear ${label.toLowerCase()}`)} onClick={() => { editing.current = false; setQuery(''); onChange(null); }}><X size={14} /></button>}
      <button type="button" className={`icon-button pick-button ${active ? 'selected' : ''}`} title={t(`Choose ${label.toLowerCase()} on map`)} aria-label={t(`Choose ${label.toLowerCase()} on map`)} aria-pressed={active} onClick={() => { setOpen(false); onPick(); }}><Crosshair size={17} /></button>
    </div>
    {value && <small className="coordinates">{value.coordinate[1].toFixed(5)}{t(", ")}{value.coordinate[0].toFixed(5)}</small>}
    {open && <div className="place-options" id={`${id}-options`} role="listbox" aria-label={`${label} suggestions`}>
      {loading ? <div className="place-hint">{t("Searching local places…")}</div> : places.length ? places.map((place, index) => <button type="button" id={`${id}-option-${index}`} role="option" aria-selected={activeIndex === index} className={activeIndex === index ? 'keyboard-active' : ''} disabled={!canSelect} key={`${place.id ?? place.name}-${index}`} onMouseDown={e => e.preventDefault()} onClick={() => { if (canSelect) select(place); }}>
        <MapPin size={16} aria-hidden="true" /><span>{place.name}<small>{place.coordinate[1].toFixed(4)}{t(", ")}{place.coordinate[0].toFixed(4)}</small></span>
      </button>) : <div className="place-hint"><Search size={16} />{t(searchError || 'No match. Pick a point on the map or enter lat, lng.')}</div>}
    </div>}
  </div>;
}
