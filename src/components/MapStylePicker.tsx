import { t } from '../lib/language';
import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import type { MapStyleId } from '../../shared/types';
import { MAP_STYLES, normalizeMapStyleId } from '../lib/mapStyle';

interface ChoicesProps { value: MapStyleId; disabled?: boolean; onChange: (style: MapStyleId) => void }
export function MapStyleChoices({ value, disabled, onChange }: ChoicesProps) {
  value = normalizeMapStyleId(value);
  return <div className="map-style-choices" role="group" aria-label={t("Map style")}>{MAP_STYLES.map(style => <button type="button" key={style.id} className={`map-style-choice ${value === style.id ? 'selected' : ''}`} aria-pressed={value === style.id} aria-label={`${style.name} map style`} disabled={disabled} onClick={() => onChange(style.id)}>
    <span className="style-preview" aria-hidden="true"><svg viewBox="0 0 160 65" preserveAspectRatio="xMidYMid slice"><rect width="160" height="65" fill={style.colours[0]} /><path d="M0 0H64L76 20 47 44 0 35Z M112 43 160 26V65H130Z" fill={style.colours[1]} /><path d="M136 -10Q110 15 132 34T111 80" fill="none" stroke={style.colours[2]} strokeWidth="17" /><path d="M-10 54 174 10 M39 -6 85 77" fill="none" stroke={style.id === 'night' ? '#263b49' : '#d5c6a9'} strokeWidth="10" /><path d="M-10 54 174 10 M39 -6 85 77" fill="none" stroke={style.colours[3]} strokeWidth="6" /><path d="M-2 20 100 56 M62 -2 152 54" fill="none" stroke={style.id === 'night' ? '#49606e' : '#fff'} strokeWidth="4" /></svg>{value === style.id && <span className="style-selected-tick"><Check size={13} /></span>}</span>
    <strong>{t(style.name)}</strong><small>{t(style.description)}</small>
  </button>)}</div>;
}
export default function MapStylePicker({ value, disabled, onChange, onClose }: ChoicesProps & { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); document.querySelector<HTMLButtonElement>('.map-style-trigger')?.focus(); } };
    const outside = (event: PointerEvent) => { const target = event.target; if (target instanceof Element && !panel.current?.contains(target) && !target.closest('.map-style-trigger')) close.current(); };
    document.addEventListener('keydown', keyboard); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', keyboard); document.removeEventListener('pointerdown', outside); };
  }, []);
  return <div ref={panel} className="map-style-picker" id="map-style-picker" role="region" aria-label={t("Map styles")}><div className="row between"><h2>{t("Map styles")}</h2><button type="button" className="icon-button small" aria-label={t("Close map styles")} onClick={onClose}><X size={18} /></button></div><p>{t("Choose colour and detail that work for you.")}</p><MapStyleChoices value={value} disabled={disabled} onChange={onChange} /><p className="map-style-note">{t("Map colours are separate from the app’s light/dark theme.")}</p></div>;
}
