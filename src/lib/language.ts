import { urdu } from './urdu';
import type { Language } from '../../shared/speech';
let current: Language = 'en';
try { if (typeof localStorage !== 'undefined' && localStorage.getItem('manzil-language') === 'ur') current = 'ur'; } catch { /* Private browsing may disable storage. */ }
const listeners = new Set<() => void>();
export const getLanguage = () => current;
export const subscribeLanguage = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function setLanguage(language: Language) {
  current = language;
  try { localStorage.setItem('manzil-language', language); } catch { /* Keep the in-memory choice. */ }
  for (const listener of listeners) listener();
}
export function translate(text: string, language: Language): string {
  if (language === 'en' || !text) return text;
  const trimmed = text.trim(), translated = urdu[trimmed];
  if (translated !== undefined) return text.replace(trimmed, translated);
  // Format dynamic, app-owned messages without changing source evidence or road names.
  const patterns: [RegExp, (match: RegExpMatchArray) => string][] = [
    [/^Step (\d+) of (\d+)$/, m => `مرحلہ ${m[1]} از ${m[2]}`],
    [/^Stop (\d+)$/, m => `پڑاؤ ${m[1]}`],
    [/^(\d+) min$/, m => `${m[1]} منٹ`], [/^(\d+) hr (\d+) min$/, m => `${m[1]} گھنٹے ${m[2]} منٹ`],
    [/^([\d.]+) km$/, m => `${m[1]} کلومیٹر`], [/^(\d+) m$/, m => `${m[1]} میٹر`],
    [/^GPS estimate · reported accuracy about (\d+) m$/, m => `جی پی ایس کی تخمینی درستگی تقریباً ${m[1]} میٹر`],
    [/^Leave (\d+) minutes earlier$/, m => `${m[1]} منٹ پہلے روانگی`], [/^Leave (\d+) minutes later$/, m => `${m[1]} منٹ بعد روانگی`],
    [/^To (.+)$/, m => `${m[1]} کی طرف`], [/^Via (.+)$/, m => `براستہ ${m[1]}`],
    [/^(.+) ahead$/, m => `${translate(m[1], language)} آگے`],
    [/^(?:Continue on|Start on|Head onto) (.+)$/, m => `${m[1]} پر آگے بڑھیں`],
    [/^Bear left toward (.+)$/, m => `${m[1]} کی طرف بائیں مڑیں`], [/^Bear right toward (.+)$/, m => `${m[1]} کی طرف دائیں مڑیں`],
    [/^Follow the route around toward (.+)$/, m => `${m[1]} کی طرف راستے کے مطابق مڑیں`],
    [/^Add at least (\d+) points? to the map\.$/, m => `نقشے پر کم از کم ${m[1]} نقاط شامل کریں۔`],
    [/^Alternative(?: route)? (\d+)$/, m => `متبادل راستہ ${m[1]}`],
    [/^Select the start, destination and stops within (\d+) metres of a supported public car-road node\.$/, m => `روانگی، منزل اور پڑاؤ عوامی سڑک سے ${m[1]} میٹر کے اندر منتخب کریں۔`],
    [/^Pins snapped to road nodes \((.+)\)\. Access between each pin and its snapped point is not routed\.$/, m => `منتخب مقامات کو قریبی سڑک سے ملایا گیا ہے (${m[1]})۔ نشان سے سڑک تک رسائی راستے میں شامل نہیں۔`],
    [/^Until (.+)$/, m => `${m[1]} تک`], [/^Leave (.+)$/, m => `روانگی ${m[1]}`],
    [/^Move stop (\d+) earlier$/, m => `پڑاؤ ${m[1]} پہلے کریں`], [/^Move stop (\d+) later$/, m => `پڑاؤ ${m[1]} بعد میں کریں`], [/^Remove stop (\d+)$/, m => `پڑاؤ ${m[1]} ہٹائیں`],
    [/^Choose (.+) on map$/, m => `نقشے پر ${translate(m[1], language)} منتخب کریں`], [/^Clear (.+)$/, m => `${translate(m[1], language)} صاف کریں`],
  ];
  for (const [pattern, format] of patterns) { const match = trimmed.match(pattern); if (match) return text.replace(trimmed, format(match)); }
  return text;
}
export const t = (text: string) => translate(text, current);
