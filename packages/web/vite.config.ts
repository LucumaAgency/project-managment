import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // 5173 lo usa el CRM en local
    // Subdominios locales como en producción: lucuma.lvh.me:5174 (lvh.me apunta a 127.0.0.1).
    // Requiere BASE_DOMAIN=lvh.me en el .env; sin eso se usa ?cuenta=slug.
    allowedHosts: ['localhost', '.lvh.me'],
    // changeOrigin en false: la API necesita el Host original para saber la cuenta.
    proxy: { '/api': { target: 'http://localhost:3100', changeOrigin: false } },
  },
  build: { outDir: '../../public', emptyOutDir: true },
});
