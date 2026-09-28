import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite configuration.
 *
 * In development the client talks to `/api`, which this server proxies to the
 * local gateway — so the browser only ever sees one origin, and the same build
 * runs behind the gateway in production without a CORS story.
 */
const gateway = process.env.ORBISYN_GATEWAY_URL ?? 'http://127.0.0.1:8787';

/**
 * Hosts the dev server answers for.
 *
 * `localhost` alone is not enough in practice: tunnels, container previews and
 * reverse proxies all send a `Host` header the process has never heard of, and
 * Vite answers those with 403 before the app even loads. The suffixes below
 * cover the hosted preview environments we actually deploy into.
 */
const ALLOWED_HOSTS = ['.e2b.app', '.e2b.dev', '.trycloudflare.com', 'localhost', '127.0.0.1'];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ALLOWED_HOSTS,
    proxy: {
      '/api': {
        target: gateway,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ALLOWED_HOSTS,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
  },
});
