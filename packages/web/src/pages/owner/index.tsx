import { Navigate, useOutletContext } from 'react-router-dom';
import { CalendarPage } from '../admin/CalendarPage';
import { AnalyticsPage } from '../admin/AnalyticsPage';
import { ConfigurationPage } from '../admin/ConfigurationPage';
import type { OwnerRole } from '../../api/client';

/** Context the {@link OwnerLayout} `<Outlet>` provides to nested owner pages. */
export interface OwnerOutletContext {
  /** The authenticated principal's role (RBAC). */
  role: OwnerRole;
}

/** Typed accessor for the owner outlet context (role-aware pages). */
export function useOwnerContext(): OwnerOutletContext {
  return useOutletContext<OwnerOutletContext>();
}

/**
 * Route-level RBAC guard (task 5.2; R2.1, R2.3–R2.7).
 *
 * The {@link OwnerShell} navigation only *shows* the destinations a role may
 * reach (Owner = everything; Admin = no configuration; Stylist = calendar
 * only). This guard makes the **routes themselves** consistent with that nav:
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
 * Calendar section of the owner panel (task 5.2; R2.1, R7.1).
 *
 * Reuses the existing admin {@link CalendarPage} verbatim — no rewrite — so its
 * preserved test hooks (`admin-calendar`, the day/week tabs, the
 * loading/error/empty/populated states) and the governing UI tokens, Jalali
 * dates, and RTL layout all carry over unchanged. The page renders inside the
 * {@link OwnerShell}'s single `<main>` via the `OwnerLayout` outlet, keeping the
 * document `dir="rtl"`/`lang="fa"` contract (R2.9) intact.
 *
 * Calendar is the one destination every role (Owner/Admin/Stylist) may reach,
 * so it carries no role guard.
 *
 * The outer `owner-calendar-page` testID is preserved so the panel
 * routing/RBAC suites stay green alongside the admin page's own hooks.
 */
export function OwnerCalendarPage() {
  return (
    <section data-testid="owner-calendar-page">
      <CalendarPage />
    </section>
  );
}

/**
 * Analytics section of the owner panel (task 5.2; R2.1, R7.1).
 *
 * Reuses the existing admin {@link AnalyticsPage} (KPI cards, busiest-windows
 * table, lazy chart) unchanged, preserving its `admin-analytics` / `analytics-*`
 * test hooks and token-driven styling. Restricted to Owner/Admin to mirror the
 * shell nav (a Stylist is redirected to the calendar).
 */
export function OwnerAnalyticsPage() {
  return (
    <OwnerRoleGuard allow={['Owner', 'Admin']}>
      <section data-testid="owner-analytics-page">
        <AnalyticsPage />
      </section>
    </OwnerRoleGuard>
  );
}

/**
 * Configuration section of the owner panel (task 5.2; R2.1, R7.1).
 *
 * Reuses the existing admin {@link ConfigurationPage} (staff/chairs/services/
 * holidays, confirm + undo) unchanged, preserving its `admin-configuration` /
 * `config-*` / `*-list` test hooks. Owner-only to mirror the shell nav (Admin
 * and Stylist are redirected to the calendar).
 */
export function OwnerConfigurationPage() {
  return (
    <OwnerRoleGuard allow={['Owner']}>
      <section data-testid="owner-config-page">
        <ConfigurationPage />
      </section>
    </OwnerRoleGuard>
  );
}

/** Subscription management landing — real surface (task 5.3; R3.8, R3.9, R2.1). */
export { OwnerSubscriptionPage } from './SubscriptionPage';

/** QR + standee landing — real surface (task 5.4; R4.1, R4.3). */
export { OwnerQrPage } from './QrPage';
