import { spawn } from 'node:child_process';
import { firebaseServices } from '../server/firebase.js';
import { readConfig } from '../server/config.js';

const apiPort = process.env.MANZIL_DEV_API_PORT ?? '3001', webPort = process.env.MANZIL_DEV_WEB_PORT ?? '5173', workerPort = process.env.MANZIL_DEV_WORKER_PORT ?? '3002';
Object.assign(process.env, { MANZIL_MODE: 'emulator', FIREBASE_PROJECT_ID: 'demo-manzil', GOOGLE_CLOUD_PROJECT: 'demo-manzil',
  MANZIL_SERVICE_ROLE: 'api',
  PORT: apiPort, VITE_DEV_PORT: webPort, VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
  VITE_AUTH_MODE: 'emulator', VITE_FIREBASE_PROJECT_ID: 'demo-manzil', VITE_FIREBASE_API_KEY: 'demo-api-key', VITE_FIREBASE_APP_ID: 'demo-app',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-manzil.firebaseapp.com', X_SCRAPER_ENABLED: 'false', TTS_ENABLED: 'false' });
// readConfig rejects a real project or missing/non-loopback emulators before seeding.
const config = readConfig();
const { auth } = firebaseServices(config.projectId);
for (const account of [
  { uid: 'dev-user', email: 'user@manzil.test', password: 'ManzilUser123!', displayName: 'Demo traveller', admin: false },
  { uid: 'dev-admin', email: 'admin@manzil.test', password: 'ManzilAdmin123!', displayName: 'Demo administrator', admin: true },
]) {
  const { admin: _admin, ...user } = account;
  try { await auth.getUser(account.uid); } catch (error) { if ((error as { code: string }).code !== 'auth/user-not-found') throw error; await auth.createUser(user); }
  await auth.setCustomUserClaims(account.uid, { admin: account.admin });
}
console.log('Local Firebase accounts seeded. No cloud project or paid APIs are used.');
const child = spawn(process.execPath, [process.env.npm_execpath!, 'run', 'dev'], { stdio: 'inherit', env: process.env });
const worker = spawn(process.execPath, ['--import', 'tsx', '--watch', 'server/index.ts'], { stdio: 'inherit', env: { ...process.env, MANZIL_SERVICE_ROLE: 'worker', PORT: workerPort } });
let checking = false;
async function tick() {
  if (checking) return; checking = true;
  try {
    const login = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@manzil.test', password: 'ManzilAdmin123!', returnSecureToken: true }) });
    const token = (await login.json()).idToken;
    if (!token) throw new Error();
    for (const job of ['commutes', 'source', 'fuel']) {
      const result = await fetch(`http://127.0.0.1:${workerPort}/internal/tick`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ job }) });
      if (!result.ok) throw new Error();
    }
  } catch { console.error('Local scheduled check did not complete; it will retry.'); }
  finally { checking = false; }
}
const initial = setTimeout(() => void tick(), 5000), timer = setInterval(() => void tick(), 60_000);
function stop() { clearTimeout(initial); clearInterval(timer); child.kill('SIGINT'); worker.kill('SIGINT'); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.on('exit', code => { stop(); process.exit(code ?? 1); });
worker.on('exit', code => { stop(); process.exit(code ?? 1); });
