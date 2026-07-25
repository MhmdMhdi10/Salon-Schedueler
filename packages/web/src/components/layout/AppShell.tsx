import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { ThemeToggle } from '../theme/ThemeToggle';
import { HeaderAuthNav } from './HeaderAuthNav';
import { cn } from '../ui/cn';

/** Stable id the skip link targets and the `<main>` exposes. */
export const MAIN_CONTENT_ID = 'main-content';

export interface AppShellProps {
  /** Routed page content rendered inside the single `<main>` landmark. */
  children: React.ReactNode;
  /** Optional className applied to the outermost shell element. */
  className?: string;
}

/**
 * Application shell for the Salon Booking PWA (R3.1, R3.2, R3.5, R3.8).
 *
 * Wraps the routed pages in a consistent, accessible structure:
 *  - a skip-to-content link that is visually hidden until focused, jumping
 *    keyboard/AT users straight past the header to the main region;
 *  - a `<header>` with a `<nav>` landmark (brand wordmark → home) and the
 *    theme toggle;
 *  - a single `<main id="main-content">` content region (one per page, R3.8);
 *  - a `<footer>` with site/legal info.
 *
 * Layout is RTL-first: it uses only logical properties / direction-agnostic
 * fl/grid utilities (`px`, `gap`, `mx-auto`, `text-start`) so the same classes
 * are correct under `dir="rtl"`. It is responsive across the sm/md/lg/xl
 * breakpoints with a centered max-width container and no horizontal overflow at
 * 360px (the content container can shrink; nothing is pinned to a fixed width).
 *
 * The `dir="rtl"` / `lang="fa"` document contract lives on the wrapper in
 * `App.tsx` so it is preserved for the existing smoke tests.
 */
export function AppShell({ children, className }: AppShellProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const isBusiness = pathname === '/business';
  const isAuth = pathname === '/auth';
  const isOnboarding = pathname === '/business/register';
  const isStandalone = isAuth || isOnboarding;

  return (
    <div
      className={cn(
        'flex min-h-screen flex-col overflow-x-hidden text-text',
        isStandalone ? 'bg-surface' : 'bg-bg',
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

      {isStandalone ? null : isHome ? (
        <header className="absolute inset-x-0 top-0 z-nav w-full text-white">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-5">
            <nav aria-label={t('app.primaryNav')}>
              <Link
                to="/"
                aria-label="صفحه اصلی آرا"
                className="rounded-md text-2xl font-extrabold tracking-tight text-white no-underline"
              >
                آرا
              </Link>
            </nav>
            <div className="flex items-center gap-3 sm:gap-5">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span aria-hidden="true">🇮🇷</span>
                <span>ایران</span>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </span>
              <Link
                to="/business"
                className="rounded-md bg-elevated px-4 py-2.5 text-sm font-semibold text-text no-underline hover:opacity-90"
              >
                ثبت کسب‌وکار
              </Link>
            </div>
          </div>
        </header>
      ) : isBusiness ? (
        <header className="border-b border-border bg-elevated text-text">
          <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4">
            <Link
              to="/business"
              className="flex items-center gap-2 text-2xl font-extrabold text-text no-underline"
            >
              آرا <span className="rounded bg-text px-1.5 py-0.5 text-2xs text-bg">BIZ</span>
            </Link>
            <nav
              aria-label="ناوبری کسب‌وکار"
              className="hidden items-center gap-8 text-sm md:flex"
            >
              <a href="#why" className="no-underline">چرا آرا؟</a>
              <a href="#features" className="no-underline">امکانات</a>
              <a href="#solutions" className="no-underline">راهکارها</a>
              <a href="#pricing" className="no-underline">قیمت‌گذاری</a>
            </nav>
            <div className="flex items-center gap-3 text-sm">
              <Link to="/auth" className="hidden no-underline sm:inline-flex">ورود</Link>
              <Link
                to="/business/register"
                className="rounded-md bg-primary px-4 py-2.5 font-semibold text-primary-contrast no-underline"
              >
                رایگان امتحان کنید
              </Link>
            </div>
          </div>
        </header>
      ) : (
        <header className="sticky top-0 z-nav w-full border-b border-border bg-elevated text-text">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4">
            <nav aria-label={t('app.primaryNav')}>
              <Link
                to="/"
                aria-label="آرا"
                className="rounded-md text-2xl font-extrabold text-text no-underline"
              >
                آرا
              </Link>
            </nav>
            <div className="flex items-center gap-4 sm:gap-6">
              <HeaderAuthNav />
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span aria-hidden="true">🇮🇷</span>
                ایران
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </span>
              <ThemeToggle />
            </div>
          </div>
          <nav
            aria-label="دسته‌بندی خدمات"
            className="border-t border-black/5"
          >
            <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4 py-3 text-sm font-medium [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                ['آرایش مو', 'hair'],
                ['آرایشگاه مردانه', 'barber'],
                ['ناخن', 'nails'],
                ['مراقبت پوست', 'skin'],
                ['ابرو و مژه', 'brows'],
                ['ماساژ', 'massage'],
                ['میکاپ', 'makeup'],
                ['سلامت و اسپا', 'spa'],
              ].map(([label, slug]) => (
                <Link
                  key={slug}
                  to={`/services/${slug}`}
                  className="shrink-0 whitespace-nowrap no-underline hover:text-primary"
                >
                  {label}
                </Link>
              ))}
              <Link
                to="/services/all"
                className="shrink-0 whitespace-nowrap text-muted no-underline hover:text-primary"
              >
                بیشتر...
              </Link>
            </div>
          </nav>
        </header>
      )}

      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className={cn(
          'w-full flex-1',
          'max-w-none p-0',
        )}
      >
        {children}
      </main>

      {isStandalone ? null : <PublicFooter />}
    </div>
  );
}

export default AppShell;

function PublicFooter() {
  return (
    <footer className="bg-text text-bg">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col gap-8 border-b border-white/10 py-10 md:flex-row md:items-center md:justify-between">
          <nav aria-label="پیوندهای پایین صفحه" className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <Link to="/about" className="text-white/80 no-underline hover:text-white">درباره ما</Link>
            <Link to="/contact" className="text-white/80 no-underline hover:text-white">تماس</Link>
            <Link to="/privacy" className="text-white/80 no-underline hover:text-white">حریم خصوصی</Link>
            <Link to="/terms" className="text-white/80 no-underline hover:text-white">شرایط استفاده</Link>
            <Link to="/business" className="text-white/80 no-underline hover:text-white">آرا بیز</Link>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#download" className="rounded-md border border-white/40 px-4 py-2 text-xs font-semibold text-white no-underline">دریافت از سیب‌اپ</a>
            <a href="#download" className="rounded-md border border-white/40 px-4 py-2 text-xs font-semibold text-white no-underline">دریافت از گوگل‌پلی</a>
          </div>
        </div>
        <div className="flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4 text-white/70">
            <span className="text-xl font-extrabold text-white">آرا</span>
            <span className="text-sm">© {new Date().getFullYear()} آرا. همه حقوق محفوظ است.</span>
          </div>
          <div className="flex gap-3 text-sm text-white/70">
            <span>اینستاگرام</span>
            <span>لینکدین</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
