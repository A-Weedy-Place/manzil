import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { t } from '../lib/language';
import { findPakistanCities, loadPakistanCities, pakistanRegionName, type PakistanCity } from '../lib/pakistanCities';
import './PakistanCitySelect.css';

/** Only a selected place changes the profile draft; a search is never saved as a city. */
export default function PakistanCitySelect({ value, onChange, disabled = false }: { value: string; onChange: (city: string) => void; disabled?: boolean }) {
  const id = useId(), input = useRef<HTMLInputElement>(null), skipNextFocus = useRef(false);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(-1);
  const [cities, setCities] = useState<readonly PakistanCity[] | null>(null), [failed, setFailed] = useState(false);
  const [chosenPlace, setChosenPlace] = useState<Pick<PakistanCity, 'name' | 'region'> | null>(null);
  const result = useMemo(() => cities ? findPakistanCities(cities, query) : { items: [], more: false }, [cities, query]);
  const selectedPlace = useMemo(() => cities?.find(city => city.name === value && (!chosenPlace || chosenPlace.name !== value || city.region === chosenPlace.region)) ?? null, [cities, value, chosenPlace]);

  useEffect(() => {
    if (!open || cities) return;
    let current = true;
    setFailed(false);
    loadPakistanCities().then(items => { if (current) setCities(items); }).catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [open, cities]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (chosenPlace && chosenPlace.name !== value) setChosenPlace(null); }, [value, chosenPlace]);
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${id}-option-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, id]);

  function choose(city: PakistanCity) {
    setChosenPlace({ name: city.name, region: city.region }); onChange(city.name); setQuery(''); setOpen(false); setActive(-1);
    if (document.activeElement !== input.current) { skipNextFocus.current = true; input.current?.focus(); }
  }
  function show() { setOpen(true); setQuery(''); setActive(-1); }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(''); setActive(-1); }
    else if (event.key === 'Tab') { setOpen(false); setQuery(''); setActive(-1); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); return; }
      setActive(previous => result.items.length ? previous < 0 ? event.key === 'ArrowDown' ? 0 : result.items.length - 1 : Math.max(0, Math.min(result.items.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1))) : -1);
    } else if (open && (event.key === 'Home' || event.key === 'End') && result.items.length) {
      event.preventDefault(); setActive(event.key === 'Home' ? 0 : result.items.length - 1);
    } else if (open && event.key === 'Enter') {
      event.preventDefault();
      if (active < 0 && !query.trim()) { setOpen(false); return; }
      const choice = result.items[active < 0 ? 0 : active];
      if (choice) choose(choice);
    }
  }

  return <div className="pakistan-city-select" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(false); setQuery(''); setActive(-1); }
  }}>
    <label className="field-label" htmlFor={id}>{t('City')}</label>
    <div className={`city-select-field ${open ? 'is-open' : ''}`}>
      {open && <Search size={17} aria-hidden="true" />}
      <input ref={input} id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        value={open ? query : value} placeholder={t('Search cities')} disabled={disabled} maxLength={80}
        onFocus={() => { if (skipNextFocus.current) skipNextFocus.current = false; else show(); }} onClick={() => { if (!open) show(); }} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); }} onKeyDown={keyDown} />
      {!!value && !open && <button className="city-select-clear" type="button" aria-label={t('Clear city')} disabled={disabled} onClick={() => { onChange(''); input.current?.focus(); }}><X size={16} /></button>}
      <button className="city-select-toggle" type="button" aria-label={t('Cities in Pakistan')} aria-expanded={open} aria-controls={`${id}-list`} disabled={disabled}
        onClick={() => { if (open) { setOpen(false); setQuery(''); setActive(-1); } else { show(); input.current?.focus(); } }}><ChevronDown size={18} aria-hidden="true" /></button>
    </div>
    {open && <div className="city-select-results">
      {value && <div className="city-select-saved"><span>{t('Saved city')}</span><strong dir="auto">{value}</strong></div>}
      <div className="city-select-list" id={`${id}-list`} role="listbox" aria-label={t('Cities in Pakistan')} aria-busy={!cities && !failed}>
        {!cities && <p className="city-select-message" role="status">{t(failed ? 'Could not load cities. Close and try again.' : 'Loading cities…')}</p>}
        {cities && !result.items.length && <p className="city-select-message" role="status">{t('No cities found')}</p>}
        {result.items.map((city, index) => <button key={`${city.name}:${city.region}:${index}`} id={`${id}-option-${index}`} type="button" role="option" aria-label={`${city.name}, ${pakistanRegionName(city.region)}`} aria-selected={city === selectedPlace}
          className={index === active ? 'is-active' : ''} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => choose(city)} onMouseMove={() => setActive(index)}>
          <span><strong dir="auto">{city.name}</strong><small>{pakistanRegionName(city.region)}</small></span>{city === selectedPlace && <Check size={17} aria-hidden="true" />}
        </button>)}
      </div>
      {result.more && <p className="city-select-more">{t('More matches. Keep typing to narrow the list.')}</p>}
      <a className="city-select-source" href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames · CC BY 4.0</a>
    </div>}
  </div>;
}
