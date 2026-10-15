import { speechText, type Language, type SpeechPrompt } from '../../shared/speech';
import { t } from './language';

/** A cancelled route/session can never play late audio. Cache audio, never route positions. */
export class NavigationSpeaker {
  private generation = 0;
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private cache = new Map<string, Promise<Blob>>();
  private cloudUnavailableUntil = 0;
  cancel() {
    this.generation++;
    if (this.audio) { this.audio.pause(); this.audio.src = ''; this.audio = null; }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
  private cloud(prompt: SpeechPrompt, language: Language): Promise<Blob> {
    const key = JSON.stringify([language, prompt]);
    const cached = this.cache.get(key); if (cached) return cached;
    if (Date.now() < this.cloudUnavailableUntil) return Promise.reject(new Error('Cloud speech unavailable.'));
    const request = fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language, prompt }), signal: AbortSignal.timeout(10000) })
      .then(response => { if (!response.ok || !response.headers.get('Content-Type')?.startsWith('audio/')) throw new Error('Cloud speech unavailable.'); return response.blob(); })
      .catch(error => { this.cache.delete(key); this.cloudUnavailableUntil = Date.now() + 60000; throw error; });
    this.cache.set(key, request);
    if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
    return request;
  }
  prepare(prompt: SpeechPrompt, language: Language) { void this.cloud(prompt, language).catch(() => {}); }
  async speak(prompt: SpeechPrompt, language: Language, report: (message: string) => void = () => {}) {
    this.cancel(); const generation = this.generation;
    try {
      const blob = await this.cloud(prompt, language);
      if (generation !== this.generation) return;
      this.url = URL.createObjectURL(blob); this.audio = new Audio(this.url);
      this.audio.onended = () => { if (generation === this.generation) this.cancel(); };
      await this.audio.play();
      if (generation === this.generation) report(t('Google Cloud voice'));
    } catch {
      if (generation !== this.generation) return;
      if (!('speechSynthesis' in window)) { report(t('Voice unavailable for this language on this device.')); return; }
      let voices = window.speechSynthesis.getVoices();
      if (!voices.length) {
        await new Promise<void>(resolve => {
          const loaded = () => { clearTimeout(timer); window.speechSynthesis.removeEventListener('voiceschanged', loaded); resolve(); };
          const timer = setTimeout(loaded, 1000);
          window.speechSynthesis.addEventListener('voiceschanged', loaded);
        });
        if (generation !== this.generation) return;
        voices = window.speechSynthesis.getVoices();
      }
      const voice = voices.find(value => value.lang.toLowerCase() === (language === 'ur' ? 'ur-pk' : 'en-pk')) ?? voices.find(value => value.lang.toLowerCase().startsWith(`${language}-`));
      if (!voice) { report(t('Voice unavailable for this language on this device.')); return; }
      const utterance = new SpeechSynthesisUtterance(speechText(prompt, language));
      utterance.voice = voice; utterance.lang = voice.lang;
      utterance.onerror = () => { if (generation === this.generation) report(t('Voice could not play. Tap Test voice and check audio permissions.')); };
      window.speechSynthesis.speak(utterance); report(t('Cloud speech unavailable; using a device voice.'));
    }
  }
}
