import { lazy, Suspense } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { ThemeProvider } from './components/theme';
import { AppShell, RouteLoader } from './components/layout';
import { AuthProvider } from './auth/AuthContext';

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
const MarketingHome = lazy(() =>
  import('./pages/MarketingHome').then((m) => ({ default: m.MarketingHome })),
);
const BusinessLanding = lazy(() =>
  import('./pages/BusinessLanding').then((m) => ({
    default: m.BusinessLanding,
  })),
);
const SalonProfilePage = lazy(() =>
  import('./pages/SalonProfilePage').then((m) => ({
    default: m.SalonProfilePage,
  })),
);
const CityPage = lazy(() =>
  import('./pages/DiscoveryPages').then((m) => ({ default: m.CityPage })),
);
const ServicePage = lazy(() =>
  import('./pages/DiscoveryPages').then((m) => ({ default: m.ServicePage })),
);
const AboutPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.AboutPage })),
);
const ContactPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.ContactPage })),
);
const PrivacyPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.TermsPage })),
);
const AuthPage = lazy(() =>
  import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })),
);
const QrLandingPage = lazy(() =>
  import('./pages/QrLandingPage').then((m) => ({ default: m.QrLandingPage })),
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
const OwnerAnalyticsPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerAnalyticsPage })),
);
const OwnerConfigurationPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerConfigurationPage })),
);
const OwnerSubscriptionPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerSubscriptionPage })),
);
const OwnerQrPage = lazy(() =>
  import('./pages/owner').then((m) => ({ default: m.OwnerQrPage })),
);

export function App() {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
          <div dir="rtl" lang="fa" className="app-root">
            <Suspense fallback={<RouteLoader />}>
              <Routes>
                {/*
                 * Owner panel (R2.1): `/owner/*` brings its own `OwnerShell`
                 * (header / single `<main>` / role-filtered nav) so it renders
                 * OUTSIDE `AppShell` — exactly one `<main>` landmark per page.
                 * `OwnerLayout` gates the area (auth bootstrap + RBAC) and the
                 * nested pages render inside its `<Outlet>`.
                 */}
                <Route path="/owner" element={<OwnerLayout />}>
                  <Route
                    index
                    element={<Navigate to="/owner/calendar" replace />}
                  />
                  <Route path="calendar" element={<OwnerCalendarPage />} />
                  <Route path="analytics" element={<OwnerAnalyticsPage />} />
                  <Route path="config" element={<OwnerConfigurationPage />} />
                  <Route
                    path="subscription"
                    element={<OwnerSubscriptionPage />}
                  />
                  <Route path="qr" element={<OwnerQrPage />} />
                </Route>

                {/* Public + customer + admin surfaces, inside the app shell. */}
                <Route
                  element={
                    <AppShell>
                      <Outlet />
                    </AppShell>
                  }
                >
                  {/* Public marketing home (indexable) */}
                  <Route path="/" element={<MarketingHome />} />

                  {/* Owner-acquisition marketing landing (indexable) */}
                  <Route path="/business" element={<BusinessLanding />} />

                  {/* Public salon profile (indexable) */}
                  <Route path="/s/:slug" element={<SalonProfilePage />} />

                  {/* Public discovery pages (indexable) */}
                  <Route path="/city/:city" element={<CityPage />} />
                  <Route path="/services/:type" element={<ServicePage />} />

                  {/* Public trust & legal pages (indexable) */}
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />

                  {/* Customer flows */}
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/qr/:payload" element={<QrLandingPage />} />
                  <Route
                    path="/salon/:salonId/book"
                    element={<AvailabilityPage />}
                  />
                  <Route
                    path="/salon/:salonId/book/confirm"
                    element={<BookingConfirmPage />}
                  />
                  <Route
                    path="/booking/success"
                    element={<BookingSuccessPage />}
                  />

                  {/* Legacy admin paths → consolidated into the owner panel,
                      which bootstraps auth and guards by role. */}
                  <Route
                    path="/admin"
                    element={<Navigate to="/owner" replace />}
                  />
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
                </Route>
              </Routes>
            </Suspense>
          </div>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </HelmetProvider>
  );
}

export default App;
