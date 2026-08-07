import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import { CalendarDays, BarChart3, MoreHorizontal, QrCode, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OwnerRole } from '../../api/client';
import { cn } from '../ui/cn';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/Sheet';
import { ownerNavForRole } from '../owner/ownerNav';

// ─── Tab Definitions ─────────────────────────────────────────────────────────

interface TabDef {
  key: string;
  labelKey: string;
  mobileLabelKey?: string;
  to: string;
  icon: LucideIcon;
  roles: readonly OwnerRole[];
}

/**
 * The four primary owner tabs shown in the mobile bottom bar.
 * Order: Calendar → Analytics → QR/Link → Settings.
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
    key: 'analytics',
    labelKey: 'owner.nav.analytics',
    to: '/owner/analytics',
    icon: BarChart3,
    roles: ['Owner', 'Admin'],
  },
  { key: 'qr', labelKey: 'owner.nav.qr', to: '/owner/qr', icon: QrCode, roles: ['Owner', 'Admin'] },
  {
    key: 'config',
    labelKey: 'owner.nav.configuration',
    mobileLabelKey: 'owner.nav.configurationShort',
    to: '/owner/config',
    icon: Settings,
    roles: ['Owner'],
  },
] as const;

const PRIMARY_TAB_ROUTES = new Set(TABS.map((tab) => tab.to));

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
 * Renders a fixed bottom nav with four primary tabs and a «بیشتر» overflow
 * sheet for secondary destinations. Each item has a Lucide icon and Persian
 * label. An animated brand indicator slides between primary tabs using Framer
 * Motion `layoutId`; reduced-motion users get an instant indicator.
 *
 * Accessibility: `<nav>` landmark with Persian aria-label, `aria-current="page"`
 * on the active tab, all touch targets ≥ 56×44px.
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
  const [moreOpen, setMoreOpen] = useState(false);

  /** Determine which tab is active based on the current route. */
  const visibleTabs = TABS.filter((tab) => tab.roles.includes(role));
  const activeIndex = visibleTabs.findIndex((tab) => pathname.startsWith(tab.to));
  const moreItems = ownerNavForRole(role).filter((item) => !PRIMARY_TAB_ROUTES.has(item.to));
  const moreActive = moreItems.some((item) => pathname.startsWith(item.to));

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
                aria-label={tab.mobileLabelKey ? t(tab.labelKey) : undefined}
                className={cn(
                  'relative flex min-h-[64px] w-full flex-col items-center justify-center gap-2.5',
                  'px-1 py-2.5 outline-none',
                  'focus-visible:outline focus-visible:outline-2',
                  'focus-visible:-outline-offset-2 focus-visible:outline-focus',
                  'transition-colors',
                  isActive ? 'text-primary font-bold' : 'text-muted',
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
                <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap text-xs font-medium leading-5">
                  {tab.mobileLabelKey ? (
                    <>
                      <span className="hidden lg:inline">{t(tab.labelKey)}</span>
                      <span className="inline lg:hidden" aria-hidden="true">
                        {t(tab.mobileLabelKey)}
                      </span>
                    </>
                  ) : (
                    t(tab.labelKey)
                  )}
                </span>
              </NavLink>
            </li>
          );
        })}
        {moreItems.length > 0 && (
          <li className="relative flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-current={moreActive ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[64px] w-full flex-col items-center justify-center gap-2.5',
                'px-1 py-2.5 outline-none focus-visible:outline focus-visible:outline-2',
                'focus-visible:-outline-offset-2 focus-visible:outline-focus transition-colors',
                moreActive || moreOpen ? 'font-bold text-primary' : 'text-muted',
              )}
              onClick={() => setMoreOpen(true)}
            >
              {(moreActive || moreOpen) && (
                <span
                  className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <MoreHorizontal className="h-6 w-6 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap text-xs font-medium leading-5">
                {t('owner.nav.more')}
              </span>
            </button>
          </li>
        )}
      </ul>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetTitle>{t('owner.nav.more')}</SheetTitle>
          <SheetDescription className="sr-only">{t('owner.nav.label')}</SheetDescription>
          <nav aria-label={t('owner.nav.label')} className="mt-4">
            <ul className="grid gap-2 min-[420px]:grid-cols-2" role="list">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.to);
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        'flex min-h-[52px] items-center gap-3 rounded-lg border px-3 py-2',
                        'no-underline transition-colors focus-visible:outline focus-visible:outline-2',
                        'focus-visible:outline-offset-2 focus-visible:outline-focus',
                        isActive
                          ? 'border-primary bg-primary/10 font-bold text-primary'
                          : 'border-border bg-surface text-text hover:bg-elevated',
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 truncate">{t(item.labelKey)}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

export default OwnerBottomTabs;
