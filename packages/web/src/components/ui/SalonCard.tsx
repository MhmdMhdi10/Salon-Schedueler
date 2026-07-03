import { forwardRef } from 'react';
import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from './cn';
import { Rating } from './Rating';
import { Badge } from './Badge';

export interface SalonCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Salon slug used to build the profile link `/s/:slug`. */
  slug: string;
  /** Salon display name. */
  name: string;
  /** Cover image URL (a plain img; pass an optimized asset). */
  coverUrl: string;
  /** Average rating 0–5. */
  rating: number;
  /** Total review count. */
  reviewCount: number;
  /** Neighborhood / district line shown under the name. */
  location?: string;
  /** Short list of service labels previewed on the card (max ~3 shown). */
  services?: string[];
  /** Open-now indicator. When true shows a green "باز" pill. */
  openNow?: boolean;
  /** Optional href override (defaults to `/s/:slug`). */
  href?: string;
  /** Render as a different element via `as` (default `article`). */
  as?: React.ElementType;
}

/**
 * Salon result card — the Booksy discovery surface.
 *
 * A white elevated card with a 16:9 cover photo on top, the salon name + star
 * rating row beneath, a location line, and a wrap of service pills. The whole
 * card is a single tap target into the salon profile (Booksy pattern: the
 * entire card is clickable, not just a "book" button).
 *
 * Token-driven, RTL-first, accessible: the cover is decorative (empty alt) and
 * the salon name is the link's accessible name; rating carries its own
 * `role="img"` label.
 */
export const SalonCard = forwardRef<HTMLElement, SalonCardProps>(function SalonCard(
  {
    slug,
    name,
    coverUrl,
    rating,
    reviewCount,
    location,
    services = [],
    openNow = false,
    href,
    as: Component = 'article',
    className,
    ...rest
  },
  ref,
) {
  const linkHref = href ?? `/s/${slug}`;
  const preview = services.slice(0, 3);
  const overflow = Math.max(0, services.length - preview.length);
  return (
    <Component
      ref={ref}
      className={cn(
        'group overflow-hidden rounded-lg border border-border bg-elevated shadow-1',
        'transition-[box-shadow,transform,border-color] duration-base ease-standard',
        'hover:-translate-y-0.5 hover:shadow-2 hover:border-primary/40',
        'motion-safe:active:scale-[0.99]',
        'focus-within:shadow-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
        className,
      )}
      {...rest}
    >
      <Link to={linkHref} className="flex flex-col" aria-label={`${name} — ${rating} امتیاز`}>
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface">
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-slow ease-standard group-hover:scale-[1.03]"
          />
          {openNow && (
            <Badge status="success" className="absolute end-2 top-2 shadow-1">
              باز
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="text-md font-semibold text-text leading-snug">{name}</h3>
          <Rating value={rating} count={reviewCount} size="sm" />
          {location && (
            <p className="flex items-center gap-1 text-2xs text-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{location}</span>
            </p>
          )}
          {preview.length > 0 && (
            <ul role="list" className="mt-1 flex flex-wrap gap-1" aria-label="خدمات">
              {preview.map((s) => (
                <li key={s} className="rounded-pill bg-surface px-3 py-1 text-2xs text-muted">
                  {s}
                </li>
              ))}
              {overflow > 0 && (
                <li className="rounded-pill bg-surface px-3 py-1 text-2xs text-muted">
                  +<span>{overflow}</span>
                </li>
              )}
            </ul>
          )}
        </div>
      </Link>
    </Component>
  );
});
