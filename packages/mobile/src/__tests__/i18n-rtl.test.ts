import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Smoke tests for Persian default bundle and RTL direction (mobile).
 * Requirements: 17.1, 17.2
 */
describe('Persian Localization and RTL (Mobile)', () => {
  describe('i18n configuration', () => {
    const i18nConfig = readFileSync(resolve(__dirname, '../i18n/index.ts'), 'utf-8');

    it('sets Persian (fa) as the default language', () => {
      expect(i18nConfig).toContain("lng: 'fa'");
    });

    it('sets Persian (fa) as the fallback language', () => {
      expect(i18nConfig).toContain("fallbackLng: 'fa'");
    });

    it('exports an isRtl helper', () => {
      expect(i18nConfig).toContain('isRtl');
    });
  });

  describe('Persian translation bundle', () => {
    const bundle = JSON.parse(
      readFileSync(resolve(__dirname, '../i18n/fa.json'), 'utf-8')
    );

    it('contains Persian text (non-ASCII characters)', () => {
      expect(bundle.app.title).toMatch(/[\u0600-\u06FF]/);
    });

    it('has auth, booking, and offline sections', () => {
      expect(bundle.auth).toBeDefined();
      expect(bundle.booking).toBeDefined();
      expect(bundle.offline).toBeDefined();
    });

    it('has offline-specific strings', () => {
      expect(bundle.offline.noData).toBeDefined();
      expect(bundle.offline.pendingSubmissions).toBeDefined();
    });
  });
});
