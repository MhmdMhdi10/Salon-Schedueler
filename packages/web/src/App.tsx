import { lazy, Suspense } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { AppShell } from './components/layout/AppShell';
import { RouteLoader } from './components/layout/RouteLoader';
import { RouteProgress } from './components/layout/RouteProgress';
import { PageTransition } from './components/ui/Motion';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider, useAuth } from './auth/AuthContext';

/**
 * Root component for the Salon Booking PWA.
 * Configures routing for customer and admin flows.
 *
 * The whole tree is wrapped in `ThemeProvider` so the persisted light/dark
 * choice (with OS fallback) drives `data-theme` on `<html>` and the
 * `theme-color` meta.
 *
 * It is also wrapped in `HelmetProvider` (react-helmet-async) so any route can
 * manage its `<head>` through `<SeoHead>` / `<JsonLd>` in a prerender/SSR-safe
 * way (seo §3, §5, §8). The `<SeoHead>` default is `noindex`, so routes must
 * opt in to indexing and a new private route can never leak by omission (R8.7).
 *
 * Routed pages render inside `AppShell`, which provides the consistent
 * application shell (header / single `<main>` / footer, skip-to-content link,
 * correct landmarks, RTL-first responsive layout — R3.1, R3.2, R3.8). The
 * `dir="rtl"` / `lang="fa"` document contract is preserved on the app root
 * wrapper (R3.5).
 *
 * ## Route-level code splitting (R3.7, R9.3; ui-ux §12, seo §9)
 *
 * Every routed page is loaded with `React.lazy`, so each route's code lands in
 * its own chunk and only downloads when that route is visited. This keeps the
 * heavy admin surfaces (calendar/analytics/configuration) — and, transitively,
 * the Jalali date picker and any chart code they pull in — **out of** the
 * customer funnel and public-page bundles. The admin chunk also shares a
 * dynamic-import boundary (a thin `admin` lazy module) so the three admin pages
 * collapse into one cohesive code-split group.
 *
 * `<Routes>` is wrapped in a single `<Suspense>` whose fallback is the
 * `RouteLoader`: a layout-reserving skeleton (not a blocking spinner) that
 * occupies roughly the routed page's footprint, so swapping it for the page
 * causes no cumulative layout shift (CLS).
 */

// Customer funnel + public pages — each its own chunk.
const BusinessLanding = lazy(() =>
  import('./pages/BusinessLanding').then((m) => ({
    default: m.BusinessLanding,
  })),
);
const RegisterSalonPage = lazy(() =>
  import('./pages/business/RegisterSalonPage').then((m) => ({
    default: m.RegisterSalonPage,
  })),
);
const SalonProfilePage = lazy(() =>
  import('./pages/SalonProfilePage').then((m) => ({
    default: m.SalonProfilePage,
  })),
);
const AboutPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.ContactPage })),
);
const PrivacyPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.TermsPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const QrLandingPage = lazy(() =>
  import('./pages/QrLandingPage').then((m) => ({ default: m.QrLandingPage })),
);
const MySalonsPage = lazy(() =>
  import('./pages/MySalonsPage').then((m) => ({ default: m.MySalonsPage })),
);
const CustomerDashboardPage = lazy(() =>
  import('./pages/CustomerDashboardPage').then((m) => ({ default: m.CustomerDashboardPage })),
);
const AvailabilityPage = lazy(() =>
  import('./pages/AvailabilityPage').then((m) => ({
    default: m.AvailabilityPage,
  })),
);
const BookingConfirmPage = lazy(() =>
  import('./pages/BookingConfirmPage').then((m) => ({
    default: m.BookingConfirmPage,
  })),
);
const BookingSuccessPage = lazy(() =>
  import('./pages/BookingSuccessPage').then((m) => ({
    default: m.BookingSuccessPage,
  })),
);
const WaitlistPage = lazy(() =>
  import('./pages/WaitlistPage').then((m) => ({ default: m.WaitlistPage })),
);
const FunnelTenantTheme = lazy(() =>
  import('./components/theme/FunnelTenantTheme').then((m) => ({
    default: m.FunnelTenantTheme,
  })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

// Admin surfaces are served by the owner panel (see pages/owner), which adds
// auth bootstrap + per-role route guards. The legacy `/admin/*` paths redirect
// there, so they are not imported standalone here anymore.

// Owner panel — its own code-split group, kept off the public/customer bundle
// (R2.1, R6.4; ui-ux §12, seo §9). The layout owns auth bootstrap + RBAC; the
// nested section pages are placeholders until tasks 5.2–5.4.
const OwnerLayout = lazy(() =>
  import('./pages/owner/OwnerLayout').then((m) => ({ default: m.OwnerLayout })),
);
const OwnerCalendarPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerCalendarPage })),
);
const OwnerClientsPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerClientsPage })),
);
const OwnerMarketingPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerMarketingPage })),
);
const OwnerWorkingHoursPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerWorkingHoursPage })),
);
const OwnerAnalyticsPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerAnalyticsPage })),
);
const OwnerConfigurationPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerConfigurationPage })),
);
const OwnerTeamPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerTeamPage })),
);
const OwnerSubscriptionPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerSubscriptionPage })),
);
const OwnerQrPage = lazy(() => import('./pages/owner').then((m) => ({ default: m.OwnerQrPage })));
const OwnerMyQrPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerMyQrPage })),
);
const OwnerTransactionsPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerTransactionsPage })),
);
const OwnerNotificationsPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerNotificationsPage })),
);
const OwnerProfilePage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerProfilePage })),
);

