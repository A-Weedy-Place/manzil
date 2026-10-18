/** Conservative source-to-clock checks. Unsupported date phrasing stays in review. */
const normalizeDigits = (text: string) => text.replace(/[۰-۹٠-٩]/g, digit => String(digit.charCodeAt(0) - (digit >= '۰' ? 0x6f0 : 0x660)));
const pkt = (at: string) => new Date(Date.parse(at) + 5 * 3600_000).toISOString();
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
export function sourceSupportsInstant(text: string, at: string, publication: string): boolean {
  const source = normalizeDigits(text).toLowerCase().replace(/\b([ap])\s*\.\s*m\.?/g, '$1m').replace(/\b(\d{1,2})\s*(?:to|[-\u2013])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/g, (all, first, last, minute, period) => Number(first) <= Number(last) ? `${first} ${period} to ${last}:${minute ?? '00'} ${period}` : all), local = pkt(at), date = local.slice(0, 10);
  const day = Number(local.slice(8, 10)), month = Number(local.slice(5, 7)), year = Number(local.slice(0, 4));
  const originalDay = pkt(publication).slice(0, 10), tomorrow = pkt(new Date(Date.parse(publication) + 86400_000).toISOString()).slice(0, 10);
  const namedDate = [...source.matchAll(new RegExp(`\\b${day}\\s+${months[month - 1]}(?:\\s+(\\d{4}))?\\b`, 'g'))]
    .some(match => match[1] ? Number(match[1]) === year : pkt(publication).slice(0, 4) === String(year));
  const numericDate = [...source.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/g)].some(match => Number(match[1]) === day && Number(match[2]) === month && Number(match[3]) === (match[3].length===2 ? year%100 : year));
  const dated = numericDate || source.includes(date) || namedDate || date === originalDay && /\btoday\b|آج/.test(source) || date === tomorrow && /\btomorrow\b/.test(source);
  if (!dated) return false;
  const target = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  const clocks = source.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g);
  for (const match of clocks) {
    if (!match[2] && !match[3]) continue;
    let hour = Number(match[1]); const minute = Number(match[2] ?? 0);
    if (minute > 59 || hour > (match[3] ? 12 : 23) || match[3] && hour < 1) continue;
    if (match[3]) hour = hour % 12 + (match[3] === 'pm' ? 12 : 0);
    if (hour * 60 + minute === target) return true;
  }
  return false;
}
