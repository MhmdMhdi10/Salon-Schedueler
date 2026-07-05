import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../theme';
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

  return (
    <div
      className={cn(
        'flex min-h-screen flex-col overflow-x-hidden bg-bg text-text',
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

      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-container items-center justify-between gap-4 px-4 py-3">
          <nav aria-label={t('app.primaryNav')}>
            <Link
              to="/"
              className="rounded-md text-md font-bold text-text no-underline"
            >
              {t('app.title')}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <HeaderAuthNav />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-container flex-1 px-4 py-5"
      >
        {children}
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-container px-4 py-4 text-xs text-muted">
          {t('app.footer', { year: new Date().getFullYear() })}
        </div>
      </footer>
    </div>
  );
}

export default AppShell;
