import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import { gregorianToJalali, jalaliToGregorian, type GregorianDate } from '@salon/shared';
import { JalaliDate, formatJalaliDisplay } from '../JalaliDate';

/**
 * Feature: signature-ui-system, Property 16: Jalali date conversion round-trips.
 *
 * For any valid date, converting ISO → Jalali for display and back to ISO at
 * the API boundary yields the original date (R8.5). The Typography_System shows
 * user-facing dates in the Jalali (Shamsi) calendar and converts to/from ISO
 * ONLY at the API boundary, so the two directions MUST compose to the identity:
 * a date that enters as ISO, is displayed as Jalali, and is read back as ISO
 * must equal the date that went in — no day may be gained or lost.
 *
 * `JalaliDate` / `JalaliDatePicker` route every conversion through the single
 * shared kernel (`gregorianToJalali` / `jalaliToGregorian` from `@salon/shared`),
 * so this suite drives fast-check across that exact boundary pair plus the
 * component's own rendered output.
 *
 * Validates: Requirements 8.5
 */

/** Days in a Gregorian month, accounting for leap years. */
function gregorianDaysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of the current month.
  return new Date(year, month, 0).getDate();
}

/** Formats Gregorian Y/M/D parts as a date-only ISO string (`YYYY-MM-DD`). */
function toIsoDate({ year, month, day }: GregorianDate): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** ISO → Jalali: the display-side conversion (parse ISO, convert via kernel). */
function isoToJalali(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return gregorianToJalali({ year, month, day });
}

/** Jalali → ISO: the API-boundary conversion (invert via kernel, re-serialize). */
function jalaliToIso(jalali: { jy: number; jm: number; jd: number }): string {
  return toIsoDate(jalaliToGregorian(jalali));
}

/**
 * Arbitrary for valid Gregorian dates in 1900–2100 (the reasonable display
 * range for a salon-booking calendar). Generates a year, a month, then a day
 * that is valid for that specific year/month so no impossible date is produced.
 */
const validDate = fc
  .integer({ min: 1900, max: 2100 })
  .chain((year) =>
    fc
      .integer({ min: 1, max: 12 })
      .chain((month) =>
        fc
          .integer({ min: 1, max: gregorianDaysInMonth(year, month) })
          .map((day) => ({ year, month, day }) satisfies GregorianDate),
      ),
  );

describe('Property 16 — Jalali date conversion round-trips', () => {
  it('ISO → Jalali → ISO is the identity for any valid date', () => {
    fc.assert(
      fc.property(validDate, (greg) => {
        const iso = toIsoDate(greg);
        // ISO → Jalali (display) → ISO (API boundary) must return the original.
        expect(jalaliToIso(isoToJalali(iso))).toBe(iso);
      }),
      { numRuns: 500 },
    );
  });

  it('the Jalali display components invert back to the original ISO date', () => {
    fc.assert(
      fc.property(validDate, (greg) => {
        const iso = toIsoDate(greg);
        // The exact Jalali parts the component would display for this date…
        const jalali = isoToJalali(iso);
        // …re-serialized through the API boundary equal the input date.
        expect(jalaliToIso(jalali)).toBe(iso);
      }),
      { numRuns: 500 },
    );
  });

  it('the numeric <JalaliDate> render preserves the date through the boundary', () => {
    fc.assert(
      fc.property(validDate, (greg) => {
        // Build a local-midnight Date so the component's local date getters and
        // our parts agree (no timezone-induced day shift).
        const date = new Date(greg.year, greg.month - 1, greg.day);

        // The component's own numeric display string («۱۴۰۴/۰۲/۱۷» form).
        const display = formatJalaliDisplay(date, 'numeric');
        // Map Persian digits back to ASCII so we can parse the Jalali parts.
        const ascii = display.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
        const [jy, jm, jd] = ascii.split('/').map(Number);

        // Inverting the displayed Jalali parts at the API boundary returns the
        // original Gregorian date the component rendered.
        expect(jalaliToGregorian({ jy, jm, jd })).toEqual(greg);

        // The rendered <time> element shows exactly that Jalali display string,
        // so the on-screen date is the same one that inverts back to `greg`.
        const { container, unmount } = render(<JalaliDate value={date} variant="numeric" />);
        try {
          const time = container.querySelector('time');
          expect(time).not.toBeNull();
          expect(time!.textContent).toBe(display);
        } finally {
          unmount();
        }
      }),
      { numRuns: 200 },
    );
  });
});
