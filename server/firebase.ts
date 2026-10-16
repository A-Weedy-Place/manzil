import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
export function firebaseServices(projectId: string) {
  const name = `manzil-${projectId}`;
  const app = getApps().find(value => value.name === name) ?? initializeApp({ projectId }, name);
  const db = getFirestore(app);
  return { app, auth: getAuth(app), db };
}
