import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, ContactRound, Megaphone, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OwnerRole } from '../../api/client';
import { cn } from '../ui/cn';

import './owner-bottom-tabs.css';

interface TabDef {
  key: string;
  labelKey: string;
  to: string;
  icon: LucideIcon;
  roles: readonly OwnerRole[];
}

/**
 * The owner panel's four mobile destinations.
 *
 * The profile route is a first-class destination, like a native salon app:
 * identity and account tools are no longer hidden behind a generic overflow
 * control.
 */
const TABS: readonly TabDef[] = [
  {
    key: 'calendar',
    labelKey: 'owner.nav.calendar',
    to: '/owner/calendar',
    icon: CalendarDays,
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    key: 'clients',
    labelKey: 'owner.nav.clients',
    to: '/owner/clients',
    icon: ContactRound,
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    key: 'marketing',
    labelKey: 'owner.nav.marketing',
    to: '/owner/marketing',
    icon: Megaphone,
    roles: ['Owner', 'Admin'],
  },
  {
    key: 'profile',
    labelKey: 'owner.nav.profile',
    to: '/owner/profile',
    icon: UserRound,
    roles: ['Owner', 'Admin', 'Stylist'],
  },
] as const;

export interface OwnerBottomTabsProps {
  /** Optional className applied to the outermost nav element. */
  className?: string;
  /** Authenticated role used to hide unauthorized destinations. */
  role?: OwnerRole;
}

/**
 * Fixed mobile navigation for the owner panel.
 *
 * Calendar, clients, marketing and profile are explicit destinations. The
 * profile icon opens a real profile screen, where secondary salon tools are
 * grouped by job instead of being presented as an anonymous "more" menu.
 *
 * Accessibility: nav landmark with Persian aria-label, aria-current on the
 * active tab, visible Persian labels, and touch targets ≥ 56×44px.
 * Safe-area: respects env(safe-area-inset-bottom).
 */
export function OwnerBottomTabs({ className, role = 'Owner' }: OwnerBottomTabsProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const prefersReduced = useReducedMotion();
  const visibleTabs = TABS.filter((tab) => tab.roles.includes(role));
  const activeIndex = visibleTabs.findIndex((tab) => pathname.startsWith(tab.to));

  return (
    <nav
      aria-label={t('owner.tabBar')}
      data-testid="owner-bottom-tabs"
      className={cn(
        'owner-bottom-tabs fixed z-nav',
        'pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      <ul className="relative z-[1] mx-auto flex w-full max-w-container items-stretch justify-around px-1 py-0">
        {visibleTabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = index === activeIndex;

          return (
            <li key={tab.key} className="relative flex-1">
              <NavLink
                to={tab.to}
                aria-current={isActive ? 'page' : undefined}
                aria-label={t(tab.labelKey)}
                data-testid={tab.key === 'profile' ? 'owner-profile-trigger' : undefined}
                className={cn(
                  'relative flex min-h-[64px] w-full flex-col items-center justify-center gap-1 rounded-[22px]',
                  'px-1 py-1 outline-none',
                  'focus-visible:outline focus-visible:outline-2',
                  'focus-visible:-outline-offset-2 focus-visible:outline-focus',
                  'transition-colors active:scale-[0.98]',
                  isActive ? 'font-bold text-primary' : 'text-muted',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="owner-tab-indicator"
                    className="owner-bottom-tabs__indicator absolute inset-1 rounded-[20px] bg-primary/10"
                    transition={
                      prefersReduced
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 500, damping: 35 }
                    }
                    aria-hidden="true"
                  />
                )}
                <Icon className="relative z-[1] h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="owner-bottom-tabs__label relative z-[1]">
                  {t(tab.labelKey)}
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default OwnerBottomTabs;
