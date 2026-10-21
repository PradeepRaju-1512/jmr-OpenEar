import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// The Django backend is the only API. In development the browser talks to Vite (same origin),
// and Vite forwards /api to Django, so no CORS or cookie configuration is needed.
const DJANGO_URL = process.env.DJANGO_URL || 'http://127.0.0.1:8000';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {target: DJANGO_URL, changeOrigin: true},
    },
  },
}));
