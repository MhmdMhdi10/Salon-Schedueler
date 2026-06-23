/**
 * Service worker for the Salon Booking PWA.
 * Provides offline app shell caching via a cache-first strategy.
 */

const CACHE_NAME = 'salon-booking-v1';
const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first for API calls
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for app shell
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
