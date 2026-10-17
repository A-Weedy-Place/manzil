import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import type { Language } from '../../shared/speech';
import { t } from '../lib/language';

const choices: { value: Language; label: string }[] = [{ value: 'en', label: 'English' }, { value: 'ur', label: 'اردو' }];

export default function HeaderLanguage({ value, onChange }: { value: Language; onChange: (value: Language) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { if (open) items.current[active]?.focus(); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <div className="header-language" data-tour="language" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <button type="button" ref={trigger} className="header-language-trigger" data-short-language={value === 'ur' ? 'اردو' : 'EN'} aria-label={t('Language')} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'header-language-menu' : undefined}
      onClick={() => { setActive(choices.findIndex(choice => choice.value === value)); setOpen(!open); }}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(event.key === 'ArrowDown' ? 0 : choices.length - 1); setOpen(true); } }}>
      <Languages size={17} aria-hidden="true" /><span lang={value}>{value === 'ur' ? 'اردو' : 'English'}</span><ChevronDown size={13} aria-hidden="true" />
    </button>
    {open && <div id="header-language-menu" className="header-language-menu" role="menu" aria-label={t('Language')} onKeyDown={event => {
      if (event.key === 'Tab' && event.shiftKey) { event.preventDefault(); close(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        setActive(index => event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
      }
    }}>{choices.map((choice, index) => <button type="button" role="menuitemradio" aria-checked={choice.value === value} tabIndex={-1} key={choice.value} lang={choice.value} ref={element => { items.current[index] = element; }} onClick={() => { onChange(choice.value); close(); }}><span>{choice.label}</span>{choice.value === value && <Check size={16} aria-hidden="true" />}</button>)}</div>}
  </div>;
}
