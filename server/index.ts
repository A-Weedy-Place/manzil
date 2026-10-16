import 'dotenv/config';
import { bootstrap } from './bootstrap.js';
import { createApp, applyRetention } from './app.js';
import { checkEnabledCommutes } from './commutes.js';

const { config, store } = bootstrap();
// Do not accept traffic with unusable cloud storage/credentials.
if (config.mode !== 'local') await store.routingSnapshot();
const { app, source } = createApp(store, { config });
const tick = async () => { await applyRetention(store); await checkEnabledCommutes(store); };
const server = app.listen(config.port, config.host, () => {
  console.log(`Manzil ${config.mode} ${config.role}: ${config.host}:${config.port} (${store.backend})`);
  if (config.mode === 'local') source.start();
  if (config.mode === 'local') void tick().catch(() => console.error('Local journey check failed.'));
});
const commuteTimer = config.mode === 'local' ? setInterval(() => { void tick().catch(() => console.error('Local journey check failed.')); }, 60_000) : undefined;
commuteTimer?.unref();
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true; source.stop(); if (commuteTimer) clearInterval(commuteTimer);
  server.close(() => { store.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
