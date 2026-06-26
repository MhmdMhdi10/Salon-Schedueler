import { forwardRef } from 'react';
import {
  gregorianToJalali,
  getJalaliMonthName,
} from '@salon/shared';
import { cn } from './cn';
import { toPersianDigits } from './Num';

/**
 * Persian weekday names indexed by the JS `Date.getDay()` value
 * (0 = Sunday … 6 = Saturday). The Iranian week starts on Saturday, but this
 * lookup is keyed by the platform day-of-week so the *name* is always correct
 * regardless of week ordering.
 */
const PERSIAN_WEEKDAYS_BY_JS_DAY = [
  'یکشنبه', // 0 Sunday
  'دوشنبه', // 1 Monday
  'سه‌شنبه', // 2 Tuesday
  'چهارشنبه', // 3 Wednesday
  'پنجشنبه', // 4 Thursday
  'جمعه', // 5 Friday
  'شنبه', // 6 Saturday
] as const;

export type JalaliDateStyle = 'long' | 'numeric';

export interface JalaliDateProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * The date to render. Accepts a `Date`, an ISO string, or epoch millis. The
   * value is Gregorian/ISO (the API boundary form); conversion to Jalali for
   * display happens here only (R7.2, R7.3 — reuses the shared converter).
   */
  value: Date | string | number;
  /**
   * `long` (default) → «۱۷ اردیبهشت ۱۴۰۴»; `numeric` → «۱۴۰۴/۰۲/۱۷».
   */
  variant?: JalaliDateStyle;
  /** Prefix the weekday name, e.g. «چهارشنبه ۱۷ اردیبهشت ۱۴۰۴». */
  withWeekday?: boolean;
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Builds the Jalali display string for a date using the shared converter. Pure
 * helper exported for non-JSX call sites (aria-labels, option text).
 */
export function formatJalaliDisplay(
  value: Date | string | number,
  variant: JalaliDateStyle = 'long',
  withWeekday = false,
): string {
  const date = toDate(value);
  const jalali = gregorianToJalali({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });

  let body: string;
  if (variant === 'numeric') {
    const mm = String(jalali.jm).padStart(2, '0');
    const dd = String(jalali.jd).padStart(2, '0');
    body = toPersianDigits(`${jalali.jy}/${mm}/${dd}`);
  } else {
    body = `${toPersianDigits(jalali.jd)} ${getJalaliMonthName(jalali.jm)} ${toPersianDigits(
      jalali.jy,
    )}`;
  }

  if (withWeekday) {
    const weekday = PERSIAN_WEEKDAYS_BY_JS_DAY[date.getDay()];
    return `${weekday} ${body}`;
  }
  return body;
}

/**
 * Renders a Gregorian/ISO date as a Jalali (Shamsi) date with Persian month
 * names and Persian digits (ui-ux §11, R7.2). Emits a semantic `<time>` element
 * whose `dateTime` keeps the machine-readable ISO date, while the visible text
 * is the localized Jalali string wrapped for bidi safety.
 *
 * Usage:
 *   <JalaliDate value={appointment.startAt} withWeekday />
 *   <JalaliDate value="2025-05-07" variant="numeric" />
 */
export const JalaliDate = forwardRef<HTMLTimeElement, JalaliDateProps>(
  function JalaliDate(
    { value, variant = 'long', withWeekday = false, className, ...rest },
    ref,
  ) {
    const date = toDate(value);
    const display = formatJalaliDisplay(value, variant, withWeekday);
    // Machine-readable ISO date (YYYY-MM-DD) for the `datetime` attribute.
    const iso = Number.isNaN(date.getTime())
      ? undefined
      : date.toISOString().slice(0, 10);
    return (
      <time
        ref={ref}
        dateTime={iso}
        dir="rtl"
        className={cn('whitespace-nowrap', className)}
        {...rest}
      >
        {display}
      </time>
    );
  },
);
