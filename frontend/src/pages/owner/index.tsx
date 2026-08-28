import { Navigate, useOutletContext } from 'react-router-dom';
import { OwnerConfigPage } from './OwnerConfigurationPage';
import { OwnerAnalyticsPageContent } from './OwnerAnalyticsPage';
import { OwnerCalendarPage as OwnerCalendarPageImpl } from './OwnerCalendarPage';
import { MyQrPage } from './MyQrPage';
import { OwnerClientsPage as OwnerClientsPageImpl } from './OwnerClientsPage';
import { OwnerMarketingPage as OwnerMarketingPageImpl } from './OwnerMarketingPage';
import type { OwnerRole } from '../../api/client';

export { OwnerWorkingHoursPage } from './OwnerWorkingHoursPage';

/** Context the {@link OwnerLayout} `<Outlet>` provides to nested owner pages. */
export interface OwnerOutletContext {
  /** The authenticated principal's role (RBAC). */
  role: OwnerRole;
  /** Salon scope and staff identity used by the profile surface. */
  salonId?: string;
  staffMemberId?: string;
  /** Shared shell sign-out handler for the profile surface. */
  onSignOut?: () => void;
}

/** Typed accessor for the owner outlet context (role-aware pages). */
export function useOwnerContext(): OwnerOutletContext {
  return useOutletContext<OwnerOutletContext>();
}

/**
 * Route-level RBAC guard (task 5.2; R2.1, R2.3–R2.7).
 *
 * The {@link OwnerShell} navigation only *shows* the destinations a role may
 * reach (Owner/Admin = everything; Stylist = calendar, client book,
 * notifications, and personal QR). This guard makes the
 * **routes themselves** consistent with that nav:
 * a principal who deep-links or otherwise lands on a section their role can't
 * see is redirected back to the always-available calendar rather than rendering
 * a surface they shouldn't manage.
 */
function OwnerRoleGuard({
  allow,
  children,
}: {
  /** Roles permitted to view the wrapped section. */
  allow: readonly OwnerRole[];
  children: React.ReactNode;
}) {
  const { role } = useOwnerContext();
  if (!allow.includes(role)) {
    return <Navigate to="/owner/calendar" replace />;
  }
  return <>{children}</>;
}

/**
 * Calendar section of the owner panel (task 7.4; R8.2, R8.6, R8.7, R8.8, R11.5).
 *
 * Redesigned with NYC dark-mode-first calendar: day/week views, vertical time
 * grid, appointment blocks colored by service type, Framer Motion view-switch
 * animations, Jalali dates with Persian numerals, and keyboard-operable RTL
 * date navigation.
 *
 * Calendar is the one destination every role (Owner/Admin/Stylist) may reach,
 * so it carries no role guard.
 *
 * The `owner-calendar-page` testID is preserved for routing/RBAC suites.
 */
export function OwnerCalendarPage() {
  return <OwnerCalendarPageImpl />;
}

/** Salon-scoped client book — readable by every staff member. */
export function OwnerClientsPage() {
  return (
    <OwnerRoleGuard allow={['Owner', 'Admin', 'Stylist']}>
      <OwnerClientsPageImpl />
    </OwnerRoleGuard>
  );
}

/** Lightweight marketing/share surface for owners and admins. */
export function OwnerMarketingPage() {
  return (
    <OwnerRoleGuard allow={['Owner', 'Admin']}>
      <OwnerMarketingPageImpl />
    </OwnerRoleGuard>
  );
}

/**
 * Analytics section of the owner panel — آرا minimal-chrome charts with teal
 * highlights, AnimatedCounter metrics cards, and lazy-loaded charts (Goal 15;
 * Design §Per-Surface Composition).
 *
 * Restricted to Owner/Admin to mirror the shell nav (a Stylist is redirected
 * to the calendar).
 */
export function OwnerAnalyticsPage() {
  return (
    <OwnerRoleGuard allow={['Owner', 'Admin']}>
      <section data-testid="owner-analytics-page">
        <OwnerAnalyticsPageContent />
      </section>
    </OwnerRoleGuard>
  );
}

/**
 * Configuration section of the owner panel (task 7.6; R8.4, R8.6, R8.7, R3.5,
 * R11.4, R11.5).
 *
 * Redesigned with card-based sections for Staff, Services, Chairs/Resources —
 * each with expand/collapse animations (AnimatePresence + chevron rotation),
 * inline edit affordances, add/remove slide animations, skeleton loading,
 * error+retry, Persian text, and prefers-reduced-motion handling. Working
 * hours, holidays, booking limits, and approval policy live in Calendar.
 *
 * Owner/Admin access to mirror the shell nav (Stylist is redirected to the
 * calendar). Preserves `admin-configuration` / `config-*` / `*-list` testIDs.
 */
export function OwnerConfigurationPage() {
  return (
    <OwnerRoleGuard allow={['Owner', 'Admin']}>
      <section data-testid="owner-config-page">
        <OwnerConfigPage />
      </section>
    </OwnerRoleGuard>
  );
}

/**
 * Team management for salon owners. It reuses the existing staff/service
 * configuration APIs but keeps the first-run flow focused on people and the
 * services they perform.
 */
export function OwnerTeamPage() {
  return (
    <OwnerRoleGuard allow={['Owner', 'Admin']}>
      <section data-testid="owner-team-page">
        <OwnerConfigPage view="team" />
      </section>
    </OwnerRoleGuard>
  );
}

/** Subscription management landing — real surface (task 5.3; R3.8, R3.9, R2.1). */
export { OwnerSubscriptionPage } from './SubscriptionPage';

/** Transactions ledger — «تراکنش‌ها» (appointment + subscription payments). */
export { OwnerTransactionsPage } from './OwnerTransactionsPage';

/** Salon inbox notifications — «اعلان‌ها» (live WS + durable list). */
export { OwnerNotificationsPage } from './OwnerNotificationsPage';

/** QR + standee landing — real surface (task 5.4; R4.1, R4.3). */
export { OwnerQrPage } from './QrPage';

/**
 * Personal QR section — «بارکد من» (R4.1, R2.5).
 *
 * Like the calendar, this is the one *other* destination every authenticated
 * staff role may reach: a stylist views (and shares/prints) their **own**
 * booking QR. It therefore carries no `OwnerRoleGuard` — the {@link MyQrPage}
 * itself handles the "account not linked to a stylist" case.
 */
export function OwnerMyQrPage() {
  return (
    <section data-testid="owner-my-qr-page">
      <MyQrPage />
    </section>
  );
}

/** First-class account/profile surface for the owner panel. */
export { OwnerProfilePage } from './OwnerProfilePage';
