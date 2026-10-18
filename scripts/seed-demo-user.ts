import 'dotenv/config';
import { deleteApp } from 'firebase-admin/app';
import { firebaseServices } from '../server/firebase.js';
import { seedSampleAccount } from './lib/demo-user.js';

// No default emulator hosts or project are supplied here: a mistaken cloud shell fails closed.
let services: ReturnType<typeof firebaseServices> | undefined;
try {
  const result = await seedSampleAccount(process.env, projectId => services = firebaseServices(projectId));
  console.log(`Local sample account ${result.email}: ${result.result}${result.tripCount === undefined ? '' : ` (${result.tripCount} simulated trips with public OSM paths)`}.`);
} finally {
  if (services) { await services.db.terminate(); await deleteApp(services.app); }
}
