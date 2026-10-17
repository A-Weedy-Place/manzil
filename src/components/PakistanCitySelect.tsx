import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { t } from '../lib/language';
import { findPakistanCities, loadPakistanCities, pakistanRegionName, type PakistanCity } from '../lib/pakistanCities';
import './PakistanCitySelect.css';

const pageSize = 60;

/** Only a selected place changes the profile draft; a search is never saved as a city. */
export default function PakistanCitySelect({ value, onChange, disabled = false }: { value: string; onChange: (city: string) => void; disabled?: boolean }) {
  const id = useId(), input = useRef<HTMLInputElement>(null), skipNextFocus = useRef(false);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(-1), [offset, setOffset] = useState(0);
  const [cities, setCities] = useState<readonly PakistanCity[] | null>(null), [failed, setFailed] = useState(false);
  const [chosenPlace, setChosenPlace] = useState<Pick<PakistanCity, 'name' | 'region'> | null>(null);
  const result = useMemo(() => cities ? findPakistanCities(cities, query, pageSize, offset) : { items: [], more: false, total: 0 }, [cities, query, offset]);
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
  function show() { setOpen(true); setQuery(''); setActive(-1); setOffset(0); }
  function page(direction: -1 | 1, nextActive = -1) {
    setOffset(previous => Math.max(0, previous + direction * pageSize)); setActive(nextActive);
    const list = document.getElementById(`${id}-list`); if (list) list.scrollTop = 0;
    if (document.activeElement !== input.current) { skipNextFocus.current = true; input.current?.focus(); }
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(''); setActive(-1); }
    else if (event.key === 'Tab') { setActive(-1); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); return; }
      if (event.key === 'ArrowDown' && active === result.items.length - 1 && result.more) { page(1, 0); return; }
      if (event.key === 'ArrowUp' && active === 0 && offset > 0) { page(-1, pageSize - 1); return; }
      setActive(previous => result.items.length ? previous < 0 ? event.key === 'ArrowDown' ? 0 : result.items.length - 1 : Math.max(0, Math.min(result.items.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1))) : -1);
    } else if (open && (event.key === 'PageDown' || event.key === 'PageUp')) {
      event.preventDefault();
      if (event.key === 'PageDown' && result.more) page(1, 0);
      else if (event.key === 'PageUp' && offset > 0) page(-1, 0);
    } else if (open && (event.key === 'Home' || event.key === 'End') && result.items.length) {
      event.preventDefault(); setActive(event.key === 'Home' ? 0 : result.items.length - 1);
    } else if (open && event.key === 'Enter') {
      event.preventDefault();
      if (active < 0 && !query.trim()) { setOpen(false); return; }
      const choice = result.items[active < 0 ? 0 : active];
      if (choice) choose(choice);
    }
  }

  return <div className="pakistan-city-select" data-escape-scope={open ? 'open' : undefined} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(''); setActive(-1);
      if (document.activeElement !== input.current) { skipNextFocus.current = true; input.current?.focus(); }
    }
  }} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(false); setQuery(''); setActive(-1); }
  }}>
    <label className="field-label" htmlFor={id}>{t('City')}</label>
    <div className={`city-select-field ${open ? 'is-open' : ''}`}>
      {open && <Search size={17} aria-hidden="true" />}
      <input ref={input} id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined} aria-describedby={open && cities ? `${id}-count` : undefined} aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        value={open ? query : value} placeholder={t('Search cities')} disabled={disabled} maxLength={80}
        onFocus={() => { if (skipNextFocus.current) skipNextFocus.current = false; else show(); }} onClick={() => { if (!open) show(); }} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); setOffset(0); }} onKeyDown={keyDown} />
      {!!value && !open && <button className="city-select-clear" type="button" aria-label={t('Clear city')} disabled={disabled} onClick={() => { onChange(''); input.current?.focus(); }}><X size={16} /></button>}
      <button className="city-select-toggle" type="button" aria-label={t('Cities in Pakistan')} aria-expanded={open} aria-controls={`${id}-list`} disabled={disabled}
        onClick={() => { if (open) { setOpen(false); setQuery(''); setActive(-1); } else { show(); input.current?.focus(); } }}><ChevronDown size={18} aria-hidden="true" /></button>
    </div>
    {open && <div className="city-select-results">
      {value && <div className="city-select-saved"><span>{t('Saved city')}</span><strong dir="auto">{value}</strong></div>}
      {cities && <p className="city-select-count" id={`${id}-count`} role="status"><span><bdi>{result.total.toLocaleString('en')}</bdi> {t('places')}</span>{result.total > 0 && <bdi>{offset + 1}–{offset + result.items.length}</bdi>}</p>}
      <div className="city-select-list" id={`${id}-list`} role="listbox" aria-label={t('Cities in Pakistan')} aria-busy={!cities && !failed}>
        {!cities && <p className="city-select-message" role="status">{t(failed ? 'Could not load cities. Close and try again.' : 'Loading cities…')}</p>}
        {cities && !result.items.length && <p className="city-select-message" role="status">{t('No cities found')}</p>}
        {result.items.map((city, index) => <button key={`${city.name}:${city.region}:${index}`} id={`${id}-option-${index}`} type="button" role="option" aria-label={`${city.name}, ${pakistanRegionName(city.region)}`} aria-selected={city === selectedPlace} aria-posinset={offset + index + 1} aria-setsize={result.total}
          className={index === active ? 'is-active' : ''} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => choose(city)} onMouseMove={() => setActive(index)}>
          <span><strong dir="auto">{city.name}</strong><small>{pakistanRegionName(city.region)}</small></span>{city === selectedPlace && <Check size={17} aria-hidden="true" />}
        </button>)}
      </div>
      {(offset > 0 || result.more) && <div className="city-select-pages">
        <button type="button" disabled={offset === 0} aria-label={t('Previous cities')} onClick={() => page(-1)}><ChevronLeft size={16} aria-hidden="true" />{t('Previous')}</button>
        <button type="button" disabled={!result.more} aria-label={t('Next cities')} onClick={() => page(1)}>{t('Next')}<ChevronRight size={16} aria-hidden="true" /></button>
      </div>}
      <a className="city-select-source" href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames · CC BY 4.0</a>
    </div>}
  </div>;
}
