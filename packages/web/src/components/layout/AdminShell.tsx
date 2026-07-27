import { useTranslation } from 'react-i18next';
import { NavLink, Link } from 'react-router-dom';
import { Calendar, BarChart3, Settings, type LucideIcon } from 'lucide-react';
import { ThemeToggle } from '../theme';
import { cn } from '../ui/cn';

/** Stable id the admin `<main>` exposes (skip-link target / focus). */
export const ADMIN_CONTENT_ID = 'admin-content';

/** A single crumb in the admin breadcrumb trail. */
export interface AdminBreadcrumb {
  /** Visible label (already localized by the caller, or a copy string). */
  label: string;
  /** Optional route; the last crumb is usually the current page (no link). */
  to?: string;
}

interface AdminNavItem {
  /** i18n key under `admin.*` for the visible label. */
  labelKey: string;
  to: string;
  icon: LucideIcon;
}

/**
 * Primary admin destinations (ui-ux §8): Calendar, Analytics, Configuration.
 * The same list drives the desktop side nav and the mobile bottom tab bar so
 * the two stay in sync.
 */
const ADMIN_NAV: readonly AdminNavItem[] = [
  { labelKey: 'admin.calendar', to: '/admin/calendar', icon: Calendar },
  { labelKey: 'admin.analytics', to: '/admin/analytics', icon: BarChart3 },
  { labelKey: 'admin.configuration', to: '/admin/config', icon: Settings },
] as const;

export interface AdminShellProps {
  /** Routed admin page content rendered inside the single `<main>`. */
  children: React.ReactNode;
  /**
   * Breadcrumb trail shown on desktop (ui-ux §8). The salon/dashboard root is
   * prepended automatically, so callers pass only the section-specific crumbs.
   */
  breadcrumbs?: AdminBreadcrumb[];
  /** Optional className applied to the outermost shell element. */
  className?: string;
}

/**
 * Admin **shell** (R3.1, R3.2, R3.6; ui-ux §8).
 *
 * Structurally and visually distinct from the customer funnel: where the funnel
 * is a minimal, single-column, CTA-driven flow, the admin is a capable tool with
 * persistent navigation and wayfinding:
 *
 *  - a **side navigation** (Configuration / Calendar / Analytics) on desktop
 *    (`lg+`), promoted to a top-of-content **breadcrumb** trail for hierarchy;
 *  - a **bottom tab bar** (تقویم · آمار · تنظیمات) on mobile, in the thumb zone
 *    and clearing the safe-area inset;
 *  - the standard skip-to-content link, a single `<main>`, and the theme toggle.
 *
 * Layout is RTL-first (logical properties only); the active route is marked with
 * `aria-current="page"` for AT. The bottom tab bar is hidden on `lg+` and the
 * side nav hidden below it, so exactly one navigation surface shows per
 * breakpoint with no horizontal overflow at 360px.
 */
export function AdminShell({ children, breadcrumbs, className }: AdminShellProps) {
  const { t } = useTranslation();

  return (
    <div
      data-shell="admin"
      className={cn('flex min-h-screen flex-col overflow-x-hidden bg-bg text-text', className)}
    >
      <a
        href={`#${ADMIN_CONTENT_ID}`}
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
          <Link
            to="/admin/calendar"
            className="rounded-md text-md font-bold text-text no-underline"
          >
            {t('app.title')}
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-container flex-1">
        {/* Desktop side navigation (lg+). Hidden on mobile, where the bottom
            tab bar takes over. */}
        <nav
          aria-label={t('admin.nav')}
          className="hidden w-56 shrink-0 border-e border-border bg-surface px-3 py-5 lg:block"
        >
          <ul className="flex flex-col gap-1">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline',
                        'outline-none focus-visible:outline focus-visible:outline-2',
                        'focus-visible:outline-offset-2 focus-visible:outline-focus',
                        isActive
                          ? 'bg-primary font-bold text-primary-contrast'
                          : 'text-text hover:bg-elevated',
                      )
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{t(item.labelKey)}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <main
          id={ADMIN_CONTENT_ID}
          tabIndex={-1}
          className={cn(
            'min-w-0 flex-1 px-4 py-5',
            // Reserve room for the mobile bottom tab bar so it never covers
            // page content; the bar is hidden on lg+ where padding is dropped.
            'pb-[calc(var(--space-10)+env(safe-area-inset-bottom))] lg:pb-5',
          )}
        >
          {/* Desktop breadcrumbs (ui-ux §8). Hidden on mobile to save space. */}
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <nav aria-label={t('admin.breadcrumb')} className="mb-4 hidden lg:block">
              <ol className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <li>
                  <Link to="/admin/calendar" className="text-muted no-underline hover:text-text">
                    {t('admin.home')}
                  </Link>
                </li>
                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <li key={crumb.label} className="flex items-center gap-2">
                      {/* Logical separator; flips with direction via the glyph. */}
                      <span aria-hidden="true">›</span>
                      {crumb.to && !isLast ? (
                        <Link to={crumb.to} className="text-muted no-underline hover:text-text">
                          {crumb.label}
                        </Link>
                      ) : (
                        <span
                          className="font-medium text-text"
                          aria-current={isLast ? 'page' : undefined}
                        >
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : null}

          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar (lg-hidden), clearing the safe-area inset. */}
      <nav
        aria-label={t('admin.tabBar')}
        data-testid="admin-tab-bar"
        className={cn(
          'sticky bottom-0 z-nav border-t border-border bg-surface lg:hidden',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="mx-auto flex w-full max-w-container items-stretch justify-around">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[44px] flex-col items-center justify-center gap-1 px-2 py-2 text-2xs no-underline',
                      'outline-none focus-visible:outline focus-visible:outline-2',
                      'focus-visible:-outline-offset-2 focus-visible:outline-focus',
                      isActive ? 'font-bold text-primary' : 'text-muted',
                    )
                  }
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export default AdminShell;
