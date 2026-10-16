import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd()), ...process.env };
  if (mode === 'cloud') {
    if (env.VITE_AUTH_MODE !== 'firebase') throw new Error('Cloud build requires VITE_AUTH_MODE=firebase.');
    for (const key of ['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_APP_ID', 'VITE_FIREBASE_AUTH_DOMAIN']) if (!env[key]) throw new Error(`Missing ${key} for cloud build.`);
    if (env.VITE_FIREBASE_PROJECT_ID?.startsWith('demo-')) throw new Error('Cloud build cannot use a demo project.');
  }
  if (mode !== 'development' && env.VITE_AUTH_MODE === 'emulator') throw new Error('Emulator authentication cannot be shipped in a production bundle.');
  return {
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: Number(env.VITE_DEV_PORT ?? 5173), strictPort: true,
    proxy: { '/api': env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3001' },
    watch: { ignored: ['**/data/**', '**/*.sqlite*'] },
    fs: { deny: ['.env', '.env.*', '**/.git/**', '**/data/**', '**/.wwebjs_auth/**', '**/.baileys_auth/**'] },
  },
  build: { outDir: 'dist', sourcemap: false },
  };
});
