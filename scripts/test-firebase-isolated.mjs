// Use disposable high ports without stopping the developer's running emulators.
import { createServer } from 'node:net';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const config = JSON.parse(await readFile('firebase.test.json', 'utf8'));
const listeners = [];
for (const [service, key] of [['auth','port'],['firestore','port'],['firestore','websocketPort'],['hub','port'],['logging','port']]) {
  const server = createServer();
  await new Promise((resolve,reject)=>{ server.once('error',reject);server.listen(0,'127.0.0.1',resolve); });
  config.emulators[service][key] = server.address().port; listeners.push(server);
}
const filename = `firebase.isolated-${process.pid}.test.json`;
await writeFile(filename, JSON.stringify(config));
await Promise.all(listeners.map(server=>new Promise(resolve=>server.close(resolve))));
try {
  const command = `"${process.execPath}" node_modules/vitest/vitest.mjs run tests/firebase-integration.test.ts`;
  const child = spawn(process.execPath, ['node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--config',filename,'--project','demo-manzil-test','--only','auth,firestore',command], {stdio:'inherit'});
  process.exitCode = await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
} finally { await rm(filename,{force:true}); }
