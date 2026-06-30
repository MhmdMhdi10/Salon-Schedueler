import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CalendarClock, BellRing, BarChart3, Check } from 'lucide-react';
import { SeoHead, JsonLd, SITE_NAME, SITE_URL } from '../components/seo';
import { Card, CardContent, CardTitle, Picture } from '../components/ui';
import {
  EditorialSplit,
  FeatureMosaic,
  SectionRhythm,
} from '../components/layout';
import { Motif } from '../components/brand';

/**
 * Standalone owner-acquisition marketing landing at `/business` (task 12.2;
 * R1.4, R2.1, R2.2, R2.4, R2.5, R3.1–R3.6, R8.1, R8.6).
 *
 * Same signature treatment as `MarketingHome` (`/`) — an asymmetric editorial
 * hero (`EditorialSplit`) over a token background (no indigo→purple gradient),
 * the brand `Motif` band divider, one most-prominent primary CTA into the owner
 * panel (`/owner`), an uneven value `FeatureMosaic` (lead tile + supporting
 * tiles), and sections alternating background + density via `SectionRhythm`
 * (design §5). Unlike `/`, this page targets **salon owners** and its primary
 * CTA routes directly to `/owner` with no interstitial.
 *
 * ## SEO (seo §1–§5; R3.5) — PRESERVED EXACTLY
 *  - `<SeoHead index>` opts this route **in** to indexing and emits the unique
 *    title/description, single-host canonical, OG/Twitter card, and `hreflang`
 *    self-reference.
 *  - `<JsonLd>` injects the site-wide `WebSite` + `Organization` structured
 *    data, mirroring the build-time prerender so client and prerendered HTML
 *    agree.
 *
 * ## Core Web Vitals (seo §9; R9.4, R9.6) — PRESERVED EXACTLY
 *  - The hero image is the LCP element: the AVIF candidate is preloaded in
 *    `<head>` and the `<img>` carries `fetchpriority="high"` + `loading="eager"`.
 *  - Served through `<Picture>`: AVIF/WebP sources with a PNG fallback, each at
 *    two responsive widths, with explicit `width`/`height` (no CLS).
 *
 * All copy comes from the `fa.json` i18n catalog (`business.*` / `seo.*`) — no
 * hard-coded Farsi in JSX. Tokens only; layout uses logical properties (RTL).
 */
export function BusinessLanding() {
  const { t } = useTranslation();

  // Hero LCP image: AVIF → WebP → PNG, two widths each.
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

      <SectionRhythm startWith="bg">
        {/* Hero — asymmetric editorial split: owner value proposition + the
            single most-prominent primary CTA, closed by the signature motif
            band. CTA routes to `/owner` directly (no interstitial). */}
        <div className="mx-auto w-full max-w-container px-4">
          <EditorialSplit lead="start">
            <div data-hero className="flex flex-col items-start gap-4">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent">
                <Motif variant="mark" className="h-4 w-4" />
                {t('business.hero.eyebrow')}
              </span>
              <h1 className="max-w-prose text-2xl leading-display text-display text-text">
                {t('business.hero.title')}
              </h1>
              <p className="max-w-prose text-md text-muted">
                {t('business.hero.subtitle')}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {/* Primary CTA → salon self-registration wizard. */}
                <Link
                  to="/business/register"
                  data-cta="primary"
                  className={PRIMARY_CTA}
                >
                  {t('business.hero.primaryCta')}
                </Link>
                {/* Subordinate secondary CTA → customer home. */}
                <Link to="/" data-cta="secondary" className={SECONDARY_CTA}>
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
          </EditorialSplit>

          {/* Signature motif band — a token-driven divider, decorative. */}
          <Motif
            variant="band"
            className="mx-auto mt-8 block h-6 w-full max-w-sm text-primary"
          />
        </div>

        {/* Value props — an uneven mosaic (lead tile + supporting tiles), not a
            row of equal cards (R2.2). Each tile is a crawlable, real-copy card
            with benefit-led, ROI-oriented Persian copy. */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="business-value-title">
            <h2
              id="business-value-title"
              className="mb-6 text-xl leading-display text-display text-text"
            >
              {t('business.value.title')}
            </h2>
            <FeatureMosaic>
              <LeadValueCard
                title={t('business.value.lead.title')}
                body={t('business.value.lead.body')}
              />
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
            </FeatureMosaic>
          </section>
        </div>

        {/* How it works — three ordered steps. */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="business-how-title">
            <h2
              id="business-how-title"
              className="mb-6 text-xl leading-display text-display text-text"
            >
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
        </div>

        {/* Pricing / trial block. */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="business-pricing-title">
            <Card elevated as="div">
              <CardTitle
                as="h2"
                id="business-pricing-title"
                className="mb-2 text-lg leading-display text-display"
              >
                {t('business.pricing.title')}
              </CardTitle>
              <CardContent>
                <p className="max-w-prose text-muted">{t('business.pricing.body')}</p>
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Closing CTA — repeat owner + customer routes for crawlable links.
            Trust points use real, on-page proof (R3.3). */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="business-cta-title">
            <Card elevated as="div" className="flex flex-col items-start gap-3">
              <CardTitle
                as="h2"
                id="business-cta-title"
                className="text-lg leading-display text-display"
              >
                {t('business.cta.title')}
              </CardTitle>
              <CardContent>
                <p className="max-w-prose text-muted">{t('business.cta.body')}</p>
                <ul
                  role="list"
                  className="mt-4 flex flex-col gap-2 text-sm text-text sm:flex-row sm:flex-wrap sm:gap-x-6"
                >
                  {[
                    t('business.value.online.title'),
                    t('business.value.reminders.title'),
                    t('business.value.insights.title'),
                  ].map((point) => (
                    <li key={point} className="flex items-center gap-2">
                      <Check
                        aria-hidden="true"
                        size={18}
                        className="shrink-0 text-success"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/business/register"
                  data-cta="primary"
                  className={PRIMARY_CTA}
                >
                  {t('business.cta.ownerCta')}
                </Link>
                <Link to="/" data-cta="secondary" className={SECONDARY_CTA}>
                  {t('business.cta.customerCta')}
                </Link>
              </div>
            </Card>
          </section>
        </div>
      </SectionRhythm>
    </div>
  );
}

/** Primary CTA: the single most-prominent action — a filled brand button. */
const PRIMARY_CTA =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-md font-medium text-primary-contrast no-underline shadow-1 transition-colors duration-fast ease-standard hover:brightness-110 active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Secondary CTA: visually subordinate to the primary (a quiet text link). */
const SECONDARY_CTA =
  'inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-medium text-primary underline-offset-4 transition-colors duration-fast ease-standard hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/**
 * The mosaic **lead** tile — the dominant value statement. Larger display type
 * and a faint brand `Motif` watermark mark it as the headline benefit; the
 * supporting `ValueCard`s sit around it (FeatureMosaic, R2.2).
 */
function LeadValueCard({ title, body }: { title: string; body: string }) {
  return (
    <Card
      elevated
      as="article"
      className="relative flex h-full flex-col justify-center gap-3 overflow-hidden"
    >
      <Motif
        variant="watermark"
        className="pointer-events-none absolute -bottom-4 -end-4 h-40 w-40"
      />
      <CardTitle
        as="h3"
        className="relative max-w-prose text-lg leading-display text-display text-text"
      >
        {title}
      </CardTitle>
      <CardContent className="relative">
        <p className="max-w-prose text-md text-muted">{body}</p>
      </CardContent>
    </Card>
  );
}

/** A single supporting value-proposition tile: icon + title + body. */
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
    <Card as="article" className="flex h-full flex-col gap-2">
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
