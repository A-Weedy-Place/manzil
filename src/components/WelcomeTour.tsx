import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Compass } from 'lucide-react';
import Modal from './Modal';
import { t } from '../lib/language';
import { useLanguage } from '../lib/useLanguage';
import { placeTourCard, type TourPlacement } from '../lib/tourLayout';

export const TOUR_KEY = 'manzil-tour-v1';
export type TourView = 'journey' | 'closures' | 'commutes' | 'profile';
type TourStep = { title: string; text?: string; bullets?: string[]; target: string; view: TourView };
export const TOUR_STEPS: TourStep[] = [
  { title: 'Welcome to Manzil', text: 'Plan your journey around road closures.', target: '', view: 'journey' },
  { title: 'Starting point', text: 'Type a place, use your current location, or choose a point on the map.', target: '[data-tour="starting-point"]', view: 'journey' },
  { title: 'Destination', text: 'Choose where you want to go. You can search, use your location, or pick on the map.', target: '[data-tour="destination"]', view: 'journey' },
  { title: 'Add stops', text: 'Add up to five stops and arrange them in the order you want to visit.', target: '[data-tour="stops"]', view: 'journey' },
  { title: 'Plan ahead', text: 'Choose a future date and time in Plan ahead to see expected closures and routes.', target: '[data-tour="plan-ahead"]', view: 'journey' },
  { title: 'Read the map', bullets: ['Blue lines: your routes', 'Red roads: closed at the map time', 'Yellow markers: upcoming road closures'], target: '.map-legend', view: 'journey' },
  { title: 'Find routes and navigate', text: 'Find routes, choose one, then select Navigate. English and Urdu voice guidance are available.', target: '.plan-button', view: 'journey' },
  { title: 'Choose your language', text: 'Select English or Urdu here.', target: '[data-tour="language"]', view: 'journey' },
  { title: 'Style your map', text: 'Choose a map style and show or hide road closures with these controls.', target: '[data-tour="map-controls"]', view: 'journey' },
  { title: 'Road closures', text: 'See closures, their locations and scheduled times. Open a report for more details.', target: '[data-tour="nav-closures"]', view: 'closures' },
  { title: 'Save your daily routes', text: 'Sign in to save regular journeys and receive journey alerts when a closure affects them.', target: '[data-tour="nav-saved"]', view: 'commutes' },
  { title: 'Your profile', text: 'Manage your profile, vehicle, preferences and optional monthly travel statistics here.', target: '[data-tour="nav-profile"]', view: 'profile' },
  { title: 'Explore at your own pace', text: 'Explore the map, or replay this tour from Help or Profile.', target: '[data-tour="help"]', view: 'journey' },
];
export default function WelcomeTour({ onClose, onViewChange }: { onClose: () => void; onViewChange?: (view: TourView) => void }) {
  const [index, setIndex] = useState(0), [placement, setPlacement] = useState<TourPlacement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const { language } = useLanguage();
  const step = TOUR_STEPS[index];
  function finish() { try { localStorage.setItem(TOUR_KEY, 'seen'); } catch { /* Device storage is optional. */ } onClose(); }
  useLayoutEffect(() => { onViewChange?.(step.view); }, [step.view, onViewChange]);
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
    measure(); schedule(); window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); if (opened && details) details.open = false; };
  }, [index, step, language]);
  const rect = placement?.target;
  const shade = rect ? `M0 0 H100000 V100000 H0 Z M${rect.left} ${rect.top} v${rect.height} h${rect.width} v-${rect.height} Z` : 'M0 0 H100000 V100000 H0 Z';
  const overlay = <><svg className="tour-shade" aria-hidden="true"><path d={shade} fill="rgba(12,25,36,.65)" fillRule="evenodd" /></svg>{rect && <div aria-hidden="true" className="tour-spotlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}</>;
  return <Modal titleId="tour-title" onClose={finish} className="tour-modal" cardRef={card} overlay={overlay} cardStyle={placement ? { position: 'fixed', top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight, margin: 0 } : undefined}>
    <div className="row between"><Compass size={28} /><span className="small muted" aria-live="polite">{index + 1} / {TOUR_STEPS.length}</span></div>
    <h1 id="tour-title">{t(step.title)}</h1>{step.text && <p>{t(step.text)}</p>}{step.bullets && <ul className="tour-map-key">{step.bullets.map((bullet, key) => <li key={bullet}><i aria-hidden="true" className={`tour-key-${key}`} />{t(bullet)}</li>)}</ul>}
    <div className="tour-dots" aria-hidden="true">{TOUR_STEPS.map((_, i) => <i className={index === i ? 'active' : ''} key={i} />)}</div>
    <div className="row between"><button className="text-button" onClick={finish}>{t('Skip tour')}</button><div className="row">{index > 0 && <button className="secondary-button" onClick={() => setIndex(value => value - 1)}>{t('Previous')}</button>}<button className="primary-button" onClick={() => index === TOUR_STEPS.length - 1 ? finish() : setIndex(value => value + 1)}>{t(index === TOUR_STEPS.length - 1 ? 'Finish' : 'Next')}{index === TOUR_STEPS.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}</button></div></div>
  </Modal>;
}
