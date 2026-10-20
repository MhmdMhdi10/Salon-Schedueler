import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { OwnerThemeToggle } from '../theme/OwnerThemeToggle';
import { THEME_STORAGE_KEY, ThemeScope, useTheme } from '../theme';
import { cn } from '../ui/cn';
import { OwnerSidebar } from '../owner/OwnerSidebar';
import { OwnerSetupAlert } from '../owner/OwnerSetupAlert';
import { OWNER_NAV, ownerNavForRole, type OwnerNavItem } from '../owner/ownerNav';
import { OwnerBottomTabs } from './OwnerBottomTabs';
import { PanelHeader } from './PanelHeader';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { OwnerRole } from '../../api/client';

import './owner-shell.css';

/** Stable id the owner `<main>` exposes (skip-link target / focus). */
export const OWNER_CONTENT_ID = 'owner-content';

/** localStorage key for sidebar collapsed state. */
const SIDEBAR_COLLAPSED_KEY = 'owner-sidebar-collapsed';
const ownerRouteScrollPositions = new Map<string, number>();

/** Kept as a compatibility export; owner and public surfaces now share one theme. */
export const OWNER_THEME_STORAGE_KEY = THEME_STORAGE_KEY;

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
  /** Authenticated salon id; enables persistent booking-readiness checks. */
  salonId?: string;
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
export function OwnerShell({
  children,
  role,
  salonName,
  salonId,
  onSignOut,
  className,
}: OwnerShellProps) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const { pathname } = location;
  const routeKey = `${location.pathname}${location.search}`;
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const contentRef = useRef<HTMLElement | null>(null);
  const restoringScrollRef = useRef(false);

  const handleContentScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      if (!restoringScrollRef.current) {
        ownerRouteScrollPositions.set(routeKey, event.currentTarget.scrollTop);
      }
    },
    [routeKey],
  );

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

  useLayoutEffect(() => {
    const target = contentRef.current;
    if (!target) return;
    const savedTop = ownerRouteScrollPositions.get(routeKey) ?? 0;
    restoringScrollRef.current = true;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(restore);
    function restore() {
      if (!restoringScrollRef.current) return;
      target!.scrollLeft = 0;
      target!.scrollTop = savedTop;
      if (target!.scrollTop >= savedTop - 1) {
        restoringScrollRef.current = false;
        observer?.disconnect();
      }
    }
    restore();
    if (restoringScrollRef.current && target.firstElementChild) observer?.observe(target.firstElementChild);
    const frame = window.requestAnimationFrame(restore);
    const cancelRestore = () => {
      restoringScrollRef.current = false;
      observer?.disconnect();
    };
    target.addEventListener('touchstart', cancelRestore, { passive: true });
    target.addEventListener('wheel', cancelRestore, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      target.removeEventListener('touchstart', cancelRestore);
      target.removeEventListener('wheel', cancelRestore);
    };
  }, [pathname, routeKey, isDesktop]);

  return (
    <ThemeScope
      theme={theme}
      data-shell="owner"
      className={cn(
        'flex h-screen h-[100dvh] min-h-0 flex-col overflow-hidden bg-bg text-text',
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

      <PanelHeader
        surface="owner"
        brandLabel={salonName || t('owner.title')}
        themeControl={<OwnerThemeToggle theme={theme} onToggle={toggleTheme} />}
        onSignOut={() => { ownerRouteScrollPositions.clear(); onSignOut(); }}
      />

      {/* The pane below the header owns scrolling on every screen size. */}
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
          ref={contentRef}
          id={OWNER_CONTENT_ID}
          dir="rtl"
          tabIndex={0}
          onScroll={handleContentScroll}
          className={cn(
            'min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 sm:py-5',
            isDesktop && 'w-full',
            // On mobile, reserve the rendered tab bar plus a generous breathing
            // room so the last card and its actions scroll completely above fixed nav.
            !isDesktop && 'pb-[calc(8rem+env(safe-area-inset-bottom))]',
          )}
        >
          <div className="min-w-0 w-full">
            {(role === 'Owner' || role === 'Admin') && salonId && (
              <OwnerSetupAlert salonId={salonId} refreshKey={pathname} />
            )}
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tabs — visible only below lg */}
      {!isDesktop && <OwnerBottomTabs role={role} />}
    </ThemeScope>
  );
}

export default OwnerShell;
