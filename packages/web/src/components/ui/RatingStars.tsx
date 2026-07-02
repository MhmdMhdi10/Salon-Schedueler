import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { cn } from './cn';
import { toPersianDigits } from './Num';

export type RatingStarsSize = 'sm' | 'md';

export interface RatingStarsProps {
  /** Average rating, 1–5 (one decimal, e.g. `4.8`). */
  value: number;
  /** Optional number of reviews; when present it is shown as «(۱۲۴ نظر)». */
  count?: number;
  /** Star glyph size. Defaults to `sm`. */
  size?: RatingStarsSize;
  /** Hide the numeric value beside the stars (stars + count only). */
  hideValue?: boolean;
  /** Sizing/spacing classes only (tokens). */
  className?: string;
}

/** Glyph pixel size per token size. A JSX `size` prop, not a style literal. */
const STAR_PX: Record<RatingStarsSize, number> = { sm: 15, md: 18 };

/**
 * Formats a rating for display: one decimal with the Persian decimal separator
 * and Persian digits, e.g. `4.8` → «۴٫۸».
 */
function formatRating(value: number): string {
  return toPersianDigits(value.toFixed(1)).replace('.', '٫');
}

/**
 * Star-rating display — the marketplace "social proof" primitive
 * (Booksy-style). Renders five star glyphs (filled up to the rounded rating)
 * plus the numeric value and an optional review count.
 *
 * ## Accessibility (ui-ux §3, §10)
 *  - The stars are **decorative** (`aria-hidden`): meaning is carried by the
 *    visible numeric value + review count and a `sr-only` full label, never by
 *    color/shape alone. The component deliberately does **not** expose
 *    `role="img"` so it composes onto image-strict surfaces (e.g. the salon
 *    profile) without being mistaken for a content image.
 *  - Every `<svg>` it renders is `aria-hidden`.
 *
 * Tokens only: filled stars use the warning (amber) token, empties the border
 * token; no raw color/size literals in authored styles.
 */
export function RatingStars({
  value,
  count,
  size = 'sm',
  hideValue = false,
  className,
}: RatingStarsProps) {
  const { t } = useTranslation();
  const rounded = Math.round(value);
  const px = STAR_PX[size];
  const valueLabel = formatRating(value);

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {/* Full accessible label (rating out of five, plus count when present). */}
      <span className="sr-only">
        {t('rating.srLabel', { value: valueLabel })}
        {typeof count === 'number' ? ` — ${t('rating.reviews', { count })}` : ''}
      </span>

      <span aria-hidden="true" className="inline-flex items-center">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            aria-hidden="true"
            size={px}
            className={cn(
              'shrink-0',
              i < rounded ? 'fill-warning text-warning' : 'fill-border text-border',
            )}
          />
        ))}
      </span>

      {!hideValue && (
        <span aria-hidden="true" className="text-sm font-bold tabular-nums text-text">
          {valueLabel}
        </span>
      )}

      {typeof count === 'number' && (
        <span aria-hidden="true" className="text-xs text-muted">
          ({t('rating.reviews', { count })})
        </span>
      )}
    </span>
  );
}

export default RatingStars;
