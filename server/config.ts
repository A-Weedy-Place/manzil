import { z } from 'zod';

const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
export interface RuntimeConfig {
  mode: 'local' | 'emulator' | 'production'; host: string; port: number; projectId: string;
  allowedHosts: Set<string>; allowedOrigins: Set<string>; role: 'api' | 'worker';
  workerAudience?: string; workerEmail?: string; speechPublic: boolean; firebaseHostingServiceHost?: string;
  sourceMediaBucket?: string; sourceMediaReadBucket?: string; workerJobs?: ('source' | 'commutes' | 'fuel' | 'agent')[];
  agentWorkerUrl?: string; workerManualEmail?: string;
}
/** Hosting pinTag URLs use fh-* tags on this one explicitly configured service. */
export function isAllowedApplicationHost(config: RuntimeConfig, hostname: string): boolean {
  if (config.allowedHosts.has(hostname)) return true;
  const service = config.firebaseHostingServiceHost;
  if (config.mode !== 'production' || !service || !hostname.endsWith(`---${service}`)) return false;
  return /^fh-[a-z0-9-]+$/.test(hostname.slice(0, -(service.length + 3)));
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const mode = z.enum(['local', 'emulator', 'production']).parse(env.MANZIL_MODE ?? (env.NODE_ENV === 'production' ? 'production' : 'local'));
  if ((env.NODE_ENV === 'production' || env.K_SERVICE) && mode !== 'production') throw new Error('Production runtime requires MANZIL_MODE=production.');
  const port = z.coerce.number().int().min(1).max(65535).parse(env.PORT ?? (mode === 'production' ? 8080 : 3001));
  const host = env.HOST ?? (mode === 'production' ? '0.0.0.0' : '127.0.0.1');
  const projectId = env.FIREBASE_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT ?? '';
  const role = z.enum(['api', 'worker']).parse(env.MANZIL_SERVICE_ROLE ?? 'api');
  const workerJobs = z.array(z.enum(['source', 'commutes', 'fuel', 'agent'])).min(1).parse((env.WORKER_ALLOWED_JOBS ?? 'source,commutes,fuel').split(','));
  const sourceMediaReadBucket = env.SOURCE_MEDIA_READ_BUCKET || undefined;
  const agentWorkerUrl = env.AGENT_WORKER_URL || undefined;
  const workerManualEmail = env.WORKER_MANUAL_SERVICE_ACCOUNT_EMAIL || undefined;
  if (agentWorkerUrl) {
    const url = new URL(agentWorkerUrl);
    if (mode !== 'production' || role !== 'api' || url.protocol !== 'https:' || !/^[a-z0-9-]+\.a\.run\.app$/.test(url.hostname) ||
      url.origin !== agentWorkerUrl || url.username || url.password || url.port) throw new Error('Agent dispatch requires an exact production Cloud Run origin on the API.');
  }
  if (workerManualEmail && (mode !== 'production' || role !== 'worker' || !workerManualEmail.endsWith(`@${projectId}.iam.gserviceaccount.com`)))
    throw new Error('Manual worker identity must be a service account in this production project.');
  if (sourceMediaReadBucket && (mode !== 'production' || !/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(sourceMediaReadBucket))) throw new Error('Private source image reads require a valid production bucket.');
  const sourceMediaBucket = env.SOURCE_MEDIA_BUCKET || undefined;
  if (sourceMediaBucket && (mode !== 'production' || role !== 'worker' || !/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(sourceMediaBucket)))
    throw new Error('Source media bucket requires a production worker and a valid bucket name.');
  const allowedHosts = new Set((env.ALLOWED_HOSTS ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const allowedOrigins = new Set((env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const firebaseHostingServiceHost = env.FIREBASE_HOSTING_SERVICE_HOST || undefined;
  if (firebaseHostingServiceHost && (mode !== 'production' || !/^[a-z0-9][a-z0-9-]*\.a\.run\.app$/.test(firebaseHostingServiceHost) || !allowedHosts.has(firebaseHostingServiceHost)))
    throw new Error('Firebase Hosting service host must be an explicitly allowed Cloud Run service hostname in production.');
  if (mode === 'production') {
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) || projectId.startsWith('demo-')) throw new Error('A real FIREBASE_PROJECT_ID is required in production.');
    if (Object.keys(env).some(key => key.endsWith('_EMULATOR_HOST') && env[key])) throw new Error('Emulator hosts are forbidden in production.');
    if (env.MANZIL_DB_PATH || env.MANZIL_DATA_DIR || env.AUTH_MODE === 'development') throw new Error('Local database/development auth settings are forbidden in production.');
    if (host !== '0.0.0.0') throw new Error('Production must listen on 0.0.0.0.');
    if (!allowedHosts.size || !allowedOrigins.size) throw new Error('Set explicit ALLOWED_HOSTS and ALLOWED_ORIGINS.');
    for (const item of allowedHosts) if (!/^[a-z0-9.-]+$/i.test(item) || loopback.has(item)) throw new Error('Invalid production allowed host.');
    for (const item of allowedOrigins) { const url = new URL(item); if (url.protocol !== 'https:' || url.origin !== item || loopback.has(url.hostname)) throw new Error('Allowed origins must be exact HTTPS origins.'); }
    if (role === 'worker' && (!env.WORKER_AUDIENCE?.startsWith('https://') || !env.WORKER_SERVICE_ACCOUNT_EMAIL)) throw new Error('Worker requires WORKER_AUDIENCE and WORKER_SERVICE_ACCOUNT_EMAIL.');
  } else {
    if (host !== '127.0.0.1') throw new Error('Development only listens on 127.0.0.1.');
    loopback.forEach(item => allowedHosts.add(item));
    if (mode === 'emulator') {
      if (!projectId.startsWith('demo-')) throw new Error('Emulator mode requires a demo-* project ID.');
      for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
        const value = env[name]; if (!value || !/^(127\.0\.0\.1|localhost):\d+$/.test(value)) throw new Error(`Set loopback ${name}; cloud fallback is forbidden.`);
      }
      if (env.TTS_ENABLED === 'true' && env.ALLOW_PAID_SERVICES !== 'true') throw new Error('Local cloud speech requires explicit ALLOW_PAID_SERVICES=true.');
    }
  }
  return { mode, host, port, projectId, role, allowedHosts, allowedOrigins, firebaseHostingServiceHost, workerAudience: env.WORKER_AUDIENCE, workerEmail: env.WORKER_SERVICE_ACCOUNT_EMAIL, speechPublic: env.PUBLIC_CLOUD_SPEECH === 'true', sourceMediaBucket, sourceMediaReadBucket, workerJobs, agentWorkerUrl, workerManualEmail };
}
