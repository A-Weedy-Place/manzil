import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, CircleHelp, Moon, Sun } from 'lucide-react';
import type { WeatherResponse } from '../../shared/weather';
import { weatherCondition } from '../../shared/weather';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { t } from '../lib/language';

const HOUR = 3_600_000;
const icons = { sun: Sun, moon: Moon, 'cloud-sun': CloudSun, 'cloud-moon': CloudMoon, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, thunderstorm: CloudLightning, unknown: CircleHelp };

/** This public, city-level readout has no dependency on GPS, profiles or routing. */
export default function MapWeather({ at }: { at: string }) {
  const instant = Date.parse(at), hour = Number.isFinite(instant) ? new Date(Math.floor(instant / HOUR) * HOUR).toISOString() : '';
  const [result, setResult] = useState<{ hour: string; data: WeatherResponse | null } | null>(null);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!hour) return;
    let disposed = false, pending = false, lastAttempt = -Infinity;
    const controller = new AbortController();
    async function refresh() {
      if (pending || document.visibilityState === 'hidden' || Date.now() - lastAttempt < HOUR) return;
      lastAttempt = Date.now();
      pending = true;
      try {
        const data = await api<WeatherResponse>(`/weather?at=${encodeURIComponent(hour)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (!data || data.location !== 'Islamabad' || !['fresh', 'stale', 'unavailable'].includes(data.state)) throw new Error('Weather unavailable.');
        if (data.reading && (data.reading.at !== hour || !Number.isFinite(data.reading.temperatureC))) throw new Error('Weather hour does not match.');
        if (!disposed) setResult({ hour, data });
      } catch {
        if (!disposed) setResult({ hour, data: null });
      } finally { pending = false; }
    }
    void refresh();
    // Minute clock ticks and route changes never trigger weather requests.
    const timer = setInterval(() => { void refresh(); }, HOUR);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [hour]);
  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      if (!details.current?.open) return;
      if ('key' in event) {
        if (event.key === 'Escape') { details.current.open = false; details.current.querySelector('summary')?.focus(); }
      } else if (event.target instanceof Node && !details.current.contains(event.target)) details.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); };
  }, []);
  const data = result?.hour === hour ? result.data : undefined;
  const reading = data?.reading;
  const condition = reading ? weatherCondition(reading.weatherCode, reading.isDay) : null;
  const Icon = condition ? icons[condition.icon] : Cloud;
  const temperature = reading ? `${Math.round(reading.temperatureC)}°C` : data === undefined && hour ? '…' : '—';
  const status = data?.state === 'stale' ? t('Cached forecast') : reading ? t(condition!.label) : data === undefined && hour ? t('Loading weather') : t('Weather unavailable');
  return <details ref={details} className="map-weather" data-state={data?.state ?? 'unavailable'}>
    <summary aria-label={`${t('Islamabad weather')}: ${temperature}, ${status}`}>
      <Icon size={25} strokeWidth={1.8} aria-hidden="true" />
      <span className="map-weather-value"><strong dir="ltr">{temperature}</strong><small>{t('Islamabad')}</small></span>
      <span className="map-weather-condition">{status}</span>
    </summary>
    <div className="map-weather-details">
      <strong>{t('Islamabad weather')}</strong>
      <p>{reading ? `${temperature} · ${t(condition!.label)}` : t('Weather unavailable')}</p>
      {reading && <><span>{t('Hourly forecast')} · {dateTime(reading.at)}</span><span>{t('Updated')} · {dateTime(reading.fetchedAt)}</span></>}
      {data?.state === 'stale' && <p>{t('Cached forecast')}</p>}
      {!reading && <p>{t(data?.availableUntil && (instant >= Date.parse(data.availableUntil) || instant < Date.parse(data.availableFrom ?? '')) ? 'Weather is available within the forecast window only.' : 'Weather is temporarily unavailable.')}</p>}
      <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">{t('Weather by Open-Meteo')}</a>
    </div>
  </details>;
}
