import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to all interfaces so the dev server is reachable from outside the
    // container, and proxy the API so the browser stays same-origin (no CORS).
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        // In Docker dev this is set to http://backend:3000; locally it defaults
        // to a backend on localhost:3000.
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
