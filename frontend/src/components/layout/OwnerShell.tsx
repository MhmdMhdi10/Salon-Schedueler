import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { OwnerThemeToggle } from '../theme/OwnerThemeToggle';
import { THEME_STORAGE_KEY, ThemeScope, useTheme } from '../theme';
import { cn } from '../ui/cn';
import { OwnerSidebar } from '../owner/OwnerSidebar';
import { OwnerSetupAlert } from '../owner/OwnerSetupAlert';
import { OWNER_NAV, ownerNavForRole, type OwnerNavItem } from '../owner/ownerNav';
import { OwnerBottomTabs } from './OwnerBottomTabs';
import { PanelHeader } from './PanelHeader';
import {
  PanelOnboardingGuide,
  useFirstVisitPanelGuide,
  type PanelGuideStep,
} from './PanelOnboardingGuide';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { OwnerRole } from '../../api/client';

import './owner-shell.css';

/** Stable id the owner `<main>` exposes (skip-link target / focus). */
export const OWNER_CONTENT_ID = 'owner-content';

/** localStorage key for sidebar collapsed state. */
const SIDEBAR_COLLAPSED_KEY = 'owner-sidebar-collapsed';

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
  const prefersReducedMotion = useReducedMotion();
  const guideKey = `ara:owner-guide:v1:${role}:${salonId || 'default'}`;
  const ownerGuide = useFirstVisitPanelGuide(guideKey);
  const guideSteps = useMemo(
    () => OWNER_GUIDE_STEPS.filter((step) => step.roles.includes(role)),
    [role],
  );
  const contentRef = useRef<HTMLElement | null>(null);
  const profileScrollPositionRef = useRef<{ top: number; left: number } | null>(null);

  const handleContentScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      if (!pathname.startsWith('/owner/profile')) return;
      const target = event.currentTarget;
      profileScrollPositionRef.current = {
        top: target.scrollTop,
        left: target.scrollLeft,
      };
    },
    [pathname],
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
    const isProfileRoute = pathname.startsWith('/owner/profile');
    const savedPosition = isProfileRoute ? profileScrollPositionRef.current : null;

    // Restore after routed content has been committed, before the next paint.
    // Other owner sections intentionally start at the top.
    const frame = window.requestAnimationFrame(() => {
      const target = contentRef.current;
      if (!target) return;
      const top = savedPosition?.top ?? 0;
      const left = savedPosition?.left ?? 0;
      if (typeof target.scrollTo === 'function') {
        target.scrollTo({ top, left, behavior: 'auto' });
      } else {
        // jsdom does not implement Element.scrollTo; direct assignment keeps
        // the same behavior in tests and older embedded webviews.
        target.scrollTop = top;
        target.scrollLeft = left;
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pathname, routeKey]);

  return (
    <ThemeScope
      theme={theme}
      data-shell="owner"
      className={cn(
        // Booksy Biz app frame: the shell never page-scrolls — panes scroll
        // internally (design directive §h.1).
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
        onSignOut={onSignOut}
        onHelp={ownerGuide.replay}
      />

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
          ref={contentRef}
          id={OWNER_CONTENT_ID}
          dir="rtl"
          tabIndex={0}
          onScroll={handleContentScroll}
          className={cn(
            'min-w-0 flex-1 overscroll-contain overflow-x-clip overflow-y-auto px-3 py-4 sm:px-4 sm:py-5',
            isDesktop && 'w-full',
            // On mobile, reserve the compact rendered tab bar (~65px) plus breathing
            // room so the last card can scroll completely above fixed nav.
            !isDesktop && 'pb-[calc(var(--space-10)+var(--space-6)+env(safe-area-inset-bottom))]',
          )}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={routeKey}
              initial={prefersReducedMotion ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, x: -12 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { duration: 0.24, ease: [0.22, 0.8, 0.2, 1] }
              }
              className="min-w-0 w-full"
            >
              {(role === 'Owner' || role === 'Admin') && salonId && (
                <OwnerSetupAlert salonId={salonId} refreshKey={pathname} />
              )}
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom tabs — visible only below lg */}
      {!isDesktop && <OwnerBottomTabs role={role} />}
      <PanelOnboardingGuide open={ownerGuide.open} onClose={ownerGuide.close} steps={guideSteps} />
    </ThemeScope>
  );
}

type OwnerGuideStep = PanelGuideStep & { roles: readonly OwnerRole[] };

const OWNER_GUIDE_STEPS: readonly OwnerGuideStep[] = [
  {
    id: 'owner-calendar',
    title: 'تقویم روزانه',
    body: 'نوبت‌های آنلاین و دستی را یک‌جا ببینید؛ نوبت‌های در انتظار تأیید هم از همین مسیر در دسترس‌اند.',
    to: '/owner/calendar',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-team',
    title: 'تیم',
    body: 'عضو تیم اضافه کنید، نقش و دسترسی او را تعیین کنید و برای هر نفر برنامهٔ کاری بسازید.',
    to: '/owner/team',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-clients',
    title: 'مشتری‌ها',
    body: 'اطلاعات مشتری‌ها، سوابق نوبت و یادداشت‌های لازم برای مراجعهٔ بعدی را از این بخش مدیریت کنید.',
    to: '/owner/clients',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-marketing',
    title: 'بازاریابی',
    body: 'لینک رزرو و کمپین‌های معرفی سالن را آماده کنید و نتیجهٔ دعوت‌ها را پیگیری کنید.',
    to: '/owner/marketing',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-analytics',
    title: 'آمار',
    body: 'روند نوبت‌ها، درآمد، عملکرد تیم و کانال‌های جذب مشتری را در گزارش‌های سالن ببینید.',
    to: '/owner/analytics',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-qr',
    title: 'QR سالن',
    body: 'کد QR سالن را برای ورودی، شبکه‌های اجتماعی و مسیر رزرو مشتری آماده و به اشتراک بگذارید.',
    to: '/owner/qr',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-configuration',
    title: 'تنظیمات سالن',
    body: 'اطلاعات سالن، پیامک‌ها، بیعانه، قوانین تأیید و منابع کاری را از این بخش کنترل کنید.',
    to: '/owner/config',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-services',
    title: 'خدمات',
    body: 'خدمت، مدت، قیمت و اعضای تیم ارائه‌دهنده را مدیریت کنید تا صفحهٔ رزرو همیشه دقیق بماند.',
    to: '/owner/services',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-transactions',
    title: 'تراکنش‌ها',
    body: 'پرداخت‌های نوبت و اشتراک را با مبلغ، وضعیت و تاریخ در یک دفتر ثبت‌شده دنبال کنید.',
    to: '/owner/transactions',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-notifications',
    title: 'اعلان‌ها',
    body: 'رویدادهای نوبت، تغییر زمان و پیام‌های کاری سالن را از صندوق اعلان‌ها پیگیری کنید.',
    to: '/owner/notifications',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-subscription',
    title: 'اشتراک',
    body: 'پلن فعال، زمان باقی‌مانده و تمدید اشتراک سالن را از این بخش ببینید.',
    to: '/owner/subscription',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-my-qr',
    title: 'بارکد من',
    body: 'کد QR شخصی خودت را برای دریافت رزرو مستقیم به مشتری‌ها نشان بده یا دانلود کن.',
    to: '/owner/my-qr',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-profile',
    title: 'پروفایل و دسترسی‌ها',
    body: 'پروفایل، اطلاعات حساب و میانبرهای بخش‌های پنل را از اینجا در دسترس داشته باشید.',
    to: '/owner/profile',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
] as const;

export default OwnerShell;
