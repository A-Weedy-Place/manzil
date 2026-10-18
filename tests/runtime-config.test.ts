import { describe, expect, it } from 'vitest';
import { isAllowedApplicationHost, readConfig } from '../server/config';
const production = { NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'manzil-example', ALLOWED_HOSTS: 'manzil-api.example.run.app', ALLOWED_ORIGINS: 'https://manzil-example.web.app' };
describe('runtime isolation', () => {
  it('confines manual model dispatch to an exact private HTTPS origin and project workload identity',()=>{
    const origin='https://worker-abc-as.a.run.app';
    expect(readConfig({...production,AGENT_WORKER_URL:origin}).agentWorkerUrl).toBe(origin);
    for (const url of ['http://worker-abc-as.a.run.app','https://worker.example.test','https://worker-abc-as.a.run.app/path','https://worker-abc-as.a.run.app?q=x','https://user:password@worker-abc-as.a.run.app'])
      expect(()=>readConfig({...production,AGENT_WORKER_URL:url})).toThrow();
    expect(()=>readConfig({AGENT_WORKER_URL:origin})).toThrow();
    expect(()=>readConfig({...production,WORKER_MANUAL_SERVICE_ACCOUNT_EMAIL:'api@other-project.iam.gserviceaccount.com'})).toThrow();
  });
  it('confines source-media configuration to production workers and validates allowed jobs', () => {
    const env = { ...production, MANZIL_SERVICE_ROLE: 'worker', WORKER_AUDIENCE: 'https://worker.example.run.app', WORKER_SERVICE_ACCOUNT_EMAIL: 'scheduler@example.test', SOURCE_MEDIA_BUCKET: 'private-source-media', WORKER_ALLOWED_JOBS: 'source' };
    expect(readConfig(env)).toMatchObject({ sourceMediaBucket: 'private-source-media', workerJobs: ['source'] });
    expect(() => readConfig({ ...env, MANZIL_SERVICE_ROLE: 'api' })).toThrow('production worker');
    expect(() => readConfig({ ...env, WORKER_ALLOWED_JOBS: 'unknown' })).toThrow();
    expect(() => readConfig({ SOURCE_MEDIA_BUCKET: 'private-source-media' })).toThrow('production worker');
  });
  it('accepts Firebase Hosting tags only for the explicitly selected Cloud Run service', () => {
    const service = 'manzil-api-abc123-as.a.run.app';
    const env = { ...production, ALLOWED_HOSTS: service, FIREBASE_HOSTING_SERVICE_HOST: service };
    const config = readConfig(env);
    expect(isAllowedApplicationHost(config, service)).toBe(true);
    expect(isAllowedApplicationHost(config, `fh-080ad782a75264ae---${service}`)).toBe(true);
    for (const hostname of [`other-tag---${service}`, `fh-tag---${service}.attacker.example`, 'fh-tag---other-abc123-as.a.run.app', 'attacker.example'])
      expect(isAllowedApplicationHost(config, hostname)).toBe(false);
    expect(isAllowedApplicationHost(readConfig({ ...production, ALLOWED_HOSTS: service }), `fh-tag---${service}`)).toBe(false);
  });
  it('rejects wildcard, foreign and development Firebase Hosting host configuration', () => {
    for (const service of ['*.a.run.app', 'https://service.a.run.app', 'localhost', 'service.example.com', 'not-listed.a.run.app'])
      expect(() => readConfig({ ...production, FIREBASE_HOSTING_SERVICE_HOST: service })).toThrow('Firebase Hosting service host');
    expect(() => readConfig({ FIREBASE_HOSTING_SERVICE_HOST: 'service.a.run.app', ALLOWED_HOSTS: 'service.a.run.app' })).toThrow('production');
  });
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
