import type { SpeechPrompt } from './speech';

/** Fixed local audio contains no user's road names, coordinates or account data. */
export const URDU_VOICE_PACK = 'ur-f3-v1';
export const URDU_AHEAD_DISTANCES = [50, 75, 100, 125, 150, 175, 200, 225] as const;
const distanceWords: Record<number, string> = { 50: 'پچاس', 75: 'پچھتر', 100: 'ایک سو', 125: 'ایک سو پچیس', 150: 'ڈیڑھ سو', 175: 'ایک سو پچھتر', 200: 'دو سو', 225: 'دو سو پچیس' };

/** Input to the reproducible development-only generator, not an in-browser TTS model. */
export const URDU_AUDIO_PHRASES: Readonly<Record<string, string>> = Object.freeze({
  left: 'بائیں مڑیں۔', right: 'دائیں مڑیں۔', straight: 'سیدھا چلتے رہیں۔', start: 'راستے پر آگے بڑھیں۔',
  arrive: 'آپ منزل کے قریب ہیں۔ رکنے کی مناسب جگہ دیکھیں۔',
  rerouting: 'آپ کا راستہ تبدیل کیا جا رہا ہے۔',
  gps_lost: 'آپ کے مقام کا انتظار ہے۔ ہدایات عارضی طور پر روک دی گئی ہیں۔',
  unavailable: 'کوئی کھلا راستہ دستیاب نہیں۔ ہدایات عارضی طور پر روک دی گئی ہیں۔',
  test: 'صوتی رہنمائی تیار ہے۔ دو سو میٹر کے بعد بائیں مڑیں۔',
  ...Object.fromEntries(URDU_AHEAD_DISTANCES.flatMap(distance => [
    [`after-${distance}`, `${distanceWords[distance]} میٹر کے بعد،`],
    [`straight-${distance}`, `${distanceWords[distance]} میٹر تک سیدھا چلتے رہیں۔`],
  ])),
});

/** Unsupported distances are omitted instead of announcing an inaccurate nearby number. */
export function urduAudioClips(prompt: SpeechPrompt): string[] {
  if (prompt.kind !== 'turn') return [prompt.kind];
  if (prompt.turn === 'arrive') return ['arrive'];
  const distance = prompt.distance;
  const exact = distance !== undefined && URDU_AHEAD_DISTANCES.some(value => value === distance);
  if (prompt.turn === 'straight' && exact) return [`straight-${distance}`];
  return exact ? [`after-${distance}`, prompt.turn] : [prompt.turn];
}

export function urduAudioPath(clip: string): string {
  if (!Object.hasOwn(URDU_AUDIO_PHRASES, clip)) throw new Error('Unknown navigation audio.');
  return `/audio/navigation/${URDU_VOICE_PACK}/${clip}.wav`;
}
