import * as fc from 'fast-check';
import jalaali from 'jalaali-js';
import { gregorianToJalali, jalaliToGregorian } from './index';

// Feature: salon-booking-system, Property 12: Jalali calendar round-trip

/**
 * Helper: returns the number of days in a Gregorian month, accounting for leap years.
 */
function gregorianDaysInMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of current month
  return new Date(year, month, 0).getDate();
}

/**
 * Arbitrary for valid Gregorian dates in the range 1800–2100.
 * Generates year, month (1-12), and a valid day for that year/month.
 */
const validGregorianDate = fc
  .integer({ min: 1800, max: 2100 })
  .chain((year) =>
    fc.integer({ min: 1, max: 12 }).chain((month) => {
      const maxDay = gregorianDaysInMonth(year, month);
      return fc.integer({ min: 1, max: maxDay }).map((day) => ({ year, month, day }));
    }),
  );

/**
 * Arbitrary for valid Jalali dates in a reasonable range.
 * Jalali year range: 1178 (≈ Gregorian 1800) to 1479 (≈ Gregorian 2100).
 * Uses jalaali-js to determine month length (accounts for leap years).
 */
const validJalaliDate = fc
  .integer({ min: 1178, max: 1479 })
  .chain((jy) =>
    fc.integer({ min: 1, max: 12 }).chain((jm) => {
      const maxDay = jalaali.jalaaliMonthLength(jy, jm);
      return fc.integer({ min: 1, max: maxDay }).map((jd) => ({ jy, jm, jd }));
    }),
  );

describe('Property 12: Jalali calendar round-trip', () => {
  /**
   * Validates: Requirements 17.4
   *
   * For any valid Gregorian date, converting it to a Jalali date and back
   * yields the original Gregorian date exactly.
   */
  it('Gregorian -> Jalali -> Gregorian round-trip preserves the original date', () => {
    fc.assert(
      fc.property(validGregorianDate, (d) => {
        const jalali = gregorianToJalali(d);
        const back = jalaliToGregorian(jalali);
        expect(back).toEqual(d);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 17.4
   *
   * For any valid Jalali date, converting it to a Gregorian date and back
   * yields the original Jalali date exactly.
   */
  it('Jalali -> Gregorian -> Jalali round-trip preserves the original date', () => {
    fc.assert(
      fc.property(validJalaliDate, (j) => {
        const greg = jalaliToGregorian(j);
        const back = gregorianToJalali(greg);
        expect(back).toEqual(j);
      }),
      { numRuns: 100 },
    );
  });
});
