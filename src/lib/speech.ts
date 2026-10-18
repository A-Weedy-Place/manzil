import { speechText, type Language, type SpeechPrompt } from '../../shared/speech';
import { urduAudioClips, urduAudioPath } from '../../shared/offlineSpeech';
import { t } from './language';
import { authorizationHeaders, getAuthSession } from './auth';

/** Web Speech exposes no standard gender field. Prefer identifiable female voices, never pitch-shift a male voice. */
export function selectNavigationVoice(voices: readonly SpeechSynthesisVoice[], language: Language): SpeechSynthesisVoice | undefined {
  const eligible = voices.filter(voice => voice.lang.toLowerCase().replaceAll('_', '-').split('-')[0] === language);
  const preferred = language === 'ur' ? 'ur-pk' : 'en-pk';
  const female = /\b(?:female|zira|hazel|susan|samantha|karen|moira|tessa|serena|sonia(?:neural)?|aria(?:neural)?|jenny(?:neural)?|natasha(?:neural)?|uzma(?:neural)?|gul(?:neural)?)\b/i;
  const score = (voice: SpeechSynthesisVoice) => (female.test(voice.name) ? 100 : 0) + (voice.lang.toLowerCase().replaceAll('_', '-') === preferred ? 10 : 0) + (voice.localService ? 2 : 0) + (voice.default ? 1 : 0);
  return eligible.map((voice, index) => ({ voice, index })).sort((a, b) => score(b.voice) - score(a.voice) || a.index - b.index)[0]?.voice;
}

/** Join our small PCM pack into one playback to avoid a pause between a distance and its turn. */
export async function combineNavigationWav(blobs: readonly Blob[]): Promise<Blob> {
  const buffers = await Promise.all(blobs.map(blob => blob.arrayBuffer()));
  const chunks = buffers.map(buffer => {
    const view = new DataView(buffer);
    if (buffer.byteLength < 44 || new TextDecoder().decode(buffer.slice(0, 4)) !== 'RIFF' || new TextDecoder().decode(buffer.slice(8, 16)) !== 'WAVEfmt ' || new TextDecoder().decode(buffer.slice(36, 40)) !== 'data'
      || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 16000 || view.getUint16(34, true) !== 16
      || view.getUint32(28, true) !== 32000 || view.getUint16(32, true) !== 2 || view.getUint32(4, true) !== buffer.byteLength - 8
      || view.getUint32(40, true) !== buffer.byteLength - 44 || (buffer.byteLength - 44) % 2 !== 0 || buffer.byteLength > 500_000) throw new Error('Invalid basic voice audio.');
    return new Uint8Array(buffer, 44);
  });
  if (!buffers.length) throw new Error('Missing basic voice audio.');
  const bytes = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(44 + bytes); result.set(new Uint8Array(buffers[0], 0, 44));
  const header = new DataView(result.buffer); header.setUint32(4, 36 + bytes, true); header.setUint32(40, bytes, true);
  let offset = 44; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return new Blob([result.buffer], { type: 'audio/wav' });
}

