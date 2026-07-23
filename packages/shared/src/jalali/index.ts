import jalaali from 'jalaali-js';
import dayjs from 'dayjs';
import type { GregorianDate, JalaliDate } from '../types/domain.js';

/**
 * Converts a Gregorian date to a Jalali (Shamsi) date.
 * Uses the jalaali-js kernel for the conversion algorithm.
 *
 * @param d - Gregorian date with year, month (1-12), and day
 * @returns Jalali date with jy, jm (1-12), jd
 */
export function gregorianToJalali(d: GregorianDate): JalaliDate {
  const { jy, jm, jd } = jalaali.toJalaali(d.year, d.month, d.day);
  return { jy, jm, jd };
}

/**
 * Converts a Jalali (Shamsi) date to a Gregorian date.
 * Uses the jalaali-js kernel for the conversion algorithm.
 *
 * @param j - Jalali date with jy, jm (1-12), jd
 * @returns Gregorian date with year, month (1-12), day
 */
export function jalaliToGregorian(j: JalaliDate): GregorianDate {
  const { gy, gm, gd } = jalaali.toGregorian(j.jy, j.jm, j.jd);
  return { year: gy, month: gm, day: gd };
}

// ---------------------------------------------------------------------------
// API-boundary convenience: ISO string ⇄ JalaliDate
// ---------------------------------------------------------------------------

/**
 * Parses an ISO date string (`YYYY-MM-DD` or a full ISO-8601 datetime) into a
 * Jalali date. Used at the **inbound** API boundary: the backend returns ISO
 * strings, the UI converts once on receipt and works in Jalali everywhere else.
 *
 * Total: throws a `RangeError` for unparseable input so the caller can surface
 * a user-facing error rather than silently returning NaN fields.
 *
 * @param iso - An ISO date string (e.g. "2025-07-22" or "2025-07-22T10:30:00Z")
 * @returns JalaliDate with jy, jm (1-12), jd
 */
export function isoToJalali(iso: string): JalaliDate {
  const d = dayjs(iso);
  if (!d.isValid()) {
    throw new RangeError(`Invalid ISO date string: "${iso}"`);
  }
  return gregorianToJalali({
    year: d.year(),
    month: d.month() + 1,
    day: d.date(),
  });
}

/**
 * Converts a Jalali date back to an ISO date string (`YYYY-MM-DD`). Used at the
 * **outbound** API boundary: the UI works in Jalali internally and converts to
 * ISO only when sending data to the backend.
 *
 * Lossless round-trip: `jalaliToIso(isoToJalali(s))` recovers the original
 * date portion of `s` for any valid calendar date (Property 8).
 *
 * @param j - Jalali date with jy, jm (1-12), jd
 * @returns ISO date string "YYYY-MM-DD"
 */
export function jalaliToIso(j: JalaliDate): string {
  const { year, month, day } = jalaliToGregorian(j);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Formats a Jalali date as a display string.
 * Uses dayjs for consistent formatting and jalaali-js for conversion.
 *
 * @param d - A Gregorian date (Date object or GregorianDate) to format in Jalali
 * @param format - Format string using tokens: YYYY (year), MM (month 2-digit),
 *   M (month), DD (day 2-digit), D (day), e.g. "YYYY/MM/DD"
 * @returns Formatted Jalali date string
 */
export function formatJalali(
  d: Date | GregorianDate,
  format: string = 'YYYY/MM/DD',
): string {
  let greg: GregorianDate;
  if (d instanceof Date) {
    greg = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  } else {
    greg = d;
  }

  const jalaliDate = gregorianToJalali(greg);

  // Use dayjs to build the formatted date from the Jalali components
  const result = format
    .replace(/YYYY/g, String(jalaliDate.jy))
    .replace(/MM/g, String(jalaliDate.jm).padStart(2, '0'))
    .replace(/DD/g, String(jalaliDate.jd).padStart(2, '0'))
    .replace(/M(?!M)/g, String(jalaliDate.jm))
    .replace(/D(?!D)/g, String(jalaliDate.jd));

  return result;
}

/**
 * Formats a Jalali date with day name using dayjs for the day-of-week calculation.
 *
 * @param d - A Date object to format
 * @returns Formatted string like "شنبه ۱۴۰۳/۰۱/۰۱"
 */
export function formatJalaliWithDay(d: Date): string {
  const persianDays = [
    'یکشنبه',
    'دوشنبه',
    'سه‌شنبه',
    'چهارشنبه',
    'پنجشنبه',
    'جمعه',
    'شنبه',
  ];

  const day = dayjs(d);
  const dayOfWeek = day.day(); // 0=Sunday, 6=Saturday
  const dayName = persianDays[dayOfWeek];
  const formatted = formatJalali(d);

  return `${dayName} ${formatted}`;
}

/** Persian month names */
export const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

/**
 * Returns the Persian name of a Jalali month.
 *
 * @param month - Jalali month number (1-12)
 * @returns Persian month name
 */
export function getJalaliMonthName(month: number): string {
  if (month < 1 || month > 12) {
    throw new RangeError(`Invalid Jalali month: ${month}. Must be 1-12.`);
  }
  return JALALI_MONTHS[month - 1];
}
