import { NavLink } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Calendar,
  BarChart3,
  Settings,
  QrCode,
  CreditCard,
  Receipt,
  Bell,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../ui/cn';

// ─── Types ───────────────────────────────────────────────────────────────────

export type OwnerSidebarRole = 'owner' | 'admin' | 'stylist';

export interface OwnerSidebarProps {
  /** Whether the sidebar is in collapsed (icons-only) mode. */
  collapsed: boolean;
  /** Toggle collapsed/expanded state. */
  onToggle: () => void;
  /** Currently active route path (e.g. `/owner/calendar`). */
  activeRoute: string;
  /** Authenticated role — filters which nav items are visible. */
  role: OwnerSidebarRole;
  /** Optional className for the root aside element. */
  className?: string;
}

// ─── Nav Item Definition ─────────────────────────────────────────────────────

interface SidebarNavItem {
  /** Route path. */
  to: string;
  /** Persian label. */
  label: string;
  /** Icon component. */
  icon: LucideIcon;
  /** Roles that may see this item. */
  roles: readonly OwnerSidebarRole[];
}

const SIDEBAR_NAV_ITEMS: readonly SidebarNavItem[] = [
  {
    to: '/owner/calendar',
    label: 'تقویم',
    icon: Calendar,
    roles: ['owner', 'admin', 'stylist'],
  },
  {
    to: '/owner/analytics',
    label: 'آمار',
    icon: BarChart3,
    roles: ['owner', 'admin'],
  },
  {
    to: '/owner/qr',
    label: 'بارکد و لینک',
    icon: QrCode,
    roles: ['owner', 'admin'],
  },
  {
    to: '/owner/transactions',
    label: 'تراکنش‌ها',
    icon: Receipt,
    roles: ['owner', 'admin'],
  },
  {
    to: '/owner/notifications',
    label: 'اعلان‌ها',
    icon: Bell,
    roles: ['owner', 'admin', 'stylist'],
  },
  {
    to: '/owner/subscription',
    label: 'اشتراک',
    icon: CreditCard,
    roles: ['owner', 'admin'],
  },
  {
    to: '/owner/config',
    label: 'تنظیمات',
    icon: Settings,
    roles: ['owner', 'admin'],
  },
];

// ─── Widths (tokens-based) ───────────────────────────────────────────────────

/** Expanded width in pixels (w-56 = 224px). */
const WIDTH_EXPANDED = 224;
/** Collapsed width in pixels — enough for 44px icon + padding. */
const WIDTH_COLLAPSED = 64;

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Collapsible sidebar navigation for the owner dashboard (Task 7.1).
 *
 * Desktop (lg+) sidebar with:
 * - Icons-only mode when collapsed (44×44px touch targets)
 * - Smooth width transition via Framer Motion `motion.aside`
 * - Active indicator: brand-accent bar on inline-start edge (logical properties)
 * - Role-filtered: Stylist sees only calendar
 * - RTL-aware chevron toggle
 * - `prefers-reduced-motion` respected
 * - Dark-mode-first styling using CSS tokens
 *
 * Validates: Requirements 8.5, 8.6, 10.6, 12.3
 */
export function OwnerSidebar({
  collapsed,
  onToggle,
  activeRoute,
  role,
  className,
}: OwnerSidebarProps) {
  const prefersReduced = useReducedMotion();
  const visibleItems = SIDEBAR_NAV_ITEMS.filter((item) =>
    item.roles.includes(role),
  );

  const width = collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED;

  return (
    <motion.aside
      aria-label="ناوبری پنل مدیریت"
      className={cn(
        'relative flex flex-col border-e border-border bg-surface',
        'hidden lg:flex',
        className,
      )}
      animate={{ width }}
      transition={
        prefersReduced
          ? { duration: 0 }
          : { type: 'tween', duration: 0.25, ease: [0.2, 0, 0, 1] }
      }
    >
      {/* Navigation links */}
      <nav aria-label="ناوبری داشبورد" className="flex flex-1 flex-col gap-1 px-2 py-4">
        <ul className="flex flex-col gap-1" role="list">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeRoute === item.to;

            const linkContent = (
              <NavLink
                to={item.to}
                aria-label={collapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-md no-underline',
                  'min-h-[44px] min-w-[44px] px-3 py-2',
                  'outline-none focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-2 focus-visible:outline-focus',
                  'transition-colors',
                  isActive
                    ? 'bg-elevated text-text font-bold'
                    : 'text-text-muted hover:bg-elevated hover:text-text',
                  collapsed && 'justify-center px-0',
                )}
              >
                {/* Active indicator — brand-accent bar on inline-start edge */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-block-0 inline-start-0 w-[3px] rounded-e-sm bg-primary',
                    )}
                    style={{
                      top: '4px',
                      bottom: '4px',
                      insetInlineStart: 0,
                      width: '3px',
                      borderStartEndRadius: '2px',
                      borderEndEndRadius: '2px',
                      backgroundColor: 'var(--color-primary)',
                      position: 'absolute',
                    }}
                  />
                )}
                <Icon
                  className="h-5 w-5 shrink-0"
                  aria-hidden="true"
                />
                {!collapsed && (
                  <span className="truncate text-sm">{item.label}</span>
                )}
              </NavLink>
            );

            return (
              <li key={item.to}>
                {collapsed ? (
                  <Tooltip content={item.label} side="right">
                    {linkContent}
                  </Tooltip>
                ) : (
                  linkContent
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse/expand toggle at bottom */}
      <div className="border-t border-border px-2 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'گسترش ناوبری' : 'جمع‌کردن ناوبری'}
          className={cn(
            'flex items-center justify-center rounded-md',
            'min-h-[44px] min-w-[44px] w-full',
            'text-text-muted hover:bg-elevated hover:text-text',
            'outline-none focus-visible:outline focus-visible:outline-2',
            'focus-visible:outline-offset-2 focus-visible:outline-focus',
            'transition-colors',
          )}
        >
          <ChevronLeft
            className={cn(
              'h-5 w-5 transition-transform',
              collapsed && 'rotate-180 rtl:rotate-0',
              !collapsed && 'rotate-0 rtl:rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      </div>
    </motion.aside>
  );
}

export default OwnerSidebar;
