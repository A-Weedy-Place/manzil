export type Language = 'en' | 'ur';
export type SpeechPrompt = { kind: 'turn'; turn: 'left' | 'right' | 'straight' | 'start' | 'arrive'; road?: string; distance?: number }
  | { kind: 'rerouting' | 'gps_lost' | 'unavailable' | 'test' };

/** One deterministic vocabulary supplies screen instructions and both speech providers. */
export function speechText(prompt: SpeechPrompt, language: Language): string {
  const urdu = language === 'ur';
  if (prompt.kind !== 'turn') return ({
    rerouting: ['Updating your route.', 'آپ کا راستہ تبدیل کیا جا رہا ہے۔'],
    gps_lost: ['Waiting for your location. Directions are paused.', 'آپ کے مقام کا انتظار ہے۔ ہدایات عارضی طور پر روک دی گئی ہیں۔'],
    unavailable: ['No clear route is available. Directions are paused.', 'کوئی کھلا راستہ دستیاب نہیں۔ ہدایات عارضی طور پر روک دی گئی ہیں۔'],
    test: ['Voice guidance is ready. In 200 metres, turn left.', 'صوتی رہنمائی تیار ہے۔ دو سو میٹر کے بعد بائیں مڑیں۔'],
  }[prompt.kind])[urdu ? 1 : 0];
  const road = prompt.road?.trim();
  const turn = ({ left: ['Turn left', 'بائیں مڑیں'], right: ['Turn right', 'دائیں مڑیں'], straight: ['Continue straight', 'سیدھا چلتے رہیں'],
    start: ['Join the route', 'راستے پر آگے بڑھیں'], arrive: ['You are near the destination. Check your stopping place', 'آپ منزل کے قریب ہیں۔ رکنے کی مناسب جگہ دیکھیں'] }[prompt.turn])[urdu ? 1 : 0];
  const prefix = prompt.distance && prompt.distance >= 40 ? urdu ? `${Math.round(prompt.distance)} میٹر کے بعد، ` : `In ${Math.round(prompt.distance)} metres, ` : '';
  if (prompt.turn === 'straight' && prompt.distance && prompt.distance >= 40) return urdu ? `${Math.round(prompt.distance)} میٹر تک سیدھا چلتے رہیں۔` : `Continue straight for ${Math.round(prompt.distance)} metres.`;
  return `${prefix}${turn}${road && prompt.turn !== 'arrive' ? urdu ? `، ${road} کی طرف` : ` toward ${road}` : ''}${urdu ? '۔' : '.'}`;
}
