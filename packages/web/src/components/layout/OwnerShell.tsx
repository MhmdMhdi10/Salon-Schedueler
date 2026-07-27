import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { OwnerThemeToggle } from '../theme/OwnerThemeToggle';
import { ThemeScope } from '../theme';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { OwnerSidebar } from '../owner/OwnerSidebar';
import { OwnerInboxBell } from '../owner/OwnerInboxBell';
import { OWNER_NAV, ownerNavForRole, type OwnerNavItem } from '../owner/ownerNav';
import { OwnerBottomTabs } from './OwnerBottomTabs';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { OwnerRole } from '../../api/client';
import type { Theme } from '../theme';

/** Stable id the owner `<main>` exposes (skip-link target / focus). */
export const OWNER_CONTENT_ID = 'owner-content';

/** localStorage key for sidebar collapsed state. */
const SIDEBAR_COLLAPSED_KEY = 'owner-sidebar-collapsed';

/**
 * Separate localStorage key for the owner panel theme preference (Req 8.1).
 * Defaults to Booksy's light workspace when no stored value exists, independent
 * of the main app theme stored under 'salon-theme'.
 */
export const OWNER_THEME_STORAGE_KEY = 'owner-theme';

/**
 * Reads the persisted owner theme preference from localStorage.
 * Defaults to light to match Booksy's management workspace.
 */
