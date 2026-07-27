import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, Search, SlidersHorizontal, Store } from 'lucide-react';
import i18n from '../i18n';
import { JsonLd, SeoHead, SITE_URL } from '../components/seo';
import type { JsonLdNode } from '../components/seo';
import {
  CategoryBrowser,
  EmptyState,
  FilterBar,
  SalonListCard,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Skeleton,
} from '../components/ui';
import type { SortOption } from '../components/ui';
import { getCity, getServiceType, getServiceTypeSlugs } from '../data/discovery';
import { DISCOVERY_CATEGORIES, DISCOVERY_CITIES } from '../data/taxonomy';
import { getSalonsByCity, getSalonsByService, type SalonProfile } from '../data/salons';

/**
 * Public discovery surfaces — `/city/:city` and `/services/:type` — rebuilt to
 * the Booksy directive's search-results anatomy (§b control row, §c horizontal
 * business cards, §j.3 adoption map):
 *
 *  - control row: search + city select (white, rounded-lg, shadow-sm) + neutral
 *    outlined Filters (bottom Sheet — the anchored popover clipped off-viewport
 *    on mobile) and a real Sort select bound to the `sort` URL param;
 *  - result list: vertical stack (`gap-4`) of horizontal `SalonListCard`s with
 *    photography, rating-first ordering, and inline bookable services;
 *  - count-bearing H1 with Persian digits; localized count announced via the
 *    aria-live region on every filter change;
 *  - filtered-to-empty shows `discovery.filter.noResults` + a clear-filters
 *    recovery action; a genuinely empty city/category renders the honest empty
 *    state with an owner-registration CTA (contract §canonical-taxonomy);
 *  - SEO tail: popular-treatment / city link grids as flat text links plus the
 *    hand-written guide prose (seo §1 — genuine differentiated content).
 */

/** Loading geometry kept identical to the results list: a vertical stack of
 *  horizontal card placeholders (directive §j.3 — list, not grid). */
export function DiscoverySkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-busy="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex gap-4 rounded-2xl border border-border bg-elevated p-4">
          <Skeleton variant="rect" className="size-24 shrink-0 rounded-xl sm:size-40" />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton variant="text" className="w-1/3" />
            <Skeleton variant="text" className="w-3/4" />
            <Skeleton variant="text" className="w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DiscoveryNotFound() {
  const { t } = useTranslation();
  return (
    <div data-testid="discovery-not-found" className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12">
      <SeoHead title={t('discovery.notFoundTitle')} />
      <h1 className="text-2xl font-bold text-text">{t('discovery.notFoundTitle')}</h1>
      <p className="mt-2 text-muted">{t('discovery.notFoundBody')}</p>
      <Link className="mt-5 inline-flex text-primary underline" to="/">
        {t('discovery.backHome')}
      </Link>
    </div>
  );
}

/** URL-driven filter/sort state applied to a base salon list. Shared with the
 *  `/search` page so filters behave identically across discovery surfaces. */
export function useFilteredSalons(salons: SalonProfile[]) {
  const [searchParams] = useSearchParams();
  const selectedType = searchParams.get('type');
  const selectedRating = searchParams.get('rating') ? Number(searchParams.get('rating')) : null;
  const selectedSort = (searchParams.get('sort') as SortOption) || null;
  const hasActiveFilters = Boolean(selectedType || selectedRating || selectedSort);

  const filtered = useMemo(() => {
    let result = [...salons];
    if (selectedType) {
      // Canonical category slugs (hair, nails, …) expand to granular service
      // ids via the same seam the /services pages use, so the chips and the
      // routes can never disagree.
      const matching = new Set(getSalonsByService(selectedType).map((s) => s.slug));
      result = result.filter(
        (salon) =>
          matching.has(salon.slug) ||
          salon.services.some(
            (service) => service.id === selectedType || service.name === selectedType,
          ),
      );
    }
    if (selectedRating) {
      result = result.filter((salon) => (salon.rating ?? 0) >= selectedRating);
    }
    if (selectedSort === 'rating') {
      result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (selectedSort === 'price') {
      result.sort(
        (a, b) =>
          Math.min(...a.services.map((service) => service.priceRial)) -
          Math.min(...b.services.map((service) => service.priceRial)),
      );
    }
    return result;
  }, [salons, selectedRating, selectedSort, selectedType]);

  return { salons: filtered, hasActiveFilters, filterSignature: `${selectedType ?? ''}|${selectedRating ?? ''}|${selectedSort ?? ''}` };
}

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

/** Visible, RTL-correct breadcrumb mirroring the BreadcrumbList JSON-LD. */
function DiscoveryBreadcrumb({ heading }: { heading: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('discovery.breadcrumb')} className="mb-4 text-sm text-muted">
      <ol role="list" className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link
            to="/"
            className="text-muted no-underline transition-colors duration-fast ease-standard hover:text-primary"
          >
            {t('discovery.crumbHome')}
          </Link>
        </li>
        <li aria-hidden="true">
          <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-0 ltr:rotate-180" />
        </li>
        <li aria-current="page" className="font-medium text-text">
          {heading}
        </li>
      </ol>
    </nav>
  );
}

