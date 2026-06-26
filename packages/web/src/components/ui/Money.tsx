import { forwardRef } from 'react';
import { cn } from './cn';
import { toPersianDigits } from './Num';

/**
 * Arabic thousands separator (U+066C) — the grouping mark used with Persian
 * digits, e.g. «۲٬۵۰۰٬۰۰۰». Distinct from the Latin comma so grouping reads
 * natively in Farsi (ui-ux §11 numerals & currency).
 */
const PERSIAN_GROUP_SEPARATOR = '٬';

export type MoneyUnit = 'rial' | 'toman';

/** Localized currency label per unit. Rial is the machine/data unit. */
const UNIT_LABEL: Record<MoneyUnit, string> = {
  rial: 'ریال',
  toman: 'تومان',
};

/**
 * Groups an integer string into thousands using the Persian separator. Operates
 * on the absolute digit string; the caller prepends any sign.
 */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, PERSIAN_GROUP_SEPARATOR);
}

/**
 * Formats a Rial amount (the machine value) as a grouped, Persian-digit display
 * string **without** the unit label. Exported for non-JSX call sites (e.g.
 * building an `aria-label` or a chart tooltip).
 *
 * Money flows store Rial as `bigint` (see `Service.priceRial`); this accepts
 * `bigint`, `number`, or a numeric string so no precision is lost.
 */
export function formatRial(amountRial: bigint | number | string): string {
  const asBigInt =
    typeof amountRial === 'bigint' ? amountRial : BigInt(Math.trunc(Number(amountRial)));
  const negative = asBigInt < 0n;
  const absolute = (negative ? -asBigInt : asBigInt).toString();
  const grouped = groupThousands(absolute);
  const localized = toPersianDigits(grouped);
  return negative ? `\u200E-${localized}` : localized;
}

export interface MoneyProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * The **machine value** in Iranian Rial. Kept separate from the display string
   * so callers always pass the canonical Rial amount (R7.5). `bigint` is
   * preferred for large amounts to avoid float rounding.
   */
  amountRial: bigint | number | string;
  /**
   * Display unit. Defaults to `rial` (the storage unit). When `toman`, the
   * amount is divided by 10 for display only — the machine value is unchanged.
   */
  unit?: MoneyUnit;
  /** Hide the unit label (e.g. when a column header already names the unit). */
  hideUnit?: boolean;
}

/**
 * Iranian Rial money formatter. Renders Persian digits, thousands grouping, and
 * a localized unit label («۲٬۵۰۰٬۰۰۰ ریال»), bidi-isolated via `<bdi>` so the
 * number/label pair stays intact inside RTL copy (ui-ux §11, R7.5).
 *
 * The machine value (`amountRial`) is always Rial; `toman` only changes the
 * display. Uses tabular numerals so amounts align in admin price columns.
 *
 * Usage:
 *   <Money amountRial={service.priceRial} />          → ۲٬۵۰۰٬۰۰۰ ریال
 *   <Money amountRial={2500000n} unit="toman" />      → ۲۵۰٬۰۰۰ تومان
 */
export const Money = forwardRef<HTMLElement, MoneyProps>(function Money(
  { amountRial, unit = 'rial', hideUnit = false, className, ...rest },
  ref,
) {
  const displayValue = unit === 'toman' ? toTomanRial(amountRial) : amountRial;
  const formatted = formatRial(displayValue);
  return (
    <bdi
      ref={ref}
      dir="rtl"
      className={cn('tabular-nums [font-feature-settings:"tnum"]', className)}
      {...rest}
    >
      {formatted}
      {!hideUnit && <span className="ms-1">{UNIT_LABEL[unit]}</span>}
    </bdi>
  );
});

/** Converts a Rial machine value to its Toman magnitude for display only. */
function toTomanRial(amountRial: bigint | number | string): bigint {
  const asBigInt =
    typeof amountRial === 'bigint' ? amountRial : BigInt(Math.trunc(Number(amountRial)));
  return asBigInt / 10n;
}
