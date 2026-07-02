import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Scissors } from 'lucide-react';
import i18n from '../i18n';
import { SeoHead, JsonLd, SITE_URL } from '../components/seo';
import type { JsonLdNode } from '../components/seo';
import { Card, CardContent, CardTitle, Num, SalonCard } from '../components/ui';
import { getCity, getServiceType } from '../data/discovery';
import {
  getSalonsByCity,
  getSalonsByService,
  type SalonProfile,
} from '../data/salons';

/**
 * Public discovery pages — `/city/:city` and `/services/:type` (task 5.3;
 * R8.1, R8.4, R8.8; seo §1).
 *
 * These are local/category discovery surfaces that target the Persian queries
 * Iranians actually search («سالن زیبایی [شهر]», «قیمت کوتاهی مو [شهر]»). The
 * steering standard is explicit (seo §1): they must carry **genuine,
 * differentiated content** — real cities/services, real copy, real matching
 * salons — **not templated near-duplicates**. So each page renders its own
 * hand-written Persian intro/body (from `data/discovery.ts`) plus a list of the
 * real salons that match, linking out to each `/s/:slug` profile with
 * descriptive link text (seo §2).
 *
 * ## SEO (seo §2, §3, §5)
 *  - `<SeoHead index>` opts the route **in** to indexing (default is noindex —
 *    R8.7), emitting the unique title/description, single-host self-canonical,
 *    OG/Twitter card, and the `hreflang` self-reference.
 *  - `<JsonLd>` injects a `BreadcrumbList` (خانه ‹ this page) mirroring the
 *    visible breadcrumb (seo §5). The salon entities themselves carry their own
 *    `BeautySalon`/`Service` markup on their profile pages, so we don't
 *    duplicate (or fabricate) it here.
 *
 * Slugs are ASCII (`tehran`, `haircut`) so the canonical is clean (seo §6).
 * Unknown slugs render a noindex "not found" surface. All copy comes from the
 * `fa.json` catalog (`discovery.*` / `seo.*`); layout is logical-property RTL.
 */

/** A noindex "not found" surface shared by both discovery routes. */
function DiscoveryNotFound() {
  const { t } = useTranslation();
  return (
    <div data-testid="discovery-not-found">
      <SeoHead title={t('discovery.notFoundTitle')} />
      <h1 className="text-xl font-bold text-text">{t('discovery.notFoundTitle')}</h1>
      <p className="mt-2 max-w-prose text-muted">{t('discovery.notFoundBody')}</p>
      <Link
        to="/"
        className="mt-4 inline-flex min-h-[44px] items-center text-primary underline-offset-4 hover:underline"
      >
        {t('discovery.backHome')}
      </Link>
    </div>
  );
}

