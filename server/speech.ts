import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './errors';
import { Store } from './store';
import { speechText, type Language, type SpeechPrompt } from '../shared/speech';

export const speechSchema = z.object({ language: z.enum(['en', 'ur']), prompt: z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('turn'), turn: z.enum(['left', 'right', 'straight', 'start', 'arrive']), road: z.string().trim().max(100).optional(), distance: z.number().int().min(0).max(3000).optional() }).strict(),
  z.object({ kind: z.enum(['rerouting', 'gps_lost', 'unavailable', 'test']) }).strict(),
]) }).strict();
export interface SpeechConfig { enabled: boolean; monthlyCharacters: number; englishVoice: string; urduVoice: string }
export type Synthesizer = (text: string, language: Language, voice: string) => Promise<Buffer>;
export function speechConfig(): SpeechConfig {
  const limit = Number(process.env.TTS_MONTHLY_CHARACTER_LIMIT ?? 100_000);
  return { enabled: process.env.TTS_ENABLED === 'true', monthlyCharacters: Number.isSafeInteger(limit) && limit > 0 ? limit : 100_000,
    englishVoice: process.env.TTS_ENGLISH_VOICE ?? 'en-GB-Wavenet-A', urduVoice: process.env.TTS_URDU_VOICE ?? 'ur-IN-Wavenet-A' };
}
let client: import('@google-cloud/text-to-speech').TextToSpeechClient | undefined;
const googleSynthesize: Synthesizer = async (text, language, voice) => {
  if (!client) { const { TextToSpeechClient } = await import('@google-cloud/text-to-speech'); client = new TextToSpeechClient(); }
  const [response] = await client.synthesizeSpeech({ input: { text }, voice: { languageCode: language === 'ur' ? 'ur-IN' : voice.split('-').slice(0, 2).join('-'), name: voice }, audioConfig: { audioEncoding: 'MP3' } }, { timeout: 7000, retry: null });
  if (!response.audioContent) throw new Error('Empty speech response.');
  return typeof response.audioContent === 'string' ? Buffer.from(response.audioContent, 'base64') : Buffer.from(response.audioContent);
};

/** ADC works locally and with an attached Cloud Run identity. No browser key or JSON credential upload. */
export class SpeechService {
  private pending = new Map<string, Promise<Buffer>>();
  constructor(private store: Store, readonly config = speechConfig(), private synthesize: Synthesizer = googleSynthesize) {
    store.db.exec('CREATE TABLE IF NOT EXISTS speech_cache (key TEXT PRIMARY KEY, audio BLOB NOT NULL, accessed_at INTEGER NOT NULL)');
  }
  status() {
    const month = new Date().toISOString().slice(0, 7);
    return { enabled: this.config.enabled, provider: 'google-cloud', usedCharacters: this.store.meta<number>(`speech:${month}`) ?? 0, monthlyCharacterLimit: this.config.monthlyCharacters };
  }
  async audio(language: Language, prompt: SpeechPrompt): Promise<Buffer> {
    if (!this.config.enabled) throw new HttpError(503, 'Cloud voice is not configured. Device voice is available when supported.');
    const text = speechText(prompt, language), voice = language === 'ur' ? this.config.urduVoice : this.config.englishVoice;
    if (!(language === 'ur' ? /^ur-IN-/ : /^en-[A-Z]{2}-/).test(voice)) throw new HttpError(503, 'The configured voice language is invalid.');
    const key = createHash('sha256').update(JSON.stringify([text, voice, 'MP3'])).digest('hex');
    const cached = this.store.db.prepare('SELECT audio FROM speech_cache WHERE key=?').get(key);
    if (cached) { this.store.db.prepare('UPDATE speech_cache SET accessed_at=? WHERE key=?').run(Date.now(), key); return Buffer.from(cached.audio as Uint8Array); }
    const previous = this.pending.get(key); if (previous) return previous;
    if (this.pending.size >= 2) throw new HttpError(429, 'Voice service is busy. Try again shortly.');
    const characters = Array.from(text).length, monthKey = `speech:${new Date().toISOString().slice(0, 7)}`;
    // Reserve before the request. Failed calls stay counted conservatively across restarts.
    this.store.transaction(() => {
      const used = this.store.meta<number>(monthKey) ?? 0;
      if (used + characters > this.config.monthlyCharacters) throw new HttpError(429, 'The configured monthly voice allowance has been reached.');
      this.store.setMeta(monthKey, used + characters);
    });
    const request = this.synthesize(text, language, voice).then(audio => {
      if (!audio.length || audio.length > 2_000_000) throw new Error('Invalid audio response.');
      this.store.db.prepare('INSERT OR REPLACE INTO speech_cache(key,audio,accessed_at) VALUES(?,?,?)').run(key, audio, Date.now());
      this.store.db.exec('DELETE FROM speech_cache WHERE key NOT IN (SELECT key FROM speech_cache ORDER BY accessed_at DESC LIMIT 256)');
      return audio;
    }).catch(() => { throw new HttpError(503, 'Cloud voice is temporarily unavailable. Check configuration or use a device voice.'); }).finally(() => this.pending.delete(key));
    this.pending.set(key, request); return request;
  }
}
