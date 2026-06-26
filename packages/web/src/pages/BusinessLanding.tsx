import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BarChart3, BellRing, CalendarClock } from 'lucide-react';
import { SeoHead, JsonLd, SITE_NAME, SITE_URL } from '../components/seo';
import { Card, CardContent, CardTitle, Picture } from '../components/ui';

/**
 * Standalone owner-acquisition marketing landing at `/business` (task 6.1;
 * R5.1, R5.2, R5.3, R5.4, R5.5).
 *
 * Unlike `MarketingHome` (`/`, customer-focused), this page targets **salon
 * owners**: the hero sells the platform's value to a business owner and its
 * primary CTA routes to the owner sign-up / panel (`/owner` — R5.2), while a
 * subordinate secondary CTA routes a customer visitor into the public booking
 * funnel (`/` — R5.3).
 *
 * ## SEO (seo §1–§5; R5.4, R5.5)
 *  - `<SeoHead index>` opts this route **in** to indexing (the default is
 *    noindex) and emits the unique title/description, single-host canonical,
 *    OG/Twitter card, and `hreflang` self-reference.
 *  - `<JsonLd>` injects the site-wide `WebSite` + `Organization` structured
 *    data, mirroring the build-time prerender (`scripts/prerender.mjs`
 *    `homeJsonLd` for `/business`) so the client and prerendered HTML agree —
 *    content + meta + JSON-LD all live in the initial HTML (R5.4).
 *  - The route is registered in the prerender / sitemap source of truth
 *    (`STATIC_INDEXABLE_PATHS` + `STATIC_ROUTE_CONTENT`) so View Source sees the
 *    page without running app JS.
 *
 * ## Core Web Vitals (seo §9; R5.6)
 *  - The hero image is the LCP element: the AVIF candidate is preloaded in
 *    `<head>` (via `<SeoHead>` children) and the `<img>` carries
 *    `fetchpriority="high"` + `loading="eager"`. It declares explicit
 *    `width`/`height` so it reserves its box (no CLS), and is served as
 *    AVIF → WebP → PNG at two responsive widths.
 *  - No admin/app bundle is loaded here: the page only imports the SEO + UI
 *    primitives, and the `/owner` panel stays behind a route boundary, code-split
 *    in `App.tsx`.
 *
 * All copy comes from the `fa.json` i18n catalog (`business.*` / `seo.*`) — no
 * hard-coded Farsi in JSX. Layout uses logical properties only (RTL-first), and
 * the document `dir="rtl"` / `lang="fa"` contract is preserved by the app root.
 */
