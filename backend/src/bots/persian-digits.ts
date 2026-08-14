/**
 * Persian-digit rendering for the in-chat booking conversation.
 *
 * The canonical implementation now lives in `@salon/shared`
 * (`packages/shared/src/digits`) so web, native, the owner panel and this
 * backend conversation all share one copy (Requirements 6.5, 6.6). This module
 * re-exports those helpers to keep the existing `./persian-digits` import paths
 * across the bots layer stable.
 *
 * - `toPersianDigits` converts Latin digits in an already-formatted display
 *   string (dates, times, counters) to Persian numerals.
 * - `normalizeDigits` converts user-typed «۰۹…» phone/OTP input back to ASCII
 *   before it reaches domain services.
 */

export { toPersianDigits, normalizeDigits } from '@salon/shared';
