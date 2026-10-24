import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // 5173 lo usa el CRM en local
    proxy: { '/api': 'http://localhost:3100' },
  },
  build: { outDir: '../../public', emptyOutDir: true },
});
