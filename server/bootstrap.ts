import { resolve } from 'node:path';
import { config as localEnvironment } from 'dotenv';
import { readConfig } from './config.js';
import { Store } from './store.js';
import { FirestoreStore } from './firestore-store.js';
import { firebaseServices } from './firebase.js';
import type { Repository } from './repository.js';
export function bootstrap() {
  const config = readConfig();
  if (config.mode !== 'production') localEnvironment({ path: '.env.gemini.local', override: false });
  const store: Repository = config.mode === 'local'
    ? new Store(resolve(process.env.MANZIL_DB_PATH ?? resolve(process.env.MANZIL_DATA_DIR ?? 'data', 'manzil.sqlite')))
    : new FirestoreStore(firebaseServices(config.projectId).db);
  return { config, store };
}
