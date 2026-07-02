import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  Check,
  ChevronDown,
  Eye,
  Hand,
  Heart,
  MapPin,
  Paintbrush,
  Scissors,
  Search,
  Sparkles,
} from 'lucide-react';
import { SeoHead, JsonLd, SITE_NAME, SITE_URL } from '../components/seo';
import { Card, CardContent, CardTitle, Picture, SalonCard } from '../components/ui';
import { EditorialSplit, SectionRhythm } from '../components/layout';
import { Motif } from '../components/brand';
import { getAllSalonProfiles } from '../data/salons';

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

  // The most-highly-rated salons, surfaced as a Booksy-style "featured" row.
  // Presentation-only; sorted by rating so the strongest storefronts lead.
  const featuredSalons = getAllSalonProfiles()
    .slice()
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 3);

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
            other, closed by the signature motif band. A token-driven
            atmospheric backdrop (soft primary + accent blur orbs) sits behind
            the content so the hero reads as an immersive surface, not a card. */}
        <div className="mx-auto w-full max-w-container px-4">
          <div className="relative">
            {/* Atmospheric backdrop — decorative, clipped to its own bounds so
                the floating preview card can still poke past the hero. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
            >
              <div className="absolute -top-20 -end-16 h-72 w-72 rounded-pill bg-primary opacity-30 blur-3xl" />
              <div className="absolute -bottom-16 -start-20 h-80 w-80 rounded-pill bg-accent opacity-25 blur-3xl" />
              <Motif
                variant="watermark"
                className="absolute -bottom-6 end-6 h-40 w-40"
              />
            </div>
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
              {/* Booksy-style search widget — two inputs (service + location)
                  and a primary "Search" CTA. The CTA is the single
                  most-prominent action on the page (R3.1) and routes into the
                  booking funnel; inputs are visual lead-magnets for the search
                  flow that is wired up later. */}
              <form
                role="search"
                aria-label={t('home.hero.search.label')}
                onSubmit={(event) => event.preventDefault()}
                className="flex w-full max-w-prose flex-col gap-3 rounded-lg border border-border bg-elevated p-3 shadow-2 sm:flex-row sm:items-stretch"
              >
                <label className="flex flex-1 items-center gap-2 rounded-md bg-surface px-3 py-2">
                  <Sparkles
                    aria-hidden="true"
                    size={18}
                    className="shrink-0 text-primary"
                  />
                  <span className="sr-only">
                    {t('home.hero.search.serviceLabel')}
                  </span>
                  <input
                    type="text"
                    name="service"
                    autoComplete="off"
                    enterKeyHint="search"
                    placeholder={t('home.hero.search.servicePlaceholder')}
                    className="w-full min-w-0 bg-transparent text-sm text-text outline-none placeholder:text-muted"
                  />
                </label>
                <label className="flex flex-1 items-center gap-2 rounded-md bg-surface px-3 py-2">
                  <MapPin
                    aria-hidden="true"
                    size={18}
                    className="shrink-0 text-primary"
                  />
                  <span className="sr-only">
                    {t('home.hero.search.locationLabel')}
                  </span>
                  <input
                    type="text"
                    name="location"
                    autoComplete="off"
                    enterKeyHint="search"
                    placeholder={t('home.hero.search.locationPlaceholder')}
                    className="w-full min-w-0 bg-transparent text-sm text-text outline-none placeholder:text-muted"
                  />
                </label>
                <Link
                  to="/s/salon-rose"
                  data-cta="primary"
                  className={`${PRIMARY_CTA} sm:px-6`}
                >
                  <Search aria-hidden="true" size={18} />
                  {t('home.hero.search.submit')}
                </Link>
              </form>

              {/* Trust highlights under the search widget — quick, scannable
                  reassurances. Decorative bullets; copy from the i18n catalog. */}
              <ul role="list" className="flex flex-wrap items-center gap-2 pt-1">
                {[
                  t('home.hero.highlights.speed'),
                  t('home.hero.highlights.noCall'),
                  t('home.hero.highlights.reminder'),
                ].map((label) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-1 text-xs text-muted"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-pill bg-accent"
                    />
                    {label}
                  </li>
                ))}
              </ul>

              {/* Subordinate "have an account?" link — keeps the auth surface
                  reachable from the hero without competing with the primary
                  search CTA. */}
              <p className="pt-1 text-xs text-muted">
                {t('home.hero.haveAccount')}{' '}
                <Link
                  to="/auth"
                  data-cta="secondary"
                  className="ms-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t('home.hero.secondaryCta')}
                </Link>
              </p>
            </div>
            <div className="relative">
              {/* The illustration is its own surface (a salon-luxe scene with
                  a built-in warm ground) so it does not need a card frame.
                  Letting it breathe lets the section's atmospheric glow read. */}
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
                className="h-auto w-full rounded-lg shadow-2"
                {...{ fetchpriority: 'high' }}
              />
            </div>
          </EditorialSplit>

          </div>
          {/* Signature motif band — a token-driven divider, decorative. */}
          <Motif
            variant="band"
            className="mx-auto mt-8 block h-6 w-full max-w-sm text-primary"
          />
        </div>

        {/* Categories — Booksy-style compact tile row right under the hero.
            Icon + label tiles arranged in a responsive grid (3 cols on phones,
            up to 6 on desktop). Each tile is a real link into the booking
            funnel, so the section doubles as a discovery surface for the most
            common services. */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="home-categories-title">
            <h2
              id="home-categories-title"
              className="text-xl leading-display text-display text-text"
            >
              {t('home.categories.title')}
            </h2>
            <p className="mt-2 max-w-prose text-muted">
              {t('home.categories.subtitle')}
            </p>
            <ul
              role="list"
              className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6"
            >
              {SERVICES.map((service) => (
                <CategoryTile
                  key={service.key}
                  icon={service.icon}
                  title={t(`home.services.items.${service.key}.title`)}
                />
              ))}
            </ul>
          </section>
        </div>

        {/* Featured salons — a Booksy-style row of the top-rated storefronts
            (photo, rating, category, location, from-price), each linking to
            its public profile. A real marketplace discovery surface. */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="home-featured-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="home-featured-title"
                  className="text-xl leading-display text-display text-text"
                >
                  {t('home.featured.title')}
                </h2>
                <p className="mt-2 max-w-prose text-muted">
                  {t('home.featured.subtitle')}
                </p>
              </div>
              <Link to="/city/tehran" className={SECONDARY_CTA}>
                {t('home.featured.viewAll')}
              </Link>
            </div>
            <ul
              role="list"
              className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {featuredSalons.map((salon) => (
                <li key={salon.slug}>
                  <SalonCard salon={salon} />
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* How it works — three quick steps from service to confirmed slot
            (follows the reference template's HowItWorks section; R3.4). */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="home-how-title">
            <h2
              id="home-how-title"
              className="text-xl leading-display text-display text-text"
            >
              {t('home.howItWorks.title')}
            </h2>
            <p className="mt-2 max-w-prose text-muted">
              {t('home.howItWorks.subtitle')}
            </p>
            <ol className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <StepCard
                step="۱"
                icon={<Sparkles aria-hidden="true" size={22} />}
                title={t('home.howItWorks.step1.title')}
                body={t('home.howItWorks.step1.body')}
              />
              <StepCard
                step="۲"
                icon={<CalendarCheck aria-hidden="true" size={22} />}
                title={t('home.howItWorks.step2.title')}
                body={t('home.howItWorks.step2.body')}
              />
              <StepCard
                step="۳"
                icon={<Check aria-hidden="true" size={22} />}
                title={t('home.howItWorks.step3.title')}
                body={t('home.howItWorks.step3.body')}
              />
            </ol>
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

        {/* FAQ — native <details> disclosure (accessible, no extra deps).
            Mirrors the reference template's FAQ accordion. */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="home-faq-title">
            <h2
              id="home-faq-title"
              className="text-xl leading-display text-display text-text"
            >
              {t('home.faq.title')}
            </h2>
            <p className="mt-2 max-w-prose text-muted">
              {t('home.faq.subtitle')}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              {FAQ_KEYS.map((key) => (
                <FaqItem
                  key={key}
                  question={t(`home.faq.items.${key}.q`)}
                  answer={t(`home.faq.items.${key}.a`)}
                />
              ))}
            </div>
          </section>
        </div>

        {/* Closing call to action (template "Cta") — one clear next step. */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="home-final-title">
            <div className="relative overflow-hidden rounded-lg border border-border bg-elevated p-6 shadow-2 sm:p-8">
              <Motif
                variant="watermark"
                className="pointer-events-none absolute -bottom-8 -end-8 h-48 w-48"
              />
              <div className="relative flex flex-col items-start gap-3">
                <h2
                  id="home-final-title"
                  className="text-xl leading-display text-display text-text"
                >
                  {t('home.finalCta.title')}
                </h2>
                <p className="max-w-prose text-md text-muted">
                  {t('home.finalCta.body')}
                </p>
                <Link
                  to="/s/salon-rose"
                  data-cta="closing"
                  className={`${PRIMARY_CTA} mt-1`}
                >
                  {t('home.finalCta.cta')}
                </Link>
              </div>
            </div>
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

export default MarketingHome;

/**
 * A single "how it works" step: a numbered brand badge + a supporting icon,
 * then the step title and body. Rendered as a list item inside the `<ol>`.
 */
function StepCard({
  step,
  icon,
  title,
  body,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-1">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-primary text-md font-bold text-primary-contrast"
        >
          {step}
        </span>
        <span aria-hidden="true" className="text-accent">
          {icon}
        </span>
      </div>
      <h3 className="text-lg font-medium text-text">{title}</h3>
      <p className="text-sm text-muted">{body}</p>
    </li>
  );
}

/** Popular-service tiles: a key into `home.services.items.*` + its emblem. */
const SERVICES = [
  { key: 'haircut', icon: <Scissors aria-hidden="true" size={22} /> },
  { key: 'color', icon: <Paintbrush aria-hidden="true" size={22} /> },
  { key: 'makeup', icon: <Sparkles aria-hidden="true" size={22} /> },
  { key: 'nails', icon: <Hand aria-hidden="true" size={22} /> },
  { key: 'skin', icon: <Heart aria-hidden="true" size={22} /> },
  { key: 'brows', icon: <Eye aria-hidden="true" size={22} /> },
] as const;

/**
 * A Booksy-style category tile: a circular icon emblem stacked above the label,
 * the whole tile clickable into the booking funnel. Compact so the grid reads
 * as a "categories row" rather than a stack of long cards.
 */
function CategoryTile({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <li>
      <Link
        to="/s/salon-rose"
        className="flex h-full flex-col items-center gap-2 rounded-lg border border-border bg-surface p-3 text-center shadow-1 transition-colors duration-fast ease-standard hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-12 w-12 items-center justify-center rounded-pill bg-elevated text-primary"
        >
          {icon}
        </span>
        <span className="text-xs font-medium text-text">{title}</span>
      </Link>
    </li>
  );
}

/** FAQ disclosure keys, in display order (map to `home.faq.items.*`). */
const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;

/**
 * A single FAQ entry as a native `<details>` disclosure — keyboard-operable and
 * announced by screen readers out of the box; the chevron rotates when open.
 */
function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-lg border border-border bg-surface px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-text marker:hidden [&::-webkit-details-marker]:hidden">
        <span>{question}</span>
        <ChevronDown
          aria-hidden="true"
          size={20}
          className="shrink-0 text-muted transition-transform duration-fast ease-standard group-open:-rotate-180"
        />
      </summary>
      <p className="mt-3 text-sm text-muted">{answer}</p>
    </details>
  );
}
