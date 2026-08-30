import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  ExternalLink,
  Globe,
  Images,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import i18n from '../i18n';
import { salonApi } from '../api/client';
import { JsonLd, SeoHead, SITE_URL } from '../components/seo';
import type { JsonLdNode } from '../components/seo';
// Direct module imports (not the `components/ui` barrel): the barrel re-exports the
// framer-motion–backed components, so importing through it widens this public route's
// static graph. Keeps the code-split budget honest (scripts/analyze-bundle.mjs).
import { DirText } from '../components/ui/DirText';
import { IconButton } from '../components/ui/IconButton';
import { ImageCarousel } from '../components/ui/ImageCarousel';
import { JalaliDate } from '../components/ui/JalaliDate';
import { Num, toPersianDigits } from '../components/ui/Num';
import { Picture } from '../components/ui/Picture';
import { Rating } from '../components/ui/Rating';
import { RatingStars } from '../components/ui/RatingStars';
import { SalonPlaceholder } from '../components/ui/SalonPlaceholder';
import { Spinner } from '../components/ui/Spinner';
import { cn } from '../components/ui/cn';
import { formatToman } from '../components/ui/Money';

// Lazy: the gallery lightbox is the only thing on this route that needs
// @radix-ui/react-dialog, and it only opens on user interaction.
const GalleryLightbox = lazy(() => import('./SalonProfileLightbox'));
import type { CarouselImage } from '../components/ui/ImageCarousel';
import { TenantTheme } from '../components/theme';
import {
  getSalonProfile,
  IRANIAN_WEEK_ORDER,
  PERSIAN_DAY_LABEL,
  type SalonProfile,
  type SalonService,
  type SchemaDay,
} from '../data/salons';
// City display name from the lightweight canonical taxonomy (NOT data/discovery
// — that module carries the full discovery copy and would join this public
// route's initial JS graph just for one name lookup).
import { DISCOVERY_CITIES } from '../data/taxonomy';
import { writeSalonName } from '../utils/salonName';

/**
 * Public salon profile (`/s/:slug`) — Booksy profile anatomy per the directive
 * adoption map (§j `/s/:slug`):
 *
 *  1. Photo mosaic header from the salon's own gallery (first tile 2×2,
 *     «نمایش همه تصاویر» opens a Dialog lightbox around `ImageCarousel`).
 *  2. Identity block: chips → name → address → rating (bold-number ★ count).
 *  3. Two-column body with a 360px sticky booking card; sticky bottom CTA below
 *     `lg` (safe-area aware) so the funnel entry never disappears at tablet
 *     widths.
 *  4. Services as ONE bordered `divide-y` list, grouped by category, each row
 *     with an outlined Book button that preserves the chosen service into the
 *     funnel (`?service=`).
 *  5. Reviews with a giant rating, star-distribution bars, verified-booking
 *     checks — every displayed rating is backed by the on-page reviews
 *     (contract §content-honesty), and JSON-LD `aggregateRating` is emitted
 *     only when reviews exist.
 *  6. Uniform `mt-10` rhythm across Services / Reviews / About / Amenities /
 *     Team / Hours / Contact; hours as a `max-w-sm divide-y` mini-table; the
 *     Neshan map in a lazy iframe with a real directions link.
 */

/* ─── Photo mosaic + lightbox ──────────────────────────────────────────── */

const MOSAIC_TILES = 5;

