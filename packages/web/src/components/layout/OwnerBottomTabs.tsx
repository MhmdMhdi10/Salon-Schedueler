import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, BarChart3, QrCode, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OwnerRole } from '../../api/client';
import { cn } from '../ui/cn';

// ─── Tab Definitions ─────────────────────────────────────────────────────────

interface TabDef {
  key: string;
  labelKey: string;
  to: string;
  icon: LucideIcon;
  roles: readonly OwnerRole[];
}

/**
 * The four primary owner tabs shown in the mobile bottom bar.
 * Order: Calendar → Analytics → QR/Link → Settings.
 */
const TABS: readonly TabDef[] = [
  { key: 'calendar', labelKey: 'owner.nav.calendar', to: '/owner/calendar', icon: CalendarDays, roles: ['Owner', 'Admin', 'Stylist'] },
  { key: 'analytics', labelKey: 'owner.nav.analytics', to: '/owner/analytics', icon: BarChart3, roles: ['Owner', 'Admin'] },
  { key: 'qr', labelKey: 'owner.nav.qr', to: '/owner/qr', icon: QrCode, roles: ['Owner', 'Admin'] },
  { key: 'config', labelKey: 'owner.nav.configuration', to: '/owner/config', icon: Settings, roles: ['Owner'] },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export interface OwnerBottomTabsProps {
  /** Optional className applied to the outermost nav element. */
  className?: string;
  /** Authenticated role used to hide unauthorized destinations. */
  role?: OwnerRole;
}

/**
 * Mobile bottom tab bar for the owner dashboard (Req 8.5, 8.6, 10.6).
 *
 * Renders a fixed bottom nav with 3 tabs (Calendar, Analytics, Settings),
 * each with a Lucide icon and Persian label. An animated brand indicator
 * slides between tabs using Framer Motion `layoutId`. The indicator motion
 * respects `prefers-reduced-motion` — when reduced motion is preferred, the
 * indicator jumps instantly rather than animating.
 *
 * Accessibility: `<nav>` landmark with Persian aria-label, `aria-current="page"`
 * on the active tab, all touch targets ≥ 44×44px.
 *
 * Safe-area: respects `env(safe-area-inset-bottom)` for phones with home
 * indicators.
 *
 * Styling: tokens-only, logical properties for RTL correctness.
 */
export function OwnerBottomTabs({ className, role = 'Owner' }: OwnerBottomTabsProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const prefersReduced = useReducedMotion();

  /** Determine which tab is active based on the current route. */
  const visibleTabs = TABS.filter((tab) => tab.roles.includes(role));
  const activeIndex = visibleTabs.findIndex((tab) => pathname.startsWith(tab.to));

  return (
    <nav
      aria-label={t('owner.tabBar')}
      data-testid="owner-bottom-tabs"
      className={cn(
        'fixed inset-x-0 bottom-0 z-nav border-t border-border bg-surface',
        'pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      <ul className="relative mx-auto flex w-full max-w-container items-stretch justify-around">
        {visibleTabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = index === activeIndex;

          return (
            <li key={tab.key} className="relative flex-1">
              <NavLink
                to={tab.to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[44px] w-full flex-col items-center justify-center gap-1',
                  'px-2 py-2 outline-none',
                  'focus-visible:outline focus-visible:outline-2',
                  'focus-visible:-outline-offset-2 focus-visible:outline-focus',
                  'transition-colors',
                  isActive ? 'text-primary font-bold' : 'text-text-muted',
                )}
              >
                {/* Animated active indicator — slides between tabs */}
                {isActive && (
                  <motion.span
                    layoutId="owner-tab-indicator"
                    className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-primary"
                    transition={
                      prefersReduced
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 500, damping: 35 }
                    }
                    aria-hidden="true"
                  />
                )}
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="text-2xs leading-tight">{t(tab.labelKey)}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default OwnerBottomTabs;