/** The matching-salon list shared by both discovery pages (with empty state). */
function SalonList({ salons, titleId }: { salons: SalonProfile[]; titleId: string }) {
  const { t } = useTranslation();

  if (salons.length === 0) {
    return (
      <Card as="div" className="flex flex-col items-start gap-2">
        <CardTitle as="h3">{t('discovery.noSalonsTitle')}</CardTitle>
        <CardContent>
          <p className="max-w-prose text-muted">{t('discovery.noSalonsBody')}</p>
          <Link
            to="/"
            className="mt-3 inline-flex min-h-[44px] items-center text-primary underline-offset-4 hover:underline"
          >
            {t('discovery.backHome')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="list"
      aria-labelledby={titleId}
    >
      {salons.map((salon) => (
        <li key={salon.slug}>
          <SalonCard salon={salon} />
        </li>
      ))}
    </ul>
  );
}

/** Builds the `BreadcrumbList` JSON-LD for a discovery page (خانه ‹ page). */
function buildBreadcrumb(name: string, path: string): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: i18n.t('discovery.crumbHome'),
        item: SITE_URL,
      },
      { '@type': 'ListItem', position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
}

/** `/city/:city` — local discovery for a city (R8.1, R8.4, R8.8). */
export function CityPage() {
  const { t } = useTranslation();
  const { city: citySlug } = useParams<{ city: string }>();
  const city = getCity(citySlug);

  if (!city) return <DiscoveryNotFound />;

  const salons = getSalonsByCity(city.slug);
  const path = `/city/${city.slug}`;
  const heading = t('discovery.city.headingSuffix', { city: city.name });

  return (
    <div data-testid="city-page">
      <SeoHead title={heading} description={city.intro} path={path} index />
      <JsonLd data={[buildBreadcrumb(heading, path)]} />

      <DiscoveryBreadcrumb heading={heading} />

      <header className="flex flex-col items-start gap-3 py-4">
        <h1 className="max-w-prose text-xl font-bold text-text">{heading}</h1>
        <p className="max-w-prose text-md text-muted">{city.intro}</p>
        <p className="max-w-prose text-sm text-muted">{city.body}</p>
      </header>

      {/* Neighborhoods — neighborhood-level intent, real content (seo §11). */}
      <section className="py-4" aria-labelledby="city-neighborhoods-title">
        <h2
          id="city-neighborhoods-title"
          className="mb-3 text-lg font-bold text-text"
        >
          {t('discovery.neighborhoodsTitle')}
        </h2>
        <ul className="flex flex-wrap gap-2" role="list">
          {city.neighborhoods.map((n) => (
            <li
              key={n}
              className="rounded-pill border border-border bg-surface px-3 py-1 text-sm text-text"
            >
              {n}
            </li>
          ))}
        </ul>
      </section>

      {/* Matching salons. */}
      <section className="py-4" aria-labelledby="city-salons-title">
        <h2 id="city-salons-title" className="mb-4 text-lg font-bold text-text">
          {t('discovery.city.salonsTitle', { city: city.name })}{' '}
          <span className="text-sm font-normal text-muted">
            (<Num value={salons.length} /> {t('discovery.salonCount', { count: salons.length })})
          </span>
        </h2>
        <SalonList salons={salons} titleId="city-salons-title" />
      </section>
    </div>
  );
}

/** `/services/:type` — category discovery for a service (R8.1, R8.4, R8.8). */
export function ServicePage() {
  const { t } = useTranslation();
  const { type: typeSlug } = useParams<{ type: string }>();
  const serviceType = getServiceType(typeSlug);

  if (!serviceType) return <DiscoveryNotFound />;

  const salons = getSalonsByService(serviceType.slug);
  const path = `/services/${serviceType.slug}`;
  const heading = t('discovery.service.headingSuffix', {
    service: serviceType.name,
  });

  return (
    <div data-testid="service-page">
      <SeoHead title={heading} description={serviceType.intro} path={path} index />
      <JsonLd data={[buildBreadcrumb(heading, path)]} />

      <DiscoveryBreadcrumb heading={heading} />

      <header className="flex flex-col items-start gap-3 py-4">
        <h1 className="flex max-w-prose items-center gap-2 text-xl font-bold text-text">
          <Scissors aria-hidden="true" size={22} />
          {heading}
        </h1>
        <p className="max-w-prose text-md text-muted">{serviceType.intro}</p>
        <p className="max-w-prose text-sm text-muted">{serviceType.body}</p>
      </header>

      {/* What the service includes — concrete, service-specific (seo §1). */}
      <section className="py-4" aria-labelledby="service-includes-title">
        <h2
          id="service-includes-title"
          className="mb-3 text-lg font-bold text-text"
        >
          {t('discovery.includesTitle')}
        </h2>
        <ul className="flex flex-col gap-2 ps-5 [list-style:disc] text-muted" role="list">
          {serviceType.includes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {/* Matching salons. */}
      <section className="py-4" aria-labelledby="service-salons-title">
        <h2 id="service-salons-title" className="mb-4 text-lg font-bold text-text">
          {t('discovery.service.salonsTitle', { service: serviceType.name })}{' '}
          <span className="text-sm font-normal text-muted">
            (<Num value={salons.length} /> {t('discovery.salonCount', { count: salons.length })})
          </span>
        </h2>
        <SalonList salons={salons} titleId="service-salons-title" />
      </section>
    </div>
  );
}

/** Shared breadcrumb nav (خانه ‹ current page) mirroring the JSON-LD. */
function DiscoveryBreadcrumb({ heading }: { heading: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('discovery.breadcrumb')} className="py-3 text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 text-muted" role="list">
        <li>
          <Link to="/" className="hover:text-text hover:underline">
            {t('discovery.crumbHome')}
          </Link>
        </li>
        <li aria-hidden="true">‹</li>
        <li className="text-text">{heading}</li>
      </ol>
    </nav>
  );
}
