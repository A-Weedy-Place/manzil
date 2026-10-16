import 'dotenv/config';
import { readConfig } from '../server/config.js';
const config = readConfig();
const supported = Number(process.versions.node.split('.')[0]) > 24 || Number(process.versions.node.split('.')[0]) === 24 && Number(process.versions.node.split('.')[1]) >= 12;
console.log(JSON.stringify({ mode: config.mode, role: config.role, host: config.host, port: config.port, projectId: config.projectId || '(standalone)',
  storage: config.mode === 'local' ? 'sqlite' : 'firestore', node: process.version,
  nodeSupported: supported,
  speechEnabled: process.env.TTS_ENABLED === 'true' }, null, 2));
// This validates configuration only. It never creates cloud resources or verifies billing.
if (!supported) process.exitCode = 1;
