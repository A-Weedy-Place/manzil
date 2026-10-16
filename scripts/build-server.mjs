import { build } from 'esbuild';
await build({ entryPoints: ['server/index.ts'], bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24', outfile: 'build/server/index.js', sourcemap: false });
