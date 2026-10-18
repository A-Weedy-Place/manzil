import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { URDU_AUDIO_PHRASES, URDU_VOICE_PACK, urduAudioClips, urduAudioPath } from '../shared/offlineSpeech';

describe('fixed Urdu voice asset contract', () => {
  it('covers exact ahead phases and every maneuver/status without sending road names or inventing a distance', () => {
    for (const turn of ['left', 'right', 'straight', 'start', 'arrive'] as const) {
      for (const distance of [0, 25, 39, 50, 75, 100, 125, 150, 175, 200, 225, 251, 3000]) {
        const clips = urduAudioClips({ kind: 'turn', turn, distance, road: 'Private road name / 73.044,33.6' });
        expect(clips.every(clip => Object.hasOwn(URDU_AUDIO_PHRASES, clip))).toBe(true);
        expect(clips.join(' ')).not.toMatch(/Private|73\.044|33\.6/);
        if (distance === 25 || distance === 251 || distance === 3000) expect(clips).toEqual([turn]);
        if (turn === 'arrive') expect(clips).toEqual(['arrive']);
      }
    }
    for (const kind of ['test', 'gps_lost', 'unavailable', 'rerouting'] as const) expect(urduAudioClips({ kind })).toEqual([kind]);
    expect(urduAudioClips({ kind: 'turn', turn: 'left', distance: 200 })).toEqual(['after-200', 'left']);
    expect(urduAudioClips({ kind: 'turn', turn: 'straight', distance: 175 })).toEqual(['straight-175']);
    expect(() => urduAudioPath('../../source')).toThrow(); expect(() => urduAudioPath('__proto__')).toThrow();
  });
  it('ships a complete compact non-silent PCM pack matching its source/phrase/hash manifest', async () => {
    const root = `public/audio/navigation/${URDU_VOICE_PACK}`;
    const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as { pack: string; generator: { package: string; version: string; voice: string; rate: number }; format: { sampleRate: number }; files: { id: string; text: string; bytes: number; samples: number; sha256: string }[] };
    expect(manifest.pack).toBe(URDU_VOICE_PACK); expect(manifest.generator).toMatchObject({ package: '@echogarden/espeak-ng-emscripten', version: '0.3.5', voice: 'ur+f3', rate: 175 });
    expect(manifest.files.map(file => file.id).sort()).toEqual(Object.keys(URDU_AUDIO_PHRASES).sort());
    expect((await readdir(root)).filter(file => file.endsWith('.wav')).sort()).toEqual(manifest.files.map(file => `${file.id}.wav`).sort());
    let total = 0;
    for (const file of manifest.files) {
      const audio = await readFile(`${root}/${file.id}.wav`); total += audio.length;
      expect(audio.length).toBe(file.bytes); expect(createHash('sha256').update(audio).digest('hex')).toBe(file.sha256); expect(file.text).toBe(URDU_AUDIO_PHRASES[file.id]);
      expect(audio.toString('ascii', 0, 4)).toBe('RIFF'); expect(audio.toString('ascii', 8, 16)).toBe('WAVEfmt '); expect(audio.toString('ascii', 36, 40)).toBe('data');
      expect(audio.readUInt16LE(20)).toBe(1); expect(audio.readUInt16LE(22)).toBe(1); expect(audio.readUInt32LE(24)).toBe(16000); expect(audio.readUInt16LE(34)).toBe(16);
      expect(audio.readUInt32LE(40)).toBe(file.samples * 2); expect(audio.length).toBe(44 + file.samples * 2);
      let energy = 0; for (let index = 44; index < audio.length; index += 2) energy += audio.readInt16LE(index) ** 2;
      expect(Math.sqrt(energy / file.samples)).toBeGreaterThan(100); expect(file.samples / 16000).toBeGreaterThan(0.2); expect(file.samples / 16000).toBeLessThan(12);
    }
    expect(total).toBeLessThan(2_000_000);
  });
});
