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
  /** Whether the first-run guide should always begin at its first catalogue item. */
  guideStartAtFirst?: boolean;
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
  guideStartAtFirst = false,
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
    () =>
      [...OWNER_GUIDE_STEPS]
        .filter((step) => step.roles.includes(role))
        .sort(
          (left, right) =>
            (OWNER_GUIDE_ORDER_INDEX.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
            (OWNER_GUIDE_ORDER_INDEX.get(right.id) ?? Number.MAX_SAFE_INTEGER),
        ),
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
      <PanelOnboardingGuide
        open={ownerGuide.open}
        onClose={ownerGuide.close}
        steps={guideSteps}
        startAtFirst={guideStartAtFirst}
      />
    </ThemeScope>
  );
}

type OwnerGuideStep = PanelGuideStep & { roles: readonly OwnerRole[] };

const OWNER_GUIDE_STEPS: readonly OwnerGuideStep[] = [
  {
    id: 'owner-calendar',
    eyebrow: 'تقویم',
    title: 'مرکز برنامهٔ سالن',
    body: 'نوبت‌های آنلاین و حضوری، وضعیت تأیید و برنامهٔ روزهای آینده را از همین صفحه دنبال کنید.',
    to: '/owner/calendar',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-calendar-controls',
    eyebrow: 'تقویم · ابزارهای روز',
    title: 'ثبت نوبت و مدیریت روز',
    body: 'از این قسمت نما را بین روز، هفته، ماه و فهرست عوض کنید؛ نوبت حضوری بسازید یا ساعات کاری و بسته‌شدن روز را مدیریت کنید.',
    to: '/owner/calendar',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-calendar-hours',
    eyebrow: 'تقویم · ساعات کاری',
    title: 'برنامهٔ هفتگی و تعطیلی‌ها',
    body: 'ساعات کاری هر روز و زمان‌های بسته‌بودن سالن را تنظیم کنید تا زمان‌های قابل رزرو همیشه با برنامهٔ واقعی هماهنگ باشند.',
    to: '/owner/calendar/working-hours',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-calendar-filters',
    eyebrow: 'تقویم · پیدا کردن نوبت',
    title: 'جست‌وجو و فیلتر نوبت‌ها',
    body: 'با نام مشتری، شماره، خدمت، عضو تیم یا وضعیت، نوبت موردنظر را سریع پیدا کنید.',
    to: '/owner/calendar',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-calendar-queues',
    eyebrow: 'تقویم · پیگیری‌ها',
    title: 'تأیید، رسید بیعانه و صف انتظار',
    body: 'رزروهای در انتظار تأیید، رسیدهای کارت‌به‌کارت و مشتری‌های صف انتظار در ابتدای تقویم جمع می‌شوند تا هیچ موردی از دست نرود.',
    to: '/owner/calendar',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-team',
    eyebrow: 'تیم',
    title: 'مدیریت اعضای تیم',
    body: 'اعضای تیم را اضافه کنید و برای هر نفر نقش، ورود، وضعیت فعالیت و سطح دسترسی را مشخص کنید.',
    to: '/owner/team',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-team-members',
    eyebrow: 'تیم · اعضای تیم',
    title: 'دسترسی و برنامهٔ هر عضو',
    body: 'با بازکردن هر عضو، اجازهٔ بستن وقت شخصی، تأیید نوبت، جایگاه کاری و فعال‌بودن او را تنظیم کنید.',
    to: '/owner/team',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-clients',
    eyebrow: 'مشتری‌ها',
    title: 'دفترچهٔ مشتری‌ها',
    body: 'اطلاعات مشتری‌های حضوری و آنلاین را در یک دفترچه نگه دارید تا ثبت نوبت بعدی سریع‌تر انجام شود.',
    to: '/owner/clients',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-clients-directory',
    eyebrow: 'مشتری‌ها · دفترچه',
    title: 'جست‌وجو و افزودن مشتری',
    body: 'مشتری را با نام یا شماره پیدا کنید و در صورت نیاز با نام و شمارهٔ معتبر به دفترچه اضافه کنید.',
    to: '/owner/clients',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-marketing',
    eyebrow: 'بازاریابی',
    title: 'مسیرهای جذب مشتری',
    body: 'لینک رزرو، QR و دعوت مشتری را طوری آماده کنید که هر مراجعه از مسیر درست ثبت و قابل پیگیری باشد.',
    to: '/owner/marketing',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-marketing-booking',
    eyebrow: 'بازاریابی · لینک رزرو',
    title: 'لینک رزرو سالن',
    body: 'لینک اختصاصی را کپی یا share کنید و صفحهٔ رزرو را برای بررسی در یک تب جدید ببینید.',
    to: '/owner/marketing',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-marketing-campaign',
    eyebrow: 'بازاریابی · کمپین',
    title: 'لینک‌های قابل‌اندازه‌گیری',
    body: 'برای بیو، استوری، واتساپ و QR لینک جدا بسازید؛ اسکن و رزرو هر کانال بعداً در آمار دیده می‌شود.',
    to: '/owner/marketing',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-marketing-referrals',
    eyebrow: 'بازاریابی · معرفی',
    title: 'معرفی‌های مشتریان',
    body: 'پیشرفت معرفی‌های مشتری و اعتبار قابل‌مصرف را ببینید و در زمان آماده‌شدن، مصرف اعتبار را ثبت کنید.',
    to: '/owner/marketing',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-analytics',
    eyebrow: 'آمار',
    title: 'گزارش عملکرد سالن',
    body: 'درآمد، تعداد نوبت، ظرفیت استفاده‌شده، عملکرد تیم و رفتار مشتری‌ها را در یک نمای تحلیلی ببینید.',
    to: '/owner/analytics',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-analytics-report',
    eyebrow: 'آمار · گزارش',
    title: 'بازه و جزئیات گزارش',
    body: 'بازهٔ ۷، ۳۰ یا ۹۰ روزه را انتخاب کنید و روند روزانه، ساعات شلوغ، خدمات، تیم، پرداخت‌ها و کانال‌های جذب را مقایسه کنید.',
    to: '/owner/analytics',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-qr',
    eyebrow: 'QR سالن',
    title: 'ساخت QR و استند سالن',
    body: 'برای ورودی، شبکه‌های اجتماعی یا آینهٔ سالن یک کد QR برندشده بسازید و خروجی مناسب چاپ یا اشتراک بگیرید.',
    to: '/owner/qr',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-qr-studio',
    eyebrow: 'QR سالن · استودیو',
    title: 'شخصی‌سازی و خروجی QR',
    body: 'قالب و رنگ را انتخاب کنید، پیش‌نمایش زنده را ببینید و QR را به‌صورت PNG، SVG یا نسخهٔ قابل چاپ دریافت کنید.',
    to: '/owner/qr',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-qr-order',
    eyebrow: 'QR سالن · سفارش چاپ',
    title: 'سفارش کارت و استند چاپی',
    body: 'تعداد، مشخصات ارسال و توضیحات سفارش را وارد کنید تا کارت یا استند چاپی QR برای سالن ثبت شود.',
    to: '/owner/qr',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-configuration',
    eyebrow: 'تنظیمات سالن',
    title: 'تنظیمات پایهٔ سالن',
    body: 'تنظیمات مشترک سالن مثل پیامک، روش بیعانه، منابع کاری و تجهیزات را از اینجا کنترل کنید.',
    to: '/owner/config',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-configuration-messaging',
    eyebrow: 'تنظیمات سالن · پیامک و بیعانه',
    title: 'پیامک‌ها و روش بیعانه',
    body: 'مشخص کنید پیامک رزرو، یادآوری و لغو برای چه کسی ارسال شود و اطلاعات کارت‌به‌کارت بیعانه را ثبت کنید.',
    to: '/owner/config',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-configuration-deposit',
    eyebrow: 'تنظیمات سالن · بیعانه',
    title: 'روش کارت‌به‌کارت',
    body: 'روش دریافت بیعانه فعلاً کارت‌به‌کارت است؛ شماره کارت، نام صاحب کارت و نام بانک را ثبت کنید تا مشتری رسید را برای سالن بفرستد.',
    to: '/owner/config',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-configuration-resources',
    eyebrow: 'تنظیمات سالن · منابع',
    title: 'صندلی و تجهیزات',
    body: 'منابعی را که برای برنامه‌ریزی سالن لازم‌اند اضافه، ویرایش یا غیرفعال کنید تا ظرفیت رزرو دقیق بماند.',
    to: '/owner/config',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-configuration-equipment',
    eyebrow: 'تنظیمات سالن · تجهیزات',
    title: 'مدیریت تجهیزات',
    body: 'تجهیزات موردنیاز هر سالن را جداگانه ثبت، ویرایش یا غیرفعال کنید تا فهرست منابع همیشه به‌روز بماند.',
    to: '/owner/config',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-services',
    eyebrow: 'خدمات',
    title: 'مدیریت کاتالوگ خدمات',
    body: 'خدمات سالن را از تنظیمات جداگانه مدیریت کنید تا نام، قیمت و زمان هر خدمت برای رزرو دقیق باشد.',
    to: '/owner/services',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-services-catalog',
    eyebrow: 'خدمات · کاتالوگ',
    title: 'خدمت، زمان، قیمت و تیم ارائه‌دهنده',
    body: 'خدمت جدید یا سفارشی اضافه کنید، مدت ثابت یا متغیر و بیعانه را تنظیم کنید و اعضای تیم ارائه‌دهنده را با تیک انتخاب کنید.',
    to: '/owner/services',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-transactions',
    eyebrow: 'تراکنش‌ها',
    title: 'دفتر مالی سالن',
    body: 'پرداخت‌های نوبت و اشتراک را با مبلغ، وضعیت، تاریخ و شناسهٔ پیگیری در یک فهرست ببینید.',
    to: '/owner/transactions',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-notifications',
    eyebrow: 'اعلان‌ها',
    title: 'صندوق پیام‌های کاری',
    body: 'رویدادهای رزرو، تغییر زمان، پرداخت و پیام‌های کاری سالن را در یک صندوق مرکزی دنبال کنید.',
    to: '/owner/notifications',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-notifications-inbox',
    eyebrow: 'اعلان‌ها · صندوق ورودی',
    title: 'فیلتر و خواندن اعلان‌ها',
    body: 'بین همه و خوانده‌نشده‌ها فیلتر کنید؛ پیام را باز کنید یا همهٔ اعلان‌های خوانده‌نشده را یک‌جا بخوانید.',
    to: '/owner/notifications',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-subscription',
    eyebrow: 'اشتراک',
    title: 'وضعیت اشتراک سالن',
    body: 'وضعیت فعلی، تاریخ انقضا و زمان باقی‌ماندهٔ اشتراک را از این صفحه بررسی کنید.',
    to: '/owner/subscription',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-subscription-plans',
    eyebrow: 'اشتراک · تمدید',
    title: 'انتخاب پلن تمدید',
    body: 'پلن ماهانه یا سه‌ماهه را فقط در محدودهٔ مجاز آینده انتخاب کنید؛ سیستم بیشتر از سه ماه جلوتر اجازهٔ خرید نمی‌دهد.',
    to: '/owner/subscription',
    roles: ['Owner', 'Admin'],
  },
  {
    id: 'owner-my-qr',
    eyebrow: 'بارکد من',
    title: 'QR شخصی عضو تیم',
    body: 'کد QR شخصی خودت را برای دریافت رزرو مستقیم به مشتری‌ها نشان بده، share کن یا دانلود بگیر.',
    to: '/owner/my-qr',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-profile',
    eyebrow: 'پروفایل',
    title: 'پروفایل و حساب کاربری',
    body: 'اطلاعات حساب، نقش و وضعیت دسترسی را ببینید؛ برای مدیریت بخش‌های کاری از سایدبار استفاده کنید.',
    to: '/owner/profile',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
  {
    id: 'owner-profile-tools',
    eyebrow: 'پروفایل · دسترسی سریع',
    title: 'تیم و خدمات جدا از هم',
    body: '«تیم» برای کنترل اعضا و دسترسی‌هاست و «خدمات» برای کنترل کاتالوگ؛ هرکدام از کارت مستقل خودش باز می‌شود.',
    to: '/owner/profile',
    roles: ['Owner', 'Admin', 'Stylist'],
  },
] as const;

// Put the three daily-control destinations first so a new owner reaches the
// high-value team, service, and profile surfaces before secondary reporting
// and promotion tools.
const OWNER_GUIDE_ORDER = [
  'owner-team',
  'owner-team-members',
  'owner-services',
  'owner-services-catalog',
  'owner-profile',
  'owner-profile-tools',
  'owner-calendar',
  'owner-calendar-controls',
  'owner-calendar-hours',
  'owner-calendar-filters',
  'owner-calendar-queues',
  'owner-clients',
  'owner-clients-directory',
  'owner-marketing',
  'owner-marketing-booking',
  'owner-marketing-campaign',
  'owner-marketing-referrals',
  'owner-analytics',
  'owner-analytics-report',
  'owner-qr',
  'owner-qr-studio',
  'owner-qr-order',
  'owner-configuration',
  'owner-configuration-messaging',
  'owner-configuration-deposit',
  'owner-configuration-resources',
  'owner-configuration-equipment',
  'owner-transactions',
  'owner-notifications',
  'owner-notifications-inbox',
  'owner-subscription',
  'owner-subscription-plans',
  'owner-my-qr',
] as const;

const OWNER_GUIDE_ORDER_INDEX: ReadonlyMap<string, number> = new Map(
  OWNER_GUIDE_ORDER.map((id, index) => [id, index]),
);

export default OwnerShell;
