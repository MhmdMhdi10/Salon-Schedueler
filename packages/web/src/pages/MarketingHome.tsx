import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  Check,
  ChevronDown,
  Eye,
  Hand,
  Heart,
  Paintbrush,
  Scissors,
  Search,
  Sparkles,
} from 'lucide-react';
import { SeoHead, JsonLd, SITE_NAME, SITE_URL } from '../components/seo';
import {
  Card,
  CardContent,
  CardTitle,
  ParallaxHero,
  SalonCard,
  ScrollReveal,
  StaggerContainer,
  StaggerItem,
} from '../components/ui';
import { FeatureMosaic, SectionRhythm } from '../components/layout';
import { Motif } from '../components/brand';
import { MetricsSection } from '../components/sections/MetricsSection';
import { OwnerBenefitsSection } from '../components/sections/OwnerBenefitsSection';
import { getAllSalonProfiles } from '../data/salons';

/**
 * Public marketing home at `/` — Booksy + NYC Redesign.
 *
 * The hero uses a full-viewport `ParallaxHero` with AVIF background image,
 * heroic Persian headline at 3xl–5xl scale, a single prominent magenta CTA,
 * and trust badge pills (Req 4.1, 4.2). The remaining sections use
 * `SectionRhythm` for alternating background + density.
 *
 * ## SEO (seo §3, §4, §5) — PRESERVED
 *  - `<SeoHead index>` emits unique title/description, canonical, OG/Twitter.
 *  - `<JsonLd>` injects `WebSite` + `Organization` structured data.
 *
 * ## LCP / Core Web Vitals
 *  - The hero image is the LCP element: AVIF preloaded in `<head>`,
 *    `ParallaxHero` renders it with `loading="eager"` + `fetchpriority="high"`.
 *
 * All copy comes from the `fa.json` i18n catalog — no hard-coded Farsi in JSX.
 * Tokens only; layout uses logical properties (RTL).
 */
