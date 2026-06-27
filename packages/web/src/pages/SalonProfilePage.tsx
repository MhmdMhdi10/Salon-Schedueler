import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import {
  MapPin,
  Phone,
  Clock,
  Scissors,
  Globe,
  Send,
  MessageCircle,
  Smartphone,
  Plus,
  CalendarDays,
} from 'lucide-react';
import i18n from '../i18n';
import { SeoHead, JsonLd, SITE_URL } from '../components/seo';
import type { JsonLdNode } from '../components/seo';
import {
  Button,
  Card,
  CardContent,
  CardTitle,
  Money,
  Num,
  DirText,
  Picture,
  cn,
  toPersianDigits,
} from '../components/ui';
import {
  getSalonProfile,
  IRANIAN_WEEK_ORDER,
  PERSIAN_DAY_LABEL,
  type SalonProfile,
  type SchemaDay,
} from '../data/salons';
import { usePwaInstall } from '../pwa/usePwaInstall';

/**
 * Shared styling for an off-page booking-channel link (web app/site, bots):
 * a token-driven, ≥48px, RTL-safe tappable card with the full focus-visible
 * ring and hover affordance.
 */
const CHANNEL_CARD =
  'flex min-h-[48px] items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-3 text-sm font-medium text-text no-underline transition-colors duration-fast ease-standard hover:bg-elevated hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/**
 * Public salon profile at `/s/:slug` (task 5.2; R8.1, R8.3, R8.4, R8.8, R9.1).
 *
 * This is the platform's primary search-discovery surface (seo §1). It is a
 * **content** page — discover + decide — that links out to the booking funnel
 * via a single clear CTA; it never merges the funnel into itself (seo §1
 * "one job per URL").
 *
 * ## Structure & SEO (seo §2, §3, §5, §8; R8.8)
 *  - A single `<h1>` («سالن رز — آرایشگاه زنانه در تهران، ولنجک») and ordered
 *    headings inside `article`/`section` landmark blocks (services, hours,
 *    gallery, map, NAP).
 *  - `<SeoHead index>` opts the route **in** to indexing (default is noindex),
 *    emitting the unique title/description, single-host self-canonical, OG
 *    (`business.business`) / Twitter card, and the `hreflang` self-reference.
 *  - `<JsonLd>` injects `BeautySalon` + one `Service` per offering
 *    (`priceCurrency:"IRR"`) + `BreadcrumbList`, all built from the same data
 *    that renders on the page so the NAP/structured-data stays consistent
 *    (seo §5, §11) — nothing fabricated.
 *
 * ## Local SEO & RTL (seo §11; ui-ux §11)
 *  - The NAP block (name/address/phone) is identical to the JSON-LD.
 *  - Opening hours render in **Iranian-week** order (Saturday first, Friday the
 *    weekend) and feed the JSON-LD `openingHoursSpecification`.
 *  - The map is a **lazy-loaded** Neshan/Balad embed so it never blocks paint.
 *  - Gallery images are sized (explicit `width`/`height`, CLS-safe), lazy below
 *    the fold, and carry meaningful Persian `alt`.
 *  - Logical properties throughout; mixed Latin/number runs (phone, hours) are
 *    bidi-isolated via `<DirText>`/`<Num>`.
 *
 * All copy comes from the `fa.json` catalog (`salon.profile.*`). The slug is
 * ASCII/transliterated so the canonical URL is clean (seo §6).
 */