// Global platform operations center — deliberately separate from the
// tenant-scoped owner shell. It is reachable only with a PlatformAdmin JWT.
const PlatformAdminLayout = lazy(() =>
  import('./pages/platform-admin/PlatformAdminLayout').then((m) => ({ default: m.PlatformAdminLayout })),
);
const PlatformDashboardPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminPages').then((m) => ({ default: m.PlatformDashboardPage })),
);
const PlatformSalonsPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminPages').then((m) => ({ default: m.PlatformSalonsPage })),
);
const PlatformCustomersPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminPages').then((m) => ({ default: m.PlatformCustomersPage })),
);
const PlatformStaffPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminPages').then((m) => ({ default: m.PlatformStaffPage })),
);
const PlatformAppointmentsPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminPages').then((m) => ({ default: m.PlatformAppointmentsPage })),
);
const PlatformSubscriptionsPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminPages').then((m) => ({ default: m.PlatformSubscriptionsPage })),
);
const PlatformPaymentsPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminPages').then((m) => ({ default: m.PlatformPaymentsPage })),
);
const PlatformWaitlistPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminPages').then((m) => ({ default: m.PlatformWaitlistPage })),
);
const PlatformQrScansPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminPages').then((m) => ({ default: m.PlatformQrScansPage })),
);
const PlatformAuditPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminPages').then((m) => ({ default: m.PlatformAuditPage })),
);
const PlatformAdminRecordDetailPage = lazy(() =>
  import('./pages/platform-admin/PlatformAdminRecordDetailPage').then((m) => ({ default: m.PlatformAdminRecordDetailPage })),
);

function HomeEntryPage() {
  const { status, isStaff, isPlatformAdmin } = useAuth();

  if (status === 'loading') return <RouteLoader />;
  if (status === 'authenticated') {
    return <Navigate to={isPlatformAdmin ? '/platform-admin' : isStaff ? '/owner' : '/account'} replace />;
  }

  return <BusinessLanding />;
}

function AdminEntryPage() {
  const { status, role, isStaff } = useAuth();
  if (status === 'loading') return <RouteLoader />;
  if (status === 'anonymous') return <Navigate to="/auth" replace />;
  if (role === 'PlatformAdmin') return <Navigate to="/platform-admin" replace />;
  return <Navigate to={isStaff ? '/owner' : '/account'} replace />;
}

/** Customer-only app surface. Staff and platform operators stay in their own panel. */
function CustomerOnlyRoute() {
  const { status, isCustomer, isStaff, isPlatformAdmin } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <RouteLoader />;

  if (status === 'anonymous') {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/auth" state={{ returnTo }} replace />;
  }

  if (!isCustomer) {
    return <Navigate to={isPlatformAdmin ? '/platform-admin' : isStaff ? '/owner' : '/account'} replace />;
  }

  return <Outlet />;
}

