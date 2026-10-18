import 'dotenv/config';
import { deleteApp } from 'firebase-admin/app';
import { firebaseServices } from '../server/firebase.js';
import { seedLocalTestClosures } from './lib/local-test-closures.js';

// Deliberately separate from all launchers and production paths: an explicit local QA action.
let services: ReturnType<typeof firebaseServices> | undefined;
try {
  const result = await seedLocalTestClosures(process.env, projectId => services = firebaseServices(projectId));
  console.log(`Local synthetic test closures: ${result.result}, ${result.createdCount} created (32 days). IDs: ${result.closureIds.join(', ')}`);
} finally {
  if (services) { await services.db.terminate(); await deleteApp(services.app); }
}
