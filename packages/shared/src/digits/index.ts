/**
 * Persian / Eastern-Arabic digit helpers — the single cross-platform source of
 * truth for digit localization (Requirements 6.5, 6.6; ui-ux §4, R7.4/R7.6).
 *
 * Display surfaces (web, native, owner panel, the in-chat bot conversation)
 * render Persian numerals (۰۱۲۳۴۵۶۷۸۹) for prices, dates, counts and timers via
 * {@link toPersianDigits}; inbound values (phone numbers, OTP codes) are
 * normalized back to ASCII with {@link normalizeDigits} before they reach the
 * domain layer. These are pure, dependency-free string transforms so they work
 * identically on every platform that consumes `@salon/shared`.
 */

/** Latin → Persian digit map (index = the ASCII digit value). */
export const PERSIAN_DIGITS = [
  '۰',
  '۱',
  '۲',
  '۳',
  '۴',
  '۵',
  '۶',
  '۷',
  '۸',
  '۹',
] as const;

/**
 * Replaces every ASCII digit (0-9) in `value` with its Persian equivalent.
 * Non-digit characters (separators, letters, punctuation) pass through
 * untouched so pre-formatted strings — «۱۴۰۴/۰۲/۱۷», «۲٬۵۰۰٬۰۰۰», «۰۹:۳۰» —
 * keep their grouping/separators. Accepts a number for convenience.
 *
 * Display-only: never use on values that must stay machine-readable (currency
 * codes, ISO dates, IRR amounts in JSON-LD).
 */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * Normalizes Persian (۰-۹) and Eastern-Arabic (٠-٩) digits in `value` to ASCII
 * so a user-typed or pasted «۰۹…» phone/OTP validates the same as a Latin one.
 * Non-digit characters are left untouched.
 */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}
