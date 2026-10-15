import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3001' },
    watch: { ignored: ['**/data/**', '**/*.sqlite*'] },
    fs: { deny: ['.env', '.env.*', '**/.git/**', '**/data/**', '**/.wwebjs_auth/**', '**/.baileys_auth/**'] },
  },
  build: { outDir: 'dist', sourcemap: false },
});
