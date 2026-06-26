import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { MapPin, Phone, Clock, Scissors } from 'lucide-react';
import i18n from '../i18n';
import { SeoHead, JsonLd, SITE_URL } from '../components/seo';
import type { JsonLdNode } from '../components/seo';
import {
  Card,
  CardContent,
  CardTitle,
  Money,
  Num,
  DirText,
  Picture,
  toPersianDigits,
} from '../components/ui';
import {
  getSalonProfile,
  IRANIAN_WEEK_ORDER,
  PERSIAN_DAY_LABEL,
  type SalonProfile,
} from '../data/salons';

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

  return (
    <div data-testid="salon-profile">
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

      {/* Hero: single <h1> + lead + the one primary CTA into the funnel. */}
      <header className="flex flex-col items-start gap-4 py-4">
        <h1 className="max-w-prose text-xl font-bold text-text">{heading}</h1>
        <p className="max-w-prose text-md text-muted">{salon.tagline}</p>
        <p className="max-w-prose text-sm text-muted">{salon.description}</p>
        <Link
          to={`/salon/${salon.bookingSalonId}/book`}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-md font-medium text-primary-contrast no-underline shadow-1 transition-colors duration-fast ease-standard hover:brightness-110 active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {t('salon.profile.bookCta')}
        </Link>
      </header>

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
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="text-text">{PERSIAN_DAY_LABEL[entry.day]}</span>
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
        </Card>
      </section>
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