export function BusinessLanding() {
  const { t } = useTranslation();

  // Hero LCP image: AVIF → WebP → PNG, two widths each (same assets as the
  // customer home; emitted at identical dimensions by generate-pwa-assets.mjs).
  const heroSrc = '/hero/hero-1280.png';
  const heroFallbackSrcSet = '/hero/hero-640.png 640w, /hero/hero-1280.png 1280w';
  const heroAvifSrcSet = '/hero/hero-640.avif 640w, /hero/hero-1280.avif 1280w';
  const heroWebpSrcSet = '/hero/hero-640.webp 640w, /hero/hero-1280.webp 1280w';
  const heroSizes = '(min-width: 768px) 50vw, 100vw';

  return (
    <div data-testid="business-landing">
      <SeoHead
        title={t('seo.titles.business')}
        description={t('seo.descriptions.business')}
        path="/business"
        index
      >
        {/* Preload the LCP hero (AVIF candidate) with top priority. */}
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

      {/* Hero — owner value proposition + the primary owner CTA. */}
      <section className="grid items-center gap-6 py-6 md:grid-cols-2 md:gap-8 md:py-10">
        <div className="flex flex-col items-start gap-4">
          <h1 className="max-w-prose text-2xl font-bold text-text">
            {t('business.hero.title')}
          </h1>
          <p className="max-w-prose text-md text-muted">
            {t('business.hero.subtitle')}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {/* Primary CTA → owner sign-up / panel (R5.2). */}
            <Link
              to="/owner"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-md font-medium text-primary-contrast no-underline shadow-1 transition-colors duration-fast ease-standard hover:brightness-110 active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t('business.hero.primaryCta')}
            </Link>
            {/* Secondary CTA → customer booking funnel (R5.3). */}
            <Link
              to="/"
              className="inline-flex min-h-[44px] items-center rounded-md px-4 py-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('business.hero.secondaryCta')}
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
            alt={t('business.hero.imageAlt')}
            loading="eager"
            className="h-auto w-full"
            {...{ fetchpriority: 'high' }}
          />
        </div>
      </section>

      {/* Value props — scannable, crawlable owner-benefit cards. */}
      <section className="py-6" aria-labelledby="business-value-title">
        <h2 id="business-value-title" className="mb-5 text-lg font-bold text-text">
          {t('business.value.title')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ValueCard
            icon={<CalendarClock aria-hidden="true" size={24} />}
            title={t('business.value.online.title')}
            body={t('business.value.online.body')}
          />
          <ValueCard
            icon={<BellRing aria-hidden="true" size={24} />}
            title={t('business.value.reminders.title')}
            body={t('business.value.reminders.body')}
          />
          <ValueCard
            icon={<BarChart3 aria-hidden="true" size={24} />}
            title={t('business.value.insights.title')}
            body={t('business.value.insights.body')}
          />
        </div>
      </section>

      {/* How it works — three ordered steps. */}
      <section className="py-6" aria-labelledby="business-how-title">
        <h2 id="business-how-title" className="mb-5 text-lg font-bold text-text">
          {t('business.howItWorks.title')}
        </h2>
        <ol className="grid gap-4 md:grid-cols-3" role="list">
          <StepCard
            step={1}
            title={t('business.howItWorks.step1.title')}
            body={t('business.howItWorks.step1.body')}
          />
          <StepCard
            step={2}
            title={t('business.howItWorks.step2.title')}
            body={t('business.howItWorks.step2.body')}
          />
          <StepCard
            step={3}
            title={t('business.howItWorks.step3.title')}
            body={t('business.howItWorks.step3.body')}
          />
        </ol>
      </section>

      {/* Pricing / trial block. */}
      <section className="py-6" aria-labelledby="business-pricing-title">
        <Card elevated as="div">
          <CardTitle as="h2" id="business-pricing-title" className="mb-2">
            {t('business.pricing.title')}
          </CardTitle>
          <CardContent>
            <p className="max-w-prose text-muted">{t('business.pricing.body')}</p>
          </CardContent>
        </Card>
      </section>

      {/* Closing CTA — repeat the owner + customer routes for crawlable links. */}
      <section className="py-6" aria-labelledby="business-cta-title">
        <Card as="div" className="flex flex-col items-start gap-3">
          <CardTitle as="h2" id="business-cta-title">
            {t('business.cta.title')}
          </CardTitle>
          <CardContent>
            <p className="max-w-prose text-muted">{t('business.cta.body')}</p>
          </CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/owner"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-md font-medium text-primary-contrast no-underline shadow-1 transition-colors duration-fast ease-standard hover:brightness-110 active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t('business.cta.ownerCta')}
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-[44px] items-center rounded-md px-4 py-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('business.cta.customerCta')}
            </Link>
          </div>
        </Card>
      </section>
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

/** A single «how it works» step: ordinal badge + title + body. */
function StepCard({
  step,
  title,
  body,
}: {
  step: number;
  title: string;
  body: string;
}) {
  return (
    <li className="list-none">
      <Card as="article" className="flex h-full flex-col gap-2">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-pill bg-primary text-sm font-bold text-primary-contrast"
          aria-hidden="true"
        >
          {step}
        </span>
        <CardTitle as="h3">{title}</CardTitle>
        <CardContent>
          <p className="text-muted">{body}</p>
        </CardContent>
      </Card>
    </li>
  );
}

export default BusinessLanding;
