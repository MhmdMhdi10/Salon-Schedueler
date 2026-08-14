import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fa from './fa.json';
import { toPersianDigits } from '../components/ui/Num';

/**
 * Localizes interpolated **numeric** values to Persian/Eastern-Arabic digits for
 * display (R7.4, ui-ux §4 & §11). With `alwaysFormat`, i18next runs the active
 * formatter for every interpolation; we only rewrite values that are plain
 * numbers so user-facing counts, years, durations, and step positions read
 * natively in Farsi («۳ دقیقه», «© ۱۴۰۴») without touching:
 *   - strings (callers that need Persian digits already pass pre-localized text,
 *     e.g. the OTP phone/timer via `toPersianDigits`), and
 *   - machine/data values that must stay ASCII (currency codes, IRR amounts in
 *     JSON-LD are built outside i18n).
 *
 * Pluralization is unaffected: i18next selects the plural form from the raw
 * number before formatting runs, so `count`-driven keys still resolve correctly.
 */
function localizeNumber(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return toPersianDigits(value);
  }
  return undefined;
}

/**
 * Custom formatter module (i18next v26+). The legacy monolithic
 * `interpolation.format` function was removed in v26 — the built-in `Formatter`
 * is now always used — so a global "localize every interpolated value" hook must
 * be provided as a formatter plugin via `.use()`. With `alwaysFormat: true` this
 * `format` runs for every interpolation regardless of whether the key declares a
 * named format, giving every surface Persian numerals for free.
 */
const persianNumeralFormatter = {
  type: 'formatter' as const,
  init() {
    /* no setup required */
  },
  format(value: unknown): string {
    return localizeNumber(value) ?? String(value);
  },
  add() {
    /* named formats are not used */
  },
  addCached() {
    /* named cached formats are not used */
  },
};

i18n
  .use(persianNumeralFormatter)
  .use(initReactI18next)
  .init({
    resources: {
      fa: { translation: fa },
    },
    lng: 'fa', // Persian as default
    fallbackLng: 'fa',
    interpolation: {
      escapeValue: false, // React already handles XSS
      // `alwaysFormat` makes i18next run the formatter for *every* interpolated
      // value (not only `{{x, fmt}}` tokens), so plain `{{count}}`/`{{year}}`
      // values are localized to Persian digits everywhere.
      alwaysFormat: true,
    },
  });

export default i18n;
