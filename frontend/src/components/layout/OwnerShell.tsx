import { useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
  const [guideOpen, setGuideOpen] = useState(false);
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

  useEffect(() => {
    try {
      if (localStorage.getItem(guideKey) !== 'done') setGuideOpen(true);
    } catch {
      setGuideOpen(true);
    }
  }, [guideKey]);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    try {
      localStorage.setItem(guideKey, 'done');
    } catch {
      // Private browsing can disable storage; the guide still closes for this visit.
    }
  }, [guideKey]);

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
        onHelp={() => setGuideOpen(true)}
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
      <OwnerOnboardingGuide open={guideOpen} onClose={closeGuide} />
    </ThemeScope>
  );
}

const OWNER_GUIDE_STEPS = [
  {
    title: 'تقویم روزانه',
    body: 'نوبت‌های آنلاین و دستی را یک‌جا ببینید؛ نوبت‌های در انتظار تأیید هم از همین مسیر در دسترس‌اند.',
    to: '/owner/calendar',
  },
  {
    title: 'خدمات',
    body: 'خدمت، مدت، قیمت و اعضای تیم ارائه‌دهنده را مدیریت کنید تا صفحهٔ رزرو همیشه دقیق بماند.',
    to: '/owner/config',
  },
  {
    title: 'تیم',
    body: 'عضو تیم اضافه کنید، نقش و دسترسی او را تعیین کنید و برای هر نفر برنامهٔ کاری بسازید.',
    to: '/owner/team',
  },
  {
    title: 'اشتراک و تنظیمات',
    body: 'وضعیت اشتراک، پیامک‌ها، بیعانه و لینک رزرو سالن از منوی پنل قابل تغییر است.',
    to: '/owner/subscription',
  },
] as const;

function OwnerOnboardingGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  const current = OWNER_GUIDE_STEPS[index];
  const isLast = index === OWNER_GUIDE_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-dialog flex items-end justify-center bg-black/45 p-3 sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-guide-title"
        className="w-full max-w-md rounded-2xl border border-border bg-elevated p-5 shadow-3"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-primary">راهنمای شروع پنل</p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-md px-3 text-sm text-muted hover:bg-surface"
          >
            بستن
          </button>
        </div>
        <div className="mt-4 flex items-center gap-1" aria-hidden="true">
          {OWNER_GUIDE_STEPS.map((step, stepIndex) => (
            <span
              key={step.title}
              className={cn('h-1 flex-1 rounded-pill', stepIndex <= index ? 'bg-primary' : 'bg-border')}
            />
          ))}
        </div>
        <h2 id="owner-guide-title" className="mt-5 text-xl font-bold text-text">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted">{current.body}</p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="min-h-11 rounded-md px-3 text-sm text-muted hover:bg-surface disabled:opacity-50"
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
          >
            قبلی
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-md border border-border px-3 text-sm font-semibold text-text hover:bg-surface"
              onClick={() => {
                onClose();
                navigate(current.to);
              }}
            >
              مشاهده بخش
            </button>
            <button
              type="button"
              className="min-h-11 rounded-pill bg-primary px-4 text-sm font-semibold text-primary-contrast hover:opacity-90"
              onClick={() => (isLast ? onClose() : setIndex((value) => value + 1))}
            >
              {isLast ? 'شروع کار' : 'بعدی'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default OwnerShell;