function useServiceTypeLabels(): Record<string, string> {
  return useMemo(
    () =>
      Object.fromEntries(
        getServiceTypeSlugs().map((slug) => [slug, getServiceType(slug)?.name ?? slug]),
      ),
    [],
  );
}

/**
 * Control row (§b results entry): search input submitting into `/search`, a
 * city select, a Filters button opening a bottom Sheet (FilterBar inside), and
 * a Sort select bound to the `sort` URL param.
 */
function ControlRow({
  query,
  citySlug,
  serviceQuery,
}: {
  /** Prefilled search text (e.g. the service name on a service page). */
  query: string;
  /** Current city slug (city pages) — the select navigates between cities. */
  citySlug?: string;
  /** Extra `q` carried when switching city from a service page. */
  serviceQuery?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const serviceTypeLabels = useServiceTypeLabels();
  const selectedSort = searchParams.get('sort') ?? '';

  const cityOptions = DISCOVERY_CITIES.map((city) => ({ value: city.slug, label: city.name }));

  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
      <form
        role="search"
        aria-label={t('home.hero.search.label')}
        className="flex min-w-0 flex-1 items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const q = String(data.get('q') ?? '').trim();
          navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
        }}
      >
        <label className="flex min-h-[44px] min-w-0 flex-1 items-center rounded-lg border border-border bg-elevated px-3 shadow-1">
          <Search className="size-5 shrink-0 text-muted" aria-hidden="true" />
          <span className="sr-only">{t('home.hero.search.serviceLabel')}</span>
          <input
            name="q"
            type="search"
            defaultValue={query}
            placeholder={t('home.hero.search.servicePlaceholder')}
            className="w-full bg-transparent px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted"
          />
        </label>
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center rounded-pill bg-primary px-5 text-sm font-semibold text-primary-contrast transition-opacity duration-fast ease-standard hover:opacity-90 active:translate-y-px outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {t('home.hero.search.submit')}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        {citySlug && (
          <Select
            label={t('home.hero.search.locationLabel')}
            labelHidden
            value={citySlug}
            options={cityOptions}
            onValueChange={(slug) => {
              if (slug === citySlug) return;
              navigate(
                serviceQuery
                  ? `/search?q=${encodeURIComponent(serviceQuery)}&city=${slug}`
                  : `/city/${slug}`,
              );
            }}
            containerClassName="w-40"
            className="min-h-[44px] rounded-lg shadow-1"
          />
        )}

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-elevated px-4 text-sm font-semibold text-text shadow-1 transition-colors duration-fast ease-standard hover:border-primary hover:text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {t('discovery.filter.title')}
          </button>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetTitle>{t('discovery.filter.label')}</SheetTitle>
            <SheetDescription className="sr-only">
              {t('discovery.filter.title')}
            </SheetDescription>
            <FilterBar
              variant="panel"
              className="mt-4"
              serviceTypes={getServiceTypeSlugs()}
              serviceTypeLabels={serviceTypeLabels}
            />
          </SheetContent>
        </Sheet>

        <Select
          label={t('discovery.sortLabel')}
          labelHidden
          value={selectedSort || 'recommended'}
          options={[
            { value: 'recommended', label: t('searchPage.sortDefault') },
            { value: 'rating', label: t('discovery.filter.sort.rating') },
            { value: 'price', label: t('discovery.filter.sort.price') },
          ]}
          onValueChange={(value) => {
            setSearchParams((previous) => {
              const next = new URLSearchParams(previous);
              if (value === 'recommended') next.delete('sort');
              else next.set('sort', value);
              return next;
            });
          }}
          containerClassName="w-44"
          className="min-h-[44px] rounded-lg shadow-1"
        />
      </div>
    </div>
  );
}

/** Clears the filter/sort params, keeping everything else in the URL. */
function ClearFiltersButton() {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  return (
    <button
      type="button"
      onClick={() =>
        setSearchParams((previous) => {
          const next = new URLSearchParams(previous);
          next.delete('type');
          next.delete('rating');
          next.delete('sort');
          return next;
        })
      }
      className="inline-flex min-h-[44px] items-center rounded-pill bg-primary px-5 py-2 text-sm font-medium text-primary-contrast transition-opacity duration-fast ease-standard hover:opacity-90 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {t('discovery.filter.noResults.clearFilters')}
    </button>
  );
}

