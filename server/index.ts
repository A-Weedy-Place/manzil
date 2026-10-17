import 'dotenv/config';
import { bootstrap } from './bootstrap.js';
import { createApp, applyRetention } from './app.js';
import { checkEnabledCommutes } from './commutes.js';

const { config, store } = bootstrap();
// Do not accept traffic with unusable cloud storage/credentials.
if (config.mode !== 'local') await store.routingSnapshot();
const { app, source, fuel } = createApp(store, { config });
let closing = false;
let activeTick: Promise<void> | undefined;
function tick(): Promise<void> {
  if (closing) return Promise.resolve();
  if (activeTick) return activeTick;
  activeTick = (async () => { await applyRetention(store); await checkEnabledCommutes(store); })().finally(() => { activeTick = undefined; });
  return activeTick;
}
const server = app.listen(config.port, config.host, () => {
  console.log(`Manzil ${config.mode} ${config.role}: ${config.host}:${config.port} (${store.backend})`);
  if (config.mode === 'local') source.start();
  if (config.mode === 'local' && process.env.NODE_ENV !== 'test') fuel.start();
  if (config.mode === 'local') void tick().catch(() => console.error('Local journey check failed.'));
});
const commuteTimer = config.mode === 'local' ? setInterval(() => { void tick().catch(() => console.error('Local journey check failed.')); }, 60_000) : undefined;
commuteTimer?.unref();
function shutdown() {
  if (closing) return;
  closing = true; source.stop(); fuel.stop(); if (commuteTimer) clearInterval(commuteTimer);
  server.close(() => {
    // HTTP requests have drained; also finish any local online commute check
    // before closing its SQLite adapter. Cloud workers have no local timer.
    void (async () => { await activeTick?.catch(() => {}); store.close(); process.exit(0); })();
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
