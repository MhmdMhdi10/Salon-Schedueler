import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, Pause, Play, Search } from 'lucide-react';
import { JsonLd, SeoHead, SITE_NAME, SITE_URL } from '../components/seo';
import { DISCOVERY_CATEGORIES, DISCOVERY_CITIES } from '../data/taxonomy';
import { Motif } from '../components/brand/Motif';
import { EditorialSplit } from '../components/layout/EditorialSplit';
import { ScrollReveal } from '../components/ui/ScrollReveal';
import { containerVariants, itemVariants } from '../lib/motion-variants';

/**
 * Alternating editorial feature rows (Booksy directive §j "/" item 5). Copy is
 * long-standing page prose; images carry their true intrinsic dimensions so the
 * browser reserves the exact box (CLS).
 */
const FEATURES = [
  {
    title: 'قرارهای زیبایی، بهتر از همیشه',
    paragraphs: [
      'دنبال آرایشگر، متخصص پوست، ناخن‌کار یا ماساژور نزدیک خودتان هستید؟ آرا بهترین متخصصان زیبایی را یک‌جا به شما نشان می‌دهد.',
      'آرا رزرو خدمات زیبایی را ساده می‌کند؛ بدون تماس تلفنی، در چند ثانیه زمان آزاد را پیدا کنید و هر ساعت از شبانه‌روز رزرو کنید.',
      'بهترین کسب‌وکارهای اطرافتان را پیدا کنید و همان لحظه وقت بگیرید.',
    ],
    image: '/images/hero/iranian-hairstylist.webp',
    width: 1280,
    height: 720,
    alt: 'آرایشگر ایرانی در حال حالت‌دادن موهای مشتری در یک سالن مدرن',
    reverse: false,
  },
  {
    title: 'برنامه‌تان عوض شد؟ خیالتان راحت.',
    paragraphs: [
      'رزروهای خود را از هرجا مدیریت کنید. بدون تماس تلفنی، زمان قرار را تغییر دهید یا آن را لغو کنید.',
      'آرا پیش از قرار به شما یادآوری می‌کند تا هیچ نوبتی را فراموش نکنید.',
    ],
    image: '/images/hero/iranian-booking.webp',
    width: 1280,
    height: 720,
    alt: 'مشتری ایرانی در حال مدیریت قرار زیبایی با تلفن همراه',
    reverse: true,
  },
  {
    title: 'بهترین‌ها را نزدیک خودتان رزرو کنید',
    paragraphs: [
      'در بازار آرا میان سالن‌ها و متخصصان برتر شهر بچرخید و گزینه مناسب خودتان را پیدا کنید.',
      'نمونه‌کارها، فضای سالن، قیمت‌ها و نظرهای تأییدشده مشتریان را پیش از رزرو ببینید.',
      'زمانتان را ذخیره کنید؛ گرفتن نوبت زیبایی در آرا رایگان، سریع و ساده است.',
    ],
    image: '/images/hero/iranian-skincare.webp',
    width: 1280,
    height: 720,
    alt: 'متخصص پوست ایرانی در حال ارائه خدمات حرفه‌ای به مشتری',
    reverse: false,
  },
] as const;

/**
 * Editorial guide cards. Each card's destination genuinely matches its
 * headline: the service-type discovery pages carry hand-written Persian
 * intro/body content for exactly these topics (no fake blog, no bait links).
 */
const GUIDES = [
  {
    title: 'چطور بهترین متخصص پوست را انتخاب کنیم؟',
    image: '/images/hero/iranian-skincare.webp',
    alt: 'متخصص ایرانی مراقبت از پوست در فضای حرفه‌ای',
    width: 1280,
    height: 720,
    to: '/services/skin',
  },
  {
    title: 'محبوب‌ترین مدل‌های سبیل و ریش',
    image: '/images/hero/iranian-barber.webp',
    alt: 'آرایشگر مرد ایرانی در حال مرتب‌کردن ریش مشتری',
    width: 1280,
    height: 720,
    to: '/services/barber',
  },
  {
    title: 'راهنمای انتخاب خدمات مراقبت و زیبایی',
    image: '/images/hero/iranian-manicure.webp',
    alt: 'مانیکور حرفه‌ای ناخن‌های طبیعی در سالن ایرانی',
    width: 1280,
    height: 720,
    to: '/services/nails',
  },
] as const;

