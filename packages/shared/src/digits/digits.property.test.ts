import fc from 'fast-check';
import { toPersianDigits, normalizeDigits } from './index';

/**
 * Property Tests — Feature: signature-ui-system
 *
 * Property 15: Digit display/normalization round-trips — Validates: Requirements 8.2
 *
 * `toPersianDigits` is the display localizer (ui-ux §4: render Persian numerals
 * for prices/dates/counts/timers) and `normalizeDigits` is the submit-time
 * inverse (phone/OTP fields keep Latin entry, then normalize before validation).
 * These three properties pin the contract that the two transforms are mutual
 * inverses over the digit alphabet, that display output carries no ASCII digits,
 * and that form inputs typed/pasted as Persian normalize back to Latin.
 *
 * Each property runs >= 100 generated cases.
 */
const RUNS = { numRuns: 100 };

describe('Property 15: digit display/normalization round-trips', () => {
  it('normalizeDigits(toPersianDigits(x)) === String(x) for any integer', () => {
    fc.assert(
      fc.property(fc.integer(), (x) => {
        expect(normalizeDigits(toPersianDigits(x))).toBe(String(x));
      }),
      RUNS,
    );
  });

  it('display output contains no ASCII digits (0-9)', () => {
    fc.assert(
      fc.property(fc.integer(), (x) => {
        expect(toPersianDigits(x)).not.toMatch(/[0-9]/);
      }),
      RUNS,
    );
  });

  it('form inputs keep Latin entry: Persian-digit input normalizes back to Latin for submit', () => {
    // A digit string the field could receive as Persian numerals (e.g. a pasted
    // «۰۹…» phone/OTP). After normalization it must equal the Latin form the
    // domain layer expects.
    const digitString = fc.stringOf(
      fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
      { minLength: 1, maxLength: 20 },
    );
    fc.assert(
      fc.property(digitString, (ascii) => {
        const persian = toPersianDigits(ascii);
        // The displayed/entered Persian form recovers the exact Latin string.
        expect(normalizeDigits(persian)).toBe(ascii);
        // And the normalized result is pure ASCII digits (machine-readable).
        expect(normalizeDigits(persian)).toMatch(/^[0-9]+$/);
      }),
      RUNS,
    );
  });
});
