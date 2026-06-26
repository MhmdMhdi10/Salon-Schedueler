import { useTranslation } from 'react-i18next';
import { NavLink, Link } from 'react-router-dom';
import {
  Calendar,
  BarChart3,
  Settings,
  CreditCard,
  QrCode,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from '../theme';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import type { OwnerRole } from '../../api/client';

/** Stable id the owner `<main>` exposes (skip-link target / focus). */
export const OWNER_CONTENT_ID = 'owner-content';

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
 * Owner panel **shell** (R2.1, R2.3, R2.9, R2.10; ui-ux §5/§8/§10).
 *
 * The desktop-first management surface for salon owners. Structurally it mirrors
 * the admin tool shell but is scoped to the `/owner/*` area and adds the
 * panel-level chrome the spec calls for:
 *
 *  - a `<header>` with the **salon name**, the **theme toggle**, and a
 *    **sign-out** control;
 *  - a **side navigation** (`lg+`) and a **bottom tab bar** (mobile) whose
 *    destinations are filtered by the authenticated **role** (RBAC, R2.3–R2.6);
 *  - the standard skip-to-content link and a single `<main>` landmark.
 *
 * Layout is RTL-first (logical properties only) and token-driven; the active
 * route is marked with `aria-current="page"`. The `dir="rtl"`/`lang="fa"`
 * document contract lives on the app root wrapper in `App.tsx` (R2.9).
 */
export function OwnerShell({
  children,
  role,
  salonName,
  onSignOut,
  className,
}: OwnerShellProps) {
  const { t } = useTranslation();
  const nav = ownerNavForRole(role);

  return (
    <div
      data-shell="owner"
      className={cn(
        'flex min-h-screen flex-col overflow-x-hidden bg-bg text-text',
        className,
      )}
    >
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

      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-container items-center justify-between gap-4 px-4 py-3">
          <Link
            to="/owner"
            className="rounded-md text-md font-bold text-text no-underline"
          >
            {salonName || t('owner.title')}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
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

      <div className="mx-auto flex w-full max-w-container flex-1">
        {/* Desktop side navigation (lg+); the bottom tab bar takes over on mobile. */}
        <nav
          aria-label={t('owner.nav.label')}
          className="hidden w-56 shrink-0 border-e border-border bg-surface px-3 py-5 lg:block"
        >
          <ul className="flex flex-col gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/owner'}
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
          id={OWNER_CONTENT_ID}
          tabIndex={-1}
          className={cn(
            'min-w-0 flex-1 px-4 py-5',
            'pb-[calc(var(--space-10)+env(safe-area-inset-bottom))] lg:pb-5',
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar (lg-hidden), clearing the safe-area inset. */}
      <nav
        aria-label={t('owner.tabBar')}
        data-testid="owner-tab-bar"
        className={cn(
          'sticky bottom-0 z-nav border-t border-border bg-surface lg:hidden',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="mx-auto flex w-full max-w-container items-stretch justify-around">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  end={item.to === '/owner'}
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

export default OwnerShell;
