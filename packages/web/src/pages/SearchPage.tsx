import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Search, SlidersHorizontal, Store } from 'lucide-react';
import { SeoHead } from '../components/seo';
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
  cn,
} from '../components/ui';
import { DISCOVERY_CATEGORIES, DISCOVERY_CITIES } from '../data/taxonomy';
import { getServiceType, getServiceTypeSlugs } from '../data/discovery';
import { getAllSalonProfiles, type SalonProfile } from '../data/salons';
import { SeoTailLinks, useFilteredSalons } from './DiscoveryPages';

/**
 * `/search` — the full search-results experience (route contract: the home
 * hero submits `/search?q=<query>`; empty `q` lists every salon).
 *
 * Booksy search-results anatomy (directive §b/§c):
 *  - control row: query input + city select + Filters (bottom Sheet) + Sort;
 *  - count-bearing H1 with Persian digits;
 *  - result list = vertical stack of horizontal rating-first business cards
 *    with inline bookable services (`SalonListCard`);
 *  - honest empty state with an owner-registration CTA;
 *  - SEO tail: popular-treatment + city flat link grids.
 *
 * URL params: `q` (free text), `city` (taxonomy city slug), plus the shared
 * filter params (`type`/`rating`/`sort`) handled by `useFilteredSalons` so
 * `/search` filters behave identically to `/city` + `/services`.
 * Noindex (search results must never be a search target — seo §8); `SeoHead`
 * defaults handle that.
 */