export function MarketingHome() {
  const { t } = useTranslation();

  // The most-highly-rated salons, surfaced as a Booksy-style "featured" row.
  // Presentation-only; sorted by rating so the strongest storefronts lead.
  const featuredSalons = getAllSalonProfiles()
    .slice()
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 3);

  // The hero LCP image: full-viewport AVIF background used by ParallaxHero.
  // ParallaxHero handles loading="eager" + fetchpriority="high" internally.
  const heroImageSrc = '/images/hero-salon-interior-1920w.avif';

  return (
    <div data-testid="marketing-home">
      <SeoHead
        title={t('seo.titles.home')}
        description={t('seo.descriptions.home')}
        path="/"
        index
      >
        {/* Preload the LCP hero image (AVIF full-viewport background) so it is
            fetched with top priority. ParallaxHero renders it as `loading="eager"`
            + `fetchpriority="high"` internally. */}
        <link
          rel="preload"
          as="image"
          type="image/avif"
          href={heroImageSrc}
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

      {/* ─── Full-viewport Parallax Hero (Req 4.1, 4.2) ─── */}
      <ParallaxHero
        imageSrc={heroImageSrc}
        imageAlt={t('marketing.hero.imageAlt')}
        className="min-h-screen"
      >
        <div className="mx-auto w-full max-w-container px-4">
          <div className="flex flex-col items-start gap-5">
            <h1 className="max-w-prose text-3xl font-[800] leading-[var(--line-height-hero)] tracking-[var(--tracking-tight)] text-white md:text-4xl lg:text-5xl">
              {t('marketing.hero.title')}
            </h1>
            <p className="max-w-prose text-md text-white/70">
              {t('marketing.hero.subtitle')}
            </p>
            {/* Primary magenta CTA — full-width on mobile, auto on desktop */}
            <Link
              to="/s/salon-rose"
              data-cta="primary"
              className={`${PRIMARY_CTA} w-full sm:w-auto`}
            >
              <Search aria-hidden="true" size={18} />
              {t('marketing.hero.cta')}
            </Link>
            {/* Trust badges — small pills showing platform stats */}
            <ul role="list" className="flex flex-wrap items-center gap-2 pt-2">
              {[
                t('marketing.hero.badges.salons'),
                t('marketing.hero.badges.bookings'),
                t('marketing.hero.badges.satisfaction'),
              ].map((label) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2 rounded-pill border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur-sm"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-pill bg-primary"
                  />
                  {label}
                </li>
              ))}
            </ul>
            {/* Subordinate sign-in link — keeps auth reachable without
                competing with the primary search CTA. */}
            <p className="pt-1 text-xs text-white/60">
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
        </div>
      </ParallaxHero>

      <SectionRhythm startWith="bg">
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
            <StaggerContainer className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredSalons.map((salon) => (
                <StaggerItem key={salon.slug}>
                  <SalonCard salon={salon} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          </section>
        </div>

        {/* How it works — three steps using FeatureMosaic for an asymmetric
            editorial layout (Req 4.3, anti-generic constraint: no sole 3-equal-card row). 
            The first step is the "lead" tile (spans 2 cols + 2 rows on md+) and the
            remaining steps are compact supporting tiles, creating a deliberately uneven
            visual rhythm. ScrollReveal provides entrance animation. */}
        <div className="mx-auto w-full max-w-container px-4">
          <section aria-labelledby="home-how-title">
            <ScrollReveal>
              <h2
                id="home-how-title"
                className="text-xl leading-display text-display text-text"
              >
                {t('home.howItWorks.title')}
              </h2>
              <p className="mt-2 max-w-prose text-muted">
                {t('home.howItWorks.subtitle')}
              </p>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <FeatureMosaic className="mt-6">
                {/* Lead tile — step 1 (prominent, spans 2 cols + 2 rows on md+) */}
                <HowItWorksLeadTile
                  step="۱"
                  icon={<Sparkles aria-hidden="true" size={28} />}
                  title={t('home.howItWorks.step1.title')}
                  body={t('home.howItWorks.step1.body')}
                />
                {/* Supporting tile — step 2 */}
                <HowItWorksTile
                  step="۲"
                  icon={<CalendarCheck aria-hidden="true" size={22} />}
                  title={t('home.howItWorks.step2.title')}
                  body={t('home.howItWorks.step2.body')}
                />
                {/* Supporting tile — step 3 */}
                <HowItWorksTile
                  step="۳"
                  icon={<Check aria-hidden="true" size={22} />}
                  title={t('home.howItWorks.step3.title')}
                  body={t('home.howItWorks.step3.body')}
                />
              </FeatureMosaic>
            </ScrollReveal>
          </section>
        </div>

        {/* ─── Social Proof Metrics (Req 4.4) ─── */}
        <div className="mx-auto w-full max-w-container px-4">
          <MetricsSection />
        </div>

        {/* ─── Owner Benefits — Editorial Split (Req 4.6) ─── */}
        <div className="mx-auto w-full max-w-container px-4">
          <OwnerBenefitsSection />
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

        {/* ─── Final CTA — Distinct dark surface treatment (Req 4.7) ─── */}
        {/* Visually distinct from the parallax hero: a solid dark surface band
            with white text, brand motif, and urgency messaging. No image, no
            parallax — the contrast with the hero's imagery is the point. */}
        <div className="mx-auto w-full max-w-container px-4">
          <ScrollReveal>
            <section
              aria-labelledby="home-final-title"
              className="relative overflow-hidden rounded-lg bg-[var(--color-text)] px-6 py-12 text-center sm:px-10 sm:py-16"
            >
              {/* Decorative brand motif band — faint, behind the content */}
              <Motif
                variant="band"
                className="pointer-events-none absolute inset-x-0 top-6 mx-auto h-10 w-64 opacity-20 sm:w-80"
              />
              {/* Large decorative watermark in the background */}
              <Motif
                variant="watermark"
                className="pointer-events-none absolute -bottom-10 -end-10 h-56 w-56 opacity-[0.08]"
              />
              <div className="relative flex flex-col items-center gap-4">
                <h2
                  id="home-final-title"
                  className="text-xl font-[var(--font-weight-display)] leading-[var(--line-height-display)] tracking-[var(--tracking-display)] text-[var(--color-bg)] md:text-2xl lg:text-3xl"
                >
                  {t('home.finalCta.title')}
                </h2>
                <p className="max-w-prose text-md text-[var(--color-bg)]/70">
                  {t('home.finalCta.body')}
                </p>
                <p className="text-sm text-[var(--color-bg)]/50">
                  {t('home.finalCta.urgency')}
                </p>
                {/* Primary CTA: full-width mobile, centered auto desktop */}
                <Link
                  to="/s/salon-rose"
                  data-cta="closing"
                  className={`${PRIMARY_CTA} mt-3 w-full sm:w-auto`}
                >
                  {t('home.finalCta.cta')}
                </Link>
              </div>
            </section>
          </ScrollReveal>
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
 * Lead tile for the "How It Works" mosaic — the first and most prominent step.
 * Spans 2 columns + 2 rows on desktop (via FeatureMosaic's lead slot). Uses a
 * large step number as a display-scale typographic device and more generous
 * padding for visual weight.
 */
function HowItWorksLeadTile({
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
    <div className="flex h-full flex-col justify-between gap-5 rounded-lg border border-border bg-surface p-6 shadow-1 sm:p-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="inline-flex h-14 w-14 items-center justify-center rounded-pill bg-primary text-xl font-[var(--font-weight-display)] text-primary-contrast"
          >
            {step}
          </span>
          <span aria-hidden="true" className="text-accent">
            {icon}
          </span>
        </div>
        <h3 className="text-lg font-medium leading-display text-text md:text-xl">
          {title}
        </h3>
        <p className="max-w-prose text-sm text-muted md:text-md">{body}</p>
      </div>
      {/* Decorative connector line — reinforces the "step 1 is the start" feeling */}
      <div
        aria-hidden="true"
        className="mt-auto h-1 w-16 rounded-pill bg-primary/20"
      />
    </div>
  );
}

/**
 * Supporting tile for the "How It Works" mosaic — compact secondary steps.
 * These sit beside the lead tile at a smaller visual scale, creating the
 * asymmetric editorial rhythm. Same info density (number, icon, title, body)
 * but less visual weight.
 */
function HowItWorksTile({
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
    <div className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-1">
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
    </div>
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
