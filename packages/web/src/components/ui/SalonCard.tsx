import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MapPin, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from './cn';
import { Num } from './Num';
import { Money } from './Money';
import type { SalonProfile } from '../../data/salons';

export interface SalonCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /**
   * Full SalonProfile object — a convenience shorthand. When provided, the card
   * extracts slug, name, coverUrl, rating, reviewCount, location, and starting
   * price from the profile. Individual props below are ignored when `salon` is
   * passed.
   */
  salon?: SalonProfile;
  /** Salon slug used to build the profile link `/s/:slug`. */
  slug?: string;
  /** Salon display name. */
  name?: string;
  /** Cover image URL (a plain img; pass an optimized asset). */
  coverUrl?: string;
  /** Average rating 0–5. */
  rating?: number;
  /** Total review count. */
  reviewCount?: number;
  /** Neighborhood / district line shown under the name. */
  location?: string;
  /** Starting price in Rial (shown as "از X ریال"). */
  startingPriceRial?: bigint | number | string;
  /** Short list of service labels previewed on the card (max ~3 shown). */
  services?: string[];
  /** Open-now indicator. When true shows a green "باز" pill. */
  openNow?: boolean;
  /** Optional href override (defaults to `/s/:slug`). */
  href?: string;
  /** Persian alt text for the cover image (meaningful description). */
  coverAlt?: string;
}

/**
 * Resolves the convenience `salon` object prop or individual props into a
 * normalized data shape for rendering.
 */
function resolveCardData(props: SalonCardProps) {
  if (props.salon) {
    const s = props.salon;
    const minPrice = s.services.length > 0
      ? Math.min(...s.services.map((svc) => svc.priceRial))
      : undefined;
    return {
      slug: s.slug,
      name: s.name,
      coverUrl: s.coverUrl ?? s.gallery[0]?.src ?? '/placeholders/default-salon.svg',
      coverAlt: s.gallery[0]?.alt ?? `تصویر ${s.name}`,
      rating: s.rating ?? 0,
      reviewCount: s.reviewCount ?? 0,
      location: `${s.neighborhood}، ${s.address.addressLocality}`,
      startingPriceRial: minPrice as bigint | number | string | undefined,
      openNow: false,
    };
  }
  return {
    slug: props.slug ?? '',
    name: props.name ?? '',
    coverUrl: props.coverUrl ?? '/placeholders/default-salon.svg',
    coverAlt: props.coverAlt ?? `تصویر ${props.name ?? ''}`,
    rating: props.rating ?? 0,
    reviewCount: props.reviewCount ?? 0,
    location: props.location,
    startingPriceRial: props.startingPriceRial,
    openNow: props.openNow ?? false,
  };
}

/**
 * Salon discovery card — Booksy photography-forward NYC design.
 *
 * A bold card with a prominent 16:9 hero image (takes majority of card),
 * a rating badge overlaid on the image, salon name + location + price beneath.
 * The entire card is a single link to the salon profile (`/s/:slug`).
 *
 * Micro-interactions:
 * - Hover: lifts 4px with shadow-2 transition (`whileHover`)
 * - Press: scales to 0.98 (`whileTap`)
 * - Reduced motion: all transforms disabled, only opacity feedback
 *
 * Token-driven, RTL-first, accessible: the link wraps the full card with an
 * aria-label; the image has meaningful alt text; the rating badge carries its
 * own accessible label.
 */
export const SalonCard = forwardRef<HTMLElement, SalonCardProps>(function SalonCard(
  {
    salon,
    slug,
    name,
    coverUrl,
    rating,
    reviewCount,
    location,
    startingPriceRial,
    services,
    openNow,
    href,
    coverAlt,
    className,
    ...rest
  },
  ref,
) {
  const data = resolveCardData({
    salon,
    slug,
    name,
    coverUrl,
    rating,
    reviewCount,
    location,
    startingPriceRial,
    services,
    openNow,
  });

  const linkHref = href ?? `/s/${data.slug}`;
  const prefersReduced = useReducedMotion();

  // Hover-lift: raise card 4px + increase shadow (disabled under reduced motion)
  const hoverAnimation = !prefersReduced
    ? { y: -4, boxShadow: 'var(--shadow-2)' }
    : undefined;

  // Press feedback: slight scale-down (disabled under reduced motion)
  const tapAnimation = !prefersReduced ? { scale: 0.98 } : undefined;

  return (
    <motion.article
      ref={ref}
      whileHover={hoverAnimation}
      whileTap={tapAnimation}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className={cn(
        'group overflow-hidden rounded-lg border border-border bg-elevated shadow-1',
        'transition-[border-color] duration-base ease-standard',
        'hover:border-primary/40',
        'focus-within:shadow-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
        className,
      )}
      {...(rest as Record<string, unknown>)}
    >
      <Link
        to={linkHref}
        className="flex flex-col outline-none"
        aria-label={`${data.name} — ${new Intl.NumberFormat('fa-IR').format(data.rating)} امتیاز`}
      >
        {/* Hero Photography — 16:9, takes majority of card */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface">
          <img
            src={data.coverUrl}
            alt={coverAlt ?? data.coverAlt}
            loading="lazy"
            decoding="async"
            width={640}
            height={360}
            className="h-full w-full object-cover transition-transform duration-slow ease-standard group-hover:scale-[1.03]"
          />

          {/* Rating badge overlaid on image (bottom-start corner) */}
          <span
            className={cn(
              'absolute bottom-2 start-2',
              'inline-flex items-center gap-1',
              'rounded-pill bg-elevated/90 px-2 py-1 shadow-1',
              'text-2xs font-medium text-text backdrop-blur-sm',
            )}
            role="img"
            aria-label={`امتیاز ${new Intl.NumberFormat('fa-IR').format(data.rating)} از ۵ — ${new Intl.NumberFormat('fa-IR').format(data.reviewCount)} نظر`}
          >
            <Star
              className="h-3.5 w-3.5 shrink-0 text-primary"
              fill="currentColor"
              strokeWidth={0}
              aria-hidden="true"
            />
            <Num value={Number(data.rating.toFixed(1))} />
            <span className="text-muted">
              (<Num value={data.reviewCount} /> نظر)
            </span>
          </span>

          {/* Open-now indicator (top-end corner) */}
          {data.openNow && (
            <span
              className={cn(
                'absolute top-2 end-2',
                'inline-flex items-center gap-1',
                'rounded-pill border border-success/30 bg-success/10 px-2 py-0.5',
                'text-2xs font-medium text-success shadow-1',
              )}
            >
              باز
            </span>
          )}
        </div>

        {/* Card body — salon info */}
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          {/* Salon name — bold */}
          <h3 className="text-md font-semibold text-text leading-snug line-clamp-1">
            {data.name}
          </h3>

          {/* Location */}
          {data.location && (
            <p className="flex items-center gap-1 text-2xs text-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-1">{data.location}</span>
            </p>
          )}

          {/* Starting price in Rial with Persian numerals */}
          {data.startingPriceRial != null && (
            <p className="text-xs font-medium text-text">
              <span className="text-muted">از </span>
              <Money amountRial={data.startingPriceRial} />
            </p>
          )}
        </div>
      </Link>
    </motion.article>
  );
});