function ProfileGallery({
  salon,
  onOpen,
}: {
  salon: SalonProfile;
  onOpen: (index: number) => void;
}) {
  const { t } = useTranslation();
  const images = salon.gallery.slice(0, MOSAIC_TILES);
  const placeholders = Math.max(0, MOSAIC_TILES - images.length);

  return (
    <section aria-label={t('salon.profile.galleryAria', { name: salon.name })}>
      <div className="relative grid h-64 grid-cols-2 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:h-80 sm:grid-cols-4">
        {images.map((image, index) => (
          <button
            key={image.src}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={image.alt || `نمایش تصویر ${index + 1}`}
            className={cn(
              'relative block h-full w-full overflow-hidden bg-surface p-0 text-start',
              'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
              // Mobile: the 2×2 lead photo fills the mosaic alone; the four
              // small tiles join at `sm`+ (directive §j.1).
              index === 0 ? 'col-span-2 row-span-2' : 'hidden sm:block',
            )}
          >
            <Picture
              sources={[
                ...(image.avifSrcSet ? [{ type: 'image/avif', srcSet: image.avifSrcSet }] : []),
                ...(image.webpSrcSet ? [{ type: 'image/webp', srcSet: image.webpSrcSet }] : []),
              ]}
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              loading={index === 0 ? 'eager' : 'lazy'}
              {...(index === 0 ? { fetchpriority: 'high' as const } : {})}
              pictureClassName="block h-full w-full"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
        {Array.from({ length: placeholders }).map((_, index) => (
          <SalonPlaceholder key={`placeholder-${index}`} className="hidden h-full w-full sm:flex" />
        ))}

        <button
          type="button"
          onClick={() => onOpen(0)}
          className={cn(
            'absolute bottom-4 end-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-elevated px-4 py-2 text-sm font-semibold text-text shadow-2',
            'transition-opacity duration-fast ease-standard hover:opacity-90',
            'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          )}
        >
          <Images className="size-4" aria-hidden="true" />
          {t('salon.profile.showAllPhotos')}
        </button>
      </div>
    </section>
  );
}


/* ─── Open-now helpers ─────────────────────────────────────────────────── */

function tehranToday(): SchemaDay | null {
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      weekday: 'long',
    }).format(new Date());
    return (IRANIAN_WEEK_ORDER as readonly string[]).includes(weekday)
      ? (weekday as SchemaDay)
      : null;
  } catch {
    return null;
  }
}

function isOpenNow(salon: SalonProfile): boolean | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tehran',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const weekday = parts.find((part) => part.type === 'weekday')?.value;
    const hour = parts.find((part) => part.type === 'hour')?.value;
    const minute = parts.find((part) => part.type === 'minute')?.value;
    if (!weekday || !hour || !minute) return null;
    const hours = salon.openingHours.find((item) => item.day === weekday);
    if (!hours || hours.closed || !hours.opens || !hours.closes) return false;
    const now = `${hour}:${minute}`;
    return hours.opens <= now && now < hours.closes;
  } catch {
    return null;
  }
}

/* ─── Sections ─────────────────────────────────────────────────────────── */

/** Services grouped by their category label, insertion-ordered. */
function groupServices(services: SalonService[]): Array<[string | null, SalonService[]]> {
  const groups = new Map<string | null, SalonService[]>();
  for (const service of services) {
    const key = service.category ?? null;
    const list = groups.get(key) ?? [];
    list.push(service);
    groups.set(key, list);
  }
  return Array.from(groups.entries());
}

