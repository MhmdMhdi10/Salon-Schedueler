import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import {
  Calendar,
  BarChart3,
  Settings,
  CreditCard,
  QrCode,
  LogOut,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { OwnerThemeToggle } from '../theme/OwnerThemeToggle';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { OwnerSidebar } from '../owner/OwnerSidebar';
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
 * Dark-mode-first: defaults to 'dark' when no stored value exists, independent
 * of the main app theme stored under 'salon-theme'.
 */
export const OWNER_THEME_STORAGE_KEY = 'owner-theme';

/**
 * Reads the persisted owner theme preference from localStorage.
 * Defaults to 'dark' (dark-mode-first NYC SaaS aesthetic).
 */
function getOwnerTheme(): Theme {
  try {
    const stored = localStorage.getItem(OWNER_THEME_STORAGE_KEY);
    return stored === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
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

/** A single owner-panel navigation destination. */
export interface OwnerNavItem {
  /** i18n key under `owner.nav.*` for the visible label. */
  labelKey: string;
  to: string;
  icon: LucideIcon;
  /** Roles allowed to see this destination. */
  roles: readonly OwnerRole[];
}

/**
 * Owner-panel destinations (R2.4, R2.6, R2.7, R2.8). The full management
 * surfaces — calendar, analytics, configuration, subscription, QR/standee — are
 * reserved for `Owner`/`Admin`; a `Stylist` only sees their own appointments
 * (R2.5). The actual page bodies arrive in tasks 5.2–5.4; this list drives both
 * the desktop side nav and the mobile bottom tab bar so the two stay in sync.
 */
export const OWNER_NAV: readonly OwnerNavItem[] = [
  {
    labelKey: 'owner.nav.calendar',
    to: '/owner/calendar',
    icon: Calendar,
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    labelKey: 'owner.nav.analytics',
    to: '/owner/analytics',
    icon: BarChart3,
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.configuration',
    to: '/owner/config',
    icon: Settings,
    roles: ['Owner'],
  },
  {
    labelKey: 'owner.nav.subscription',
    to: '/owner/subscription',
    icon: CreditCard,
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.qr',
    to: '/owner/qr',
    icon: QrCode,
    roles: ['Owner', 'Admin'],
  },
  {
    labelKey: 'owner.nav.myQr',
    to: '/owner/my-qr',
    icon: Share2,
    roles: ['Owner', 'Admin', 'Stylist'],
  },
] as const;

/** Returns the nav destinations a given role may see. */
export function ownerNavForRole(role: OwnerRole): OwnerNavItem[] {
  return OWNER_NAV.filter((item) => item.roles.includes(role));
}

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
 * Defaults to `false` (expanded) when no stored value exists.
 */
function getPersistedCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === 'true';
  } catch {
    return false;
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
  onSignOut,
  className,
}: OwnerShellProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Owner-specific theme state — dark-mode-first (Req 8.1, Task 7.7)
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

  // Map the OwnerRole (capitalized) to the sidebar's lowercase role type
  const sidebarRole = role.toLowerCase() as 'owner' | 'admin' | 'stylist';

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
    <div
      data-shell="owner"
      data-theme={ownerTheme}
      className={cn(
        'flex min-h-screen flex-col overflow-x-hidden bg-bg text-text',
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
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-container items-center justify-between gap-4 px-4 py-3">
          <Link
            to="/owner"
            className="rounded-md text-md font-bold text-text no-underline"
          >
            {salonName || t('owner.title')}
          </Link>
          <div className="flex items-center gap-2">
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

      {/* Content area: sidebar (desktop) + main */}
      <div className="flex flex-1">
        {/* Desktop sidebar — visible only on lg+ */}
        {isDesktop && (
          <OwnerSidebar
            collapsed={collapsed}
            onToggle={handleToggleSidebar}
            activeRoute={pathname}
            role={sidebarRole}
          />
        )}

        {/* Main content area */}
        <main
          id={OWNER_CONTENT_ID}
          tabIndex={-1}
          className={cn(
            'min-w-0 flex-1 px-4 py-5',
            // Cap the content column on desktop so wide pages (calendar, QR)
            // don't stretch to the full viewport and look consistent with the
            // narrower pages (config). Full-width on mobile.
            isDesktop && 'mx-auto w-full max-w-5xl',
            // On mobile, add bottom padding to clear the fixed bottom tabs
            !isDesktop &&
              'pb-[calc(var(--space-10)+env(safe-area-inset-bottom)+12px)]',
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom tabs — visible only below lg */}
      {!isDesktop && <OwnerBottomTabs />}
    </div>
  );
}

export default OwnerShell;