function SalonResults({
  salons,
  cityName,
  hasActiveFilters,
  filterSignature,
}: {
  salons: SalonProfile[];
  cityName?: string;
  hasActiveFilters: boolean;
  filterSignature: string;
}) {
  const { t } = useTranslation();
  const prefersReduced = useReducedMotion();
  // Announce the localized result count on every filter change (steering §10).
  const [announcement, setAnnouncement] = useState('');
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setAnnouncement(t('discovery.salonCount', { count: salons.length }));
  }, [filterSignature, salons.length, t]);

  const liveRegion = (
    <div aria-live="polite" className="sr-only">
      {announcement}
    </div>
  );

  if (salons.length === 0) {
    // Filtered-to-empty is the *user's* filters, not a missing market — say so
    // and offer recovery (ui-ux §6: empty explains why + next step).
    if (hasActiveFilters) {
      return (
        <>
          <div className="rounded-2xl border border-border bg-elevated">
            <EmptyState
              icon={<SlidersHorizontal className="h-8 w-8" aria-hidden="true" />}
              title={t('discovery.filter.noResults.title')}
              description={t('discovery.filter.noResults.body')}
              action={<ClearFiltersButton />}
            />
          </div>
          {liveRegion}
        </>
      );
    }
    return (
      <>
        <div className="rounded-2xl border border-border bg-elevated">
          <EmptyState
            icon={<Store className="h-8 w-8" aria-hidden="true" />}
            title={t('discovery.noSalonsTitle')}
            description={t('discovery.noSalonsBody')}
            action={
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-semibold text-text">{t('searchPage.ownerCtaTitle')}</p>
                <Link
                  to="/business/register"
                  className="inline-flex min-h-[44px] items-center rounded-pill bg-primary px-5 py-2 text-sm font-medium text-primary-contrast no-underline transition-opacity duration-fast ease-standard hover:opacity-90"
                >
                  {t('searchPage.ownerCtaAction')}
                </Link>
              </div>
            }
          />
          <div className="border-t border-border">
            <CategoryBrowser className="py-1" />
          </div>
        </div>
        {liveRegion}
      </>
    );
  }

  return (
    <>
      {/* Vertical stack of horizontal business cards — list, not grid
       * (directive §j.3); gap-4 is the list rhythm value (§d). Cards get a
       * single gentle load-in stagger (opacity + 8px rise, keyed by the filter
       * signature so re-filtering re-runs it); reduced motion drops the rise. */}
      <div data-testid="discovery-result-list" className="flex flex-col gap-4">
        {salons.map((salon, index) => (
          <motion.div
            key={`${filterSignature}-${salon.slug}`}
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1], delay: Math.min(index, 6) * 0.04 }}
          >
            <SalonListCard salon={salon} cityName={cityName} />
          </motion.div>
        ))}
      </div>
      {liveRegion}
    </>
  );
}

