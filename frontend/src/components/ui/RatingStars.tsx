import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';
import { Num, toPersianDigits } from './Num';

export type RatingStarsSize = 'sm' | 'md' | 'lg';

export interface RatingStarsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Numeric rating 0–5. */
  value: number;
  /** Size of star glyphs + text. */
  size?: RatingStarsSize;
  /** Hide the numeric value, show only stars. */
  hideValue?: boolean;
  /** Total review count shown inline. Optional. */
  count?: number;
}

const starSize: Record<RatingStarsSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const textSize: Record<RatingStarsSize, string> = {
  sm: 'text-2xs',
  md: 'text-xs',
  lg: 'text-sm',
};

/**
 * A star-rating display component that renders filled/empty stars and
 * optionally the numeric value. Used on salon profile pages for review
 * summaries and individual review entries.
 *
 * Token-driven, RTL-safe, accessible: the group carries an `aria-label`
 * so screen readers announce the numeric value.
 */
export function RatingStars({
  value,
  size = 'sm',
  hideValue = false,
  count,
  className,
  ...rest
}: RatingStarsProps) {
  const { t } = useTranslation();
  const clamped = Math.max(0, Math.min(5, value));
  const full = Math.floor(clamped);
  const hasHalf = clamped - full >= 0.25 && clamped - full < 0.75;
  const roundedUp = clamped - full >= 0.75 ? full + 1 : full;
  const filled = hasHalf ? full : roundedUp;
  const ariaLabel = t('rating.srLabel', { value: toPersianDigits(clamped.toFixed(1)) });

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
      {!hideValue && (
        <span className={cn('font-medium text-text', textSize[size])}>
          <Num value={Number(clamped.toFixed(1))} />
        </span>
      )}
      {count != null && (
        <span className={cn('text-muted', textSize[size])}>
          (<Num value={count} />)
        </span>
      )}
    </div>
  );
}
