import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Compass } from 'lucide-react';
import Modal from './Modal';
import { t } from '../lib/language';
import { useLanguage } from '../lib/useLanguage';
import { placeTourCard, type TourPlacement } from '../lib/tourLayout';

export const TOUR_KEY = 'manzil-tour-v1';
const steps = [
  { title: 'Welcome to Manzil', text: 'Find a clearer way through Islamabad. This short tour shows the essentials.', target: '' },
  { title: 'Choose your journey', text: 'Search for a destination, choose your start, and add stops if needed.', target: '[data-tour="search"] .place-field:last-child' },
  { title: 'Choose when to leave', text: 'Use Now for today, or pick a date and time to check scheduled closures.', target: '.map-time-trigger' },
  { title: 'Read the map', text: 'Blue lines are route choices. Red roads are closed at the selected time; amber markers are upcoming closures.', target: '.map-legend' },
  { title: 'Navigate with confidence', text: 'Find routes, select one, then start GPS guidance. Choose English or Urdu voice before you leave.', target: '.plan-button' },
  { title: 'Make it yours', text: 'Change language and map style here. Sign in to use saved journeys and personal history.', target: '[data-tour="language"]' },
  { title: 'Explore at your own pace', text: 'Try the street detour and labelled demo closures in the planner, or replay this tour from Help. This tour never changes roads or requests location.', target: '[data-tour="help"]' },
];
export function needsTour() { try { return !localStorage.getItem(TOUR_KEY); } catch { return true; } }
export default function WelcomeTour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0), [placement, setPlacement] = useState<TourPlacement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const { language } = useLanguage();
  const step = steps[index];
  function finish() { try { localStorage.setItem(TOUR_KEY, 'seen'); } catch { /* Device storage is optional. */ } onClose(); }
  useLayoutEffect(() => {
    const target = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    const details = target?.closest('details'), opened = details && !details.open;
    if (opened) details.open = true;
    const bounds = target?.getBoundingClientRect();
    if (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight)) target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    let frame = 0;
    const measure = () => {
      const viewport = window.visualViewport;
      const area = { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight };
      const rect = target?.getBoundingClientRect();
      const next = placeTourCard(rect ?? null, { width: Math.min(440, area.width - 24), height: Math.max(card.current?.scrollHeight ?? 0, card.current?.offsetHeight ?? 0, 220) }, area, language === 'ur');
      setPlacement(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (target) observer?.observe(target); if (card.current) observer?.observe(card.current);
    measure(); window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); if (opened && details) details.open = false; };
  }, [index, step, language]);
  const rect = placement?.target;
  const shade = rect ? `M0 0 H100000 V100000 H0 Z M${rect.left} ${rect.top} v${rect.height} h${rect.width} v-${rect.height} Z` : 'M0 0 H100000 V100000 H0 Z';
  const overlay = <><svg className="tour-shade" aria-hidden="true"><path d={shade} fill="rgba(12,25,36,.65)" fillRule="evenodd" /></svg>{rect && <div aria-hidden="true" className="tour-spotlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}</>;
  return <Modal titleId="tour-title" onClose={finish} className="tour-modal" cardRef={card} overlay={overlay} cardStyle={placement ? { position: 'fixed', top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight, margin: 0 } : undefined}>
    <div className="row between"><Compass size={28} /><span className="small muted" aria-live="polite">{index + 1} / {steps.length}</span></div>
    <h1 id="tour-title">{t(step.title)}</h1><p>{t(step.text)}</p>
    <div className="tour-dots" aria-hidden="true">{steps.map((_, i) => <i className={index === i ? 'active' : ''} key={i} />)}</div>
    <div className="row between"><button className="text-button" onClick={finish}>{t('Skip tour')}</button><div className="row">{index > 0 && <button className="secondary-button" onClick={() => setIndex(value => value - 1)}>{t('Previous')}</button>}<button className="primary-button" onClick={() => index === steps.length - 1 ? finish() : setIndex(value => value + 1)}>{t(index === steps.length - 1 ? 'Finish' : 'Next')}{index === steps.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}</button></div></div>
  </Modal>;
}
