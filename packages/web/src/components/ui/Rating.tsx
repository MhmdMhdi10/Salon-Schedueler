import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';
import { Num, toPersianDigits } from './Num';

export interface RatingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Numeric rating 0–5 (supports halves via the `half` prop). */
  value: number;
  /** Total review count shown inline as "(n)" Persian-digit. Optional. */
  count?: number;
  /** Size of the star glyph + text. */
  size?: 'sm' | 'md' | 'lg';
  /** Show only the stars (no count), e.g. compact list cards. */
  showCount?: boolean;
  /** Accessible label format; defaults to a Persian "امتیاز n از ۵". */
  label?: string;
}

const starSize: Record<NonNullable<RatingProps['size']>, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const textSize: Record<NonNullable<RatingProps['size']>, string> = {
  sm: 'text-2xs',
  md: 'text-xs',
  lg: 'text-sm',
};

/**
 * Star rating + review count — the Booksy signature social-proof primitive.
 *
 * Filled stars use the `--color-warning` amber token (the Booksy gold star —
 * one star color across the whole product; `RatingStars` matches). Never
 * color-only: the numeric value is always present as accessible text.
 * Half-stars are represented by a 50%-width overlay so the visual granularity
 * matches the value.
 *
 * Token-driven, RTL-safe (the row direction follows the document dir), and
 * accessible: the group carries an `aria-label` so screen readers announce the
 * numeric value, never "five stars".
 */
export function Rating({
  value,
  count,
  size = 'sm',
  showCount = true,
  label,
  className,
  ...rest
}: RatingProps) {
  const { t } = useTranslation();
  const clamped = Math.max(0, Math.min(5, value));
  const full = Math.floor(clamped);
  const hasHalf = clamped - full >= 0.25 && clamped - full < 0.75;
  const roundedUp = clamped - full >= 0.75 ? full + 1 : full;
  const filled = hasHalf ? full : roundedUp;
  const ariaLabel =
    label ??
    t('rating.srLabel', {
      value: toPersianDigits(clamped.toFixed(1)),
      defaultValue: `امتیاز ${new Intl.NumberFormat('fa-IR').format(clamped)} از ۵`,
    });

  return (
    <div
      className={cn('inline-flex items-center gap-1', className)}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      <span className="inline-flex" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => {
          const isFull = i < filled;
          const isHalf = hasHalf && i === filled;
          return (
            <span key={i} className={cn('relative inline-block', starSize[size])}>
              <Star
                className={cn('absolute inset-0', starSize[size], 'text-border')}
                strokeWidth={1.5}
                fill="currentColor"
              />
              {(isFull || isHalf) && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: isHalf ? '50%' : '100%' }}
                >
                  <Star
                    className={cn(starSize[size], 'text-warning')}
                    strokeWidth={1.5}
                    fill="currentColor"
                  />
                </span>
              )}
            </span>
          );
        })}
      </span>
      <span className={cn('font-medium text-text', textSize[size])}>
        <Num value={Number(clamped.toFixed(1))} />
      </span>
      {showCount && count != null && (
        <span className={cn('text-muted', textSize[size])}>
          (<Num value={count} />)
        </span>
      )}
    </div>
  );
}
