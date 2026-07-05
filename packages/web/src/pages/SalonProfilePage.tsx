import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import i18n from '../i18n';
import { SeoHead, JsonLd, SITE_URL } from '../components/seo';
import type { JsonLdNode } from '../components/seo';
import { Num, DirText, Picture, Avatar, cn, formatRial, toPersianDigits } from '../components/ui';
import { TenantTheme } from '../components/theme';
import { Salon3DStage } from '../components/three/Salon3DStage';
import {
  getSalonProfile,
  IRANIAN_WEEK_ORDER,
  PERSIAN_DAY_LABEL,
  type SalonProfile,
  type SchemaDay,
} from '../data/salons';
import { usePwaInstall } from '../pwa/usePwaInstall';

/** Chic, high-contrast "ink" button (charcoal in light, paper in dark). */
const INK_BUTTON =
  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-pill bg-text px-7 py-3 text-md font-bold text-bg no-underline transition-transform duration-fast ease-standard hover:scale-[1.03] active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none';

/** Outline "pill" link that inverts on hover — used for off-page channels. */
const PILL_LINK =
  'inline-flex min-h-[44px] items-center gap-2 rounded-pill border border-text px-5 py-2 text-sm font-medium text-text no-underline transition-colors duration-fast ease-standard hover:bg-text hover:text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/**
 * Public salon profile at `/s/:slug` (task 5.2; R8.1, R8.3, R8.4, R8.8, R9.1).
 *
 * Designed as an editorial salon "lookbook" rather than a generic dashboard:
 * oversized display type, numbered section headers with hairline rules, a real
 * price-list menu, an asymmetric gallery, and chic ink/outline controls. SEO,
 * RTL, a11y, and perf discipline are preserved (tokens only; images sized +
 * lazy; one <h1>; AA-safe color usage).
 */
