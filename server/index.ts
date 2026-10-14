import 'dotenv/config';
import { resolve } from 'node:path';
import { Store } from './store.js';
import { createApp, applyRetention } from './app.js';
import { checkEnabledCommutes } from './commutes.js';

const port = Number(process.env.PORT ?? '3001');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
if (process.env.HOST && process.env.HOST !== '127.0.0.1') throw new Error('This single-user prototype only supports HOST=127.0.0.1.');
const store = new Store(resolve(process.env.MANZIL_DB_PATH ?? resolve(process.env.MANZIL_DATA_DIR ?? 'data', 'manzil.sqlite')));
const { app, source } = createApp(store);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Manzil local API: http://127.0.0.1:${port} (SQLite; signed-out public source coverage is partial)`);
  source.start();
  setImmediate(() => { applyRetention(store); checkEnabledCommutes(store); });
});
const commuteTimer = setInterval(() => { applyRetention(store); checkEnabledCommutes(store); }, 60_000);
commuteTimer.unref();
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true; source.stop(); clearInterval(commuteTimer);
  server.close(() => { store.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
