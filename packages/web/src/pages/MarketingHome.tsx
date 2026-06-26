import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CalendarCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { SeoHead, JsonLd, SITE_NAME, SITE_URL } from '../components/seo';
import { Card, CardContent, CardTitle, Picture } from '../components/ui';

/**
 * Public marketing home at `/` (task 5.1; R8.1, R8.2, R8.3, R8.8, R9.1, R9.4).
 *
 * This is the platform's primary indexable surface and replaces the old login
 * page that used to render at `/` — the login surface now lives fully at
 * `/auth` (kept `noindex`). The page is a content page, not an app flow: a
 * hero with the value proposition and a single prominent primary CTA into the
 * funnel/auth, scannable value-prop sections, a trust block, and a crawlable
 * trust/legal footer (seo §1, §2, §13).
 *
 * ## SEO (seo §3, §4, §5)
 *  - `<SeoHead index>` opts this route **in** to indexing (the default is
 *    noindex) and emits the unique title/description, single-host canonical,
 *    OG/Twitter card, and `hreflang` self-reference.
 *  - `<JsonLd>` injects the site-wide `WebSite` + `Organization` structured
 *    data, mirroring the build-time prerender (`scripts/prerender.mjs`
 *    `homeJsonLd`) so the client and prerendered HTML agree.
 *
 * ## LCP / Core Web Vitals (seo §9; R9.4, R9.5, R9.6)
 *  - The hero image is the LCP element: the **AVIF** candidate is preloaded in
 *    `<head>` (via `<SeoHead>` children) and the `<img>` carries
 *    `fetchpriority="high"` + `loading="eager"` so the browser fetches it
 *    first. The above-the-fold Vazirmatn weight is already preloaded in
 *    `index.html`.
 *  - The hero is served through a `<picture>` (`<Picture>`): modern AVIF/WebP
 *    sources with a PNG fallback (task 11.2; R9.5), each at a responsive
 *    `srcset` of two widths.
 *  - The image declares explicit `width`/`height`, so it reserves its box and
 *    never causes layout shift regardless of the chosen format (CLS; R9.6).
 *
 * All copy comes from the `fa.json` i18n catalog (`home.*` / `seo.*`) — no
 * hard-coded Farsi in JSX. Layout uses logical properties only (RTL-first).
 */
