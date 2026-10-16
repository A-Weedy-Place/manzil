import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './errors';
import type { Repository } from './repository';
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
  constructor(private store: Repository, readonly config = speechConfig(), private synthesize: Synthesizer = googleSynthesize) {}
  async status() {
    const month = new Date().toISOString().slice(0, 7);
    return { enabled: this.config.enabled, provider: 'google-cloud', usedCharacters: await this.store.speechUsage(month), monthlyCharacterLimit: this.config.monthlyCharacters };
  }
  async audio(language: Language, prompt: SpeechPrompt): Promise<Buffer> {
    if (!this.config.enabled) throw new HttpError(503, 'Cloud voice is not configured. Device voice is available when supported.');
    const text = speechText(prompt, language), voice = language === 'ur' ? this.config.urduVoice : this.config.englishVoice;
    if (!(language === 'ur' ? /^ur-IN-/ : /^en-[A-Z]{2}-/).test(voice)) throw new HttpError(503, 'The configured voice language is invalid.');
    const key = createHash('sha256').update(JSON.stringify([text, voice, 'MP3'])).digest('hex');
    const cached = await this.store.cachedSpeech(key);
    if (cached) return cached;
    const previous = this.pending.get(key); if (previous) return previous;
    if (this.pending.size >= 2) throw new HttpError(429, 'Voice service is busy. Try again shortly.');
    const characters = Array.from(text).length, month = new Date().toISOString().slice(0, 7);
    // Reserve before the request. Failed calls stay counted conservatively across restarts.
    const request = (async () => {
      await this.store.reserveSpeech(month, characters, this.config.monthlyCharacters);
      return this.synthesize(text, language, voice);
    })().then(async audio => {
      if (!audio.length || audio.length > 2_000_000) throw new Error('Invalid audio response.');
      await this.store.cacheSpeech(key, audio);
      return audio;
    }).catch(error => { if (error instanceof HttpError) throw error; throw new HttpError(503, 'Cloud voice is temporarily unavailable. Check configuration or use a device voice.'); }).finally(() => this.pending.delete(key));
    this.pending.set(key, request); return request;
  }
}