/** Flat text-link grid used for the SEO tail (directive §j.6 — no cards). */
export function SeoTailLinks({
  heading,
  links,
}: {
  heading: string;
  links: { to: string; label: string }[];
}) {
  return (
    <nav aria-label={heading} className="mt-10">
      <h2 className="text-lg font-bold text-text">{heading}</h2>
      <ul role="list" className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className="inline-flex min-h-[32px] items-center gap-1 text-sm text-muted no-underline transition-colors duration-fast ease-standard hover:text-primary"
            >
              <ChevronLeft className="h-3.5 w-3.5 shrink-0 rtl:rotate-0 ltr:rotate-180" aria-hidden="true" />
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function DiscoveryLayout({
  testId,
  heading,
  countedHeading,
  path,
  description,
  intro,
  query,
  citySlug,
  serviceQuery,
  cityName,
  salons,
  hasActiveFilters,
  filterSignature,
  details,
  seoTail,
}: {
  testId: 'city-page' | 'service-page';
  heading: string;
  countedHeading: string;
  path: string;
  description: string;
  intro: string;
  query: string;
  citySlug?: string;
  serviceQuery?: string;
  cityName?: string;
  salons: SalonProfile[];
  hasActiveFilters: boolean;
  filterSignature: string;
  details: React.ReactNode;
  seoTail: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div data-testid={testId} className="bg-surface text-text">
      <SeoHead title={heading} description={description} path={path} index />
      <JsonLd data={[buildBreadcrumb(heading, path)]} />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <DiscoveryBreadcrumb heading={heading} />
        <ControlRow query={query} citySlug={citySlug} serviceQuery={serviceQuery} />

        <div className="mx-auto max-w-4xl lg:mx-0">
          <section>
            <h1 className="text-display mb-1 text-2xl leading-tight">{countedHeading}</h1>
            <p className="mb-5 text-sm text-muted">{intro}</p>
            <SalonResults
              salons={salons}
              cityName={cityName}
              hasActiveFilters={hasActiveFilters}
              filterSignature={filterSignature}
            />
            <details className="mt-6 rounded-xl border border-border bg-elevated p-4 text-sm text-muted">
              <summary className="cursor-pointer font-bold text-text">
                {t('discovery.guideTitle')}
              </summary>
              <div className="mt-4 space-y-4 leading-7">{details}</div>
            </details>
          </section>

          {seoTail}
        </div>
      </div>
    </div>
  );
}

export function CityPage() {
  const { t } = useTranslation();
  const { city: citySlug } = useParams<{ city: string }>();
  const city = getCity(citySlug);
  const allSalons = useMemo(() => (city ? getSalonsByCity(city.slug) : []), [city]);
  const { salons, hasActiveFilters, filterSignature } = useFilteredSalons(allSalons);
  if (!city) return <DiscoveryNotFound />;

  const path = `/city/${city.slug}`;
  const heading = t('discovery.city.headingSuffix', { city: city.name });
  return (
    <DiscoveryLayout
      testId="city-page"
      heading={heading}
      countedHeading={`${heading} (${t('discovery.salonCount', { count: salons.length })})`}
      path={path}
      description={city.intro}
      intro={city.intro}
      query=""
      citySlug={city.slug}
      cityName={city.name}
      salons={salons}
      hasActiveFilters={hasActiveFilters}
      filterSignature={filterSignature}
      details={
        <>
          <p>{city.body}</p>
          <h3 className="font-semibold text-text">{t('discovery.neighborhoodsTitle')}</h3>
          <ul className="flex flex-wrap gap-2" role="list">
            {city.neighborhoods.map((neighborhood) => (
              <li key={neighborhood} className="rounded-full bg-surface px-3 py-1">
                {neighborhood}
              </li>
            ))}
          </ul>
        </>
      }
      seoTail={
        <>
          <SeoTailLinks
            heading={t('discovery.popularTitle')}
            links={DISCOVERY_CATEGORIES.map((category) => ({
              to: `/services/${category.slug}`,
              label: category.label,
            }))}
          />
          <SeoTailLinks
            heading={t('discovery.citiesTitle')}
            links={DISCOVERY_CITIES.filter((c) => c.slug !== city.slug).map((c) => ({
              to: `/city/${c.slug}`,
              label: c.name,
            }))}
          />
        </>
      }
    />
  );
}

export function ServicePage() {
  const { t } = useTranslation();
  const { type: typeSlug } = useParams<{ type: string }>();
  const [searchParams] = useSearchParams();
  const serviceType = getServiceType(typeSlug);
  const allSalons = useMemo(
    () => (serviceType ? getSalonsByService(serviceType.slug) : []),
    [serviceType],
  );
  const { salons, hasActiveFilters, filterSignature } = useFilteredSalons(allSalons);

  // Legacy safety net: old links submit the hero search to `/services/all`.
  // That was never a real category — forward to the real search surface.
  if (typeSlug === 'all') {
    const q = searchParams.get('q');
    return <Navigate to={q ? `/search?q=${encodeURIComponent(q)}` : '/search'} replace />;
  }
  if (!serviceType) return <DiscoveryNotFound />;

  const path = `/services/${serviceType.slug}`;
  const heading = t('discovery.service.headingSuffix', { service: serviceType.name });
  return (
    <DiscoveryLayout
      testId="service-page"
      heading={heading}
      countedHeading={`${heading} (${t('discovery.salonCount', { count: salons.length })})`}
      path={path}
      description={serviceType.intro}
      intro={serviceType.intro}
      query={serviceType.name}
      citySlug="tehran"
      serviceQuery={serviceType.name}
      cityName={undefined}
      salons={salons}
      hasActiveFilters={hasActiveFilters}
      filterSignature={filterSignature}
      details={
        <>
          <p>{serviceType.body}</p>
          <h3 className="font-semibold text-text">{t('discovery.includesTitle')}</h3>
          <ul className="list-inside list-disc">
            {serviceType.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      }
      seoTail={
        <SeoTailLinks
          heading={t('discovery.popularTitle')}
          links={DISCOVERY_CATEGORIES.filter((c) => c.slug !== serviceType.slug).map(
            (category) => ({
              to: `/services/${category.slug}`,
              label: category.label,
            }),
          )}
        />
      }
    />
  );
}
