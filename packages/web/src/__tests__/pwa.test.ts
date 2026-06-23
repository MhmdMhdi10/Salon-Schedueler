import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Smoke tests for PWA manifest and service-worker registration.
 * Requirements: 18.1
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
