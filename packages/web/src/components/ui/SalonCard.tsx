import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin } from 'lucide-react';
import { cn } from './cn';
import { Picture, type PictureSource } from './Picture';
import { RatingStars } from './RatingStars';
import { formatRial } from './Money';
import {
  getMinServicePriceRial,
  type SalonProfile,
} from '../../data/salons';

export interface SalonCardProps {
  /** The salon to present (presentation-only public profile). */
  salon: SalonProfile;
  /**
   * Image loading strategy. Cards below the fold pass `lazy` (default); the
   * first row on a discovery page may pass `eager`.
   */
  imageLoading?: 'lazy' | 'eager';
  /** Sizing/spacing classes only (tokens). */
  className?: string;
}

/**
 * Marketplace **salon card** (Booksy-style): a cover photo, the salon name,
 * its rating + review count, category, neighborhood/city, and a "from …" price
 * — the unit shared by the discovery grids and the home "featured salons" row.
 *
 * ## Accessibility (ui-ux §10)
 * The whole card is a single link to the profile via the "stretched link"
 * pattern (`<Link>` with a full-bleed `::after`), so there is exactly one
 * interactive element per card and its accessible name is the salon name — no
 * nested/overlapping links. The cover image carries a meaningful Persian `alt`;
 * the rating stars and chevron are decorative.
 *
 * Tokens only; logical properties throughout so it mirrors correctly in RTL.
 */
export function SalonCard({ salon, imageLoading = 'lazy', className }: SalonCardProps) {
  const { t } = useTranslation();
  const cover = salon.gallery[0];
  const sources = cover
    ? ([
        cover.avifSrcSet && { type: 'image/avif', srcSet: cover.avifSrcSet },
        cover.webpSrcSet && { type: 'image/webp', srcSet: cover.webpSrcSet },
      ].filter(Boolean) as PictureSource[])
    : [];
  const minPrice = getMinServicePriceRial(salon);

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-1',
        'transition-shadow duration-base ease-standard hover:shadow-2',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
        className,
      )}
    >
      {/* Cover photo (sized + lazy → CLS-safe). Zooms gently on hover. */}
      <div className="relative aspect-[4/3] overflow-hidden bg-elevated">
        {cover && (
          <Picture
            sources={sources}
            src={cover.src}
            fallbackSrcSet={cover.srcSet}
            sizes="(min-width: 1024px) 33vw, (min-width: 480px) 50vw, 100vw"
            width={cover.width}
            height={cover.height}
            alt={cover.alt}
            loading={imageLoading}
            className="h-full w-full object-cover transition-transform duration-slow ease-standard group-hover:scale-105 motion-reduce:transform-none"
          />
        )}
        {salon.priceRange && (
          <span className="absolute end-2 top-2 rounded-pill border border-border bg-elevated px-2 py-0.5 text-2xs font-medium text-text shadow-1">
            {salon.priceRange}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-md font-bold leading-snug text-text">
          <Link
            to={`/s/${salon.slug}`}
            className="rounded-sm no-underline outline-none after:absolute after:inset-0 after:content-['']"
          >
            {salon.name}
          </Link>
        </h3>

        {salon.category && (
          <p className="text-xs text-muted">{salon.category}</p>
        )}

        {typeof salon.rating === 'number' && (
          <RatingStars value={salon.rating} count={salon.reviewCount} />
        )}

        <p className="flex items-center gap-1 text-sm text-muted">
          <MapPin aria-hidden="true" size={16} className="shrink-0" />
          <span>
            {salon.neighborhood}، {salon.address.addressLocality}
          </span>
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {typeof minPrice === 'number' ? (
            <span className="text-sm text-text">
              {t('salonCard.fromPrice', { price: formatRial(minPrice) })}
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            {t('salonCard.view')}
            <ChevronLeft aria-hidden="true" size={16} className="shrink-0" />
          </span>
        </div>
      </div>
    </article>
  );
}

export default SalonCard;
