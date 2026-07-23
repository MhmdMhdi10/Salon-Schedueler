/**
 * API-boundary date & digit utilities — thin re-exports from `@salon/shared`
 * for discoverability within the web package.
 *
 * Design rule (task 3.6b, Requirements 14.4, 14.5, 10.2):
 *  - ISO ⇄ Jalali conversion happens ONLY at the API boundary (on inbound
 *    response parse and outbound request build). Internal UI state works in
 *    Jalali exclusively.
 *  - Digit normalization (Persian/Arabic → Latin) is total (handles any string)
 *    and idempotent (applying it twice yields the same result). Apply once on
 *    form submission before validation.
 *  - `toPersianDigits` is display-only and must never be applied to values that
 *    will be sent back to the API.
 */

export {
  /** Convert an ISO date string from the API into a Jalali date (inbound). */
  isoToJalali,
  /** Convert a Jalali date to an ISO string for the API (outbound). */
  jalaliToIso,
  /** Low-level: Gregorian object → Jalali object. */
  gregorianToJalali,
  /** Low-level: Jalali object → Gregorian object. */
  jalaliToGregorian,
  /** Format a date as a Jalali display string. */
  formatJalali,
  /** Format a date as a Jalali display string with weekday name. */
  formatJalaliWithDay,
  /** Persian month names array. */
  JALALI_MONTHS,
  /** Get Persian month name by 1-based index. */
  getJalaliMonthName,
  /** Normalize Persian/Arabic digits to Latin (total, idempotent). */
  normalizeDigits,
  /** Convert Latin digits to Persian for display only. */
  toPersianDigits,
  /** Persian digit constant array (index = Latin digit value). */
  PERSIAN_DIGITS,
} from '@salon/shared';