function getOwnerTheme(): Theme {
  try {
    const stored = localStorage.getItem(OWNER_THEME_STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Persists the owner theme preference to localStorage.
 */
function setOwnerThemeStorage(theme: Theme): void {
  try {
    localStorage.setItem(OWNER_THEME_STORAGE_KEY, theme);
  } catch {
    // Silent — localStorage unavailable
  }
}

/**
 * Keep `<meta name="theme-color">` in sync with the currently applied theme so
 * the PWA chrome matches the owner workspace (ui-ux §2). Mirrors the app-wide
 * ThemeProvider helper: prefer the live `--color-bg` token, no hardcoded hex.
 */
function syncMetaThemeColor(): void {
  if (typeof document === 'undefined') return;
  const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const tokenBg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
  if (tokenBg) meta.setAttribute('content', tokenBg);
}

// The nav definition lives in `components/owner/ownerNav.ts` (the single
// source of truth for sidebar + bottom tabs); re-exported here so existing
// imports of `OWNER_NAV`/`ownerNavForRole` from the shell keep working.
export { OWNER_NAV, ownerNavForRole };
export type { OwnerNavItem };

export interface OwnerShellProps {
  /** Routed owner page content rendered inside the single `<main>`. */
  children: React.ReactNode;
  /** The authenticated role; drives which nav destinations are visible (RBAC). */
  role: OwnerRole;
  /** Salon display name shown in the header (falls back to the app title). */
  salonName?: string;
  /** Sign-out handler — clears tokens and returns the user to the login surface. */
  onSignOut: () => void;
  /** Optional className applied to the outermost shell element. */
  className?: string;
}

/**
 * Reads the persisted sidebar collapsed state from localStorage.
 * Defaults to `true` (compact rail) when no stored value exists.
 */
function getPersistedCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored == null ? true : stored === 'true';
  } catch {
    return true;
  }
}

/**
 * Owner panel **shell** (R2.1, R2.3, R2.9, R2.10; Req 8.5; Task 7.3).
 *
 * Responsive layout wrapper for all `/owner/*` routes:
 *
 * - **Desktop (lg+):** header + collapsible `OwnerSidebar` alongside the content
 *   area in a horizontal flex layout. The sidebar collapsed state is persisted
 *   to localStorage.
 * - **Mobile (<lg):** header + content area + fixed `OwnerBottomTabs` at the
 *   bottom. Content has bottom padding to clear the tab bar.
 *
 * Both navigation components are role-filtered (RBAC). The shell retains:
 * - Skip-to-content link
 * - `<header>` with salon name, theme toggle, sign-out
 * - Single `<main>` landmark
 * - `data-shell="owner"` marker
 *
 * Layout uses tokens-only styling, logical properties for RTL correctness,
 * and env(safe-area-inset-bottom) for bottom tab bar on mobile.
 */
export function OwnerShell({ children, role, salonName, onSignOut, className }: OwnerShellProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Owner-specific theme state — light workspace by default.
  const [ownerTheme, setOwnerTheme] = useState<Theme>(getOwnerTheme);

  const toggleOwnerTheme = useCallback(() => {
    setOwnerTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      setOwnerThemeStorage(next);
      return next;
    });
  }, []);

  // Sync owner theme from localStorage on multi-tab
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === OWNER_THEME_STORAGE_KEY) {
        setOwnerTheme(e.newValue === 'light' ? 'light' : 'dark');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // The owner-scoped theme must also win over the *document* theme: tokens.css
  // defines light on `:root` and dark under `[data-theme='dark']` only, so a
  // nested light wrapper can never override an app-dark `<html>` (the panel
  // would render dark while the toggle claims light), and Radix portals mount
  // on `document.body` — outside any wrapper. While /owner/* is mounted we
  // therefore stamp the owner theme on the document root (restoring the app
  // theme on unmount) and keep the PWA `theme-color` chrome in sync. The
  // ThemeScope below additionally carries the theme to scoped portal content.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    root.setAttribute('data-theme', ownerTheme);
    syncMetaThemeColor();
    return () => {
      if (previous === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previous);
      syncMetaThemeColor();
    };
  }, [ownerTheme]);

  // Sidebar collapsed state — persisted to localStorage
  const [collapsed, setCollapsed] = useState(getPersistedCollapsed);

  // Persist collapsed state whenever it changes
  const handleToggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Silent — localStorage unavailable (e.g. private mode quota)
      }
      return next;
    });
  }, []);

  // Sync collapsed state from localStorage on mount (handles multi-tab)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SIDEBAR_COLLAPSED_KEY) {
        setCollapsed(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <ThemeScope
      theme={ownerTheme}
      data-shell="owner"
      className={cn(
        // Booksy Biz app frame: the shell never page-scrolls — panes scroll
        // internally (design directive §h.1).
        'flex h-screen flex-col overflow-hidden bg-bg text-text',
        className,
      )}
    >
      {/* Skip to content link */}
      <a
        href={`#${OWNER_CONTENT_ID}`}
        className={cn(
          'sr-only z-nav rounded-md bg-primary px-4 py-2 text-primary-contrast',
          'focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2',
          'focus-visible:start-2',
        )}
      >
        {t('app.skipToContent')}
      </a>

      {/* Header */}
      <header className="shrink-0 border-b border-border bg-surface">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-3">
          <Link to="/owner" className="rounded-md text-md font-bold text-text no-underline">
            {salonName || t('owner.title')}
          </Link>
          <div className="flex items-center gap-2">
            <OwnerInboxBell />
            <OwnerThemeToggle theme={ownerTheme} onToggle={toggleOwnerTheme} />
            <Button
              variant="ghost"
              size="md"
              startIcon={<LogOut className="h-4 w-4 rtl:-scale-x-100" />}
              onClick={onSignOut}
              data-testid="owner-sign-out"
            >
              {t('owner.signOut')}
            </Button>
          </div>
        </div>
      </header>

      {/* Content area: sidebar (desktop) + main — panes scroll internally */}
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar — visible only on lg+ */}
        {isDesktop && (
          <OwnerSidebar
            collapsed={collapsed}
            onToggle={handleToggleSidebar}
            activeRoute={pathname}
            role={role}
          />
        )}

        {/* Main content area — the single scrolling pane of the app frame */}
        <main
          id={OWNER_CONTENT_ID}
          tabIndex={-1}
          className={cn(
            'min-w-0 flex-1 overflow-y-auto px-4 py-5',
            isDesktop && 'w-full',
            // On mobile, add bottom padding to clear the fixed bottom tabs
            !isDesktop && 'pb-[calc(var(--space-10)+env(safe-area-inset-bottom)+12px)]',
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs — visible only below lg */}
      {!isDesktop && <OwnerBottomTabs role={role} />}
    </ThemeScope>
  );
}

export default OwnerShell;
