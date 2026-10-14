import 'dotenv/config';
import { resolve } from 'node:path';
import { Store } from '../server/store.js';
import { SourceService } from '../server/source.js';

const store = new Store(resolve(process.env.MANZIL_DB_PATH ?? resolve(process.env.MANZIL_DATA_DIR ?? 'data', 'manzil.sqlite')));
try {
  const status = await new SourceService(store).check();
  console.log(JSON.stringify({ state: status.state, message: status.message, lastAttemptAt: status.lastAttemptAt,
    nextCheckAt: status.nextCheckAt, noticesCollected: status.noticesCollected, coverage: status.coverage }, null, 2));
  if (status.state === 'error' || status.state === 'blocked') process.exitCode = 2;
} finally { store.close(); }
