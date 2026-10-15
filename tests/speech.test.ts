import { afterEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../server/store';
import { SpeechService, speechSchema, type Synthesizer } from '../server/speech';
import { speechText } from '../shared/speech';
const stores: Store[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); vi.useRealTimers(); });
function service(limit = 100000, synthesize: Synthesizer = vi.fn(async () => Buffer.from('audio-fixture'))) {
  const store = new Store(':memory:'); stores.push(store);
  const config = { enabled: true, monthlyCharacters: limit, englishVoice: 'en-GB-Wavenet-A', urduVoice: 'ur-IN-Wavenet-A' };
  return { store, config, synthesize, speech: new SpeechService(store, config, synthesize) };
}
describe('structured bilingual cloud speech', () => {
  it('uses Urdu script, preserves road names and gives distinct direction and distance prompts', () => {
    expect(speechText({ kind: 'turn', turn: 'left', road: 'F-8', distance: 200 }, 'ur')).toContain('بائیں');
    expect(speechText({ kind: 'turn', turn: 'right', distance: 200 }, 'ur')).toContain('دائیں');
    expect(speechText({ kind: 'turn', turn: 'left', road: 'F-8', distance: 200 }, 'ur')).toContain('F-8');
    expect(speechText({ kind: 'rerouting' }, 'en')).toBe('Updating your route.');
    expect(speechText({ kind: 'turn', turn: 'arrive', road: 'private' }, 'ur')).not.toContain('private');
  });
  it('rejects arbitrary text, SSML, unexpected fields and oversized prompts', () => {
    expect(speechSchema.safeParse({ language: 'ur', text: '<speak>anything</speak>' }).success).toBe(false);
    expect(speechSchema.safeParse({ language: 'fr', prompt: { kind: 'test' } }).success).toBe(false);
    expect(speechSchema.safeParse({ language: 'en', prompt: { kind: 'turn', turn: 'left', road: 'x'.repeat(101) } }).success).toBe(false);
  });
  it('deduplicates concurrent calls and reuses durable audio across service restarts', async () => {
    const { store, config, synthesize, speech } = service();
    const [a, b] = await Promise.all([speech.audio('ur', { kind: 'test' }), speech.audio('ur', { kind: 'test' })]);
    expect(a.equals(b)).toBe(true); expect(synthesize).toHaveBeenCalledTimes(1);
    const used = speech.status().usedCharacters;
    await new SpeechService(store, config, synthesize).audio('ur', { kind: 'test' });
    expect(synthesize).toHaveBeenCalledTimes(1); expect(speech.status().usedCharacters).toBe(used);
    await speech.audio('en', { kind: 'test' }); expect(synthesize).toHaveBeenCalledTimes(2);
  });
  it('reserves characters before synthesis, rejects excess and keeps cache usable at the cap', async () => {
    const text = speechText({ kind: 'test' }, 'en');
    const { synthesize, speech } = service(Array.from(text).length);
    await speech.audio('en', { kind: 'test' });
    await expect(speech.audio('ur', { kind: 'test' })).rejects.toThrow('allowance');
    await speech.audio('en', { kind: 'test' }); expect(synthesize).toHaveBeenCalledTimes(1);
  });
  it('does not expose upstream credentials/errors and conservatively counts failed attempts', async () => {
    const { speech } = service(100000, vi.fn(async () => { throw new Error('sensitive credential detail'); }));
    await expect(speech.audio('en', { kind: 'test' })).rejects.toThrow('temporarily unavailable');
    expect(speech.status().usedCharacters).toBeGreaterThan(0);
  });
  it('makes no provider call when disabled and rolls its durable counter by UTC month', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-31T23:59:59Z');
    const { speech, config, synthesize } = service(); config.enabled = false;
    await expect(speech.audio('en', { kind: 'test' })).rejects.toThrow('not configured');
    expect(synthesize).not.toHaveBeenCalled(); config.enabled = true;
    await speech.audio('en', { kind: 'test' }); expect(speech.status().usedCharacters).toBeGreaterThan(0);
    vi.setSystemTime('2026-11-01T00:00:00Z'); expect(speech.status().usedCharacters).toBe(0);
  });
  it('limits concurrent provider calls independently of cache hits', async () => {
    const releases: ((value: Buffer) => void)[] = [];
    const { speech } = service(100000, vi.fn(() => new Promise<Buffer>(resolve => { releases.push(resolve); })));
    const first = speech.audio('en', { kind: 'test' });
    const second = speech.audio('en', { kind: 'rerouting' });
    await expect(speech.audio('en', { kind: 'gps_lost' })).rejects.toThrow('busy');
    releases.forEach(release => release(Buffer.from('audio'))); await Promise.all([first, second]);
  });
});
