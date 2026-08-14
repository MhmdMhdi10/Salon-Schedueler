import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Smoke tests for Persian default bundle and RTL direction.
 * Requirements: 17.1, 17.2
 */
describe('Persian Localization and RTL', () => {
  describe('i18n configuration', () => {
    const i18nConfig = readFileSync(resolve(__dirname, '../i18n/index.ts'), 'utf-8');

    it('sets Persian (fa) as the default language', () => {
      expect(i18nConfig).toContain("lng: 'fa'");
    });

    it('sets Persian (fa) as the fallback language', () => {
      expect(i18nConfig).toContain("fallbackLng: 'fa'");
    });

    it('imports the Persian translation bundle', () => {
      expect(i18nConfig).toContain("import fa from './fa.json'");
    });
  });

  describe('Persian translation bundle', () => {
    const bundle = JSON.parse(readFileSync(resolve(__dirname, '../i18n/fa.json'), 'utf-8'));

    it('contains Persian text (non-ASCII characters)', () => {
      expect(bundle.app.title).toMatch(/[\u0600-\u06FF]/); // Arabic/Persian unicode range
    });

    it('has all required sections', () => {
      expect(bundle.app).toBeDefined();
      expect(bundle.auth).toBeDefined();
      expect(bundle.booking).toBeDefined();
      expect(bundle.salon).toBeDefined();
      expect(bundle.admin).toBeDefined();
      expect(bundle.common).toBeDefined();
    });
  });

  describe('RTL root direction', () => {
    const htmlContent = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');

    it('HTML root element has dir="rtl"', () => {
      expect(htmlContent).toContain('dir="rtl"');
    });

    it('HTML root element has lang="fa"', () => {
      expect(htmlContent).toContain('lang="fa"');
    });
  });

  describe('App component RTL', () => {
    const appContent = readFileSync(resolve(__dirname, '../App.tsx'), 'utf-8');

    it('App root div has dir="rtl"', () => {
      expect(appContent).toContain('dir="rtl"');
    });

    it('App root div has lang="fa"', () => {
      expect(appContent).toContain('lang="fa"');
    });
  });
});
