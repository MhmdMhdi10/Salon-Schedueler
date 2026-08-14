import { describe, it, expect } from 'vitest';
import i18n from './index';

/**
 * Verifies that interpolated numeric values render with Persian/Eastern-Arabic
 * digits across the catalog (R7.4), while strings and pluralization are
 * unaffected. The i18n instance configures a global interpolation `format`
 * (see ./index.ts) so every surface gets Persian numerals for free.
 */
describe('i18n Persian numeral interpolation', () => {
  it('localizes a numeric interpolation to Persian digits', () => {
    // booking.durationMinutes: "{{count}} دقیقه"
    expect(i18n.t('booking.durationMinutes', { count: 30 })).toContain('۳۰');
    expect(i18n.t('booking.durationMinutes', { count: 30 })).not.toContain('30');
  });

  it('localizes multiple numeric interpolations in one string', () => {
    // funnel.stepLabel: "مرحله {{current}} از {{total}}"
    const out = i18n.t('funnel.stepLabel', { current: 2, total: 4 });
    expect(out).toContain('۲');
    expect(out).toContain('۴');
    expect(out).not.toMatch(/[0-9]/);
  });

  it('localizes the footer year to Persian digits', () => {
    // app.footer: "© {{year}} سامانه رزرو سالن"
    expect(i18n.t('app.footer', { year: 1404 })).toContain('۱۴۰۴');
  });

  it('leaves pre-localized string interpolations untouched', () => {
    // auth.resendIn: "ارسال مجدد تا {{time}}" — caller passes Persian text.
    const out = i18n.t('auth.resendIn', { time: '۰:۴۵' });
    expect(out).toContain('۰:۴۵');
  });
});