export function SalonProfilePage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const salon = getSalonProfile(slug);
  const { installed, promptInstall } = usePwaInstall();
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  // Unknown slug → a noindex "not found" surface (no canonical into the index).
  if (!salon) {
    return (
      <div data-testid="salon-not-found">
        <SeoHead title={t('salon.profile.notFoundTitle')} />
        <h1 className="text-xl font-bold text-text">
          {t('salon.profile.notFoundTitle')}
        </h1>
        <p className="mt-2 max-w-prose text-muted">
          {t('salon.profile.notFoundBody')}
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex min-h-[44px] items-center text-primary underline-offset-4 hover:underline"
        >
          {t('salon.profile.backHome')}
        </Link>
      </div>
    );
  }

  const heading = `${salon.name} — ${t('salon.profile.headingSuffix', {
    city: salon.address.addressLocality,
    neighborhood: salon.neighborhood,
  })}`;
  const path = `/s/${salon.slug}`;
  const ogImage = salon.ogImage ? `${SITE_URL}${salon.ogImage}` : undefined;
  const bookHref = `/salon/${salon.bookingSalonId}/book`;
  const today = tehranToday();
  const channels = salon.channels ?? {};

  const handleInstall = async () => {
    const outcome = await promptInstall();
    // Browsers without `beforeinstallprompt` (e.g. iOS Safari) need the manual
    // "Add to Home Screen" flow — reveal the instructions instead.
    if (outcome === 'unavailable') setShowInstallHelp(true);
  };

  return (
    <div
      data-testid="salon-profile"
      className="mx-auto w-full max-w-container pb-28 md:pb-10"
    >
      <SeoHead
        title={salon.name}
        description={salon.tagline}
        path={path}
        ogType="business.business"
        image={ogImage}
        index
      />
      <JsonLd data={buildSalonJsonLd(salon)} />

      {/* Breadcrumb — mirrors the BreadcrumbList JSON-LD (seo §5). */}
      <nav aria-label={t('salon.profile.breadcrumb')} className="py-3 text-sm">
        <ol className="flex flex-wrap items-center gap-x-2 text-muted" role="list">
          <li>
            <Link to="/" className="hover:text-text hover:underline">
              {t('salon.profile.crumbHome')}
            </Link>
          </li>
          <li aria-hidden="true">‹</li>
          <li className="text-text">{salon.name}</li>
        </ol>
      </nav>

      {/* Hero — single <h1>, key facts as chips, and the one primary CTA. */}
      <header className="relative mt-2 overflow-hidden rounded-lg bg-gradient-to-bl from-primary to-accent px-5 py-8 text-primary-contrast shadow-2 sm:px-8 sm:py-10">
        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-pill bg-white/15 px-3 py-1 text-sm">
              <MapPin aria-hidden="true" size={14} />
              {salon.neighborhood}، {salon.address.addressLocality}
            </span>
            <span className="inline-flex items-center gap-1 rounded-pill bg-white/15 px-3 py-1 text-sm">
              <Scissors aria-hidden="true" size={14} />
              {t('salon.profile.servicesCount', { count: salon.services.length })}
            </span>
          </div>
          <h1 className="max-w-prose text-2xl font-bold leading-tight">{heading}</h1>
          <p className="max-w-prose text-md opacity-90">{salon.tagline}</p>
          <Link
            to={bookHref}
            className="mt-1 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-primary-contrast px-6 py-3 text-md font-bold text-primary no-underline shadow-1 transition-transform duration-fast ease-emphasized hover:scale-[1.02] active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <CalendarDays aria-hidden="true" size={20} />
            {t('salon.profile.bookCtaLong')}
          </Link>
          <p className="text-xs opacity-90">{t('salon.profile.bookCtaHint')}</p>
        </div>
      </header>

      {/* Longer description at a readable measure. */}
      <p className="max-w-prose py-4 text-md leading-loose text-muted">
        {salon.description}
      </p>

      {/* Other booking channels — web app/site + Bale/Telegram bots. */}
      <section className="py-6" aria-labelledby="salon-channels-title">
        <h2 id="salon-channels-title" className="mb-1 text-lg font-bold text-text">
          {t('salon.profile.channelsTitle')}
        </h2>
        <p className="mb-4 max-w-prose text-sm text-muted">
          {t('salon.profile.channelsHint')}
        </p>
        <ul className="grid gap-3 sm:grid-cols-3" role="list">
          {channels.website && (
            <li>
              <Link to={channels.website} className={CHANNEL_CARD}>
                <Globe aria-hidden="true" size={20} className="text-primary" />
                <span>{t('salon.profile.channelWebsite')}</span>
              </Link>
            </li>
          )}
          {channels.bale && (
            <li>
              <a
                href={channels.bale}
                target="_blank"
                rel="noopener noreferrer"
                className={CHANNEL_CARD}
              >
                <MessageCircle aria-hidden="true" size={20} className="text-primary" />
                <span>{t('salon.profile.channelBale')}</span>
                <span className="sr-only">
                  {' '}
                  ({t('salon.profile.channelNewTab')})
                </span>
              </a>
            </li>
          )}
          {channels.telegram && (
            <li>
              <a
                href={channels.telegram}
                target="_blank"
                rel="noopener noreferrer"
                className={CHANNEL_CARD}
              >
                <Send aria-hidden="true" size={20} className="text-primary" />
                <span>{t('salon.profile.channelTelegram')}</span>
                <span className="sr-only">
                  {' '}
                  ({t('salon.profile.channelNewTab')})
                </span>
              </a>
            </li>
          )}
        </ul>
      </section>

      {/* Add as web app (PWA install) — "save it to book faster next time". */}
      {installed ? (
        <p className="py-2 text-sm font-medium text-success">
          {t('salon.profile.installedNote')}
        </p>
      ) : (
        <section className="py-6" aria-labelledby="salon-install-title">
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-contrast"
                aria-hidden="true"
              >
                <Smartphone size={22} />
              </span>
              <div className="flex flex-col gap-1">
                <h2
                  id="salon-install-title"
                  className="text-md font-bold text-text"
                >
                  {t('salon.profile.installTitle')}
                </h2>
                <p className="max-w-prose text-sm text-muted">
                  {t('salon.profile.installBody')}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              onClick={handleInstall}
              startIcon={<Plus size={18} />}
              className="sm:shrink-0"
            >
              {t('salon.profile.installCta')}
            </Button>
          </Card>
          {showInstallHelp && (
            <p
              role="note"
              className="mt-3 max-w-prose rounded-md border border-border bg-surface p-3 text-sm text-muted"
            >
              <span className="font-bold text-text">
                {t('salon.profile.installManualTitle')}:{' '}
              </span>
              {t('salon.profile.installManualBody')}
            </p>
          )}
        </section>
      )}

      {/* Services — one card list; price in Rial via <Money>. */}
      <section className="py-6" aria-labelledby="salon-services-title">
        <h2
          id="salon-services-title"
          className="mb-4 flex items-center gap-2 text-lg font-bold text-text"
        >
          <Scissors aria-hidden="true" size={20} />
          {t('salon.profile.servicesTitle')}
        </h2>
        <ul className="grid gap-3 md:grid-cols-2" role="list">
          {salon.services.map((service) => (
            <li key={service.id}>
              <Card as="article" className="flex flex-col gap-2">
                <CardTitle as="h3">{service.name}</CardTitle>
                <CardContent className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">
                    {t('salon.profile.serviceDuration')}:{' '}
                    <Num value={service.durationMinutes} />{' '}
                    {t('salon.profile.durationMinutes', {
                      count: service.durationMinutes,
                    })}
                  </span>
                  <Money amountRial={service.priceRial} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* Opening hours — Iranian week order (Saturday first). */}
      <section className="py-6" aria-labelledby="salon-hours-title">
        <h2
          id="salon-hours-title"
          className="mb-4 flex items-center gap-2 text-lg font-bold text-text"
        >
          <Clock aria-hidden="true" size={20} />
          {t('salon.profile.hoursTitle')}
        </h2>
        <Card as="div">
          <ul className="flex flex-col gap-2" role="list">
            {orderedHours(salon).map((entry) => (
              <li
                key={entry.day}
                className={cn(
                  'flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm',
                  entry.day === today && 'bg-elevated font-bold',
                )}
              >
                <span className="flex items-center gap-2 text-text">
                  {PERSIAN_DAY_LABEL[entry.day]}
                  {entry.day === today && (
                    <span className="rounded-pill bg-primary px-2 py-0.5 text-2xs font-medium text-primary-contrast">
                      {t('salon.profile.todayBadge')}
                    </span>
                  )}
                </span>
                {entry.closed || !entry.opens || !entry.closes ? (
                  <span className="text-muted">
                    {t('salon.profile.hoursClosed')}
                  </span>
                ) : (
                  <DirText dir="ltr" className="text-muted tabular-nums">
                    {t('salon.profile.hoursRange', {
                      opens: toPersianDigits(entry.opens),
                      closes: toPersianDigits(entry.closes),
                    })}
                  </DirText>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* Gallery — sized, lazy, Persian alt (CLS-safe). */}
      <section className="py-6" aria-labelledby="salon-gallery-title">
        <h2 id="salon-gallery-title" className="mb-4 text-lg font-bold text-text">
          {t('salon.profile.galleryTitle')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {salon.gallery.map((image) => {
            const sources = [
              image.avifSrcSet && { type: 'image/avif', srcSet: image.avifSrcSet },
              image.webpSrcSet && { type: 'image/webp', srcSet: image.webpSrcSet },
            ].filter(Boolean) as { type: string; srcSet: string }[];
            return (
              <div
                key={image.src}
                className="overflow-hidden rounded-lg border border-border bg-surface"
              >
                <Picture
                  sources={sources}
                  src={image.src}
                  fallbackSrcSet={image.srcSet}
                  sizes="(min-width: 480px) 50vw, 100vw"
                  width={image.width}
                  height={image.height}
                  alt={image.alt}
                  loading="lazy"
                  className="h-auto w-full"
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Map — lazy-loaded Neshan/Balad embed (seo §11). */}
      <section className="py-6" aria-labelledby="salon-map-title">
        <h2 id="salon-map-title" className="mb-4 text-lg font-bold text-text">
          {t('salon.profile.mapTitle')}
        </h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <iframe
            title={t('salon.profile.mapEmbedTitle', { name: salon.name })}
            src={salon.mapEmbedUrl}
            loading="lazy"
            width={1200}
            height={400}
            className="block h-[400px] w-full border-0"
          />
        </div>
      </section>

      {/* NAP block — identical to the JSON-LD (seo §11). */}
      <section className="py-6" aria-labelledby="salon-contact-title">
        <h2 id="salon-contact-title" className="mb-4 text-lg font-bold text-text">
          {t('salon.profile.contactTitle')}
        </h2>
        <Card as="address" className="flex flex-col gap-3 not-italic">
          <p className="flex items-start gap-2 text-sm text-text">
            <MapPin aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
            <span>
              <span className="text-muted">{t('salon.profile.addressLabel')}: </span>
              {salon.address.streetAddress}، {salon.address.addressLocality}
            </span>
          </p>
          <p className="flex items-center gap-2 text-sm text-text">
            <Phone aria-hidden="true" size={18} className="shrink-0" />
            <span className="text-muted">{t('salon.profile.phoneLabel')}: </span>
            <a href={`tel:${salon.telephone}`} className="text-primary hover:underline">
              <DirText dir="ltr">{salon.telephone}</DirText>
            </a>
          </p>
          <a
            href={`tel:${salon.telephone}`}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text no-underline transition-colors duration-fast ease-standard hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Phone aria-hidden="true" size={16} />
            {t('salon.profile.callCta')}
          </a>
        </Card>
      </section>

      {/* Sticky mobile booking bar — keeps the primary CTA in thumb reach
          (ui-ux §5) and clears the home-indicator safe area. Hidden on ≥md,
          where the hero CTA stays visible. */}
      <div
        className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-elevated px-4 py-3 shadow-2 md:hidden"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Link
          to={bookHref}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-md font-bold text-primary-contrast no-underline shadow-1 transition-colors duration-fast ease-standard hover:brightness-110 active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <CalendarDays aria-hidden="true" size={20} />
          {t('salon.profile.bookCta')}
        </Link>
      </div>
    </div>
  );
}

/** Orders a salon's hours into Iranian-week display order (Saturday first). */
function orderedHours(salon: SalonProfile) {
  return IRANIAN_WEEK_ORDER.map(
    (day) => salon.openingHours.find((h) => h.day === day) ?? { day, closed: true },
  );
}

/**
 * Today's schema.org weekday in the salon's locale (Asia/Tehran) for the "امروز"
 * hours highlight, or null if the runtime can't resolve the time zone. Display-
 * only — never affects the JSON-LD.
 */
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

/**
 * Builds the page's JSON-LD: `BeautySalon` + one `Service` per offering
 * (`priceCurrency:"IRR"`) + `BreadcrumbList` (seo §5). Built from the same
 * `SalonProfile` that renders on the page, so the structured data marks up only
 * visible content and the NAP stays consistent — nothing is fabricated.
 *
 * Exported so it can be unit-tested without rendering the whole page.
 */
export function buildSalonJsonLd(salon: SalonProfile): JsonLdNode[] {
  const url = `${SITE_URL}/s/${salon.slug}`;
  const image = salon.ogImage ? `${SITE_URL}${salon.ogImage}` : undefined;

  const beautySalon: JsonLdNode = {
    '@type': 'BeautySalon',
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
    openingHoursSpecification: salon.openingHours
      .filter((h) => !h.closed && h.opens && h.closes)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: h.day,
        opens: h.opens,
        closes: h.closes,
      })),
  };
  if (image) beautySalon.image = image;

  const services: JsonLdNode[] = salon.services.map((service) => ({
    '@type': 'Service',
    name: service.name,
    provider: { '@type': 'BeautySalon', name: salon.name },
    offers: {
      '@type': 'Offer',
      price: String(service.priceRial),
      priceCurrency: 'IRR',
    },
  }));

  const breadcrumb: JsonLdNode = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: i18n.t('salon.profile.crumbHome'),
        item: SITE_URL,
      },
      { '@type': 'ListItem', position: 2, name: salon.name, item: url },
    ],
  };

  return [beautySalon, ...services, breadcrumb];
}

export default SalonProfilePage;
