import { afterEach, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { Store } from '../server/store';
import { SpeechService } from '../server/speech';
import { createApp } from '../server/app';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
async function setup(enabled: boolean) {
  const store = new Store(':memory:'), synthesize = vi.fn(async () => Buffer.from('audio-fixture'));
  const speech = new SpeechService(store, { enabled, monthlyCharacters: 1000, englishVoice: 'en-GB-Wavenet-A', urduVoice: 'ur-IN-Wavenet-A' }, synthesize);
  const { app } = createApp(store, { speech });
  const server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => { store.close(); resolve(); }); }));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port.');
  return { synthesize, request: (path: string, body?: unknown) => fetch(`http://127.0.0.1:${address.port}/api${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) };
}
it('reports a disabled speech adapter without trying ADC and returns an explicit unavailable state', async () => {
  const { request, synthesize } = await setup(false);
  expect(await (await request('/speech/status')).json()).toMatchObject({ enabled: false, usedCharacters: 0, provider: 'google-cloud' });
  const response = await request('/speech', { language: 'ur', prompt: { kind: 'test' } });
  expect(response.status).toBe(503); expect(await response.json()).toHaveProperty('error'); expect(synthesize).not.toHaveBeenCalled();
});
it('returns binary audio with the selected language and rejects arbitrary synthesis requests', async () => {
  const { request, synthesize } = await setup(true);
  expect((await request('/speech', { language: 'ur', text: 'arbitrary text' })).status).toBe(400);
  const response = await request('/speech', { language: 'ur', prompt: { kind: 'turn', turn: 'left', distance: 200 } });
  expect(response.status).toBe(200); expect(response.headers.get('Content-Type')).toContain('audio/mpeg');
  expect(await response.text()).toBe('audio-fixture'); expect(synthesize).toHaveBeenCalledWith(expect.stringContaining('بائیں'), 'ur', 'ur-IN-Wavenet-A');
});
