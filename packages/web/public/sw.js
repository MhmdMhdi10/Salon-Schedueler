/**
 * Service worker source for the Salon Booking PWA (task 4.5; design "PWA
 * strategy"; R11.1–R11.6; seo §9 "PWA caching"; ui-ux §12).
 *
 * Authored as the `injectManifest` source for `vite-plugin-pwa` (see
 * `vite.config.ts`). At build time the plugin bundles this file (inlining the
 * Workbox modules) and replaces the `self.__WB_MANIFEST` injection point with
 * the precache manifest of the built app shell, emitting the final `/sw.js`
 * into `dist/`. `src/main.tsx` continues to register `/sw.js`, so the existing
 * PWA smoke tests (which assert `install`/`activate`/`fetch` handlers here and
 * the `register('/sw.js')` call) stay valid.
 *
 * ## Caching strategy (seo §9, design)
 *   - **App shell** → precache (CacheFirst against the injected manifest) so the
 *     app still loads offline (R11.3).
 *   - **Salon images** → CacheFirst with expiration (bounded, fast repeat views).
 *   - **Public API GETs** → StaleWhileRevalidate (instant paint, refresh behind).
 *
 * ## Safety — never leak one user's data to another (R11.6, seo §9)
 *   - Requests carrying an `Authorization` header (authenticated API calls) are
 *     **never** cached — always network, no fallback that could persist them.
 *   - `noindex`/authenticated **navigations** (auth, admin, the booking funnel,
 *     QR landings) are served network-first and their responses are **never**
 *     stored, so private/stale HTML is never replayed (to a crawler or another
 *     user). Only the public shell (`/`, `/index.html`) is precached.
 */

import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

const SHELL_CACHE = 'salon-shell-v2';
const IMAGE_CACHE = 'salon-images-v2';
const API_CACHE = 'salon-public-api-v2';

/**
 * The build-time precache manifest, injected by `vite-plugin-pwa`'s
 * `injectManifest` at the `self.__WB_MANIFEST` point. At runtime it is an array
 * of `{ url, revision }` entries for the built app shell. We precache only the
 * shell assets plus the navigation entry so the app loads offline; private HTML
 * is never part of this set.
 */
const PRECACHE_ENTRIES = self.__WB_MANIFEST || [];
const SHELL_URLS = Array.from(
  new Set(['/', '/index.html', '/manifest.json', ...PRECACHE_ENTRIES.map((e) => e.url)])
);

const KNOWN_CACHES = [SHELL_CACHE, IMAGE_CACHE, API_CACHE];

/** Path prefixes whose navigations are private/transactional — never cached. */
const NOINDEX_NAV_PREFIXES = ['/auth', '/admin', '/booking', '/qr'];

function isNoindexNavigation(url) {
  const path = url.pathname;
  if (NOINDEX_NAV_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return true;
  }
  // Booking funnel steps live under /salon/:id/book(/confirm).
  return /^\/salon\/[^/]+\/book(\/|$)/.test(path);
}

function isImageRequest(request, url) {
  return (
    request.destination === 'image' ||
    /\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname)
  );
}

const imageStrategy = new CacheFirst({
  cacheName: IMAGE_CACHE,
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
  ],
});

const publicApiStrategy = new StaleWhileRevalidate({
  cacheName: API_CACHE,
  plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
});

// Install: precache the public app shell so the app loads offline (R11.3).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

// Activate: drop caches from older SW versions, then take control immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !KNOWN_CACHES.includes(key)).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: route each request to the safe strategy; never cache authed/private.
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GETs are cacheable; let the network handle everything else.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // SAFETY: authenticated API calls carry a bearer token — never cache them,
  // and never serve a cached fallback that could belong to another user.
  if (request.headers.has('authorization')) {
    event.respondWith(fetch(request));
    return;
  }

  // Salon imagery → CacheFirst (bounded by expiration).
  if (isImageRequest(request, url)) {
    event.respondWith(imageStrategy.handle({ request, event }));
    return;
  }

  // API GETs.
  if (sameOrigin && url.pathname.startsWith('/api/')) {
    // SAFETY: only *public* API GETs are cached. Anything that looks
    // user-scoped (calendar/analytics/appointments/payments/auth) is always
    // fetched live and never persisted.
    const isPrivateApi = /^\/api\/(auth|appointments|payments)\b/.test(url.pathname) ||
      /\/(calendar|analytics|staff|chairs)\b/.test(url.pathname);
    if (isPrivateApi) {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(publicApiStrategy.handle({ request, event }));
    return;
  }

  // Navigations: serve the precached shell offline, but NEVER store private
  // (noindex/authenticated) HTML — fetch those live so stale private pages are
  // never replayed (R11.6).
  if (request.mode === 'navigate') {
    if (isNoindexNavigation(url)) {
      event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
      return;
    }
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Precached shell assets (hashed JS/CSS/fonts) → cache-first, fall back to net.
  if (sameOrigin) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
