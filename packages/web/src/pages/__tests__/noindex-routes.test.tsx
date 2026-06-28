import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';

/**
 * Indexability tests for the private app/admin/auth/funnel routes (task 4.2,
 * R8.7; seo §1). Every one of these surfaces is transactional, authenticated,
 * or per-visit and must never be a search target. Each page renders `<SeoHead>`
 * with the noindex default, so the document must carry
 * `<meta name="robots" content="noindex,follow">`.
 *
 * The set covered here mirrors the SEO indexability map verbatim:
 *   `/` (old login) and `/auth`, `/qr/:payload`, the booking funnel
 *   (availability + confirm), `/booking/success`, and all admin pages.
 *
 * Requirements: 8.7
 */

// Stub the API client so the pages mount without real network calls. The
// availability/qr/admin pages call into it on mount; resolved empty data keeps
// them in a render path that still emits the head.
vi.mock('../../api/client', () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    ApiError,
    setAccessToken: vi.fn(),
    authApi: {
      requestOtp: vi.fn().mockResolvedValue({}),
      verifyOtp: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    },
    salonApi: {
      resolveQr: vi.fn().mockResolvedValue({ salon: { id: 'salon-1', name: 'سالن رز' } }),
      getServices: vi.fn().mockResolvedValue({ services: [] }),
      getAvailability: vi.fn().mockResolvedValue({ slots: [] }),
      getStylists: vi.fn().mockResolvedValue({ stylists: [] }),
    },
    approvalPolicyApi: {
      get: vi.fn().mockResolvedValue({ autoApprove: false, staff: [] }),
      setSalon: vi.fn().mockResolvedValue({ ok: true, autoApprove: false }),
      setStaff: vi.fn().mockResolvedValue({ ok: true, autoApprove: null }),
    },
    brandAccentApi: {
      get: vi.fn().mockResolvedValue({ brandAccent: null }),
      set: vi.fn().mockResolvedValue({ ok: true, brandAccent: null }),
    },
    bookingApi: {
      create: vi.fn().mockResolvedValue({ status: 'confirmed' }),
    },
    adminApi: {
      getStaff: vi.fn().mockResolvedValue({ staff: [] }),
      getChairs: vi.fn().mockResolvedValue({ chairs: [] }),
      getCalendar: vi.fn().mockResolvedValue({ appointments: [] }),
      getAnalytics: vi
        .fn()
        .mockResolvedValue({ utilization: {}, revenue: 0, busiestWindows: [] }),
    },
  };
});

import { AuthPage } from '../AuthPage';
import { QrLandingPage } from '../QrLandingPage';
import { AvailabilityPage } from '../AvailabilityPage';
import { BookingConfirmPage } from '../BookingConfirmPage';
import { BookingSuccessPage } from '../BookingSuccessPage';
import { ConfigurationPage } from '../admin/ConfigurationPage';
import { CalendarPage } from '../admin/CalendarPage';
import { AnalyticsPage } from '../admin/AnalyticsPage';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

function robotsContent(): string | null {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null;
}

/** Render `element` at `path` inside the router + Helmet providers. */
function renderAt(path: string, element: React.ReactElement, route = path) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('private routes emit noindex,follow (R8.7)', () => {
  it('`/auth` (the login surface) is noindex', async () => {
    renderAt('/auth', <AuthPage />);
    await waitFor(() => expect(robotsContent()).toBe('noindex,follow'));
  });

  it('`/qr/:payload` is noindex', async () => {
    renderAt('/qr/abc123', <QrLandingPage />, '/qr/:payload');
    await waitFor(() => expect(robotsContent()).toBe('noindex,follow'));
  });

  it('`/salon/:salonId/book` (availability) is noindex', async () => {
    renderAt('/salon/salon-1/book', <AvailabilityPage />, '/salon/:salonId/book');
    await waitFor(() => expect(robotsContent()).toBe('noindex,follow'));
  });

  it('`/salon/:salonId/book/confirm` is noindex', async () => {
    renderAt(
      '/salon/salon-1/book/confirm',
      <BookingConfirmPage />,
      '/salon/:salonId/book/confirm',
    );
    await waitFor(() => expect(robotsContent()).toBe('noindex,follow'));
  });

  it('`/booking/success` is noindex', async () => {
    renderAt('/booking/success', <BookingSuccessPage />);
    await waitFor(() => expect(robotsContent()).toBe('noindex,follow'));
  });

  it('`/admin/config` is noindex', async () => {
    renderAt('/admin/config', <ConfigurationPage salonId="salon-1" />);
    await waitFor(() => expect(robotsContent()).toBe('noindex,follow'));
  });

  it('`/admin/calendar` is noindex', async () => {
    renderAt('/admin/calendar', <CalendarPage salonId="salon-1" />);
    await waitFor(() => expect(robotsContent()).toBe('noindex,follow'));
  });

  it('`/admin/analytics` is noindex', async () => {
    renderAt('/admin/analytics', <AnalyticsPage salonId="salon-1" />);
    await waitFor(() => expect(robotsContent()).toBe('noindex,follow'));
  });
});