/**
 * Ambient Ken Burns drift (`animate-ken-burns`, tailwind.config.js) applied to
 * the page's photography so every image breathes instead of sitting dead-still.
 *
 * Each surface picks a different variant whose shorthand carries a **negative**
 * `animation-delay`, starting the loop already part-way through: neighbouring
 * photos are instantly out of phase (no synchronised page-wide "pulse") and
 * nobody waits for the first cycle. The offset must live inside the `animation`
 * shorthand — a separate `[animation-delay:…]` utility gets reset by it.
 *
 * Class strings are static literals so Tailwind's JIT emits them, and the whole
 * set is `motion-safe:`-gated — under `prefers-reduced-motion: reduce` no
 * animation is applied at all and the photos render at their natural scale.
 */
const DRIFT = [
  'motion-safe:animate-ken-burns',
  'motion-safe:animate-ken-burns-2',
  'motion-safe:animate-ken-burns-3',
  'motion-safe:animate-ken-burns-4',
] as const;

/** Stable per-surface drift phase — wraps so any index is safe. */
const drift = (index: number) => DRIFT[index % DRIFT.length];

/** Small square آرا mark used on the dual product panel badges. */
function AppMark({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-2xs font-bold ${
        dark ? 'bg-ink text-ink-contrast' : 'bg-primary text-primary-contrast'
      }`}
      aria-hidden="true"
    >
      آرا
    </span>
  );
}

/**
 * Hero photography — three salon scenes that cross-fade while drifting slowly
 * inwards (`animate-hero-slide`, tailwind.config.js).
 *
 * These are stills, not a video, and that is the point. A browser composites a
 * `<video>` layer with bilinear filtering and refreshes its texture only at the
 * clip's frame rate, so animating `scale` on one makes fine detail (hair,
 * fabric, stone) crawl between frames — it reads as a trembling picture at ANY
 * amplitude. An `<img>` layer has no such constraint: the same transform is
 * resampled smoothly, so the drift stays calm. The old background clip was
 * itself just these photos cut together every ~2.5s, so nothing is lost —
 * the hard cuts become slow cross-fades and 886KB of video goes away.
 *
 *  - Slide 1 is the LCP element: `loading="eager"` + `fetchpriority="high"`,
 *    and it carries the hero's real Persian alt text. The other two are
 *    decorative (`alt=""`) and lazy.
 *  - `animation-delay` offsets each slide by a third of the cycle. Slides 2–3
 *    start at `opacity-0`, so before their turn — and under
 *    `prefers-reduced-motion: reduce`, where `motion-safe:` withholds the
 *    animation entirely — the hero is simply slide 1, static.
 *  - A visible pause control satisfies WCAG 2.2.2 for motion that runs longer
 *    than five seconds; it freezes every slide's fade AND drift at once.
 */
const HERO_SLIDES = [
  {
    src: '/images/hero/poster-iran.webp',
    // Each slide's phase offset is baked into its own animation utility (see
    // tailwind.config.js) rather than added as a separate `[animation-delay:…]`
    // class — the `animation` shorthand would otherwise reset the delay back to
    // zero and all three slides would fade in and out together.
    phase: 'motion-safe:animate-hero-slide-1',
    lead: true,
  },
  {
    src: '/images/hero/iranian-hairstylist.webp',
    phase: 'opacity-0 motion-safe:animate-hero-slide-2',
    lead: false,
  },
  {
    src: '/images/hero/iranian-barber.webp',
    phase: 'opacity-0 motion-safe:animate-hero-slide-3',
    lead: false,
  },
] as const;

function HeroPhotos() {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(true);
  // `animation-play-state` does not inherit, so the freeze goes on each slide.
  const freeze = playing ? '' : '[animation-play-state:paused]';

  return (
    <>
      {HERO_SLIDES.map(({ src, phase, lead }) => (
        <img
          key={src}
          src={src}
          alt={lead ? t('marketing.hero.imageAlt') : ''}
          width={1280}
          height={720}
          loading={lead ? 'eager' : 'lazy'}
          {...{ fetchpriority: lead ? 'high' : 'auto' }}
          className={`absolute inset-0 h-full w-full object-cover ${phase} ${freeze}`}
        />
      ))}
      <button
        type="button"
        onClick={() => setPlaying((current) => !current)}
        aria-label={playing ? t('marketing.hero.motionPause') : t('marketing.hero.motionPlay')}
        className="absolute bottom-16 end-4 z-10 flex h-11 w-11 items-center justify-center rounded-pill border border-ink-border bg-ink/60 text-ink-contrast transition-opacity duration-fast ease-standard hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {playing ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </>
  );
}

/**
 * Dual product panel (directive §j "/" item 4): two `rounded-2xl` washes —
 * mint-tinted consumer / neutral business — each with a centered pitch and ONE
 * CTA. Honest copy: the product is a web app (PWA); native stores are «به‌زودی»
 * and nothing pretends to send SMS links.
 */
function AppPromo() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-7xl px-4 py-12">
      <div className="grid gap-6 md:grid-cols-2">
        <ScrollReveal className="h-full">
          <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-accent/10 px-6 pt-10 sm:px-10">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-text">
              <AppMark />
              {t('marketing.apps.customer.badge')}
            </div>
            <h2 className="mb-6 mt-8 text-center text-xl text-display leading-display text-text">
              {t('marketing.apps.customer.title')}
            </h2>
            <p className="mx-auto max-w-md text-center text-muted">
              بدون تماس تلفنی، قرار بعدی‌تان را پیدا کنید و
              <strong className="text-text"> همان لحظه </strong>
              در هر زمان و مکان رزرو کنید.
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <Link
                to="/auth"
                className="inline-flex min-h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-contrast no-underline transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {t('marketing.apps.customer.cta')}
              </Link>
              <span className="text-xs text-muted">{t('marketing.apps.customer.storesSoon')}</span>
            </div>
            <div className="relative mt-auto aspect-[4/3] w-full pt-6">
              <img
                src="/images/app/customer-app-iran.webp"
                alt=""
                aria-hidden="true"
                width={1200}
                height={900}
                loading="lazy"
                className={`absolute inset-0 h-full w-full object-cover ${drift(0)}`}
              />
              <img
                src="/screenshots/booking-mobile.png"
                alt={t('marketing.apps.customer.imageAlt')}
                width={1080}
                height={1920}
                loading="lazy"
                className="absolute -bottom-[8%] end-[7%] w-[27%] rounded-xl border border-ink-border/20 bg-elevated shadow-2"
              />
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="h-full">
          <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-surface px-6 pt-10 sm:px-10">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-text">
              <AppMark dark />
              {t('marketing.apps.business.badge')}
            </div>
            <h2 className="mb-6 mt-8 text-center text-xl text-display leading-display text-text">
              {t('marketing.apps.business.title')}
            </h2>
            <p className="mx-auto max-w-md text-center text-muted">
              تقویم، رزرو، بازاریابی و پرداخت؛ همه ابزارهای رشد سالن در
              <strong className="text-text"> یک اپلیکیشن.</strong>
            </p>
            <div className="mt-6 flex justify-center">
              <Link
                data-cta="owner"
                to="/business"
                className="inline-flex min-h-11 items-center rounded-md border border-ink-border bg-ink px-6 text-sm font-semibold text-ink-contrast no-underline transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {t('marketing.apps.business.cta')}
              </Link>
            </div>
            <div className="relative mt-auto aspect-[4/3] w-full pt-6">
              <img
                src="/images/app/business-app-iran.webp"
                alt=""
                aria-hidden="true"
                width={1200}
                height={900}
                loading="lazy"
                className={`absolute inset-0 h-full w-full object-cover ${drift(2)}`}
              />
              <img
                src="/screenshots/admin-desktop.png"
                alt={t('marketing.apps.business.imageAlt')}
                width={1920}
                height={1080}
                loading="lazy"
                className="absolute bottom-[9%] start-[5%] w-[58%] rounded-md border border-ink-border/20 bg-elevated shadow-2"
              />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/**
 * One asymmetric editorial feature row. `EditorialSplit` supplies the
 * deliberately uneven 1.4fr/1fr grid (signature layout rule — never a
 * symmetric 50/50 split); rows alternate order AND lead side.
 */
function FeatureRow({
  title,
  paragraphs,
  image,
  width,
  height,
  alt,
  reverse,
  phase,
}: (typeof FEATURES)[number] & { phase: number }) {
  const text = (
    <div className="flex flex-col justify-center">
      <h2 className="mb-6 text-2xl text-display leading-display text-text lg:mb-10 lg:text-3xl">
        {title}
      </h2>
      <div className="space-y-5 text-muted">
        {paragraphs.map((paragraph, index) => (
          <p
            key={paragraph}
            className={index === paragraphs.length - 1 ? 'font-bold text-text' : undefined}
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
  const visual = (
    <div className="flex items-center justify-center">
      {/* The frame clips the ambient Ken Burns zoom so the drift never bleeds
          past the rounded edge or nudges the layout (transform only, no reflow). */}
      <div className="aspect-[16/10] w-full max-w-xl overflow-hidden rounded-lg shadow-1">
        <img
          src={image}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          className={`h-full w-full object-cover ${drift(phase)}`}
        />
      </div>
    </div>
  );

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 lg:py-24">
      <ScrollReveal>
        <EditorialSplit lead={reverse ? 'end' : 'start'}>
          {reverse ? (
            <>
              <div className="order-2 md:order-1">{visual}</div>
              <div className="order-1 md:order-2">{text}</div>
            </>
          ) : (
            <>
              {text}
              {visual}
            </>
          )}
        </EditorialSplit>
      </ScrollReveal>
    </section>
  );
}

/** Flat chevron text link used by the SEO city grid (zero cards). */
function FeatureLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <Link
      to={to}
      className="group flex min-h-11 items-center gap-2 text-text no-underline transition-colors duration-fast ease-standard hover:text-primary"
    >
      {/* Forward affordance in RTL points in the reading direction (start ← end). */}
      <ChevronLeft className="h-4 w-4 text-primary" aria-hidden="true" />
      {children}
    </Link>
  );
}

/**
 * Public marketing home (`/`) — Booksy structure through Ara's tokens
 * (directive §j "/"):
 *
 *  1. Dark-scrim photography/video hero extending beneath the transparent
 *     absolute header; small display H1; the white search bar IS the hero and
 *     submits to `/search?q=`.
 *  2. Category text-link rail (canonical taxonomy) pinned to the hero's
 *     bottom edge.
 *  3. Dual consumer/business product panel.
 *  4. Alternating asymmetric editorial feature rows.
 *  5. SEO city-link grid (all 20 taxonomy cities resolve).
 *  6. Guide cards pointing at real editorial discovery content.
 */
export function MarketingHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get('q')?.toString().trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  };

  return (
    <div data-testid="marketing-home" className="overflow-x-clip bg-bg">
      <SeoHead
        title={t('seo.titles.home')}
        description={t('seo.descriptions.home')}
        path="/"
        index
      />
      <JsonLd
        data={[
          { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, inLanguage: 'fa-IR' },
          { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
        ]}
      />

      {/* Hero — sits beneath the transparent absolute header (AppShell adds no
          flow height on `/`), so it carries its own dark scrim for the chrome. */}
      <section className="relative flex min-h-[34rem] flex-col overflow-hidden bg-ink">
        <HeroPhotos />
        {/* Flat photo scrim (directive §b) — the theme-stable overlay token. */}
        <div className="absolute inset-0 bg-overlay" aria-hidden="true" />

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-4">
          <motion.div
            className="flex flex-1 flex-col items-center justify-center pb-6 pt-28"
            variants={prefersReduced ? {} : containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.h1
              variants={prefersReduced ? {} : itemVariants}
              className="mb-6 max-w-2xl text-center text-2xl text-display leading-display text-ink-contrast sm:text-3xl"
            >
              {t('marketing.hero.title')}
            </motion.h1>
            <motion.form
              variants={prefersReduced ? {} : itemVariants}
              onSubmit={search}
              role="search"
              className="relative flex w-full max-w-xl items-center gap-2 rounded-lg bg-ink-contrast p-2 shadow-1 focus-within:ring-2 focus-within:ring-focus"
            >
              <Search
                className="pointer-events-none absolute start-5 h-5 w-5 text-ink/50"
                aria-hidden="true"
              />
              <label htmlFor="home-search" className="sr-only">
                {t('marketing.hero.searchLabel')}
              </label>
              <input
                id="home-search"
                name="q"
                type="search"
                placeholder={t('marketing.hero.searchPlaceholder')}
                className="min-w-0 flex-1 bg-transparent py-2 pe-2 ps-9 text-sm text-ink outline-none placeholder:text-ink/50"
              />
              <button
                type="submit"
                data-cta="primary"
                className="min-h-11 shrink-0 rounded-md bg-primary px-5 text-sm font-semibold text-primary-contrast shadow-1 transition-opacity duration-fast ease-standard hover:opacity-90 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {t('marketing.hero.cta')}
              </button>
            </motion.form>
            <motion.div variants={prefersReduced ? {} : itemVariants}>
              <Link
                data-cta="secondary"
                to="/city/tehran"
                className="mt-5 inline-block rounded-sm text-sm font-semibold text-ink-contrast underline underline-offset-4 transition-opacity duration-fast ease-standard hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {t('marketing.hero.secondaryCta')}
              </Link>
            </motion.div>
          </motion.div>

          {/* Category rail pinned to the hero's bottom edge (canonical taxonomy
              — every slug resolves). The inline-end fade signals overflow. */}
          <nav aria-label={t('marketing.hero.categoriesAria')} className="relative">
            <div className="flex items-center justify-between gap-6 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {DISCOVERY_CATEGORIES.map(({ slug, label }) => (
                <Link
                  key={slug}
                  to={`/services/${slug}`}
                  className="shrink-0 whitespace-nowrap text-sm font-semibold text-ink-contrast no-underline transition-opacity duration-fast ease-standard hover:opacity-80"
                >
                  {label}
                </Link>
              ))}
              <Link
                to="/search"
                className="shrink-0 whitespace-nowrap text-sm font-semibold text-ink-contrast no-underline transition-opacity duration-fast ease-standard hover:opacity-80"
              >
                {t('marketing.hero.more')}
              </Link>
            </div>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 end-0 w-10 bg-gradient-to-l from-ink/60 to-transparent rtl:bg-gradient-to-r md:hidden"
            />
          </nav>
        </div>
      </section>

      {/* Signature motif band as the hero divider (brand surface). */}
      <div className="mx-auto flex max-w-7xl justify-center px-4 pt-8 text-primary">
        <Motif variant="band" className="h-8 w-64" aria-hidden />
      </div>

      <AppPromo />

      {FEATURES.map((feature, index) => (
        <FeatureRow key={feature.title} {...feature} phase={index + 1} />
      ))}

      <section className="mx-auto max-w-7xl px-4 py-16">
        <ScrollReveal>
          <h2 className="mb-6 text-center text-2xl text-display leading-display text-text sm:text-3xl">
            متخصص آرا را در شهر خودتان پیدا کنید
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={0.05}>
          <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-x-8 gap-y-1 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {DISCOVERY_CITIES.map(({ slug, name }) => (
              <li key={slug}>
                <FeatureLink to={`/city/${slug}`}>{name}</FeatureLink>
              </li>
            ))}
          </ul>
        </ScrollReveal>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="pb-8 text-xl text-display leading-display text-text">
          پیشنهاد آرا برای شما
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map((guide, index) => (
            <ScrollReveal key={guide.title} delay={index * 0.05} className="h-full">
              <Link
                to={guide.to}
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-elevated no-underline shadow-1 transition-shadow duration-fast ease-standard hover:shadow-2"
              >
                <div className="aspect-[16/10] w-full overflow-hidden">
                  <img
                    src={guide.image}
                    alt={guide.alt}
                    width={guide.width}
                    height={guide.height}
                    loading="lazy"
                    className={`h-full w-full object-cover ${drift(index)}`}
                  />
                </div>
                <h3 className="p-5 text-xl font-semibold leading-[1.6] text-text transition-colors duration-fast ease-standard group-hover:text-primary">
                  {guide.title}
                </h3>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </section>
    </div>
  );
}

export default MarketingHome;