/** Case/whitespace-insensitive match across a salon's searchable text. */
function matchesQuery(salon: SalonProfile, query: string, cityName: string): boolean {
  if (!query) return true;
  const haystack = [
    salon.name,
    salon.displayName ?? '',
    salon.tagline,
    salon.neighborhood,
    cityName,
    salon.category ?? '',
    ...salon.services.map((s) => s.name),
  ]
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

const CITY_ALL = 'all';

export function SearchPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const prefersReduced = useReducedMotion();
  const query = (params.get('q') ?? '').trim();
  const citySlug = params.get('city') ?? CITY_ALL;
  const [draft, setDraft] = useState(query);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const cityNameBySlug = useMemo(() => new Map(DISCOVERY_CITIES.map((c) => [c.slug, c.name])), []);
  const serviceTypeLabels = useMemo(
    () =>
      Object.fromEntries(
        getServiceTypeSlugs().map((slug) => [slug, getServiceType(slug)?.name ?? slug]),
      ),
    [],
  );

  const matched = useMemo(() => {
    return getAllSalonProfiles().filter((salon) => {
      if (citySlug !== CITY_ALL && salon.citySlug !== citySlug) return false;
      return matchesQuery(salon, query, cityNameBySlug.get(salon.citySlug) ?? '');
    });
  }, [query, citySlug, cityNameBySlug]);

  const { salons: results, hasActiveFilters, filterSignature } = useFilteredSalons(matched);

  const updateParam = (key: string, value: string | null) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  };

  const selectedSort = params.get('sort') ?? '';
  const isEmpty = results.length === 0;

  return (
    <div className="bg-surface">
      <SeoHead title={t('searchPage.title')} />

      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        {/* Control row — query + city + filters + sort (directive §b). */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            role="search"
            aria-label={t('searchPage.searchLabel')}
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const next = draft.trim();
              updateParam('q', next || null);
            }}
          >
            <label htmlFor="search-q" className="sr-only">
              {t('searchPage.searchLabel')}
            </label>
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute inset-y-0 start-3 my-auto h-5 w-5 text-muted"
                aria-hidden="true"
              />
              <input
                id="search-q"
                type="search"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t('searchPage.searchPlaceholder')}
                className={cn(
                  'w-full rounded-lg border border-border bg-elevated py-2.5 pe-4 ps-11 text-sm text-text shadow-1',
                  'placeholder:text-muted',
                  'outline-none focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-2 focus-visible:outline-focus',
                )}
              />
            </div>
            <button
              type="submit"
              className={cn(
                'inline-flex min-h-[44px] items-center rounded-pill bg-primary px-5 py-2 text-sm font-semibold text-primary-contrast shadow-1',
                'transition-opacity duration-fast ease-standard hover:opacity-90 active:translate-y-px',
                'outline-none focus-visible:outline focus-visible:outline-2',
                'focus-visible:outline-offset-2 focus-visible:outline-focus',
              )}
            >
              {t('searchPage.submit')}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <Select
              label={t('searchPage.cityLabel')}
              labelHidden
              value={citySlug}
              options={[
                { value: CITY_ALL, label: t('searchPage.cityAll') },
                ...DISCOVERY_CITIES.map((city) => ({ value: city.slug, label: city.name })),
              ]}
              onValueChange={(value) => updateParam('city', value === CITY_ALL ? null : value)}
              containerClassName="w-40"
              className="min-h-[44px] rounded-lg shadow-1"
            />

            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={filtersOpen}
                className={cn(
                  'inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-elevated px-4 text-sm font-semibold text-text shadow-1',
                  'transition-colors duration-fast ease-standard hover:border-primary hover:text-primary',
                  'outline-none focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-2 focus-visible:outline-focus',
                )}
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
              label={t('searchPage.sortLabel')}
              labelHidden
              value={selectedSort || 'recommended'}
              options={[
                { value: 'recommended', label: t('searchPage.sortDefault') },
                { value: 'rating', label: t('discovery.filter.sort.rating') },
                { value: 'price', label: t('discovery.filter.sort.price') },
              ]}
              onValueChange={(value) =>
                updateParam('sort', value === 'recommended' ? null : value)
              }
              containerClassName="w-44"
              className="min-h-[44px] rounded-lg shadow-1"
            />
          </div>
        </div>

        {/* Count-bearing H1 (Persian digits via the i18n numeral formatter). */}
        <h1 className="text-display mt-6 text-2xl text-text">
          {t('searchPage.heading')} ({t('discovery.salonCount', { count: results.length })})
        </h1>
        <p className="mt-2 text-sm text-muted" aria-live="polite">
          {query
            ? t('discovery.resultsFor', { query })
            : t('searchPage.resultsCount', { count: results.length })}
        </p>

        {/* Result list — vertical stack of horizontal cards (directive §c). */}
        {!isEmpty ? (
          <div className="mt-6 flex max-w-4xl flex-col gap-4" data-testid="search-result-list">
            {results.map((salon, index) => (
              <motion.div
                key={`${filterSignature}-${salon.slug}`}
                initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.2,
                  ease: [0.2, 0, 0, 1],
                  delay: Math.min(index, 6) * 0.04,
                }}
              >
                <SalonListCard
                  salon={salon}
                  cityName={cityNameBySlug.get(salon.citySlug)}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="mt-6 max-w-4xl rounded-2xl border border-border bg-elevated">
            <EmptyState
              icon={
                hasActiveFilters ? (
                  <SlidersHorizontal className="h-8 w-8" aria-hidden="true" />
                ) : (
                  <Search className="h-8 w-8" aria-hidden="true" />
                )
              }
              title={
                hasActiveFilters ? t('discovery.filter.noResults.title') : t('searchPage.emptyTitle')
              }
              description={
                hasActiveFilters
                  ? t('discovery.filter.noResults.body')
                  : t('searchPage.emptyBody', { query })
              }
              action={
                hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setParams((previous) => {
                        const next = new URLSearchParams(previous);
                        next.delete('type');
                        next.delete('rating');
                        next.delete('sort');
                        return next;
                      });
                    }}
                    className={cn(
                      'inline-flex min-h-[44px] items-center rounded-pill bg-primary px-5 py-2 text-sm font-medium text-primary-contrast',
                      'transition-opacity duration-fast ease-standard hover:opacity-90',
                      'outline-none focus-visible:outline focus-visible:outline-2',
                      'focus-visible:outline-offset-2 focus-visible:outline-focus',
                    )}
                  >
                    {t('discovery.filter.noResults.clearFilters')}
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm font-semibold text-text">
                      {t('searchPage.ownerCtaTitle')}
                    </p>
                    <Link
                      to="/business/register"
                      className={cn(
                        'inline-flex min-h-[44px] items-center gap-2 rounded-pill bg-primary px-5 py-2 text-sm font-medium text-primary-contrast no-underline shadow-1',
                        'transition-opacity duration-fast ease-standard hover:opacity-90',
                        'outline-none focus-visible:outline focus-visible:outline-2',
                        'focus-visible:outline-offset-2 focus-visible:outline-focus',
                      )}
                    >
                      <Store className="h-4 w-4" aria-hidden="true" />
                      {t('searchPage.ownerCtaAction')}
                    </Link>
                  </div>
                )
              }
            />
            {!hasActiveFilters && (
              <div className="border-t border-border">
                <CategoryBrowser className="py-1" />
              </div>
            )}
          </div>
        )}

        {/* SEO tail — flat text-link grids (directive §j.6). */}
        <div className="max-w-4xl">
          <SeoTailLinks
            heading={t('discovery.popularTitle')}
            links={DISCOVERY_CATEGORIES.map((category) => ({
              to: `/services/${category.slug}`,
              label: category.label,
            }))}
          />
          <SeoTailLinks
            heading={t('discovery.citiesTitle')}
            links={DISCOVERY_CITIES.map((city) => ({
              to: `/city/${city.slug}`,
              label: city.name,
            }))}
          />
        </div>
      </div>
    </div>
  );
}

export default SearchPage;
