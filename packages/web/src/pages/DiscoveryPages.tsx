import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MapPin, Search } from 'lucide-react';
import i18n from '../i18n';
import { JsonLd, SeoHead, SITE_URL } from '../components/seo';
import type { JsonLdNode } from '../components/seo';
import { FilterBar, Num, Skeleton } from '../components/ui';
import type { SortOption } from '../components/ui';
import { getCity, getServiceType, getServiceTypeSlugs } from '../data/discovery';
import { getSalonsByCity, getSalonsByService, type SalonProfile } from '../data/salons';

/** Loading geometry kept identical to the results list at each breakpoint. */
export function DiscoverySkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-busy="true"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className="flex gap-4 rounded-2xl border border-black/10 bg-white p-4"
        >
          <Skeleton variant="rect" className="hidden size-40 shrink-0 rounded-xl sm:block" />
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
    <div
      data-testid="discovery-not-found"
      className="mx-auto min-h-[60vh] max-w-7xl px-4 py-12"
    >
      <SeoHead title={t('discovery.notFoundTitle')} />
      <h1 className="text-2xl font-bold text-text">{t('discovery.notFoundTitle')}</h1>
      <p className="mt-2 text-muted">{t('discovery.notFoundBody')}</p>
      <Link className="mt-5 inline-flex text-primary underline" to="/">
        {t('discovery.backHome')}
      </Link>
    </div>
  );
}

