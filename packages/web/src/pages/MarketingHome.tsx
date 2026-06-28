import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CalendarCheck, Check, ShieldCheck, Sparkles } from 'lucide-react';
import { SeoHead, JsonLd, SITE_NAME, SITE_URL } from '../components/seo';
import { Card, CardContent, CardTitle, Picture } from '../components/ui';
import {
  EditorialSplit,
  FeatureMosaic,
  SectionRhythm,
} from '../components/layout';
import { Motif } from '../components/brand';

/**
 * Public marketing home at `/` (task 5.1 / 12.1; R1.4, R2.1, R2.2, R2.4, R2.5,
 * R3.1–R3.6, R8.1, R8.6, R9.1, R9.4).
 *
 * This is the platform's primary indexable surface and replaces the old login
 * page that used to render at `/` — the login surface now lives fully at
 * `/auth` (kept `noindex`). The page is a **signature** content surface, not a
 * generic stack of equal cards: an asymmetric editorial hero (`EditorialSplit`)
 * over a token background (no indigo→purple gradient cliché) with the brand
 * `Motif` band divider; one most-prominent primary CTA into the funnel; an
 * uneven value `FeatureMosaic` (a lead tile + supporting tiles); a trust block
 * that surfaces only real, on-page proof; and a crawlable trust/legal footer.
 * Sections alternate background + density via `SectionRhythm` (design §5).
 *
 * ## SEO (seo §3, §4, §5) — PRESERVED EXACTLY
 *  - `<SeoHead index>` opts this route **in** to indexing (the default is
 *    noindex) and emits the unique title/description, single-host canonical,
 *    OG/Twitter card, and `hreflang` self-reference.
 *  - `<JsonLd>` injects the site-wide `WebSite` + `Organization` structured
 *    data, mirroring the build-time prerender (`scripts/prerender.mjs`
 *    `homeJsonLd`) so the client and prerendered HTML agree.
 *
 * ## LCP / Core Web Vitals (seo §9; R9.4, R9.5, R9.6) — PRESERVED EXACTLY
 *  - The hero image is the LCP element: the **AVIF** candidate is preloaded in
 *    `<head>` and the `<img>` carries `fetchpriority="high"` + `loading="eager"`.
 *  - The hero is served through a `<picture>` (`<Picture>`): AVIF/WebP sources
 *    with a PNG fallback, each at a responsive `srcset` of two widths, with
 *    explicit `width`/`height` so it never causes layout shift (CLS; R9.6).
 *
 * All copy comes from the `fa.json` i18n catalog (`home.*` / `seo.*`) — no
 * hard-coded Farsi in JSX. Tokens only; layout uses logical properties (RTL).
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

      <SectionRhythm startWith="bg">
        {/* Hero — asymmetric editorial split: value proposition + the single
            most-prominent primary CTA on one side, the domain LCP image on the
            other, closed by the signature motif band. */}
        <div className="mx-auto w-full max-w-container px-4">
          <EditorialSplit lead="start">
            <div data-hero className="flex flex-col items-start gap-4">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent">
                <Motif variant="mark" className="h-4 w-4" />
                {t('home.hero.eyebrow')}
              </span>
              <h1 className="max-w-prose text-2xl leading-display text-display text-text">
                {t('home.hero.title')}
              </h1>
              <p className="max-w-prose text-md text-muted">
                {t('home.hero.subtitle')}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {/* The single most-prominent primary CTA → booking entry. */}
                <Link to="/s/salon-rose" data-cta="primary" className={PRIMARY_CTA}>
                  {t('home.hero.primaryCta')}
                </Link>
                {/* Subordinate secondary CTA → account/login. */}
                <Link to="/auth" data-cta="secondary" className={SECONDARY_CTA}>
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
          </EditorialSplit>

          {/* Signature motif band — a token-driven divider, decorative. */}
          <Motif
            variant="band"
            className="mx-auto mt-8 block h-6 w-full max-w-sm text-primary"
          />
        </div>

        {/* Value props — an uneven mosaic (lead tile + supporting tiles), not a
            row of equal cards (R2.2). Each tile is a crawlable, real-copy card. */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="home-value-title">
            <h2
              id="home-value-title"
              className="mb-6 text-xl leading-display text-display text-text"
            >
              {t('home.value.title')}
            </h2>
            <FeatureMosaic>
              <LeadValueCard
                title={t('home.value.lead.title')}
                body={t('home.value.lead.body')}
              />
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
            </FeatureMosaic>
          </section>
        </div>

        {/* Trust block — only real, on-page proof (no fabricated metrics). */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="home-trust-title">
            <Card elevated as="div">
              <CardTitle
                as="h2"
                id="home-trust-title"
                className="mb-2 text-lg leading-display text-display"
              >
                {t('home.trust.title')}
              </CardTitle>
              <CardContent>
                <p className="max-w-prose text-muted">{t('home.trust.body')}</p>
                <ul
                  role="list"
                  className="mt-4 flex flex-col gap-2 text-sm text-text sm:flex-row sm:flex-wrap sm:gap-x-6"
                >
                  {[
                    t('home.trust.points.secure'),
                    t('home.trust.points.confidential'),
                    t('home.trust.points.instant'),
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
            </Card>
          </section>
        </div>
      </SectionRhythm>

      {/* Trust / legal footer — crawlable internal links (seo §2, §7). */}
      <nav
        aria-label={t('home.footer.nav')}
        className="mx-auto w-full max-w-container border-t border-border px-4 py-5"
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

export default MarketingHome;
