import 'dotenv/config';
import { deleteApp } from 'firebase-admin/app';
import { firebaseServices } from '../server/firebase.js';
import { seedLocalUpcomingClosures } from './lib/local-upcoming-closures.js';

// Never called by launchers or production: an explicit local QA action only.
let services: ReturnType<typeof firebaseServices> | undefined;
try {
  const result = await seedLocalUpcomingClosures(process.env, projectId => services = firebaseServices(projectId));
  console.log(`Local synthetic upcoming closures: ${result.result}, ${result.createdCount} created (next PKT calendar month, 32 days). IDs: ${result.closureIds.join(', ')}`);
} finally {
  if (services) { await services.db.terminate(); await deleteApp(services.app); }
}
