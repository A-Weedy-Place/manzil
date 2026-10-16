import { describe, expect, it } from 'vitest';
import { readConfig } from '../server/config';
const production = { NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'manzil-example', ALLOWED_HOSTS: 'manzil-api.example.run.app', ALLOWED_ORIGINS: 'https://manzil-example.web.app' };
describe('runtime isolation', () => {
  it('keeps standalone development on loopback and makes cloud binding explicit', () => {
    expect(readConfig({})).toMatchObject({ mode: 'local', host: '127.0.0.1', port: 3001 });
    expect(readConfig(production)).toMatchObject({ mode: 'production', host: '0.0.0.0', port: 8080 });
    expect(() => readConfig({ HOST: '0.0.0.0' })).toThrow('Development');
  });
  it('cannot fall back to development, SQLite or emulators in production', () => {
    expect(() => readConfig({ ...production, MANZIL_MODE: 'local' })).toThrow('requires');
    expect(() => readConfig({ ...production, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toThrow('Emulator');
    expect(() => readConfig({ ...production, MANZIL_DB_PATH: 'data/local.sqlite' })).toThrow('Local database');
    expect(() => readConfig({ ...production, FIREBASE_PROJECT_ID: 'demo-manzil' })).toThrow('real');
    expect(() => readConfig({ ...production, ALLOWED_ORIGINS: '*' })).toThrow();
    expect(() => readConfig({ ...production, ALLOWED_HOSTS: '' })).toThrow('explicit');
  });
  it('requires both local emulator endpoints and rejects real projects/paid speech by default', () => {
    const env = { MANZIL_MODE: 'emulator', FIREBASE_PROJECT_ID: 'demo-manzil', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' };
    expect(readConfig(env).mode).toBe('emulator');
    expect(() => readConfig({ ...env, FIREBASE_AUTH_EMULATOR_HOST: '' })).toThrow('cloud fallback');
    expect(() => readConfig({ ...env, FIREBASE_PROJECT_ID: 'real-project' })).toThrow('demo-');
    expect(() => readConfig({ ...env, TTS_ENABLED: 'true' })).toThrow('ALLOW_PAID_SERVICES');
    expect(() => readConfig({ ...production, MANZIL_SERVICE_ROLE: 'worker' })).toThrow('Worker');
  });
});