export function MarketingHome() {
  const { t } = useTranslation();

  // The hero is the LCP image: served as AVIF → WebP → PNG, each at two widths.
  // The PNG is the universal fallback (`<img src>`); the AVIF candidate is what
  // we preload (it is what supporting browsers fetch). Variants are emitted at
  // identical dimensions by scripts/generate-pwa-assets.mjs so width/height stay
  // valid for every format.
  const heroSrc = '/hero/hero-1280.png';
  const heroFallbackSrcSet = '/hero/hero-640.png 640w, /hero/hero-1280.png 1280w';
  const heroAvifSrcSet = '/hero/hero-640.avif 640w, /hero/hero-1280.avif 1280w';
  const heroWebpSrcSet = '/hero/hero-640.webp 640w, /hero/hero-1280.webp 1280w';
  const heroSizes = '(min-width: 768px) 50vw, 100vw';

  return (
    <div data-testid="marketing-home">
      <SeoHead
        title={t('seo.titles.home')}
        description={t('seo.descriptions.home')}
        path="/"
        index
      >
        {/* Preload the LCP hero image so it is fetched with top priority.
            We preload the AVIF candidate (what supporting browsers render) with
            the same `imageSrcSet`/`imageSizes` the <picture> uses, so the
            preload matches the resource actually chosen. React 18 expects the
            lowercase `fetchpriority` DOM attribute. */}
        <link
          rel="preload"
          as="image"
          type="image/avif"
          href="/hero/hero-1280.avif"
          imageSrcSet={heroAvifSrcSet}
          imageSizes={heroSizes}
          {...{ fetchpriority: 'high' }}
        />
      </SeoHead>

      {/* Site-wide WebSite + Organization structured data (seo §5). */}
      <JsonLd
        data={[
          {
            '@type': 'WebSite',
            name: SITE_NAME,
            url: SITE_URL,
            inLanguage: 'fa-IR',
          },
          {
            '@type': 'Organization',
            name: SITE_NAME,
            url: SITE_URL,
          },
        ]}
      />

      {/* Hero — value proposition + the single primary CTA. */}
      <section className="grid items-center gap-6 py-6 md:grid-cols-2 md:gap-8 md:py-10">
        <div className="flex flex-col items-start gap-4">
          <h1 className="max-w-prose text-2xl font-bold text-text">
            {t('home.hero.title')}
          </h1>
          <p className="max-w-prose text-md text-muted">
            {t('home.hero.subtitle')}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/s/salon-rose"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-md font-medium text-primary-contrast no-underline shadow-1 transition-colors duration-fast ease-standard hover:brightness-110 active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t('home.hero.primaryCta')}
            </Link>
            <Link
              to="/auth"
              className="inline-flex min-h-[44px] items-center rounded-md px-4 py-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('home.hero.secondaryCta')}
            </Link>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-1">
          <Picture
            sources={[
              { type: 'image/avif', srcSet: heroAvifSrcSet },
              { type: 'image/webp', srcSet: heroWebpSrcSet },
            ]}
            src={heroSrc}
            fallbackSrcSet={heroFallbackSrcSet}
            sizes={heroSizes}
            width={1280}
            height={720}
            alt={t('home.hero.imageAlt')}
            loading="eager"
            className="h-auto w-full"
            {...{ fetchpriority: 'high' }}
          />
        </div>
      </section>

      {/* Value props — scannable, crawlable cards. */}
      <section className="py-6" aria-labelledby="home-value-title">
        <h2 id="home-value-title" className="mb-5 text-lg font-bold text-text">
          {t('home.value.title')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ValueCard
            icon={<Sparkles aria-hidden="true" size={24} />}
            title={t('home.value.fast.title')}
            body={t('home.value.fast.body')}
          />
          <ValueCard
            icon={<CalendarCheck aria-hidden="true" size={24} />}
            title={t('home.value.trusted.title')}
            body={t('home.value.trusted.body')}
          />
          <ValueCard
            icon={<ShieldCheck aria-hidden="true" size={24} />}
            title={t('home.value.reminders.title')}
            body={t('home.value.reminders.body')}
          />
        </div>
      </section>

      {/* Trust block. */}
      <section className="py-6" aria-labelledby="home-trust-title">
        <Card elevated as="div">
          <CardTitle as="h2" id="home-trust-title" className="mb-2">
            {t('home.trust.title')}
          </CardTitle>
          <CardContent>
            <p className="max-w-prose text-muted">{t('home.trust.body')}</p>
          </CardContent>
        </Card>
      </section>

      {/* Trust / legal footer — crawlable internal links (seo §2, §7). */}
      <nav
        aria-label={t('home.footer.nav')}
        className="border-t border-border py-5"
      >
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted" role="list">
          <li>
            <Link to="/about" className="hover:text-text hover:underline">
              {t('home.footer.about')}
            </Link>
          </li>
          <li>
            <Link to="/contact" className="hover:text-text hover:underline">
              {t('home.footer.contact')}
            </Link>
          </li>
          <li>
            <Link to="/privacy" className="hover:text-text hover:underline">
              {t('home.footer.privacy')}
            </Link>
          </li>
          <li>
            <Link to="/terms" className="hover:text-text hover:underline">
              {t('home.footer.terms')}
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** A single value-proposition card: icon + title + body. */
function ValueCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card as="article" className="flex flex-col gap-2">
      <span className="text-primary" aria-hidden="true">
        {icon}
      </span>
      <CardTitle as="h3">{title}</CardTitle>
      <CardContent>
        <p className="text-muted">{body}</p>
      </CardContent>
    </Card>
  );
}

export default MarketingHome;
