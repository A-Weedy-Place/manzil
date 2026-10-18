import type { Coordinate } from './types.js';

/** Fixed MVP city; never replaced by a user's location or trip coordinates. */
export const ISLAMABAD_WEATHER_COORDINATE: Coordinate = [73.0479, 33.6844];
export const WEATHER_SOURCE_URL = 'https://open-meteo.com/';
export interface WeatherReading {
  location: 'Islamabad'; coordinate: Coordinate;
  /** Beginning of the matching hourly forecast interval, in UTC. */
  at: string; temperatureC: number; weatherCode: number; isDay: boolean;
  fetchedAt: string; source: 'Open-Meteo'; sourceUrl: string;
}
export interface WeatherResponse {
  location: 'Islamabad'; at: string; state: 'fresh' | 'stale' | 'unavailable';
  reading: WeatherReading | null; fetchedAt: string | null; nextRefreshAt: string | null;
  availableFrom: string | null; availableUntil: string | null; message: string;
}
export type WeatherIcon = 'sun' | 'moon' | 'cloud-sun' | 'cloud-moon' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunderstorm' | 'unknown';
/** Open-Meteo WMO interpretation, shared by the header and exported trip cards. */
export function weatherCondition(code: number, isDay: boolean): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: isDay ? 'Clear sky' : 'Clear night', icon: isDay ? 'sun' : 'moon' };
  if (code === 1 || code === 2) return { label: code === 1 ? 'Mainly clear' : 'Partly cloudy', icon: isDay ? 'cloud-sun' : 'cloud-moon' };
  if (code === 3) return { label: 'Overcast', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: code === 45 ? 'Fog' : 'Freezing fog', icon: 'fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: code >= 56 ? 'Freezing drizzle' : 'Drizzle', icon: 'drizzle' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: code === 66 || code === 67 ? 'Freezing rain' : code >= 80 ? 'Rain showers' : 'Rain', icon: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Snow', icon: 'snow' };
  if ([95, 96, 97, 99].includes(code)) return { label: code === 96 || code === 99 ? 'Thunderstorm with hail' : 'Thunderstorm', icon: 'thunderstorm' };
  return { label: 'Weather unavailable', icon: 'unknown' };
}