/** A cancelled route/session/account can never play late audio. Cache audio, never route positions. */
export class NavigationSpeaker {
  private generation = 0;
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private cache = new Map<string, Promise<Blob>>();
  private pack = new Map<string, Promise<Blob>>();
  private cloudUnavailableUntil = 0;
  private cloudStatus: { expires: number; request: Promise<boolean> } | null = null;
  private missingDeviceUntil = new Map<Language, number>();
  private owner = this.account();
  private cancelWait: (() => void) | null = null;
  private account() { return getAuthSession().user?.uid ?? 'guest'; }
  private releaseAudio() {
    if (this.audio) { this.audio.pause(); this.audio.src = ''; this.audio = null; }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
  }
  cancel() {
    this.generation++;
    this.cancelWait?.(); this.cancelWait = null;
    this.releaseAudio();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    if (this.owner !== this.account()) { this.owner = this.account(); this.cache.clear(); this.cloudStatus = null; this.cloudUnavailableUntil = 0; }
  }
  private current(generation: number, owner: string) { return generation === this.generation && owner === this.account(); }
  private configured(owner: string): Promise<boolean> {
    if (this.cloudStatus && this.cloudStatus.expires > Date.now()) return this.cloudStatus.request;
    const request = authorizationHeaders().then(headers => {
      if (owner !== this.account()) return null;
      return fetch('/api/speech/status', { headers, signal: AbortSignal.timeout(4000) });
    }).then(async response => !!response?.ok && (await response.json() as { enabled?: boolean }).enabled === true).catch(() => false);
    this.cloudStatus = { request, expires: Date.now() + 60000 }; return request;
  }
  private async cloud(prompt: SpeechPrompt, language: Language, owner: string, generation: number): Promise<Blob> {
    if (!this.current(generation, owner)) throw new Error('Speech cancelled.');
    if (Date.now() < this.cloudUnavailableUntil) throw new Error('Cloud speech unavailable.');
    const configured = await this.configured(owner);
    if (!this.current(generation, owner)) throw new Error('Speech cancelled.');
    if (!configured) throw new Error('Cloud speech unavailable.');
    const key = JSON.stringify([owner, language, prompt]);
    const cached = this.cache.get(key); if (cached) return cached;
    // Pending credential/config reads cannot spend allowance after Stop or a language/route change.
    // Keep cancellation outside the provider-failure branch and only cache requests that actually began.
    const headers = await authorizationHeaders();
    if (!this.current(generation, owner)) throw new Error('Speech cancelled.');
    const concurrent = this.cache.get(key); if (concurrent) return concurrent;
    const request = fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ language, prompt }), signal: AbortSignal.timeout(10000) })
      .then(response => { if (!response.ok || !response.headers.get('Content-Type')?.startsWith('audio/')) throw new Error('Cloud speech unavailable.'); return response.blob(); })
      .catch(error => { if (this.cache.get(key) === request) this.cache.delete(key); if (owner === this.account()) this.cloudUnavailableUntil = Date.now() + 60000; throw error; });
    this.cache.set(key, request); if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!); return request;
  }
  private async basicUrdu(prompt: SpeechPrompt): Promise<Blob> {
    const blobs = urduAudioClips(prompt).map(clip => {
      const cached = this.pack.get(clip); if (cached) return cached;
      const request = fetch(urduAudioPath(clip), { signal: AbortSignal.timeout(10000) }).then(response => {
        if (!response.ok) throw new Error('Basic Urdu voice unavailable.'); return response.blob();
      }).catch(error => { this.pack.delete(clip); throw error; });
      this.pack.set(clip, request); return request;
    });
    return combineNavigationWav(await Promise.all(blobs));
  }
  prepare(prompt: SpeechPrompt, language: Language) {
    const owner = this.account(), generation = this.generation;
    // A user must explicitly enable/test voice before the panel preloads any audio.
    if (language === 'ur') void this.basicUrdu(prompt).catch(() => {});
    else void this.cloud(prompt, language, owner, generation).catch(() => {});
  }
  private async deviceVoice(language: Language): Promise<SpeechSynthesisVoice | undefined> {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const initial = selectNavigationVoice(synth.getVoices(), language); if (initial) return initial;
    if ((this.missingDeviceUntil.get(language) ?? 0) > Date.now()) return;
    await new Promise<void>(resolve => {
      const complete = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', loaded); if (this.cancelWait === complete) this.cancelWait = null; resolve(); };
      const loaded = () => { if (selectNavigationVoice(synth.getVoices(), language)) complete(); };
      const timer = setTimeout(complete, 900);
      this.cancelWait = complete; synth.addEventListener('voiceschanged', loaded); loaded();
    });
    const loaded = selectNavigationVoice(synth.getVoices(), language);
    if (!loaded) this.missingDeviceUntil.set(language, Date.now() + 30000);
    return loaded;
  }
  private async play(blob: Blob, generation: number, owner: string, report: (message: string) => void, label: string) {
    if (!this.current(generation, owner)) return;
    this.url = URL.createObjectURL(blob); const audio = this.audio = new Audio(this.url);
    audio.onended = () => { if (this.current(generation, owner)) this.cancel(); };
    audio.onerror = () => { if (this.current(generation, owner)) report(t('Voice could not play. Tap Test voice and check audio permissions.')); };
    try { await audio.play(); if (this.current(generation, owner)) report(t(label)); }
    catch (error) { if (this.audio === audio) this.releaseAudio(); throw error; }
  }
  private async offline(prompt: SpeechPrompt, generation: number, owner: string, report: (message: string) => void) {
    try { await this.play(await this.basicUrdu(prompt), generation, owner, report, 'Basic Urdu voice'); }
    catch { if (this.current(generation, owner)) report(t('Voice could not play. Tap Test voice and check audio permissions.')); }
  }
  async speak(prompt: SpeechPrompt, language: Language, report: (message: string) => void = () => {}) {
    this.cancel(); const generation = this.generation, owner = this.account();
    try { await this.play(await this.cloud(prompt, language, owner, generation), generation, owner, report, 'Google Cloud voice'); return; }
    catch { /* A configured cloud provider remains optional; device/basic audio needs no paid service. */ }
    if (!this.current(generation, owner)) return;
    let voice: SpeechSynthesisVoice | undefined;
    try { voice = await this.deviceVoice(language); } catch { /* A failed device catalogue must not disable the basic Urdu pack. */ }
    if (!this.current(generation, owner)) return;
    if (voice && typeof SpeechSynthesisUtterance !== 'undefined') {
      const utterance = new SpeechSynthesisUtterance(speechText(prompt, language)); utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = 0.95;
      utterance.onerror = () => {
        if (!this.current(generation, owner)) return;
        utterance.onerror = null;
        if (language === 'ur') void this.offline(prompt, generation, owner, report);
        else report(t('Voice could not play. Tap Test voice and check audio permissions.'));
      };
      try { window.speechSynthesis.speak(utterance); report(t('Device voice')); return; }
      catch { if (language !== 'ur') { report(t('Voice could not play. Tap Test voice and check audio permissions.')); return; } }
    }
    if (language === 'ur') await this.offline(prompt, generation, owner, report);
    else report(t('Voice unavailable for this language on this device.'));
  }
}