export function App() {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            {/* Single app-level ToastProvider: `useToast` works on every route
             * and a toast survives page navigation. (Pages must NOT mount
             * their own nested ToastProvider — the nearest provider wins and
             * a nested one would silo its toasts to that page.) */}
            <ToastProvider>
              <div dir="rtl" lang="fa" className="app-root">
                <RouteProgress />
                <Suspense fallback={<RouteLoader />}>
                  <Routes>
                    <Route path="/platform-admin" element={<PlatformAdminLayout />}>
                      <Route index element={<PlatformDashboardPage />} />
                      <Route path="details" element={<PlatformAdminRecordDetailPage />} />
                      <Route path="salons" element={<PlatformSalonsPage />} />
                      <Route path="customers" element={<PlatformCustomersPage />} />
                      <Route path="staff" element={<PlatformStaffPage />} />
                      <Route path="appointments" element={<PlatformAppointmentsPage />} />
                      <Route path="subscriptions" element={<PlatformSubscriptionsPage />} />
                      <Route path="payments" element={<PlatformPaymentsPage />} />
                      <Route path="waitlist" element={<PlatformWaitlistPage />} />
                      <Route path="qr-scans" element={<PlatformQrScansPage />} />
                      <Route path="audit-logs" element={<PlatformAuditPage />} />
                    </Route>

                    {/*
                     * Owner panel (R2.1): `/owner/*` brings its own `OwnerShell`
                     * (header / single `<main>` / role-filtered nav) so it renders
                     * OUTSIDE `AppShell` — exactly one `<main>` landmark per page.
                     * `OwnerLayout` gates the area (auth bootstrap + RBAC) and the
                     * nested pages render inside its `<Outlet>`.
                     */}
                    <Route path="/owner" element={<OwnerLayout />}>
                      <Route index element={<Navigate to="/owner/calendar" replace />} />
                      <Route path="profile" element={<OwnerProfilePage />} />
                      <Route path="calendar" element={<OwnerCalendarPage />} />
                      <Route path="clients" element={<OwnerClientsPage />} />
                      <Route path="marketing" element={<OwnerMarketingPage />} />
                      <Route path="calendar/working-hours" element={<OwnerWorkingHoursPage />} />
                      <Route path="analytics" element={<OwnerAnalyticsPage />} />
                      <Route path="config" element={<OwnerConfigurationPage />} />
                      <Route path="team" element={<OwnerTeamPage />} />
                      <Route path="subscription" element={<OwnerSubscriptionPage />} />
                      <Route path="transactions" element={<OwnerTransactionsPage />} />
                      <Route path="notifications" element={<OwnerNotificationsPage />} />
                      <Route path="qr" element={<OwnerQrPage />} />
                      <Route path="my-qr" element={<OwnerMyQrPage />} />
                    </Route>

                    {/*
                     * Booking funnel (آرا Design Goals 12, 15, 17, 19):
                     * `/salon/:salonId/book/*` and `/booking/success` render
                     * OUTSIDE `AppShell` in their own `FunnelShell` (no nav chrome,
                     * sticky mobile CTA in thumb reach). `FunnelTenantTheme`
                     * resolves the salon's Brand_Accent and scopes it to the
                     * funnel subtree (R4.2).
                     */}
                    <Route path="/salon/:salonId/book" element={<FunnelTenantTheme />}>
                      <Route index element={<AvailabilityPage />} />
                      <Route path="confirm" element={<BookingConfirmPage />} />
                    </Route>
                    <Route path="/booking/success" element={<BookingSuccessPage />} />

                    {/* Public + customer + admin surfaces, inside the app shell.
                     * The INNER Suspense keeps the shell chrome (sticky header,
                     * footer) mounted while a page chunk loads — only the main
                     * region shows the RouteLoader skeleton. `PageTransition`
                     * adds the enter-only route crossfade (reduced-motion safe).
                     */}
                    <Route
                      element={
                        <AppShell>
                          <PageTransition>
                            <Suspense fallback={<RouteLoader />}>
                              <Outlet />
                            </Suspense>
                          </PageTransition>
                        </AppShell>
                      }
                    >
                      {/* Launch home: owner-acquisition is the primary product.
                       * Marketplace discovery stays out of navigation and old
                       * public discovery URLs return here until that product is
                       * ready to launch. Direct salon profiles and booking links
                       * remain available below. */}
                      <Route path="/" element={<HomeEntryPage />} />
                      <Route path="/business" element={<Navigate to="/" replace />} />

                      {/* Salon self-registration onboarding wizard (noindex) */}
                      <Route path="/business/register" element={<RegisterSalonPage />} />

                      {/* Public salon profile (indexable) */}
                      <Route path="/s/:slug" element={<SalonProfilePage />} />

                      {/* Marketplace is intentionally unavailable at launch. */}
                      <Route path="/city/:city" element={<Navigate to="/" replace />} />
                      <Route path="/services/:type" element={<Navigate to="/" replace />} />
                      <Route path="/search" element={<Navigate to="/" replace />} />

                      {/* Public trust & legal pages (indexable) */}
                      <Route path="/about" element={<AboutPage />} />
                      <Route path="/contact" element={<ContactPage />} />
                      <Route path="/privacy" element={<PrivacyPage />} />
                      <Route path="/terms" element={<TermsPage />} />

                      {/* Customer flows — dashboard and saved-salon surfaces require a customer session. */}
                      <Route path="/auth" element={<AuthPage />} />
                      <Route element={<CustomerOnlyRoute />}>
                        <Route path="/account" element={<CustomerDashboardPage />} />
                        <Route path="/salon/:salonId/waitlist" element={<WaitlistPage />} />
                        <Route path="/my-salons" element={<MySalonsPage />} />
                      </Route>
                      <Route path="/qr/:payload" element={<QrLandingPage />} />
                      {/*
                       * Booking funnel + success live outside AppShell (above)
                       * for the FunnelShell no-chrome pattern (آرا Design Goal 17).
                       */}

                      {/* Legacy admin paths → consolidated into the owner panel,
                      which bootstraps auth and guards by role. */}
                      <Route path="/admin" element={<AdminEntryPage />} />
                      <Route
                        path="/admin/config"
                        element={<Navigate to="/owner/config" replace />}
                      />
                      <Route
                        path="/admin/calendar"
                        element={<Navigate to="/owner/calendar" replace />}
                      />
                      <Route
                        path="/admin/analytics"
                        element={<Navigate to="/owner/analytics" replace />}
                      />

                      {/* Catch-all 404 (noindex) — polished, with search + home
                      + category links so a dead URL still converts. */}
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Routes>
                </Suspense>
              </div>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </HelmetProvider>
  );
}

export default App;
