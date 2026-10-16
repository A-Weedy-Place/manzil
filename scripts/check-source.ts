import 'dotenv/config';
import { bootstrap } from '../server/bootstrap.js';
import { SourceService } from '../server/source.js';

const { config, store } = bootstrap();
if (config.mode === 'production') throw new Error('Use the authenticated worker for production collection.');
try {
  const status = await new SourceService(store).check();
  console.log(JSON.stringify({ state: status.state, message: status.message, lastAttemptAt: status.lastAttemptAt,
    nextCheckAt: status.nextCheckAt, noticesCollected: status.noticesCollected, coverage: status.coverage }, null, 2));
  if (status.state === 'error' || status.state === 'blocked') process.exitCode = 2;
} finally { store.close(); }
