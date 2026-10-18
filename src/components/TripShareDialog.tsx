import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Download, Share2 } from 'lucide-react';
import type { MapStyleId, Trip } from '../../shared/types';
import { getAuthSession } from '../lib/auth';
import { downloadJSON } from '../lib/format';
import { t } from '../lib/language';
import { downloadTripImage, renderTripShareImage, type TripShareImage } from '../lib/tripShareImage';
import { tripTraceSections, usableTracePoints } from '../lib/tripTrace';

/** Inline in the existing history panel, avoiding nested modal focus traps. */
export default function TripShareDialog({ trip, owner, mapStyle, onClose }: { trip: Trip; owner: string; mapStyle?: MapStyleId; onClose: () => void }) {
  const title = useId(), [image, setImage] = useState<(TripShareImage & { url: string }) | null>(null);
  const [error, setError] = useState(''), [sharing, setSharing] = useState(false), [attempt, setAttempt] = useState(0);
  const mounted = useRef(false), generation = useRef(0);
  const owns = () => mounted.current && getAuthSession().user?.uid === owner;
  useEffect(() => {
    const controller = new AbortController(), version = ++generation.current; let url = '';
    mounted.current = true; setImage(null); setError(''); setSharing(false);
    renderTripShareImage(trip, { signal: controller.signal, mapStyle }).then(result => {
      if (controller.signal.aborted || version !== generation.current || !owns()) return;
      url = URL.createObjectURL(result.blob); setImage({ ...result, url });
    }).catch(() => { if (!controller.signal.aborted && version === generation.current && owns()) setError('Could not create your trip image. Try again.'); });
    return () => { mounted.current = false; generation.current++; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [trip, owner, mapStyle, attempt]);
  const filename = `manzil-trip-${trip.id}.png`;
  function downloadable() { return image && owns() ? image.blob : null; }
  function exportGeometry() {
    if (!owns()) return;
    const sections = tripTraceSections(trip.points);
    downloadJSON(`manzil-trip-${trip.id}.geojson`, { type: 'Feature', properties: { name: trip.name, startedAt: trip.startedAt, endedAt: trip.endedAt,
      ...(trip.demoData ? { simulated: true, provenance: 'Fictional trip generated from the public OpenStreetMap road graph; no device GPS was captured.' } : {}) },
      geometry: sections.length === 1 ? { type: 'LineString', coordinates: sections[0] } : sections.length ? { type: 'MultiLineString', coordinates: sections } : { type: 'MultiPoint', coordinates: usableTracePoints(trip.points).map(point => point.coordinate) } });
  }
  function shareFile() {
    const blob = downloadable(); if (!blob || !navigator.share || sharing) return;
    const version = generation.current; setSharing(true); setError('');
    navigator.share({ title: `${trip.name} · Manzil`, files: [new File([blob], filename, { type: 'image/png' })] }).catch(error => {
      if (owns() && version === generation.current && (error as Error)?.name !== 'AbortError') setError('Sharing is unavailable here. Download the PNG instead.');
    }).finally(() => { if (owns() && version === generation.current) setSharing(false); });
  }
  let canShare = false;
  try { canShare = !!image && typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [new File([image.blob], filename, { type: 'image/png' })] }); } catch { /* PNG download remains available. */ }
  return <section className="trip-share-panel" aria-labelledby={title}>
    <header className="trip-share-heading"><button type="button" className="icon-button" aria-label={t('Back to trip history')} onClick={onClose}><ArrowLeft size={20} /></button><h2 id={title}>{t('Share journey')}</h2></header>
    {error && <p className="error-box" role="alert">{t(error)} {!image && <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>{t('Retry')}</button>}</p>}
    {!image && !error && <div className="trip-share-loading" role="status"><Share2 size={26} /><strong>{t('Creating your trip image…')}</strong></div>}
    {image && <><img className="trip-share-preview" src={image.url} alt={`${t('Journey map and statistics')}: ${trip.name}`} />
      {image.basemap === 'illustration' && <p className="small muted" role="status">{t('Map tiles unavailable. This image uses a route illustration.')}</p>}
      <p className="trip-share-privacy">{t('Includes your route, endpoints and journey details.')}</p>
      <div className="trip-share-actions"><button type="button" className="primary-button" onClick={() => { const blob = downloadable(); if (blob) downloadTripImage(blob, filename); }}><Download size={17} />{t('Download PNG')}</button>{canShare && <button type="button" className="secondary-button" disabled={sharing} onClick={shareFile}><Share2 size={17} />{t(sharing ? 'Sharing…' : 'Share image')}</button>}</div>
    </>}
    <details className="trip-share-data"><summary>{t('More options')}</summary><button type="button" className="text-button" onClick={exportGeometry}><Download size={15} />{t('Download GeoJSON')}</button></details>
  </section>;
}