function ServicesSection({
  salon,
  bookHref,
  onBookClick,
}: {
  salon: SalonProfile;
  bookHref: string;
  onBookClick: () => void;
}) {
  const { t } = useTranslation();
  const groups = groupServices(salon.services);
  const showGroupHeaders = groups.length > 1;

  return (
    <section className="mt-10" aria-labelledby="salon-services-title">
      <h2 id="salon-services-title" className="text-2xl font-bold text-text">
        {t('salon.profile.servicesTitle')}
      </h2>
      {/* ONE bordered container, rows divided — not per-row cards (§c). */}
      <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-elevated">
        {groups.map(([category, services]) => (
          <div key={category ?? 'all'} className="divide-y divide-border">
            {showGroupHeaders && (
              <h3 className="bg-surface px-4 py-2 text-sm font-semibold text-muted">
                {category ?? t('salon.profile.allServices')}
              </h3>
            )}
            {services.map((service) => (
              <div
                key={service.id}
                className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-text">{service.name}</p>
                  {service.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{service.description}</p>
                  )}
                  <p className="mt-1 text-sm text-muted">
                    {t('salon.profile.durationMinutes', { count: service.durationMinutes })}
                  </p>
                </div>
                <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:shrink-0 sm:justify-start">
                  <bdi className="whitespace-nowrap text-sm font-semibold text-text">
                    {formatToman(service.priceRial)}{' '}
                    <span className="text-xs font-normal text-muted">تومان</span>
                  </bdi>
                  <Link
                    to={`${bookHref}?service=${encodeURIComponent(service.id)}`}
                    onClick={onBookClick}
                    aria-label={t('salon.profile.bookServiceAria', { name: service.name })}
                    className={cn(
                      'inline-flex min-h-[44px] items-center rounded-md border border-primary px-5 text-sm font-semibold text-primary no-underline',
                      'transition-colors duration-fast ease-standard hover:bg-primary hover:text-primary-contrast',
                      'outline-none focus-visible:outline focus-visible:outline-2',
                      'focus-visible:outline-offset-2 focus-visible:outline-focus',
                    )}
                  >
                    {t('salon.profile.bookService')}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewsSection({ salon }: { salon: SalonProfile }) {
  const { t } = useTranslation();
  const reviews = salon.reviews ?? [];
  const distribution = useMemo(() => {
    const counts = new Map<number, number>([
      ...Array.from({ length: 5 }, (_, i) => [5 - i, 0] as [number, number]),
    ]);
    for (const review of reviews) {
      const bucket = Math.round(review.rating);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [reviews]);

  return (
    <section className="mt-10" aria-labelledby="salon-reviews-title">
      <h2 id="salon-reviews-title" className="text-2xl font-bold text-text">
        {t('salon.profile.reviewsTitle')}
      </h2>

      {reviews.length > 0 ? (
        <>
          {/* Summary: giant rating + stars + count, then distribution bars. */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-bold text-text">
              <Num value={Number((salon.rating ?? 0).toFixed(1))} />
            </span>
            <RatingStars value={salon.rating ?? 0} size="md" hideValue />
            <span className="text-sm text-muted">
              {t('salon.profile.reviewsSummary', { count: salon.reviewCount ?? reviews.length })}
            </span>
          </div>

          <ul
            role="list"
            aria-label={t('salon.profile.distributionAria')}
            className="mt-4 max-w-sm space-y-1.5"
          >
            {distribution.map(([stars, count]) => {
              const percent = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
              return (
                <li key={stars} className="flex items-center gap-3 text-xs text-muted">
                  <span className="w-14 shrink-0">
                    {t('salon.profile.starLabel', { count: stars })}
                  </span>
                  <span
                    className="h-2 flex-1 overflow-hidden rounded-pill bg-surface"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-pill bg-warning"
                      style={{ inlineSize: `${percent}%` }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-end">
                    <Num value={count} />
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 space-y-4">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-2xl border border-border bg-elevated p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-text">{review.author}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <RatingStars value={review.rating} hideValue />
                      {review.verified && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <ShieldCheck className="size-3.5" aria-hidden="true" />
                          {t('salon.profile.verifiedBooking')}
                        </span>
                      )}
                    </div>
                  </div>
                  <time className="shrink-0 text-xs text-muted" dateTime={review.date}>
                    <JalaliDate value={review.date} />
                  </time>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">{review.body}</p>
                {review.service && (
                  <p className="mt-2 inline-flex rounded-pill bg-surface px-2.5 py-1 text-xs text-muted">
                    {t('salon.profile.reviewFor', { service: review.service })}
                  </p>
                )}
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-2xl border border-border bg-elevated p-4 text-sm text-muted">
          {t('salon.profile.reviewsEmpty')}
        </p>
      )}
    </section>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export function SalonProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const salon = getSalonProfile(slug);
  const [qrRedirecting, setQrRedirecting] = useState(false);
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  const [mapVisible, setMapVisible] = useState(false);

  useEffect(() => {
    if (salon || !slug) return;
    let active = true;
    setQrRedirecting(true);
    salonApi
      .resolveQr(slug)
      .then((result) => {
        if (active)
          navigate(`/qr/${encodeURIComponent(slug)}`, {
            replace: true,
            state: {
              resolvedQr: result,
              scanSource:
                new URLSearchParams(location.search).get('utm_source') ??
                new URLSearchParams(location.search).get('source') ??
                undefined,
            },
          });
      })
      .catch(() => {
        if (active) setQrRedirecting(false);
      });
    return () => {
      active = false;
    };
  }, [location.search, navigate, salon, slug]);

  if (!salon) {
    // While the QR-resolve request is in flight, show a neutral pending state
    // — never flash «صفحه یافت نشد» at users following a valid QR link.
    if (qrRedirecting) {
      return (
        <div
          data-testid="salon-resolving"
          role="status"
          className="mx-auto flex min-h-[60vh] max-w-7xl flex-col items-center justify-center gap-4 px-4 py-12 text-center"
        >
          <SeoHead title={t('salon.profile.resolvingQrTitle')} />
          <Spinner size="lg" />
          <p className="font-semibold text-text">{t('salon.profile.resolvingQrTitle')}</p>
          <p className="text-sm text-muted">{t('salon.profile.resolvingQrBody')}</p>
        </div>
      );
    }
    return (
      <div data-testid="salon-not-found" className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12">
        <SeoHead title={t('salon.profile.notFoundTitle')} />
        <h1 className="text-2xl font-bold text-text">{t('salon.profile.notFoundTitle')}</h1>
        <p className="mt-2 text-muted">{t('salon.profile.notFoundBody')}</p>
        <Link to="/" className="mt-5 inline-flex text-primary underline">
          {t('salon.profile.backHome')}
        </Link>
      </div>
    );
  }

  const path = `/s/${salon.slug}`;
  const bookHref = `/salon/${salon.bookingSalonId}/book`;
  const cacheSalonName = () => writeSalonName(salon.bookingSalonId, salon.name);
  const reviews = salon.reviews ?? [];
  const staff = salon.staff ?? [];
  const city = DISCOVERY_CITIES.find((c) => c.slug === salon.citySlug);
  const today = tehranToday();
  const open = isOpenNow(salon);
  const minPrice =
    salon.services.length > 0
      ? Math.min(...salon.services.map((service) => service.priceRial))
      : null;

  return (
    <TenantTheme accentKey={salon.brandAccent}>
      <div
        data-testid="salon-profile"
        className="mx-auto w-full max-w-container px-4 pb-28 pt-4 lg:pb-12"
      >
        <SeoHead
          title={salon.name}
          description={salon.tagline}
          path={path}
          ogType="business.business"
          image={salon.ogImage ? `${SITE_URL}${salon.ogImage}` : undefined}
          index
        />
        <JsonLd data={buildSalonJsonLd(salon)} />

        {/* Visible, RTL-correct breadcrumb (steering §8 wayfinding). */}
        <nav aria-label={t('salon.profile.breadcrumb')} className="mb-4 text-sm text-muted">
          <ol role="list" className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link
                to="/"
                className="inline-flex min-h-10 min-w-10 items-center justify-center px-1 text-muted no-underline transition-colors duration-fast ease-standard hover:text-primary"
              >
                {t('salon.profile.crumbHome')}
              </Link>
            </li>
            <li aria-hidden="true">‹</li>
            {city && (
              <>
                <li>
                  <Link
                    to={`/city/${city.slug}`}
                    className="inline-flex min-h-10 min-w-10 items-center justify-center px-1 text-muted no-underline transition-colors duration-fast ease-standard hover:text-primary"
                  >
                    {city.name}
                  </Link>
                </li>
                <li aria-hidden="true">‹</li>
              </>
            )}
            <li aria-current="page" className="font-medium text-text">
              {salon.name}
            </li>
          </ol>
        </nav>

        <header>
          <ProfileGallery salon={salon} onOpen={setLightboxAt} />
        </header>
        {lightboxAt !== null && (
          <Suspense fallback={null}>
            <GalleryLightbox
              salon={salon}
              openAt={lightboxAt}
              onClose={() => setLightboxAt(null)}
            />
          </Suspense>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22.5rem]">
          <div className="min-w-0">
            {/* Identity block: chips → name → address → rating (§j.4). */}
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-pill bg-surface px-3 py-1 text-xs text-muted">
                {salon.category ?? t('salon.profile.eyebrow')}
              </span>
              {open !== null && (
                <span
                  className={cn(
                    'rounded-pill px-3 py-1 text-xs font-semibold',
                    open ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                  )}
                >
                  {open ? t('salon.profile.openNow') : t('salon.profile.closedNow')}
                </span>
              )}
            </div>
            <h1 className="text-display text-3xl leading-tight text-text">
              {salon.displayName ?? salon.name}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {salon.address.streetAddress}، {salon.address.addressLocality}
            </p>
            {salon.rating != null && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <bdi className="font-bold text-text">
                  <Num value={Number(salon.rating.toFixed(1))} />
                </bdi>
                <RatingStars value={salon.rating} hideValue />
                <span className="text-muted">
                  {t('rating.reviews', { count: salon.reviewCount ?? reviews.length })}
                </span>
              </div>
            )}

            <ServicesSection salon={salon} bookHref={bookHref} onBookClick={cacheSalonName} />

            <ReviewsSection salon={salon} />

            <section className="mt-10" aria-labelledby="salon-about-title">
              <h2 id="salon-about-title" className="text-2xl font-bold text-text">
                {t('salon.profile.aboutTitle')}
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted">{salon.description}</p>
            </section>

            {salon.amenities && salon.amenities.length > 0 && (
              <section className="mt-10" aria-labelledby="salon-amenities-title">
                <h2 id="salon-amenities-title" className="text-2xl font-bold text-text">
                  {t('salon.profile.amenitiesTitle')}
                </h2>
                <ul
                  className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2 lg:grid-cols-3"
                  role="list"
                >
                  {salon.amenities.map((amenity) => (
                    <li key={amenity} className="flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      {amenity}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {salon.policies && salon.policies.length > 0 && (
              <section className="mt-10" aria-labelledby="salon-policies-title">
                <h2 id="salon-policies-title" className="text-2xl font-bold text-text">
                  {t('salon.profile.policiesTitle')}
                </h2>
                <ul className="mt-4 max-w-3xl space-y-2 text-sm leading-6 text-muted" role="list">
                  {salon.policies.map((policy) => (
                    <li key={policy} className="flex items-start gap-2">
                      <ShieldCheck
                        className="mt-1 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {policy}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {staff.length > 0 && (
              <section className="mt-10" aria-labelledby="salon-staff-title">
                <h2 id="salon-staff-title" className="text-2xl font-bold text-text">
                  {t('salon.profile.teamTitle')}
                </h2>
                <p className="mt-1 text-sm text-muted">{t('salon.profile.teamSubtitle')}</p>
                <ul className="mt-4 flex flex-wrap gap-6" role="list">
                  {staff.map((member) => (
                    <li key={member.id} className="text-center">
                      <span
                        aria-hidden="true"
                        className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary"
                      >
                        {member.name.slice(0, 1)}
                      </span>
                      <span className="mt-2 block text-sm font-semibold text-text">
                        {member.name}
                      </span>
                      <span className="block text-xs text-muted">{member.role}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-10" aria-labelledby="salon-hours-title">
              <h2 id="salon-hours-title" className="text-2xl font-bold text-text">
                {t('salon.profile.hoursTitle')}
              </h2>
              <div className="mt-4 max-w-sm divide-y divide-border overflow-hidden rounded-2xl border border-border bg-elevated">
                {IRANIAN_WEEK_ORDER.map((day) => {
                  const hours = salon.openingHours.find((item) => item.day === day);
                  const isToday = day === today;
                  return (
                    <div
                      key={day}
                      className={cn(
                        'flex items-center justify-between px-4 py-3 text-sm',
                        isToday && 'bg-primary/5 font-semibold',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {PERSIAN_DAY_LABEL[day]}
                        {isToday && (
                          <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-xs font-bold text-text">
                            {t('salon.profile.todayBadge')}
                          </span>
                        )}
                      </span>
                      <bdi className="text-muted">
                        {!hours || hours.closed
                          ? t('salon.profile.hoursClosed')
                          : `${toPersianDigits(hours.opens ?? '')} – ${toPersianDigits(hours.closes ?? '')}`}
                      </bdi>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-10" aria-labelledby="salon-contact-title">
              <h2 id="salon-contact-title" className="text-2xl font-bold text-text">
                {t('salon.profile.contactTitle')}
              </h2>
              <address className="mt-4 space-y-2 text-sm not-italic text-muted">
                <p className="flex items-center gap-2">
                  <MapPin className="size-4 shrink-0" aria-hidden="true" />
                  {salon.address.streetAddress}، {salon.address.addressLocality}
                </p>
                <a
                  href={`tel:${salon.telephone}`}
                  className="flex min-h-10 items-center gap-2 font-semibold text-primary no-underline"
                >
                  <Phone className="size-4 shrink-0" aria-hidden="true" />
                  <DirText dir="ltr">{salon.telephone}</DirText>
                </a>
              </address>

              {salon.channels && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-text">
                    {t('salon.profile.channelsTitle')}
                  </h3>
                  <p className="mt-1 text-xs text-muted">{t('salon.profile.channelsHint')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {salon.channels.website && (
                      <Link
                        to={salon.channels.website}
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-border bg-elevated px-4 text-sm font-medium text-text no-underline transition-colors duration-fast ease-standard hover:border-primary hover:text-primary"
                      >
                        <Globe className="size-4" aria-hidden="true" />
                        {t('salon.profile.channelWebsite')}
                      </Link>
                    )}
                    {salon.channels.bale && (
                      <a
                        href={salon.channels.bale}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-border bg-elevated px-4 text-sm font-medium text-text no-underline transition-colors duration-fast ease-standard hover:border-primary hover:text-primary"
                      >
                        <Send className="size-4" aria-hidden="true" />
                        {t('salon.profile.channelBale')}
                        <span className="sr-only">({t('salon.profile.channelNewTab')})</span>
                      </a>
                    )}
                    {salon.channels.telegram && (
                      <a
                        href={salon.channels.telegram}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-border bg-elevated px-4 text-sm font-medium text-text no-underline transition-colors duration-fast ease-standard hover:border-primary hover:text-primary"
                      >
                        <Send className="size-4" aria-hidden="true" />
                        {t('salon.profile.channelTelegram')}
                        <span className="sr-only">({t('salon.profile.channelNewTab')})</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Real map embed, loaded lazily behind an explicit tap/click so
                  the third-party iframe never competes with first paint. */}
              <div className="mt-5 overflow-hidden rounded-2xl border border-border">
                {mapVisible ? (
                  <iframe
                    src={salon.mapEmbedUrl}
                    title={t('salon.profile.mapEmbedTitle', { name: salon.name })}
                    loading="lazy"
                    className="block h-64 w-full border-0"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setMapVisible(true)}
                    className={cn(
                      'flex h-64 w-full flex-col items-center justify-center gap-2 bg-surface text-sm font-semibold text-text',
                      'transition-colors duration-fast ease-standard hover:text-primary',
                      'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
                    )}
                  >
                    <MapPin className="size-6 text-primary" aria-hidden="true" />
                    {t('salon.profile.mapTitle')}
                  </button>
                )}
              </div>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${salon.geo.latitude},${salon.geo.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-[40px] items-center gap-2 text-sm font-semibold text-primary no-underline transition-opacity duration-fast ease-standard hover:opacity-80"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                {t('salon.profile.directionsCta')}
                <span className="sr-only">({t('salon.profile.channelNewTab')})</span>
              </a>
            </section>
          </div>

          {/* Sticky booking card — 360px rail (§j.2). */}
          <aside className="hidden lg:block">
            <div className="sticky top-32 rounded-2xl border border-border bg-elevated p-6 shadow-1">
              <p className="text-sm text-muted">{t('salon.profile.sidebarEyebrow')}</p>
              <h2 className="mt-2 text-lg font-semibold text-text">{t('salon.profile.bookCta')}</h2>
              <Link
                to={bookHref}
                onClick={cacheSalonName}
                className={cn(
                  'mt-5 flex min-h-[48px] w-full items-center justify-center rounded-pill bg-primary px-5 text-sm font-semibold text-primary-contrast no-underline',
                  'transition-opacity duration-fast ease-standard hover:opacity-90 active:translate-y-px',
                  'outline-none focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-2 focus-visible:outline-focus',
                )}
              >
                {t('salon.profile.bookCtaLong')}
              </Link>
              <p className="mt-3 text-xs text-muted">{t('salon.profile.bookCtaHint')}</p>
              {salon.rating != null && (
                <div className="mt-5 flex items-center gap-2 text-sm">
                  <bdi className="font-bold text-text">
                    <Num value={Number(salon.rating.toFixed(1))} />
                  </bdi>
                  <RatingStars value={salon.rating} hideValue />
                  <span className="text-muted">
                    {t('rating.reviews', { count: salon.reviewCount ?? reviews.length })}
                  </span>
                </div>
              )}
              {minPrice != null && (
                <p className="mt-3 text-sm text-muted">
                  {t('discovery.card.fromPrice', {
                    price: toPersianDigits(formatToman(minPrice)),
                  })}
                </p>
              )}
              <p className="mt-3 text-sm leading-6 text-muted">{salon.address.streetAddress}</p>
              {open !== null && (
                <p
                  className={cn(
                    'mt-3 text-sm font-semibold',
                    open ? 'text-success' : 'text-danger',
                  )}
                >
                  {open ? t('salon.profile.openNow') : t('salon.profile.closedNow')}
                </p>
              )}
            </div>
          </aside>
        </div>

        {/* Sticky bottom CTA below lg — hands off to the sidebar exactly where
            it appears; safe-area aware (steering §5). */}
        <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-elevated px-4 pt-3 pb-[max(var(--space-3),env(safe-area-inset-bottom))] lg:hidden">
          <Link
            to={bookHref}
            onClick={cacheSalonName}
            className={cn(
              'flex min-h-[48px] w-full items-center justify-center rounded-pill bg-primary px-5 font-semibold text-primary-contrast no-underline',
              'transition-opacity duration-fast ease-standard hover:opacity-90 active:translate-y-px',
              'outline-none focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            {t('salon.profile.bookCta')}
          </Link>
        </div>
      </div>
    </TenantTheme>
  );
}

/* ─── JSON-LD ──────────────────────────────────────────────────────────── */

export function buildSalonJsonLd(salon: SalonProfile): JsonLdNode[] {
  const url = `${SITE_URL}/s/${salon.slug}`;
  const salonType = salon.category === 'آرایشگاه مردانه' ? 'HairSalon' : 'BeautySalon';
  const reviews = salon.reviews ?? [];
  const node: JsonLdNode = {
    '@type': salonType,
    name: salon.name,
    url,
    telephone: salon.telephone,
    priceRange: salon.priceRange,
    address: {
      '@type': 'PostalAddress',
      streetAddress: salon.address.streetAddress,
      addressLocality: salon.address.addressLocality,
      addressRegion: salon.address.addressRegion,
      addressCountry: salon.address.addressCountry,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: salon.geo.latitude,
      longitude: salon.geo.longitude,
    },
    openingHoursSpecification: IRANIAN_WEEK_ORDER.map((day) =>
      salon.openingHours.find((hours) => hours.day === day),
    )
      .filter((hours): hours is NonNullable<typeof hours> =>
        Boolean(hours && !hours.closed && hours.opens && hours.closes),
      )
      .map((hours) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: hours.day,
        opens: hours.opens,
        closes: hours.closes,
      })),
  };
  if (salon.ogImage) node.image = `${SITE_URL}${salon.ogImage}`;
  // aggregateRating ONLY when visible reviews back it (contract
  // §content-honesty; Google review-snippet policy). `withComputedRating`
  // guarantees rating/reviewCount agree with the reviews below.
  if (reviews.length > 0 && typeof salon.rating === 'number' && salon.reviewCount) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: salon.rating.toFixed(1),
      reviewCount: String(salon.reviewCount),
      bestRating: '5',
      worstRating: '1',
    };
    node.review = reviews.map((review) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: review.author },
      datePublished: review.date.slice(0, 10),
      reviewRating: {
        '@type': 'Rating',
        ratingValue: String(review.rating),
        bestRating: '5',
        worstRating: '1',
      },
      reviewBody: review.body,
    }));
  }

  const services: JsonLdNode[] = salon.services.map((service) => ({
    '@type': 'Service',
    name: service.name,
    provider: { '@type': salonType, name: salon.name },
    offers: {
      '@type': 'Offer',
      price: String(service.priceRial),
      priceCurrency: 'IRR',
    },
  }));
  const city = DISCOVERY_CITIES.find((c) => c.slug === salon.citySlug);
  const breadcrumb: JsonLdNode = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: i18n.t('salon.profile.crumbHome'),
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: city?.name ?? salon.address.addressLocality,
        item: `${SITE_URL}/city/${salon.citySlug}`,
      },
      { '@type': 'ListItem', position: 3, name: salon.name, item: url },
    ],
  };
  return [node, ...services, breadcrumb];
}

export default SalonProfilePage;
