import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Scissors, SearchX } from 'lucide-react';
import i18n from '../i18n';
import { SeoHead, JsonLd, SITE_URL } from '../components/seo';
import type { JsonLdNode } from '../components/seo';
import {
  Button,
  EmptyState,
  FilterBar,
  Num,
  SalonCard,
  Skeleton,
  StaggerContainer,
  StaggerItem,
} from '../components/ui';
import type { SortOption } from '../components/ui';
import { getCity, getServiceType, getServiceTypeSlugs } from '../data/discovery';
import { getSalonsByCity, getSalonsByService, type SalonProfile } from '../data/salons';
import { useInfiniteScroll } from './useInfiniteScroll';

/**
 * Public discovery pages — `/city/:city` and `/services/:type` (task 4.2;
 * Req 5.1–5.7, 9, 10, 14).
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
 * ## Design (Booksy + NYC redesign)
 *  - FilterBar: sticky filter/sort bar below page header (Req 5.2)
 *  - StaggerContainer/StaggerItem: cascading entrance on the card grid (Req 5.3)
 *  - Skeleton loading: 6 skeleton cards matching final card dimensions (Req 5.5)
 *  - Responsive grid: 3-col desktop, 2-col tablet, 1-col mobile (Req 5.4)
 *  - Empty state with filter reset action (Req 5.6)
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

// ─── Skeleton Loading ────────────────────────────────────────────────────────

/** Skeleton cards matching final SalonCard dimensions (Req 5.5). */
function DiscoverySkeleton() {
  return (
    <div
      className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-busy="true"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border overflow-hidden bg-elevated">
          <Skeleton variant="rect" className="aspect-video w-full" />
          <div className="p-4 space-y-2">
            <Skeleton variant="text" className="w-3/4" />
            <Skeleton variant="text" className="w-1/2" />
            <Skeleton variant="text" className="w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Not Found ───────────────────────────────────────────────────────────────

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

// ─── Filtering Logic ─────────────────────────────────────────────────────────

/** Applies URL-driven filters to a list of salons. */
function useFilteredSalons(salons: SalonProfile[]) {
  const [searchParams] = useSearchParams();

  const selectedType = searchParams.get('type');
  const selectedRating = searchParams.get('rating') ? Number(searchParams.get('rating')) : null;
  const selectedSort = (searchParams.get('sort') as SortOption) || null;

  return useMemo(() => {
    let filtered = [...salons];

    // Filter by service type
    if (selectedType) {
      filtered = filtered.filter((salon) =>
        salon.services.some((s) => s.id === selectedType || s.name === selectedType),
      );
    }

    // Filter by minimum rating
    if (selectedRating) {
      filtered = filtered.filter((salon) => (salon.rating ?? 0) >= selectedRating);
    }

    // Sort
    if (selectedSort === 'rating') {
      filtered.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (selectedSort === 'price') {
      filtered.sort((a, b) => {
        const aMin = Math.min(...a.services.map((s) => s.priceRial));
        const bMin = Math.min(...b.services.map((s) => s.priceRial));
        return aMin - bMin;
      });
    }

    return filtered;
  }, [salons, selectedType, selectedRating, selectedSort]);
}

// ─── Salon Grid ──────────────────────────────────────────────────────────────

/** The filtered salon grid with stagger animations, infinite scroll, and empty state. */
function SalonGrid({
  salons,
}: {
  salons: SalonProfile[];
}) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasActiveFilters = !!(
    searchParams.get('type') ||
    searchParams.get('rating') ||
    searchParams.get('sort')
  );

  // Serialize filter params as a reset key — pagination resets when filters change
  const resetKey = `${searchParams.get('type') ?? ''}-${searchParams.get('rating') ?? ''}-${searchParams.get('sort') ?? ''}`;

  const { visibleCount, sentinelRef, hasMore, isLoadingMore } = useInfiniteScroll(
    salons.length,
    24,
    resetKey,
  );

  // Slice to visible count for pagination
  const visibleSalons = useMemo(
    () => salons.slice(0, visibleCount),
    [salons, visibleCount],
  );

  // Empty state — either no salons at all, or filters yielded no results
  if (salons.length === 0) {
    if (hasActiveFilters) {
      return (
        <EmptyState
          icon={<SearchX size={40} />}
          title={t('discovery.filter.noResults.title')}
          description={t('discovery.filter.noResults.body')}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete('type');
                  next.delete('rating');
                  next.delete('sort');
                  return next;
                });
              }}
            >
              {t('discovery.filter.noResults.clearFilters')}
            </Button>
          }
        />
      );
    }

    return (
      <EmptyState
        icon={<SearchX size={40} />}
        title={t('discovery.noSalonsTitle')}
        description={t('discovery.noSalonsBody')}
        action={
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center text-primary underline-offset-4 hover:underline"
          >
            {t('discovery.backHome')}
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <StaggerContainer
        className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      >
        {visibleSalons.map((salon) => (
          <StaggerItem key={salon.slug}>
            <SalonCard
              slug={salon.slug}
              name={salon.name}
              coverUrl={salon.coverUrl ?? salon.gallery[0]?.src ?? '/og/default.jpg'}
              rating={salon.rating ?? 0}
              reviewCount={salon.reviewCount ?? 0}
              location={`${salon.neighborhood}، ${salon.address.addressLocality}`}
              services={salon.services.map((s) => s.name)}
              openNow={!salon.openingHours.find((h) => h.day === currentDay())?.closed}
            />
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Loading skeleton at the tail (partial loading state, ui-ux §6) */}
      {isLoadingMore && (
        <div
          className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          role="status"
          aria-busy="true"
        >
          {Array.from({ length: Math.min(3, salons.length - visibleCount) }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border overflow-hidden bg-elevated">
              <Skeleton variant="rect" className="aspect-video w-full" />
              <div className="p-4 space-y-2">
                <Skeleton variant="text" className="w-3/4" />
                <Skeleton variant="text" className="w-1/2" />
                <Skeleton variant="text" className="w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sentinel for IntersectionObserver — triggers loading more */}
      {hasMore && (
        <div
          ref={sentinelRef}
          className="h-1"
          aria-hidden="true"
        />
      )}

      {/* Accessible loading announcement via aria-live */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isLoadingMore ? t('discovery.loadingMore') : ''}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Today's Iranian-week day token (used for the "open now" badge). */
function currentDay(): import('../data/salons').SchemaDay {
  const map: Record<number, import('../data/salons').SchemaDay> = {
    6: 'Saturday',
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
  };
  return map[new Date().getDay()];
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
        {/* RTL-safe separator: ‹ mirrors correctly in RTL context */}
        <li aria-hidden="true">‹</li>
        <li className="text-text">{heading}</li>
      </ol>
    </nav>
  );
}

/** Builds service type labels map for the FilterBar from i18n. */
function useServiceTypeLabels(): Record<string, string> {
  const { t } = useTranslation();
  const slugs = getServiceTypeSlugs();
  return useMemo(() => {
    const labels: Record<string, string> = {};
    for (const slug of slugs) {
      const st = getServiceType(slug);
      if (st) labels[slug] = st.name;
    }
    return labels;
  }, [slugs, t]);
}

// ─── City Page ───────────────────────────────────────────────────────────────

/** `/city/:city` — local discovery for a city (Req 5.1–5.7). */
export function CityPage() {
  const { t } = useTranslation();
  const { city: citySlug } = useParams<{ city: string }>();
  const city = getCity(citySlug);
  const allSalons = useMemo(
    () => (city ? getSalonsByCity(city.slug) : []),
    [city],
  );
  const filteredSalons = useFilteredSalons(allSalons);
  const serviceTypeLabels = useServiceTypeLabels();

  if (!city) return <DiscoveryNotFound />;

  const path = `/city/${city.slug}`;
  const heading = t('discovery.city.headingSuffix', { city: city.name });

  return (
    <div data-testid="city-page" className="pb-8">
      <SeoHead title={heading} description={city.intro} path={path} index />
      <JsonLd data={[buildBreadcrumb(heading, path)]} />

      {/* Breadcrumb */}
      <DiscoveryBreadcrumb heading={heading} />

      {/* Page Header */}
      <header className="flex flex-col items-start gap-3 py-4">
        <h1 className="max-w-prose text-xl font-bold text-display text-text">{heading}</h1>
        <p className="max-w-prose text-md text-muted">{city.intro}</p>
        <p className="max-w-prose text-sm text-muted">{city.body}</p>
      </header>

      {/* Neighborhoods — neighborhood-level intent, real content (seo §11). */}
      <section className="py-4" aria-labelledby="city-neighborhoods-title">
        <h2 id="city-neighborhoods-title" className="mb-3 text-lg font-bold text-text">
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

      {/* Filter Bar — sticky below nav (Req 5.2) */}
      <FilterBar
        serviceTypes={getServiceTypeSlugs()}
        serviceTypeLabels={serviceTypeLabels}
        className="mx-[-1rem] sm:mx-0 sm:rounded-lg"
      />

      {/* Matching salons (Req 5.1, 5.3, 5.4, 5.5) */}
      <section className="py-6" aria-labelledby="city-salons-title">
        <h2 id="city-salons-title" className="mb-4 text-lg font-bold text-text">
          {t('discovery.city.salonsTitle', { city: city.name })}{' '}
          <span className="text-sm font-normal text-muted">
            (<Num value={filteredSalons.length} />{' '}
            {t('discovery.salonCount', { count: filteredSalons.length })})
          </span>
        </h2>
        <SalonGrid
          salons={filteredSalons}
        />
      </section>
    </div>
  );
}

// ─── Service Page ────────────────────────────────────────────────────────────

/** `/services/:type` — category discovery for a service (Req 5.1–5.7). */
export function ServicePage() {
  const { t } = useTranslation();
  const { type: typeSlug } = useParams<{ type: string }>();
  const serviceType = getServiceType(typeSlug);
  const allSalons = useMemo(
    () => (serviceType ? getSalonsByService(serviceType.slug) : []),
    [serviceType],
  );
  const filteredSalons = useFilteredSalons(allSalons);
  const serviceTypeLabels = useServiceTypeLabels();

  if (!serviceType) return <DiscoveryNotFound />;

  const path = `/services/${serviceType.slug}`;
  const heading = t('discovery.service.headingSuffix', {
    service: serviceType.name,
  });

  return (
    <div data-testid="service-page" className="pb-8">
      <SeoHead title={heading} description={serviceType.intro} path={path} index />
      <JsonLd data={[buildBreadcrumb(heading, path)]} />

      {/* Breadcrumb */}
      <DiscoveryBreadcrumb heading={heading} />

      {/* Page Header */}
      <header className="flex flex-col items-start gap-3 py-4">
        <h1 className="flex max-w-prose items-center gap-2 text-xl font-bold text-display text-text">
          <Scissors aria-hidden="true" size={22} />
          {heading}
        </h1>
        <p className="max-w-prose text-md text-muted">{serviceType.intro}</p>
        <p className="max-w-prose text-sm text-muted">{serviceType.body}</p>
      </header>

      {/* What the service includes — concrete, service-specific (seo §1). */}
      <section className="py-4" aria-labelledby="service-includes-title">
        <h2 id="service-includes-title" className="mb-3 text-lg font-bold text-text">
          {t('discovery.includesTitle')}
        </h2>
        <ul className="flex flex-col gap-2 ps-5 [list-style:disc] text-muted" role="list">
          {serviceType.includes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {/* Filter Bar — sticky below nav (Req 5.2) */}
      <FilterBar
        serviceTypes={getServiceTypeSlugs()}
        serviceTypeLabels={serviceTypeLabels}
        className="mx-[-1rem] sm:mx-0 sm:rounded-lg"
      />

      {/* Matching salons (Req 5.1, 5.3, 5.4, 5.5) */}
      <section className="py-6" aria-labelledby="service-salons-title">
        <h2 id="service-salons-title" className="mb-4 text-lg font-bold text-text">
          {t('discovery.service.salonsTitle', { service: serviceType.name })}{' '}
          <span className="text-sm font-normal text-muted">
            (<Num value={filteredSalons.length} />{' '}
            {t('discovery.salonCount', { count: filteredSalons.length })})
          </span>
        </h2>
        <SalonGrid
          salons={filteredSalons}
        />
      </section>
    </div>
  );
}
