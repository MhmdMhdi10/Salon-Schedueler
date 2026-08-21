import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { BrandLogo } from '../brand';
import { ThemeToggle } from '../theme/ThemeToggle';
import { HeaderAuthNav } from './HeaderAuthNav';
import { toPersianDigits } from '../ui/Num';
import { cn } from '../ui/cn';
import { PwaInstallPrompt } from '../../pwa/PwaInstallPrompt';

/** Stable id the skip link targets and the `<main>` exposes. */
export const MAIN_CONTENT_ID = 'main-content';

const ENAMAD_CODE = '9VvZMqffMTky88WMBv1WJpNzNafnVCyo';
const ENAMAD_LINK = `https://trustseal.enamad.ir/?id=7396256&Code=${ENAMAD_CODE}`;
const ENAMAD_LOGO = `https://trustseal.enamad.ir/logo.aspx?id=7396256&Code=${ENAMAD_CODE}`;

/**
 * Header presentation variants (Booksy directive §a):
 *
 *  - `default`     — sticky two-deck header: brand row (wordmark + Motif mark,
 *                    account nav, «ثبت سالن», theme toggle) over a horizontally
 *                    scrollable category rail fed from `data/taxonomy.ts`.
 *  - `business`    — sticky product header for the owner-acquisition surface
 *                    (`/`): logo + «بیز» badge, section anchors, login
 *                    + primary CTA.
 *  - `bare`        — no header and no footer (auth / onboarding pages where
 *                    the card is the whole composition).
 *
 * When `headerVariant` is omitted it is derived from the pathname
 * (`/` → business, `/auth` + `/business/register`
 * → bare, everything else → default).
 */
export type AppShellHeaderVariant = 'default' | 'business' | 'bare';

export interface AppShellProps {
  /** Routed page content rendered inside the single `<main>` landmark. */
  children: React.ReactNode;
  /** Optional className applied to the outermost shell element. */
  className?: string;
  /** Explicit header variant; derived from the route when omitted. */
  headerVariant?: AppShellHeaderVariant;
}

/**
 * Application shell for the Salon Booking PWA (R3.1, R3.2, R3.5, R3.8).
 *
 * Wraps the routed pages in a consistent, accessible structure:
 *  - a skip-to-content link that is visually hidden until focused;
 *  - a `<header>` per the variant map above (nav landmark, wordmark → home,
 *    account entry, theme toggle);
 *  - a single `<main id="main-content">` content region (one per page, R3.8);
 *  - the thin dark two-row footer (directive §f) with REAL link targets only.
 *
 * Layout is RTL-first (logical properties only) and responsive 360px–1280px+
 * with a centered max-width container and no horizontal overflow.
 */
export function AppShell({ children, className, headerVariant }: AppShellProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const derived: AppShellHeaderVariant =
    pathname === '/'
      ? 'business'
      : pathname === '/auth' || pathname === '/business/register'
        ? 'bare'
        : 'default';
  const variant = headerVariant ?? derived;
  const isBare = variant === 'bare';
  const isOwnerLanding = pathname === '/';
  const hideFooter = pathname === '/account';

  return (
    <div
      className={cn(
        'flex min-h-screen min-h-[100dvh] flex-col overflow-x-hidden text-text',
        isBare ? 'bg-surface' : 'bg-bg',
        className,
      )}
    >
      {/* Skip-to-content: off-screen until focused, then anchored to the
          inline-start so the focus ring is visible in RTL. */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className={cn(
          'sr-only z-nav rounded-md bg-primary px-4 py-2 text-primary-contrast',
          'focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2',
          'focus-visible:start-2',
        )}
      >
        {t('app.skipToContent')}
      </a>

      {variant === 'business' ? (
        <BusinessHeader />
      ) : variant === 'default' ? (
        <DefaultHeader />
      ) : null}

      {isBare && pathname !== '/business/register' && (
        <div className="fixed end-3 top-3 z-nav">
          <ThemeToggle />
        </div>
      )}

      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="min-w-0 w-full max-w-none flex-1 p-0">
        {children}
      </main>

      {/* Keep the owner-acquisition hero focused; install can be offered after
          the user enters the product instead of obscuring the first CTA. */}
      {isBare || isOwnerLanding ? null : <PwaInstallPrompt />}
      {isBare || hideFooter ? null : <PublicFooter />}
    </div>
  );
}

export default AppShell;

/** Shared selected brand lockup, linking home. */
function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      to="/"
      aria-label="آرا"
      className={cn(
        'flex min-h-10 shrink-0 items-center rounded-md no-underline',
        'outline-none focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-2 focus-visible:outline-focus',
        inverse ? 'text-ink-contrast' : 'text-text',
      )}
    >
      <BrandLogo inverse={inverse} className="h-9" />
    </Link>
  );
}

/**
 * Compact inner-page header. Marketplace category navigation is intentionally
 * absent during the owner-first launch.
 */
function DefaultHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-nav w-full border-b border-border bg-elevated text-text">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3">
        <nav aria-label={t('app.primaryNav')}>
          <BrandMark />
        </nav>
        <div className="flex min-w-0 items-center gap-0.5 sm:gap-2">
          <Link
            to="/account"
            className="flex min-h-10 shrink-0 items-center rounded-md px-2 py-2 text-xs font-semibold text-text no-underline transition-colors duration-fast ease-standard hover:bg-surface sm:px-3 sm:text-sm"
          >
            سالن‌های من
          </Link>
          <HeaderAuthNav />
          <Link
            to="/business/register"
            className={cn(
              'hidden rounded-md px-3 py-2 text-sm font-semibold text-text no-underline sm:inline-flex',
              'transition-colors duration-fast ease-standard hover:bg-surface',
              'outline-none focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            ثبت سالن
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/**
 * Sticky product header for `/` (directive §a "Biz landing"): logo +
 * tiny «بیز» badge, center anchors (the landing page owns the matching ids),
 * login + solid primary CTA, theme toggle.
 */
function BusinessHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-nav border-b border-border bg-elevated text-text">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4">
        <Link
          to="/"
          className={cn(
            'flex min-h-10 shrink-0 items-center gap-2 text-2xl font-extrabold text-text no-underline',
            'outline-none focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-focus',
          )}
        >
          <BrandLogo className="h-9" />
          <span className="rounded bg-ink px-1.5 py-0.5 text-2xs font-bold text-ink-contrast">
            بیز
          </span>
        </Link>
        <nav aria-label="ناوبری کسب‌وکار" className="hidden items-center gap-8 text-sm md:flex">
          <a
            href="#why"
            className="no-underline transition-colors duration-fast ease-standard hover:text-primary"
          >
            چرا آرا؟
          </a>
          <a
            href="#features"
            className="no-underline transition-colors duration-fast ease-standard hover:text-primary"
          >
            امکانات
          </a>
          <a
            href="#solutions"
            className="no-underline transition-colors duration-fast ease-standard hover:text-primary"
          >
            راهکارها
          </a>
          <a
            href="#pricing"
            className="no-underline transition-colors duration-fast ease-standard hover:text-primary"
          >
            قیمت‌گذاری
          </a>
        </nav>
        <div className="flex shrink-0 items-center gap-1 text-xs sm:gap-3 sm:text-sm">
          <Link
            to="/auth"
            className={cn(
              'inline-flex min-h-10 min-w-10 shrink-0 items-center gap-2 rounded-md px-2 py-2 font-semibold no-underline sm:px-3',
              'transition-colors duration-fast ease-standard hover:bg-surface',
              'outline-none focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
            aria-label={t('app.signIn')}
          >
            <LogIn className="h-4 w-4 rtl:-scale-x-100 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">{t('app.signIn')}</span>
          </Link>
          <ThemeToggle />
          <Link
            to="/business/register"
            className={cn(
              'rounded-md bg-primary px-3 py-2.5 font-semibold text-primary-contrast no-underline sm:px-4',
              'transition-opacity duration-fast ease-standard hover:opacity-90',
              'outline-none focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
            aria-label="رایگان امتحان کنید"
          >
            <span className="sm:hidden">شروع رایگان</span>
            <span className="hidden sm:inline">رایگان امتحان کنید</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/** One flat footer link (on-ink styling). */
function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-10 items-center rounded-sm px-1 text-sm text-ink-muted no-underline',
        'transition-colors duration-fast ease-standard hover:text-ink-contrast',
        'outline-none focus-visible:outline focus-visible:outline-2',
        'focus-visible:outline-offset-2 focus-visible:outline-focus',
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Thin dark two-row footer (directive §f) — deliberately quiet: one wrap-nav
 * of REAL links + the web-app entry, then wordmark + © line. It renders on the
 * `ink` band tokens so it stays a legible dark surface in BOTH themes (the old
 * `bg-text text-bg` inversion turned near-white in dark mode and every link
 * disappeared). No app-store badges (no native apps yet) and no dead social
 * placeholders.
 */
export function PublicFooter() {
  const { t } = useTranslation();
  const year = toPersianDigits(new Date().getFullYear());
  return (
    <footer className="bg-ink text-ink-contrast">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col gap-8 border-b border-ink-border py-10 md:flex-row md:items-center md:justify-between">
          <nav aria-label={t('app.footerNav.label')} className="flex flex-wrap gap-x-6 gap-y-3">
            <FooterLink to="/about">{t('app.footerNav.about')}</FooterLink>
            <FooterLink to="/contact">{t('app.footerNav.contact')}</FooterLink>
            <FooterLink to="/privacy">{t('app.footerNav.privacy')}</FooterLink>
            <FooterLink to="/terms">{t('app.footerNav.terms')}</FooterLink>
            <FooterLink to="/business/register">ثبت سالن</FooterLink>
          </nav>
          {/* Honest web-app entry — the native apps don't exist yet, so no
              store badges; the PWA login is the real destination. */}
          <Link
            to="/auth"
            className={cn(
              'inline-flex min-h-10 w-fit items-center rounded-md border border-ink-border px-4 py-2',
              'text-xs font-semibold text-ink-contrast no-underline',
              'transition-colors duration-fast ease-standard hover:bg-ink-contrast/10',
              'outline-none focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            ورود به پنل آرا
          </Link>
        </div>
        <div className="flex flex-col gap-5 py-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo inverse className="h-9" />
            <a
              referrerPolicy="origin"
              target="_blank"
              href={ENAMAD_LINK}
              aria-label="نماد اعتماد الکترونیکی آرا"
            >
              <img
                referrerPolicy="origin"
                src={ENAMAD_LOGO}
                alt=""
                style={{ cursor: 'pointer' }}
                code={ENAMAD_CODE}
              />
            </a>
          </div>
          <span className="text-sm text-ink-muted">© {year} آرا — همه حقوق محفوظ است.</span>
        </div>
      </div>
    </footer>
  );
}
