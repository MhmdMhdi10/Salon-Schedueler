import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MapPin, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from './cn';
import { Num, toPersianDigits } from './Num';
import { Money, formatToman } from './Money';
import { Rating } from './Rating';
import { SalonPlaceholder } from './SalonPlaceholder';
import type { SalonProfile } from '../../data/salons';
import { writeSalonName } from '../../utils/salonName';

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
  /** Starting price in Rial (shown as "از X تومان"). */
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
    const minPrice =
      s.services.length > 0 ? Math.min(...s.services.map((svc) => svc.priceRial)) : undefined;
    return {
      slug: s.slug,
      name: s.name,
      coverUrl: s.coverUrl ?? s.gallery[0]?.src ?? '/images/salons/salon-card-1-640w.webp',
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
    coverUrl: props.coverUrl ?? '/images/salons/salon-card-1-640w.webp',
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
  const hoverAnimation = !prefersReduced ? { y: -4, boxShadow: 'var(--shadow-2)' } : undefined;

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
          <h3 className="text-md font-semibold text-text leading-snug line-clamp-1">{data.name}</h3>

          {/* Location */}
          {data.location && (
            <p className="flex items-center gap-1 text-2xs text-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-1">{data.location}</span>
            </p>
          )}

          {/* Starting price in Toman with Persian numerals */}
          {data.startingPriceRial != null && (
            <p className="text-xs font-medium text-text">
              <span className="text-muted">از </span>
              <Money amountRial={data.startingPriceRial} unit="toman" />
            </p>
          )}
        </div>
      </Link>
    </motion.article>
  );
});

/* ─── Horizontal business card (Booksy directive §c) ───────────────────────── */

export interface SalonListCardProps {
  /** Full public profile — the card derives everything from it. */
  salon: SalonProfile;
  /** City display name for the location line (e.g. «تهران»). */
  cityName?: string;
  /** Heading element for the salon name (list context decides the level). */
  headingLevel?: 'h2' | 'h3';
  /** How many inline bookable service rows to show (0 hides the block). */
  maxServices?: number;
  className?: string;
}

/**
 * Horizontal discovery/search business card — the Booksy list anatomy
 * (directive §c): photo start-side, then info column in this exact order:
 * ① rating row FIRST, ② name, ③ neighborhood · address, ④ chip row — plus up
 * to three inline bookable service rows with price and a per-service «رزرو»
 * button that deep-links into the funnel preserving the chosen service
 * (`?service=`).
 *
 * Interaction per the restraint doctrine (§i): the resting card has no shadow,
 * hover raises shadow only (no translate/scale). The salon name carries a
 * stretched link covering the card; the per-service Book buttons layer above
 * it (`relative z-10`) so the DOM stays valid (no nested links).
 *
 * The cover photo renders at every breakpoint — smaller on phones — because
 * mobile is the primary audience (photography-forward, signature-design §5).
 */
export function SalonListCard({
  salon,
  cityName,
  headingLevel: Heading = 'h2',
  maxServices = 3,
  className,
}: SalonListCardProps) {
  const { t } = useTranslation();
  const cover = salon.coverUrl ?? salon.gallery[0]?.src;
  const coverAlt = salon.gallery[0]?.alt ?? salon.name;
  const services = maxServices > 0 ? salon.services.slice(0, maxServices) : [];
  const bookHref = `/salon/${salon.bookingSalonId}/book`;
  const cacheSalonName = () => writeSalonName(salon.bookingSalonId, salon.name);

  return (
    <article
      className={cn(
        'group relative flex flex-col gap-4 rounded-2xl border border-border bg-elevated p-4',
        'transition-shadow duration-fast ease-standard hover:shadow-2',
        'focus-within:shadow-2',
        className,
      )}
      data-testid="salon-list-card"
    >
      <div className="flex gap-4">
        {/* Cover photo — visible at every breakpoint (photography-forward). */}
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-surface sm:size-40">
          {cover ? (
            <img
              src={cover}
              alt={coverAlt}
              width={640}
              height={360}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <SalonPlaceholder className="h-full w-full" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ① Rating row FIRST — bold number + gold star + count (§c). */}
          {salon.rating != null && (
            <Rating value={salon.rating} count={salon.reviewCount} size="sm" />
          )}

          {/* ② Name — stretched link makes the whole card clickable. */}
          <Heading className="mt-1 min-w-0">
            <Link
              to={`/s/${salon.slug}`}
              className={cn(
                'block truncate text-lg font-bold text-text no-underline',
                'transition-colors duration-fast ease-standard group-hover:text-primary',
                'outline-none focus-visible:outline-none',
                // Stretched-link: the card is the hit area; services layer above.
                'after:absolute after:inset-0 after:rounded-2xl after:content-[""]',
                'focus-visible:after:outline focus-visible:after:outline-2',
                'focus-visible:after:outline-offset-2 focus-visible:after:outline-focus',
              )}
            >
              {salon.displayName ?? salon.name}
            </Link>
          </Heading>

          {/* ③ Location line — neighborhood · street. */}
          <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-muted">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {cityName ? `${cityName}، ` : ''}
              {salon.neighborhood} · {salon.address.streetAddress}
            </span>
          </p>

          {/* ④ Chip row — category + price tier. */}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            {salon.category && (
              <span className="rounded-pill bg-surface px-2.5 py-1 text-xs font-medium text-muted">
                {salon.category}
              </span>
            )}
            {salon.services.length > 0 && (
              <span className="rounded-pill bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {t('discovery.card.fromPrice', {
                  price: toPersianDigits(
                    formatToman(Math.min(...salon.services.map((s) => s.priceRial))),
                  ),
                  defaultValue: 'از {{price}} تومان',
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Inline bookable services — the highest-value Booksy upgrade (§c). */}
      {services.length > 0 && (
        <ul role="list" className="relative z-10 divide-y divide-border border-t border-border">
          {services.map((service) => (
            <li
              key={service.id}
              className="flex flex-col items-stretch gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{service.name}</p>
                <p className="text-xs text-muted">
                  {t('salon.profile.durationMinutes', { count: service.durationMinutes })}
                </p>
              </div>
              <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:shrink-0 sm:justify-start">
                <bdi className="whitespace-nowrap text-sm font-semibold text-text">
                  {formatToman(service.priceRial)}{' '}
                  <span className="text-xs font-normal text-muted">تومان</span>
                </bdi>
                <Link
                  to={`${bookHref}?service=${encodeURIComponent(service.id)}`}
                  onClick={cacheSalonName}
                  aria-label={t('salon.profile.bookServiceAria', { name: service.name })}
                  className={cn(
                    'inline-flex min-h-[36px] items-center rounded-md border border-primary px-4 text-sm font-semibold text-primary no-underline',
                    'transition-colors duration-fast ease-standard hover:bg-primary hover:text-primary-contrast',
                    'outline-none focus-visible:outline focus-visible:outline-2',
                    'focus-visible:outline-offset-2 focus-visible:outline-focus',
                  )}
                >
                  {t('salon.profile.bookService')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