export function SalonProfilePage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const salon = getSalonProfile(slug);
  const { installed, promptInstall } = usePwaInstall();
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Progressive-enhancement motion with anime.js (v4): a staggered hero intro
  // and scroll-reveals for the sections. Dynamically imported so it stays out
  // of SSR/prerender and ships as its own chunk; gated on reduced-motion; all
  // instances are scoped and reverted on unmount. Failures are swallowed (the
  // page is fully usable without it).
  useEffect(() => {
    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let cancelled = false;
    let scope: { revert: () => void } | undefined;

    import('animejs')
      .then(({ animate, createScope, stagger, onScroll, svg }) => {
        const root = rootRef.current;
        if (cancelled || !root) return;
        scope = createScope({ root: rootRef }).add(() => {
          const hero = root.querySelector('header') as HTMLElement | null;

          // 1) Hero intro — staggered rise + fade on mount.
          const heroItems = root.querySelector('[data-hero]')?.children;
          if (heroItems?.length) {
            animate(Array.from(heroItems), {
              opacity: [0, 1],
              y: [28, 0],
              delay: stagger(70),
              duration: 760,
              ease: 'out(3)',
            });
          }
          const stage = root.querySelector('[data-hero-3d]') as HTMLElement | null;
          if (stage) {
            animate(stage, { opacity: [0, 1], scale: [0.92, 1], duration: 900, ease: 'out(3)' });
          }

          // 2) Hero parallax — playback SCRUBBED to scroll position (sync),
          //    the anime.js-homepage feel: layers drift at different rates.
          if (hero) {
            const heroRange = (sync: number) =>
              onScroll({
                target: hero,
                enter: { target: 'top', container: 'top' },
                leave: { target: 'bottom', container: 'top' },
                sync,
              });
            const mark = root.querySelector('[data-parallax="mark"]') as HTMLElement | null;
            if (mark) {
              animate(mark, {
                y: [0, -220],
                opacity: [0.12, 0.02],
                ease: 'linear',
                autoplay: heroRange(0.18),
              });
            }
            if (stage) {
              animate(stage, { y: [0, -90], ease: 'linear', autoplay: heroRange(0.32) });
            }
            const heroText = root.querySelector('[data-hero]') as HTMLElement | null;
            if (heroText) {
              animate(heroText, {
                y: [0, -36],
                opacity: [1, 0.5],
                ease: 'linear',
                autoplay: heroRange(0.42),
              });
            }
          }

          // 3) Section reveals — scrubbed fade + rise as each block scrolls in.
          root.querySelectorAll('[data-reveal]').forEach((node) => {
            animate(node as HTMLElement, {
              opacity: [0, 1],
              y: [48, 0],
              ease: 'out(2)',
              autoplay: onScroll({
                target: node as HTMLElement,
                enter: { target: 'top', container: 'bottom' },
                leave: { target: 'top', container: 'center' },
                sync: 0.5,
              }),
            });
          });

          // 4) Staggered lists — children rise in sequence, scrubbed to scroll.
          root.querySelectorAll('[data-stagger]').forEach((list) => {
            const children = Array.from(list.children) as HTMLElement[];
            if (!children.length) return;
            animate(children, {
              opacity: [0, 1],
              y: [32, 0],
              delay: stagger(110),
              duration: 480,
              ease: 'out(2)',
              autoplay: onScroll({
                target: list as HTMLElement,
                enter: { target: 'top', container: 'bottom' },
                leave: { target: 'bottom', container: 'center' },
                sync: 0.5,
              }),
            });
          });

          // 5) Section rules — an SVG line "draws on" as each header enters.
          root.querySelectorAll('[data-rule]').forEach((line) => {
            const [drawable] = svg.createDrawable(line as SVGLineElement);
            animate(drawable, {
              draw: ['0 0', '0 1'],
              ease: 'out(2)',
              autoplay: onScroll({
                target: (line.closest('[data-reveal]') as HTMLElement) ?? (line as HTMLElement),
                enter: { target: 'top', container: 'bottom' },
                leave: { target: 'top', container: 'center' },
                sync: 0.5,
              }),
            });
          });

          // 6) Prices — count up from zero the first time they scroll into view.
          root.querySelectorAll('[data-countup]').forEach((el) => {
            const node = el as HTMLElement;
            const value = Number(node.getAttribute('data-countup')) || 0;
            const state = { v: 0 };
            animate(state, {
              v: value,
              duration: 1400,
              ease: 'out(4)',
              autoplay: onScroll({
                target: node,
                enter: { target: 'top', container: 'bottom' },
              }),
              onUpdate: () => {
                node.textContent = formatRial(Math.round(state.v));
              },
            });
          });
        });
      })
      .catch(() => {
        /* anime.js is a progressive enhancement — ignore load/runtime errors */
      });

    return () => {
      cancelled = true;
      scope?.revert();
    };
  }, []);

  // Unknown slug → a noindex "not found" surface (no canonical into the index).
  if (!salon) {
    return (
      <div data-testid="salon-not-found">
        <SeoHead title={t('salon.profile.notFoundTitle')} />
        <h1 className="text-xl font-bold text-text">
          {t('salon.profile.notFoundTitle')}
        </h1>
        <p className="mt-2 max-w-prose text-muted">
          {t('salon.profile.notFoundBody')}
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex min-h-[44px] items-center text-primary underline-offset-4 hover:underline"
        >
          {t('salon.profile.backHome')}
        </Link>
      </div>
    );
  }

  const headingSuffix = t('salon.profile.headingSuffix', {
    city: salon.address.addressLocality,
    neighborhood: salon.neighborhood,
  });
  const path = `/s/${salon.slug}`;
  const ogImage = salon.ogImage ? `${SITE_URL}${salon.ogImage}` : undefined;
  const bookHref = `/salon/${salon.bookingSalonId}/book`;
  const today = tehranToday();
  const openNow = isOpenNow(salon);
  const channels = salon.channels ?? {};
  // The salon is the primary brand mark (R4.5): its configured display name when
  // present, otherwise its stored name.
  const brandMark = salon.displayName ?? salon.name;
  // A large, faint backdrop of the salon's brand word — the editorial signature.
  const markWord = brandMark.split(' ').pop() ?? brandMark;

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'unavailable') setShowInstallHelp(true);
  };

  return (
    <TenantTheme accentKey={salon.brandAccent}>
      <div ref={rootRef} data-testid="salon-profile" className="mx-auto w-full max-w-container pb-28 md:pb-12">
      <SeoHead
        title={salon.name}
        description={salon.tagline}
        path={path}
        ogType="business.business"
        image={ogImage}
        index
      />
      <JsonLd data={buildSalonJsonLd(salon)} />

      {/* Breadcrumb — mirrors the BreadcrumbList JSON-LD (seo §5). */}
      <nav aria-label={t('salon.profile.breadcrumb')} className="py-3 text-sm">
        <ol className="flex flex-wrap items-center gap-x-2 text-muted" role="list">
          <li>
            <Link to="/" className="hover:text-text hover:underline">
              {t('salon.profile.crumbHome')}
            </Link>
          </li>
          <li aria-hidden="true">‹</li>
          <li className="text-text">{salon.name}</li>
        </ol>
      </nav>

      {/* Hero — editorial: an overline, an oversized name over a faint brand
          mark, the locale/tagline, a live open marker, and the primary CTA. */}
      <header className="relative overflow-hidden py-10 sm:py-16">
        <span
          aria-hidden="true"
          data-parallax="mark"
          className="pointer-events-none absolute -top-8 select-none text-[28vw] font-black leading-none text-accent opacity-[0.07] end-0 sm:text-[20vw]"
        >
          {markWord}
        </span>
        <div className="relative grid items-center gap-8 lg:grid-cols-2">
          <div data-hero className="flex flex-col items-start gap-5">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="h-px w-10 bg-accent" />
              <span className="text-xs font-bold tracking-[0.25em] text-muted">
                {t('salon.profile.eyebrow')}
              </span>
            </div>

            <div className="flex items-center gap-4">
              {salon.logoUrl ? (
                <Avatar src={salon.logoUrl} name={brandMark} size="lg" decorative />
              ) : null}
              <h1 className="text-[clamp(2.75rem,9vw,5.5rem)] font-black leading-[0.95] text-text">
                {brandMark}
              </h1>
            </div>

            <p className="max-w-prose text-md text-muted">{headingSuffix}</p>
            <p className="max-w-prose text-md leading-loose text-muted">{salon.tagline}</p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text">
              {openNow !== null && (
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn('h-2.5 w-2.5 rounded-pill', openNow ? 'bg-success' : 'bg-muted')}
                  />
                  {openNow ? t('salon.profile.openNow') : t('salon.profile.closedNow')}
                </span>
              )}
              <span className="text-muted">
                {salon.neighborhood}، {salon.address.addressLocality}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-5 pt-2">
              <Link to={bookHref} className={INK_BUTTON}>
                {t('salon.profile.bookCtaLong')}
                <Arrow />
              </Link>
              <a
                href={`tel:${salon.telephone}`}
                className="text-sm font-medium text-text underline decoration-accent decoration-2 underline-offset-4 hover:decoration-text"
              >
                {t('salon.profile.callCta')}
              </a>
            </div>
          </div>

          {/* Signature 3D centerpiece (decorative, lazy + WebGL/motion-gated). */}
          <div data-hero-3d>
            <Salon3DStage className="h-[280px] w-full sm:h-[360px] lg:h-[480px]" />
          </div>
        </div>
      </header>

      {/* Slim feature band — truthful highlights, divided, no boxes/icons. */}
      <ul
        data-stagger
        className="flex flex-col divide-y divide-border border-y border-border sm:flex-row sm:divide-x sm:divide-y-0 sm:rtl:divide-x-reverse"
        role="list"
      >
        {[
          t('salon.profile.feat247'),
          t('salon.profile.featInstant'),
          t('salon.profile.featReminder'),
        ].map((label, i) => (
          <li key={label} className="flex items-center gap-3 py-4 sm:flex-1 sm:px-5">
            <span className="text-sm font-black text-accent">
              {toPersianDigits(String(i + 1))}
            </span>
            <span className="text-sm font-medium text-text">{label}</span>
          </li>
        ))}
      </ul>

      {/* Services — a salon price list (name · dotted leader · price). */}
      <section className="pt-12" aria-labelledby="salon-services-title">
        <SectionHeader id="salon-services-title" index="01" title={t('salon.profile.servicesTitle')} />
        <ul data-stagger role="list" className="flex flex-col border-t border-border">
          {salon.services.map((service, index) => (
            <li
              key={service.id}
              className="flex items-baseline gap-4 border-b border-border py-5"
            >
              <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 text-lg font-bold text-text">
                  {service.name}
                  {index === 0 && (
                    <span className="rounded-pill bg-text px-2 py-0.5 text-2xs font-medium text-bg">
                      {t('salon.profile.popular')}
                    </span>
                  )}
                </h3>
                <span className="text-xs text-muted">
                  <Num value={service.durationMinutes} />{' '}
                  {t('salon.profile.durationMinutes', { count: service.durationMinutes })}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="mb-1.5 hidden flex-1 border-b border-dotted border-border sm:block"
              />
              <bdi
                dir="rtl"
                className="ms-auto whitespace-nowrap text-lg font-bold tabular-nums text-text sm:ms-0"
              >
                <span data-countup={String(service.priceRial)}>
                  {formatRial(service.priceRial)}
                </span>
                <span className="ms-1">ریال</span>
              </bdi>
            </li>
          ))}
        </ul>
      </section>

      {/* Opening hours — editorial table, today emphasized (no boxes). */}
      <section className="pt-12" aria-labelledby="salon-hours-title">
        <SectionHeader id="salon-hours-title" index="02" title={t('salon.profile.hoursTitle')} />
        <ul data-stagger role="list" className="flex flex-col border-t border-border">
          {orderedHours(salon).map((entry) => {
            const isToday = entry.day === today;
            return (
              <li
                key={entry.day}
                className={cn(
                  'flex items-center justify-between gap-4 border-b border-border py-3 text-sm',
                  isToday && 'font-bold',
                )}
              >
                <span className="flex items-center gap-2 text-text">
                  {PERSIAN_DAY_LABEL[entry.day]}
                  {isToday && (
                    <span className="text-2xs font-black tracking-wide text-accent">
                      {t('salon.profile.todayBadge')}
                    </span>
                  )}
                </span>
                {entry.closed || !entry.opens || !entry.closes ? (
                  <span className="text-muted">{t('salon.profile.hoursClosed')}</span>
                ) : (
                  <DirText dir="ltr" className="text-muted tabular-nums">
                    {t('salon.profile.hoursRange', {
                      opens: toPersianDigits(entry.opens),
                      closes: toPersianDigits(entry.closes),
                    })}
                  </DirText>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Gallery — asymmetric, framed tiles with a hover-zoom; images stay
          sized + lazy + Persian alt (CLS-safe, motion-reduce friendly). */}
      <section className="pt-12" aria-labelledby="salon-gallery-title">
        <SectionHeader id="salon-gallery-title" index="03" title={t('salon.profile.galleryTitle')} />
        <div data-stagger className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          {salon.gallery.map((image, index) => {
            const sources = [
              image.avifSrcSet && { type: 'image/avif', srcSet: image.avifSrcSet },
              image.webpSrcSet && { type: 'image/webp', srcSet: image.webpSrcSet },
            ].filter(Boolean) as { type: string; srcSet: string }[];
            const featured = index === 0;
            return (
              <figure
                key={image.src}
                className={cn(
                  'group overflow-hidden bg-surface',
                  featured
                    ? 'aspect-[4/3] sm:col-span-7'
                    : 'aspect-[3/4] sm:col-span-5 sm:mt-12',
                )}
              >
                <Picture
                  sources={sources}
                  src={image.src}
                  fallbackSrcSet={image.srcSet}
                  sizes="(min-width: 1024px) 33vw, (min-width: 480px) 50vw, 100vw"
                  width={image.width}
                  height={image.height}
                  alt={image.alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-slow ease-standard group-hover:scale-105 motion-reduce:transform-none"
                />
              </figure>
            );
          })}
        </div>
      </section>

      {/* Booking channels — outline pill links (web app/site, Bale, Telegram). */}
      <section className="pt-12" aria-labelledby="salon-channels-title">
        <SectionHeader id="salon-channels-title" index="04" title={t('salon.profile.channelsTitle')} />
        <p className="mb-5 max-w-prose text-sm text-muted">
          {t('salon.profile.channelsHint')}
        </p>
        <div data-stagger className="flex flex-wrap gap-3">
          {channels.website && (
            <Link to={channels.website} className={PILL_LINK}>
              {t('salon.profile.channelWebsite')}
            </Link>
          )}
          {channels.bale && (
            <a href={channels.bale} target="_blank" rel="noopener noreferrer" className={PILL_LINK}>
              {t('salon.profile.channelBale')}
              <Arrow external />
              <span className="sr-only"> ({t('salon.profile.channelNewTab')})</span>
            </a>
          )}
          {channels.telegram && (
            <a href={channels.telegram} target="_blank" rel="noopener noreferrer" className={PILL_LINK}>
              {t('salon.profile.channelTelegram')}
              <Arrow external />
              <span className="sr-only"> ({t('salon.profile.channelNewTab')})</span>
            </a>
          )}
        </div>
      </section>

      {/* Add as web app — refined ink callout (save it to book faster). */}
      {installed ? (
        <p className="pt-10 text-sm font-medium text-success">
          {t('salon.profile.installedNote')}
        </p>
      ) : (
        <section
          data-reveal
          className="mt-12 flex flex-col gap-4 border-t-2 border-text pt-6 sm:flex-row sm:items-center sm:justify-between"
          aria-labelledby="salon-install-title"
        >
          <div className="flex flex-col gap-1">
            <h2 id="salon-install-title" className="text-lg font-bold text-text">
              {t('salon.profile.installTitle')}
            </h2>
            <p className="max-w-prose text-sm text-muted">
              {t('salon.profile.installBody')}
            </p>
            {showInstallHelp && (
              <p role="note" className="mt-2 max-w-prose text-sm text-muted">
                <span className="font-bold text-text">
                  {t('salon.profile.installManualTitle')}:{' '}
                </span>
                {t('salon.profile.installManualBody')}
              </p>
            )}
          </div>
          <button type="button" onClick={handleInstall} className={cn(INK_BUTTON, 'sm:shrink-0')}>
            {t('salon.profile.installCta')}
          </button>
        </section>
      )}

      {/* Contact / NAP — editorial footer block (identical to JSON-LD, seo §11). */}
      <section className="pt-12" aria-labelledby="salon-contact-title">
        <SectionHeader id="salon-contact-title" index="05" title={t('salon.profile.contactTitle')} />
        <address data-reveal className="flex flex-col gap-6 not-italic sm:flex-row sm:justify-between">
          <p className="max-w-prose text-md leading-loose text-text">
            <span className="block text-xs font-bold tracking-wide text-muted">
              {t('salon.profile.addressLabel')}
            </span>
            {salon.address.streetAddress}، {salon.address.addressLocality}
          </p>
          <p className="text-md text-text">
            <span className="block text-xs font-bold tracking-wide text-muted">
              {t('salon.profile.phoneLabel')}
            </span>
            <a
              href={`tel:${salon.telephone}`}
              className="text-lg font-bold underline decoration-accent decoration-2 underline-offset-4 hover:decoration-text"
            >
              <DirText dir="ltr">{salon.telephone}</DirText>
            </a>
          </p>
        </address>
        <div className="mt-6 overflow-hidden border border-border">
          <iframe
            title={t('salon.profile.mapEmbedTitle', { name: salon.name })}
            src={salon.mapEmbedUrl}
            loading="lazy"
            width={1200}
            height={320}
            className="block h-[320px] w-full border-0"
          />
        </div>
      </section>

      {/* Sticky mobile booking bar — primary CTA in thumb reach (ui-ux §5). */}
      <div
        className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-bg px-4 py-3 md:hidden"
        style={{ paddingBottom: 'calc(var(--space-3) + env(safe-area-inset-bottom))' }}
      >
        <Link to={bookHref} className={cn(INK_BUTTON, 'w-full')}>
          {t('salon.profile.bookCta')}
          <Arrow />
        </Link>
      </div>
      </div>
    </TenantTheme>
  );
}

/** A numbered editorial section header: «۰۱ — عنوان» with a hairline rule. */
function SectionHeader({ id, index, title }: { id: string; index: string; title: string }) {
  return (
    <div data-reveal className="mb-6 flex items-baseline gap-4">
      <span className="text-2xl font-black tabular-nums text-accent">
        {toPersianDigits(index)}
      </span>
      <h2 id={id} className="text-xl font-bold text-text">
        {title}
      </h2>
      <svg
        aria-hidden="true"
        className="h-0.5 flex-1 self-center text-border"
        viewBox="0 0 100 2"
        preserveAspectRatio="none"
      >
        <line
          data-rule
          x1="0"
          y1="1"
          x2="100"
          y2="1"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

/** A thin directional arrow (mirrors in RTL). `external` tilts it up-and-out. */
function Arrow({ external = false }: { external?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', external ? 'rotate-45' : 'rtl:-scale-x-100')}
    >
      <path d="M10 3l5 5-5 5" />
      <path d="M15 8H1" />
    </svg>
  );
}

/**
 * Whether the salon is open right now in its locale (Asia/Tehran): looks up
 * today's hours and compares the current `HH:mm` against them. Returns null if
 * the time zone can't be resolved. Display-only — never affects the JSON-LD.
 */
function isOpenNow(salon: SalonProfile): boolean | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tehran',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const hour = parts.find((p) => p.type === 'hour')?.value;
    const minute = parts.find((p) => p.type === 'minute')?.value;
    if (!weekday || !hour || !minute) return null;
    const day = salon.openingHours.find((h) => h.day === weekday);
    if (!day || day.closed || !day.opens || !day.closes) return false;
    const now = `${hour}:${minute}`;
    return day.opens <= now && now < day.closes;
  } catch {
    return null;
  }
}

/** Orders a salon's hours into Iranian-week display order (Saturday first). */
function orderedHours(salon: SalonProfile) {
  return IRANIAN_WEEK_ORDER.map(
    (day) => salon.openingHours.find((h) => h.day === day) ?? { day, closed: true },
  );
}

/** Today's schema.org weekday in the salon's locale (Asia/Tehran), or null. */
function tehranToday(): SchemaDay | null {
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      weekday: 'long',
    }).format(new Date());
    return (IRANIAN_WEEK_ORDER as readonly string[]).includes(weekday)
      ? (weekday as SchemaDay)
      : null;
  } catch {
    return null;
  }
}

/**
 * Builds the page's JSON-LD: `BeautySalon` + one `Service` per offering
 * (`priceCurrency:"IRR"`) + `BreadcrumbList` (seo §5). Built from the same
 * `SalonProfile` that renders on the page, so the structured data marks up only
 * visible content and the NAP stays consistent — nothing is fabricated.
 *
 * Exported so it can be unit-tested without rendering the whole page.
 */
export function buildSalonJsonLd(salon: SalonProfile): JsonLdNode[] {
  const url = `${SITE_URL}/s/${salon.slug}`;
  const image = salon.ogImage ? `${SITE_URL}${salon.ogImage}` : undefined;

  const beautySalon: JsonLdNode = {
    '@type': 'BeautySalon',
    name: salon.name,
    url,
    telephone: salon.telephone,
    priceRange: salon.priceRange,
    address: {
      '@type': 'PostalAddress',
      streetAddress: salon.address.streetAddress,
      addressLocality: salon.address.addressLocality,
      addressRegion: salon.address.addressRegion,
      addressCountry: salon.address.addressCountry,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: salon.geo.latitude,
      longitude: salon.geo.longitude,
    },
    openingHoursSpecification: salon.openingHours
      .filter((h) => !h.closed && h.opens && h.closes)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: h.day,
        opens: h.opens,
        closes: h.closes,
      })),
  };
  if (image) beautySalon.image = image;

  const services: JsonLdNode[] = salon.services.map((service) => ({
    '@type': 'Service',
    name: service.name,
    provider: { '@type': 'BeautySalon', name: salon.name },
    offers: {
      '@type': 'Offer',
      price: String(service.priceRial),
      priceCurrency: 'IRR',
    },
  }));

  const breadcrumb: JsonLdNode = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: i18n.t('salon.profile.crumbHome'),
        item: SITE_URL,
      },
      { '@type': 'ListItem', position: 2, name: salon.name, item: url },
    ],
  };

  return [beautySalon, ...services, breadcrumb];
}

export default SalonProfilePage;
