// Real bounded public navigation probes: no credentials, GPS or model calls.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = new URL(process.argv[2] ?? 'https://manzil-app-v1.web.app');
assert(base.protocol === 'https:' && base.pathname === '/' && !base.search && !base.hash && !base.username && !base.password, 'Use an HTTPS origin only');
const status = async () => {
  const response = await fetch(new URL('/api/speech/status', base), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  return response.json();
};
const before = await status();
assert.equal(before.enabled, true, 'Cloud voices must be enabled');
assert.equal(before.monthlyCharacterLimit, 100000, 'Expected shared prototype cap');
const reports = [];
for (const language of ['en', 'ur']) {
  const request = async () => {
    const response = await fetch(new URL('/api/speech', base), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://manzil-app-v1.web.app' },
      body: JSON.stringify({ language, prompt: { kind: 'test' } }), signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, `${language} voice HTTP status`);
    assert.match(response.headers.get('content-type') ?? '', /audio\/mpeg/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.length > 128 && (bytes[0] === 0xff || bytes.subarray(0, 3).toString() === 'ID3'), 'Expected actual MP3 audio');
    return bytes;
  };
  const audio = await request(), afterFirst = await status(), repeated = await request(), afterRepeat = await status();
  assert(audio.equals(repeated), 'Repeat should reuse identical cached audio');
  if (process.argv.includes('--save-samples')) {
    const folder = new URL('../test-results/', import.meta.url);
    await mkdir(folder, { recursive: true });
    await writeFile(new URL(`navigation-voice-${language}.mp3`, folder), audio);
  }
  reports.push({language, audioBytes: audio.length, repeatMatches: true,
    counterUnchangedOnRepeat: afterFirst.usedCharacters === afterRepeat.usedCharacters});
}
console.log(JSON.stringify({origin: base.origin, guestCloudVoices: true, monthlyCharacterLimit: before.monthlyCharacterLimit,
  usedCharactersBefore: before.usedCharacters, usedCharactersAfter: (await status()).usedCharacters, reports}, null, 2));
