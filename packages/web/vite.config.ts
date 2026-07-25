import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // The repo's `node_modules` can be root-owned (from a prior Docker build),
  // which makes Vite's default cache dir (`node_modules/.vite`) unwritable and
  // breaks dep optimization with EACCES. Allow overriding the cache location to
  // a writable path via `VITE_CACHE_DIR` so `npm run dev` works without changing
  // node_modules ownership; falls back to the default when unset.
  cacheDir: process.env.VITE_CACHE_DIR || undefined,
  // In Docker dev the web container runs with a TTY (so Vite's incremental
  // output — `hmr update …`, errors — flushes to `docker compose logs` in real
  // time instead of being block-buffered). Vite clears the terminal on each
  // update by default, which would wipe the `docker logs` scrollback; keep the
  // history readable. Harmless for native dev (just disables the screen clear).
  clearScreen: false,
  plugins: [
    react(),
    // PWA service worker via the `injectManifest` strategy (task 4.5; design
    // "PWA strategy"). The hand-written source lives at `public/sw.js` and
    // keeps its `install`/`activate`/`fetch` handlers; at build time the plugin
    // bundles it (inlining the Workbox modules) and replaces `self.__WB_MANIFEST`
    // with the precache manifest of the built app shell, emitting `dist/sw.js`.
    // `src/main.tsx` still registers `/sw.js`, so the existing PWA tests stay
    // valid. We hand-author `public/manifest.json` and register the SW
    // ourselves, so the plugin must not generate either.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        // Precache only the public app shell — never private/funnel HTML
        // (R11.6). Public route HTML is added by the prerender step and is
        // safe to serve offline; the shell entry is index.html.
        globPatterns: [
          'index.html',
          'manifest.json',
          'assets/**/*.{js,css}',
          'fonts/**/*.woff2',
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  optimizeDeps: {
    // `@salon/shared` is a symlinked workspace package compiled to **CommonJS**
    // (`dist/index.js`, no `"type":"module"`). The web app imports its named
    // exports (e.g. `getJalaliMonthName`) as ESM. Vite does NOT pre-bundle
    // linked workspace packages by default, so in dev the browser receives the
    // raw CJS barrel — and because the package re-exports through a wildcard
    // (`export * from './jalali/index.js'` → `__exportStar`), the ESM named
    // imports can't be statically resolved and fail at runtime with
    // "does not provide an export named 'getJalaliMonthName'". Forcing it into
    // `optimizeDeps.include` makes esbuild pre-bundle it to interop-correct ESM
    // with the named exports resolved (the production build solves the same
    // problem via `build.commonjsOptions.include` below).
    include: ['@salon/shared'],
  },
  build: {
    commonjsOptions: {
      // `@salon/shared` is a symlinked workspace package compiled to CommonJS,
      // so its real path resolves outside `node_modules`. The CJS→ESM
      // interop plugin's default `include` (`/node_modules/`) would skip it,
      // leaving its `__exportStar` barrel untransformed — which means Rollup
      // cannot statically see named exports re-exported through the wildcard
      // (e.g. `gregorianToJalali`) and the build fails. Explicitly include the
      // shared package so its named exports resolve.
      include: [/node_modules/, /packages[\\/]shared[\\/]dist/],
    },
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        // Split heavy third-party libraries into their own vendor chunks so
        // they load **only** on the routes that import them (task 11.1; R9.3;
        // seo §9, ui-ux §12). Without this, Rollup merges the shared UI
        // primitives into one large chunk — pulling the Radix-based overlay
        // components (Toast/Dialog/Sheet/Select/…) onto the public marketing,
        // salon-profile, discovery, and legal pages that only use the light
        // display primitives (Card, DirText, SeoHead). Isolating Radix and
        // Framer Motion keeps the public pages' initial JS within the ~150KB
        // gzip budget, while the admin/funnel routes still get them on demand.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|use-sync-external-store)[\\/]/.test(
                id,
              )
            ) {
              // Keep the React/router runtime in its own small vendor chunk so
              // Rollup never hoists it into `vendor-radix` (which would force
              // Radix onto every React-using page and blow the public budget).
              return 'vendor-react';
            }
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (
              id.includes('framer-motion') ||
              id.includes('motion-dom') ||
              id.includes('motion-utils')
            ) {
              return 'vendor-motion';
            }
            return undefined;
          }
          return undefined;
        },
      },
    },
  },
  server: {
    // Bind to all interfaces so the dev server is reachable from outside the
    // container, and proxy the API so the browser stays same-origin (no CORS).
    host: true,
    port: 5173,
    // File watching in Docker dev: the source tree is bind-mounted into the
    // container, but native inotify events from the host aren't reliably
    // delivered across the mount boundary, so Vite's watcher never fires and
    // edits don't trigger HMR (the same caveat the mobile/Expo service notes).
    // When `VITE_DEV_POLLING` is set (Docker dev — see docker-compose.yml) fall
    // back to polling so host edits are picked up promptly. Native `npm run dev`
    // leaves this unset to keep watching event-driven and avoid the extra CPU.
    // node_modules/.git stay ignored by Vite's defaults, so polling stays cheap.
    watch: process.env.VITE_DEV_POLLING
      ? { usePolling: true, interval: 100 }
      : undefined,
    // HMR websocket reachability: the browser opens the HMR socket back on the
    // port it loaded the page from. In Docker the container's Vite port (5173)
    // is published on a different host port (e.g. 5273 via the dev override), so
    // tell the client which port to reach through `VITE_HMR_CLIENT_PORT`. Unset
    // (native dev, or a 1:1 port map) → Vite falls back to the page's own port.
    hmr: process.env.VITE_HMR_CLIENT_PORT
      ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) }
      : undefined,
    proxy: {
      '/api': {
        // In Docker dev this is set to http://backend:3000. Native Vite uses
        // the host port from docker-compose.override.yml, where this project's
        // backend is published on 3110 to avoid local port collisions.
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3110',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15_000,
  },
});
