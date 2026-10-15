import { t } from '../lib/language';
import { useEffect, useRef, useState } from 'react';
import { FlaskConical, LocateFixed, Plus, Trash2 } from 'lucide-react';
import type { Coordinate } from '../../shared/types';
import { api, send } from '../lib/api';
import { dateTime } from '../lib/format';

interface Scenario { id: string; title: string; description: string; enabled: boolean; closureIds: string[]; coordinates: Coordinate[]; timing: 'active' | 'future' | 'expired'; startsAt: string; endsAt: string }
interface Catalogue { at: string; scenarios: Scenario[] }
interface Props { at: string; revision: number; reload: () => Promise<void>; notify: (text: string) => void; onFocus: (coordinates: Coordinate[]) => void }
export default function DemoClosures({ at, revision, reload, notify, onFocus }: Props) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  // Time changes do not mutate an already enabled scenario's saved schedule.
  useEffect(() => { const controller = new AbortController(), request = ++sequence.current; api<Catalogue>(`/demos?at=${encodeURIComponent(at)}`, { signal: controller.signal }).then(result => { if (request === sequence.current) { setCatalogue(result); setError(''); } }).catch(reason => { if (!controller.signal.aborted && request === sequence.current) setError(reason instanceof Error ? reason.message : 'Demo scenarios unavailable.'); }); return () => controller.abort(); }, [at, revision]);
  async function toggle(scenarios: Scenario[], enabled: boolean) {
    setBusy(true); sequence.current++;
    try {
      for (const scenario of scenarios) setCatalogue(await send<Catalogue>('/demos', { scenario: scenario.id, at, enabled }));
      await reload(); setError(''); notify(enabled ? 'Demo closures added.' : 'Demo closures cleared.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update demos.'); await reload().catch(() => {}); }
    finally { setBusy(false); }
  }
  return <details className="demo-catalogue">
    <summary><FlaskConical size={18} />{t("Demo closures")}<span>{catalogue?.scenarios.filter(item => item.enabled).length ?? 0} {t("on")}</span></summary>
    <div className="demo-actions"><button className="text-button" disabled={busy || !catalogue?.scenarios.some(item => !item.enabled)} onClick={() => catalogue && toggle(catalogue.scenarios.filter(item => !item.enabled), true)}><Plus size={16} />{t("Add all")}</button><button className="text-button danger-text" disabled={busy || !catalogue?.scenarios.some(item => item.enabled)} onClick={() => catalogue && toggle(catalogue.scenarios.filter(item => item.enabled), false)}><Trash2 size={16} />{t("Clear demos")}</button></div>
    {error && <div className="error-box" role="alert">{t(error)}</div>}
    {!catalogue && !error && <p className="small muted">{t("Loading demos…")}</p>}
    {catalogue?.scenarios.map(item => <div className="demo-scenario" key={item.id}><label><input type="checkbox" disabled={busy} checked={item.enabled} onChange={event => toggle([item], event.target.checked)} /><span><strong>{item.title.replace(/^Demo\s*[·:]\s*/i, '')}</strong><small>{dateTime(item.startsAt)} {t("– ")}{dateTime(item.endsAt)}</small></span></label><button className="icon-button small" aria-label={`Show ${item.title} on map`} onClick={() => onFocus(item.coordinates)}><LocateFixed size={17} /></button></div>)}
    <span className="small muted">{t("Synthetic test events")}</span>
  </details>;
}
