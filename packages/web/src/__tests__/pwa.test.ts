import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Smoke tests for PWA manifest and service-worker registration.
 * Requirements: 18.1, 15.2, 15.4
 */
describe('PWA Configuration', () => {
  describe('manifest.json', () => {
    const manifestPath = resolve(__dirname, '../../public/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    it('has required PWA fields', () => {
      expect(manifest.name).toBeDefined();
      expect(manifest.short_name).toBeDefined();
      expect(manifest.start_url).toBe('/');
      expect(manifest.display).toBe('standalone');
    });

    it('specifies RTL direction and Persian language', () => {
      expect(manifest.dir).toBe('rtl');
      expect(manifest.lang).toBe('fa');
    });

    it('has at least two icon sizes for installability', () => {
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
      const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');
    });

    it('has a theme_color and background_color', () => {
      expect(manifest.theme_color).toBeDefined();
      expect(manifest.background_color).toBeDefined();
    });
  });

  describe('Service Worker registration', () => {
    it('sw.js file exists and has install/activate/fetch handlers', () => {
      const swPath = resolve(__dirname, '../../public/sw.js');
      const swContent = readFileSync(swPath, 'utf-8');

      expect(swContent).toContain("addEventListener('install'");
      expect(swContent).toContain("addEventListener('activate'");
      expect(swContent).toContain("addEventListener('fetch'");
    });

    it('main.tsx registers the service worker', () => {
      const mainPath = resolve(__dirname, '../main.tsx');
      const mainContent = readFileSync(mainPath, 'utf-8');

      expect(mainContent).toContain('serviceWorker');
      expect(mainContent).toContain("register('/sw.js')");
    });
  });

  describe('index.html PWA meta', () => {
    const htmlPath = resolve(__dirname, '../../index.html');
    const htmlContent = readFileSync(htmlPath, 'utf-8');

    it('includes manifest link', () => {
      expect(htmlContent).toContain('rel="manifest"');
      expect(htmlContent).toContain('href="/manifest.json"');
    });

    it('includes theme-color meta', () => {
      expect(htmlContent).toContain('name="theme-color"');
    });

    it('sets RTL direction and Persian lang', () => {
      expect(htmlContent).toContain('dir="rtl"');
      expect(htmlContent).toContain('lang="fa"');
    });
  });
});

/**
 * Service worker caching strategy verification (Req 15.2, 15.4).
 * Ensures:
 * - No auth data leakage: authenticated API calls are never cached
 * - Offline shell works: static assets are precached
 * - Proper caching strategies per resource type
 */
describe('Service Worker Caching Strategy', () => {
  const swPath = resolve(__dirname, '../../public/sw.js');
  const swContent = readFileSync(swPath, 'utf-8');

  describe('No auth data leakage (Req 15.4)', () => {
    it('rejects requests with Authorization header from cache (NetworkOnly)', () => {
      // Must check for authorization header and bypass cache
      expect(swContent).toContain("request.headers.has('authorization')");
      // Must respond with fetch only (no cache fallback)
      expect(swContent).toMatch(
        /headers\.has\(['"]authorization['"]\)[\s\S]*?respondWith\(fetch\(request\)\)/,
      );
    });

    it('never caches private API routes', () => {
      // Private API routes must be identified and fetched live
      expect(swContent).toContain('api');
      expect(swContent).toContain('auth|appointments|payments');
      expect(swContent).toContain('calendar|analytics|staff|chairs');
    });

    it('excludes /owner navigations from caching', () => {
      // Owner dashboard is private — its navigation HTML must never be stored
      expect(swContent).toContain("'/owner'");
    });

    it('excludes auth/admin/booking/qr navigations from caching', () => {
      expect(swContent).toContain("'/auth'");
      expect(swContent).toContain("'/admin'");
      expect(swContent).toContain("'/booking'");
      expect(swContent).toContain("'/qr'");
    });

    it('excludes booking funnel /salon/:id/book from cached navigations', () => {
      expect(swContent).toMatch(/\/salon\/.*\/book/);
    });

    it('only processes GET requests (POST/PUT/DELETE pass through)', () => {
      expect(swContent).toMatch(/request\.method\s*!==\s*['"]GET['"]/);
    });
  });

  describe('Offline shell works (Req 15.2)', () => {
    it('precaches the app shell (index.html, manifest, assets, fonts)', () => {
      expect(swContent).toContain("'/'");
      expect(swContent).toContain("'/index.html'");
      expect(swContent).toContain("'/manifest.json'");
      expect(swContent).toContain('__WB_MANIFEST');
    });

    it('falls back to cached index.html for offline navigations', () => {
      // Navigation handler must fall back to /index.html when offline
      expect(swContent).toContain("caches.match('/index.html')");
    });

    it('serves precached shell assets cache-first with network fallback', () => {
      // Same-origin non-API, non-image, non-font requests use cache-first
      expect(swContent).toContain(
        'caches.match(request).then((cached) => cached || fetch(request))',
      );
    });
  });

  describe('Caching strategies per resource type', () => {
    it('uses CacheFirst for images with 30-day expiration and max 100 entries', () => {
      expect(swContent).toContain('IMAGE_CACHE');
      expect(swContent).toContain('maxEntries: 100');
      expect(swContent).toContain('maxAgeSeconds: 30 * 24 * 60 * 60');
    });

    it('uses CacheFirst for fonts with 1-year expiration', () => {
      expect(swContent).toContain('FONT_CACHE');
      expect(swContent).toContain('maxAgeSeconds: 365 * 24 * 60 * 60');
    });

    it('uses StaleWhileRevalidate for public API GETs', () => {
      expect(swContent).toContain('StaleWhileRevalidate');
      expect(swContent).toContain('API_CACHE');
    });

    it('uses injectManifest strategy (not generateSW) for fine-grained control', () => {
      // The vite config must use injectManifest
      const viteConfigPath = resolve(__dirname, '../../vite.config.ts');
      const viteConfig = readFileSync(viteConfigPath, 'utf-8');
      expect(viteConfig).toContain("strategies: 'injectManifest'");
    });

    it('precaches JS, CSS, and font assets via globPatterns', () => {
      const viteConfigPath = resolve(__dirname, '../../vite.config.ts');
      const viteConfig = readFileSync(viteConfigPath, 'utf-8');
      expect(viteConfig).toContain('assets/**/*.{js,css}');
      expect(viteConfig).toContain('fonts/**/*.woff2');
    });
  });
});