function useFilteredSalons(salons: SalonProfile[]) {
  const [searchParams] = useSearchParams();
  const selectedType = searchParams.get('type');
  const selectedRating = searchParams.get('rating')
    ? Number(searchParams.get('rating'))
    : null;
  const selectedSort = (searchParams.get('sort') as SortOption) || null;

  return useMemo(() => {
    let result = [...salons];
    if (selectedType) {
      result = result.filter((salon) =>
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

function DiscoveryBreadcrumb({ heading }: { heading: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('discovery.breadcrumb')} className="sr-only">
      <ol role="list">
        <li>
          <Link to="/">{t('discovery.crumbHome')}</Link>
        </li>
        <li>{heading}</li>
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

function SearchBar({
  query,
  location,
}: {
  query: string;
  location: string;
}) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const serviceTypeLabels = useServiceTypeLabels();

  return (
    <form
      role="search"
      aria-label={t('home.hero.search.label')}
      className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center"
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="flex min-h-[44px] flex-1 items-center rounded-lg border border-border bg-elevated px-3 shadow-sm">
        <Search className="size-5 shrink-0 text-muted" aria-hidden="true" />
        <span className="sr-only">{t('home.hero.search.serviceLabel')}</span>
        <input
          defaultValue={query}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-text outline-none"
        />
      </label>
      <label className="flex min-h-[44px] flex-1 items-center rounded-lg border border-border bg-elevated px-3 shadow-sm">
        <MapPin className="size-5 shrink-0 text-muted" aria-hidden="true" />
        <span className="sr-only">{t('home.hero.search.locationLabel')}</span>
        <input
          defaultValue={location}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-text outline-none"
        />
      </label>
      <div className="flex items-center gap-3">
        <details className="group relative">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center rounded-lg border border-border bg-elevated px-4 text-sm font-semibold text-text">
            فیلترها
          </summary>
          <div className="absolute end-0 top-full z-popover mt-2 w-[min(90vw,41rem)] rounded-xl border border-border bg-elevated p-3 shadow-2">
            <FilterBar
              serviceTypes={getServiceTypeSlugs()}
              serviceTypeLabels={serviceTypeLabels}
            />
          </div>
        </details>
        <button
          type="button"
          onClick={() =>
            setSearchParams((previous) => {
              const next = new URLSearchParams(previous);
              next.set('sort', 'rating');
              return next;
            })
          }
          className="min-h-[44px] rounded-lg border border-border bg-elevated px-4 text-sm font-semibold text-text"
        >
          مرتب‌سازی: پیشنهادی
        </button>
      </div>
    </form>
  );
}

function initial(name: string) {
  return name.trim().slice(0, 1);
}

function DiscoveryBusinessCard({ salon }: { salon: SalonProfile }) {
  return (
    <Link
      to={`/s/${salon.slug}`}
      className="group flex min-h-48 gap-4 rounded-2xl border border-border bg-elevated p-4 no-underline transition-shadow hover:shadow-md"
      aria-label={`${salon.name}، امتیاز ${salon.rating ?? 0}`}
    >
      <div className="relative hidden size-40 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-accent to-text sm:flex">
        <span className="text-5xl font-bold text-bg" aria-hidden="true">
          {initial(salon.name)}
        </span>
        <span className="absolute bottom-2 start-2 rounded bg-text/80 px-2 py-0.5 text-2xs font-semibold text-bg">
          پیشنهاد آرا
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 text-sm">
          <bdi className="font-bold text-text">
            <Num value={Number((salon.rating ?? 0).toFixed(1))} />
          </bdi>
          <span className="text-warning" aria-hidden="true">
            ★
          </span>
          <span className="text-muted">
            <Num value={salon.reviewCount ?? 0} /> نظر
          </span>
        </div>
        <h2 className="mt-1 truncate text-lg font-bold text-text group-hover:text-primary">
          {salon.name}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {salon.neighborhood} · {salon.address.streetAddress}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          {salon.services.slice(0, 3).map((service) => (
            <span
              key={service.id}
              className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted"
            >
              {service.name}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

function SalonResults({ salons }: { salons: SalonProfile[] }) {
  const { t } = useTranslation();
  if (salons.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-elevated p-8 text-center">
        <p className="font-bold text-text">{t('discovery.noSalonsTitle')}</p>
        <p className="mt-2 text-sm text-muted">{t('discovery.noSalonsBody')}</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {salons.map((salon) => (
          <DiscoveryBusinessCard key={salon.slug} salon={salon} />
        ))}
      </div>
      <div aria-live="polite" className="sr-only" />
    </>
  );
}

function DiscoveryLayout({
  testId,
  heading,
  path,
  description,
  query,
  location,
  salons,
  details,
}: {
  testId: 'city-page' | 'service-page';
  heading: string;
  path: string;
  description: string;
  query: string;
  location: string;
  salons: SalonProfile[];
  details: React.ReactNode;
}) {
  return (
    <div data-testid={testId} className="bg-surface text-text">
      <SeoHead title={heading} description={description} path={path} index />
      <JsonLd data={[buildBreadcrumb(heading, path)]} />
      <DiscoveryBreadcrumb heading={heading} />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <SearchBar query={query} location={location} />
        <div className="grid gap-6 lg:grid-cols-[1fr_22.5rem]">
          <section>
            <h1 className="mb-1 text-lg font-bold leading-tight">{heading}</h1>
            <p className="mb-5 text-sm text-muted">چه عواملی روی ترتیب نتایج اثر می‌گذارند؟</p>
            <SalonResults salons={salons} />
            <details className="mt-6 rounded-xl border border-border bg-elevated p-4 text-sm text-muted">
              <summary className="cursor-pointer font-bold text-text">
                راهنمای انتخاب و رزرو
              </summary>
              <div className="mt-4 space-y-4 leading-7">{details}</div>
            </details>
          </section>
          <aside className="hidden lg:block">
            <div className="sticky top-32 flex h-[70vh] items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-accent/10 to-surface text-sm font-semibold text-muted">
              نمایش نقشه
            </div>
          </aside>
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
  const salons = useFilteredSalons(allSalons);
  if (!city) return <DiscoveryNotFound />;

  const path = `/city/${city.slug}`;
  const heading = t('discovery.city.headingSuffix', { city: city.name });
  return (
    <DiscoveryLayout
      testId="city-page"
      heading={`${heading} — نزدیک‌ترین‌ها (${salons.length})`}
      path={path}
      description={city.intro}
      query="سالن زیبایی"
      location={city.name}
      salons={salons}
      details={
        <>
          <p>{city.intro}</p>
          <p>{city.body}</p>
          <ul className="flex flex-wrap gap-2" role="list">
            {city.neighborhoods.map((neighborhood) => (
              <li key={neighborhood} className="rounded-full bg-surface px-3 py-1">
                {neighborhood}
              </li>
            ))}
          </ul>
        </>
      }
    />
  );
}

export function ServicePage() {
  const { t } = useTranslation();
  const { type: typeSlug } = useParams<{ type: string }>();
  const serviceType = getServiceType(typeSlug);
  const allSalons = useMemo(
    () => (serviceType ? getSalonsByService(serviceType.slug) : []),
    [serviceType],
  );
  const salons = useFilteredSalons(allSalons);
  if (!serviceType) return <DiscoveryNotFound />;

  const path = `/services/${serviceType.slug}`;
  const heading = t('discovery.service.headingSuffix', { service: serviceType.name });
  return (
    <DiscoveryLayout
      testId="service-page"
      heading={`${heading} — نزدیک‌ترین‌ها (${salons.length})`}
      path={path}
      description={serviceType.intro}
      query={serviceType.name}
      location="تهران"
      salons={salons}
      details={
        <>
          <p>{serviceType.intro}</p>
          <p>{serviceType.body}</p>
          <ul className="list-inside list-disc">
            {serviceType.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      }
    />
  );
}
