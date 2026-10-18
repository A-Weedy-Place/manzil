/** Development-only generator. No TTS engine, model, credentials or dependency ships with Manzil. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { URDU_AUDIO_PHRASES, URDU_VOICE_PACK } from '../shared/offlineSpeech';

const engineDirectory = process.argv[2];
if (!engineDirectory) throw new Error('Supply the unpacked @echogarden/espeak-ng-emscripten 0.3.5 directory. See public/audio/navigation/README.md.');
const modulePath = resolve(engineDirectory, 'espeak-ng.js');
const packageJson = JSON.parse(await readFile(resolve(engineDirectory, 'package.json'), 'utf8')) as { name: string; version: string };
if (packageJson.name !== '@echogarden/espeak-ng-emscripten' || packageJson.version !== '0.3.5') throw new Error('Unexpected offline generator version.');
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const engineHashes = Object.fromEntries(await Promise.all(['espeak-ng.js', 'espeak-ng.data'].map(async name => [name, hash(await readFile(resolve(engineDirectory, name)))])));
const expectedEngineHashes = { 'espeak-ng.js': '3502d997af2640e54518a06845776c8507bfeebd8ff75f80176370e35de9896b', 'espeak-ng.data': 'f7f8eff5685c709db9dae81e88a0e0556867d60514f7308ae99e0579369397b5' };
for (const [name, expected] of Object.entries(expectedEngineHashes)) if (engineHashes[name] !== expected) throw new Error(`Unexpected generator hash: ${name}`);
const { default: initialize } = await import(pathToFileURL(modulePath).href);
const module = await initialize();
const engine = await new module.eSpeakNGWorker();
if (!engine.list_voices().some((voice: { name: string }) => voice.name === 'Urdu')) throw new Error('Generator does not contain Urdu.');
engine.set_voice('ur+f3'); engine.set_rate(175); engine.set_pitch(50); engine.set_range(50);
const directory = resolve('public/audio/navigation', URDU_VOICE_PACK);
await mkdir(directory, { recursive: true });
const sampleRate = 16000;
const files: { id: string; text: string; bytes: number; samples: number; sha256: string }[] = [];
for (const [id, text] of Object.entries(URDU_AUDIO_PHRASES)) {
  const chunks: Int16Array[] = [];
  engine.synthesize(text, (samples: Int16Array) => { if (samples?.length) chunks.push(Int16Array.from(samples)); });
  const original = new Int16Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0; for (const chunk of chunks) { original.set(chunk, offset); offset += chunk.length; }
  let start = 0, end = original.length;
  while (start < end && Math.abs(original[start]) < 80) start++;
  while (end > start && Math.abs(original[end - 1]) < 80) end--;
  start = Math.max(0, start - 220); end = Math.min(original.length, end + 880);
  if (end - start < 1000) throw new Error(`Silent output: ${id}`);
  const count = Math.ceil((end - start) * sampleRate / 22050);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(36 + count * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let index = 0; index < count; index++) {
    const source = start + index * 22050 / sampleRate, base = Math.floor(source), fraction = source - base;
    const value = Math.round(original[Math.min(end - 1, base)] * (1 - fraction) + original[Math.min(end - 1, base + 1)] * fraction);
    wav.writeInt16LE(value, 44 + index * 2);
  }
  await writeFile(resolve(directory, `${id}.wav`), wav);
  files.push({ id, text, bytes: wav.length, samples: count, sha256: hash(wav) });
}
const manifest = { pack: URDU_VOICE_PACK, generator: { package: packageJson.name, version: packageJson.version, source: 'https://github.com/echogarden-project/espeak-ng-emscripten', voice: 'ur+f3', rate: 175, pitch: 50, range: 50, engineHashes }, format: { encoding: 'PCM16', channels: 1, sampleRate }, files };
await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ pack: URDU_VOICE_PACK, clips: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0), engineHashes }));
