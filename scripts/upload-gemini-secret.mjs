import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';

// Deliberate cloud mutation. Key bytes travel over stdin, never command arguments or logs.
// Create the named secret and confirm the API key project's tier before using this helper.
const key = parse(readFileSync('.env.gemini.local')).GEMINI_API_KEY?.trim();
if (!key || key.length < 20 || /[\r\n]/.test(key)) throw new Error('Save a valid key in .env.gemini.local first.');
const args = ['secrets', 'versions', 'add', 'manzil-gemini-api-key', '--project=manzil-app-v1', '--data-file=-', '--quiet'];
const result = process.platform === 'win32'
  ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `gcloud.cmd ${args.join(' ')}`], { input: key, encoding: 'utf8', windowsHide: true })
  : spawnSync('gcloud', args, { input: key, encoding: 'utf8' });
if (result.error || result.status !== 0) {
  console.error('Secret version upload failed. Check operator login, the existing secret and IAM. Key contents were not printed.');
  process.exitCode = 1;
} else console.log('Created a new manzil-gemini-api-key secret version in manzil-app-v1. No key contents were printed.');
