// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationSpeaker, selectNavigationVoice } from '../src/lib/speech';
import { signInDevelopment, signOut } from '../src/lib/auth';
import * as auth from '../src/lib/auth';
import { setLanguage } from '../src/lib/language';

const voice = (name: string, lang: string, localService = true) => ({ name, lang, localService, voiceURI: name, default: false } as SpeechSynthesisVoice);
let spoken: SpeechSynthesisUtterance[];
let listeners: Set<() => void>;
let voices: SpeechSynthesisVoice[];
let created: { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; src: string; onended?: () => void }[];
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); signOut(); setLanguage('en'); spoken = []; listeners = new Set(); voices = []; created = [];
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('speechSynthesis', { getVoices: () => voices, speak: vi.fn((utterance: SpeechSynthesisUtterance) => spoken.push(utterance)), cancel: vi.fn(), addEventListener: (_event: string, callback: () => void) => listeners.add(callback), removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback) });
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; voice: SpeechSynthesisVoice | null = null; lang = ''; rate = 1; onerror: ((event: unknown) => void) | null = null; constructor(text: string) { this.text = text; } });
  vi.stubGlobal('Audio', class { src: string; play = vi.fn(async () => {}); pause = vi.fn(); constructor(url: string) { this.src = url; created.push(this); } });
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:voice'); static revokeObjectURL = vi.fn(); });
  fetcher = vi.fn(async (url: string) => {
    if (url === '/api/speech/status') return Response.json({ enabled: false });
    throw new Error(`Unexpected speech request: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { signOut(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe('navigation speech providers', () => {
  it('prefers identifiable female voices of the requested language and accepts a bare language tag', () => {
    const male = voice('Microsoft David', 'en-PK'), female = voice('Microsoft Zira', 'en-US');
    expect(selectNavigationVoice([male, female], 'en')).toBe(female);
    const urdu = voice('Microsoft Uzma', 'ur-PK'); expect(selectNavigationVoice([male, urdu], 'ur')).toBe(urdu);
    const neural = voice('ur-PK-UzmaNeural', 'ur-PK', false); expect(selectNavigationVoice([voice('ur-PK-AsadNeural', 'ur-PK'), neural], 'ur')).toBe(neural);
    expect(selectNavigationVoice([voice('Hindi voice', 'hi-IN'), voice('Bare Urdu', 'ur')], 'ur')?.name).toBe('Bare Urdu');
    expect(selectNavigationVoice([male], 'ur')).toBeUndefined();
  });
  it('uses a late Urdu voice even when other language voices were initially present', async () => {
    voices = [voice('Microsoft Zira', 'en-US')]; const speaker = new NavigationSpeaker(), report = vi.fn();
    const task = speaker.speak({ kind: 'test' }, 'ur', report); await flush();
    voices.push(voice('Microsoft Uzma', 'ur-PK')); listeners.forEach(listener => listener()); await task;
    expect(spoken).toHaveLength(1); expect(spoken[0].lang).toBe('ur-PK'); expect(spoken[0].text).toContain('بائیں');
    expect(report).toHaveBeenCalledWith('Device voice'); expect(fetcher.mock.calls.some(([url]) => String(url).includes('.wav'))).toBe(false); speaker.cancel();
  });
  it('never falls back or plays after cancellation while waiting for voices', async () => {
    const speaker = new NavigationSpeaker(), report = vi.fn(); const task = speaker.speak({ kind: 'test' }, 'ur', report); await flush(); speaker.cancel(); await task;
    expect(listeners.size).toBe(0); expect(created).toHaveLength(0); expect(spoken).toHaveLength(0); expect(report).not.toHaveBeenCalled();
  });
  it('checks cloud configuration once, never posts when disabled, and preserves configured cloud playback', async () => {
    voices = [voice('Microsoft Zira', 'en-US')]; const speaker = new NavigationSpeaker(); await speaker.speak({ kind: 'test' }, 'en'); await speaker.speak({ kind: 'rerouting' }, 'en');
    expect(fetcher).toHaveBeenCalledTimes(1); expect(spoken).toHaveLength(2); speaker.cancel();
    fetcher.mockImplementation(async (url: string) => url === '/api/speech/status' ? Response.json({ enabled: true }) : new Response('cloud fixture', { headers: { 'Content-Type': 'audio/mpeg' } }));
    const configured = new NavigationSpeaker(), report = vi.fn(); await configured.speak({ kind: 'test' }, 'ur', report);
    expect(created).toHaveLength(1); expect(report).toHaveBeenCalledWith('Google Cloud voice'); configured.cancel();
  });
  it('blocks a late configured-cloud reply after account changes', async () => {
    let resolve!: (response: Response) => void;
    fetcher.mockImplementation(async (url: string) => url === '/api/speech/status' ? Response.json({ enabled: true }) : new Promise<Response>(value => { resolve = value; }));
    const speaker = new NavigationSpeaker(), report = vi.fn(); const task = speaker.speak({ kind: 'test' }, 'ur', report); await flush();
    signInDevelopment('user@manzil.test', 'ManzilUser123!'); resolve(new Response('late cloud', { headers: { 'Content-Type': 'audio/mpeg' } })); await task;
    expect(created).toHaveLength(0); expect(spoken).toHaveLength(0); expect(report).not.toHaveBeenCalled(); speaker.cancel();
  });
  it('does not start paid synthesis when Stop precedes an enabled status reply, and keeps the next request usable', async () => {
    let resolve!: (response: Response) => void;
    fetcher.mockImplementation(async (url: string) => url === '/api/speech/status' ? new Promise<Response>(value => { resolve = value; }) : new Response('cloud fixture', { headers: { 'Content-Type': 'audio/mpeg' } }));
    const speaker = new NavigationSpeaker(), report = vi.fn();
    const pending = speaker.speak({ kind: 'test' }, 'en', report); await flush(); speaker.cancel();
    resolve(Response.json({ enabled: true })); await pending;
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/speech/status']); expect(created).toHaveLength(0); expect(report).not.toHaveBeenCalled();
    await speaker.speak({ kind: 'test' }, 'en', report);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/speech/status', '/api/speech']); expect(created).toHaveLength(1); expect(report).toHaveBeenCalledWith('Google Cloud voice'); speaker.cancel();
  });
  it('cancels pending cloud prefetch before an enabled status reply without spending allowance', async () => {
    let resolve!: (response: Response) => void;
    fetcher.mockImplementation(async (url: string) => url === '/api/speech/status' ? new Promise<Response>(value => { resolve = value; }) : new Response('cloud fixture', { headers: { 'Content-Type': 'audio/mpeg' } }));
    const speaker = new NavigationSpeaker(); speaker.prepare({ kind: 'turn', turn: 'left', distance: 200 }, 'en'); await flush(); speaker.cancel();
    resolve(Response.json({ enabled: true })); await flush();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/speech/status']); expect(created).toHaveLength(0);
    await speaker.speak({ kind: 'test' }, 'en'); expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/speech/status', '/api/speech']); speaker.cancel();
  });
  it('rechecks cancellation after credentials resolve and does not poison the next audio cache entry', async () => {
    let resolve!: (headers: Record<string, string>) => void;
    const headers = vi.spyOn(auth, 'authorizationHeaders').mockResolvedValueOnce({}).mockImplementationOnce(() => new Promise(value => { resolve = value; }));
    fetcher.mockImplementation(async (url: string) => url === '/api/speech/status' ? Response.json({ enabled: true }) : new Response('cloud fixture', { headers: { 'Content-Type': 'audio/mpeg' } }));
    const speaker = new NavigationSpeaker(), report = vi.fn(); const pending = speaker.speak({ kind: 'test' }, 'en', report); await flush();
    expect(resolve).toBeTypeOf('function'); speaker.cancel(); resolve({}); await pending; headers.mockRestore();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/speech/status']); expect(report).not.toHaveBeenCalled();
    await speaker.speak({ kind: 'test' }, 'en', report); expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/speech/status', '/api/speech']); expect(created).toHaveLength(1); speaker.cancel();
  });
  it('reports actual audio-play failure rather than claiming a working Urdu voice', async () => {
    Reflect.deleteProperty(window, 'speechSynthesis');
    fetcher.mockImplementation(async (url: string) => url === '/api/speech/status' ? Response.json({ enabled: true }) : new Response('cloud fixture', {headers:{'Content-Type':'audio/mpeg'}}));
    vi.stubGlobal('Audio', class { src: string; pause = vi.fn(); play = vi.fn(async () => { throw new Error('NotAllowedError'); }); constructor(src: string) { this.src = src; } });
    const speaker = new NavigationSpeaker(), report = vi.fn(); await speaker.speak({ kind: 'test' }, 'ur', report);
    expect(report).not.toHaveBeenCalledWith('Google Cloud voice'); expect(report).toHaveBeenCalledWith('Voice unavailable for this language on this device.'); speaker.cancel();
  });
});

it('does not download bundled Urdu audio when cloud and device voices are unavailable', async () => {
  vi.useFakeTimers(); const report=vi.fn(),speaker=new NavigationSpeaker();
  const task=speaker.speak({kind:'test'},'ur',report);await vi.advanceTimersByTimeAsync(1000);await task;
  expect(report).toHaveBeenCalledWith('Voice unavailable for this language on this device.');expect(created).toHaveLength(0);
  expect(fetcher.mock.calls.map(([url])=>url)).toEqual(['/api/speech/status']);speaker.cancel();
});
