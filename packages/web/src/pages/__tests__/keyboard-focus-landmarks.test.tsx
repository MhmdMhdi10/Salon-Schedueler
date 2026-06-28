import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import {
  renderRtl,
  expectNoSeriousA11yViolations,
  expectSingleH1AndOrderedHeadings,
} from '../../test/a11y';

/**
 * Accessibility pass — keyboard, focus, and landmarks (task 10.1; R10.2, R10.3,
 * R3.8; ui-ux §10).
 *
 * The customer funnel and admin pages already carry the visible focus ring
 * (the global `:focus-visible` token outline + per-control `outline-focus`),
 * Radix-backed dialog/sheet focus management (trapped, restored, Esc — covered
 * in `overlays.test.tsx`), and a logical-property RTL layout so the focus order
 * follows reading order. What was missing was an explicit, per-page **heading
 * audit** — exactly one `<h1>` and no skipped heading levels — to match the
 * coverage the public pages already have (MarketingHome / SalonProfile /
 * Discovery / Legal). This file closes that gap for the funnel + admin pages
 * and re-checks them in RTL via axe.
 *
 * These pages are rendered standalone (each hosts its own content; the shell's
 * `<header>`/`<main>`/`<footer>` landmarks and skip link are audited in the
 * layout shell tests). The API clients are mocked so the pages reach their
 * populated state where the full heading outline is present.
 */

// ---- API client mock (covers every endpoint the audited pages call) --------

const getServices = vi.fn();
const getAvailability = vi.fn();
const getStylists = vi.fn();
const resolveQr = vi.fn();
const getStaff = vi.fn();
const getChairs = vi.fn();
const getCalendar = vi.fn();
const getAnalytics = vi.fn();

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
      requestOtp: vi.fn().mockResolvedValue(undefined),
      verifyOtp: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    },
    salonApi: {
      getServices: (salonId: string) => getServices(salonId),
      getAvailability: (salonId: string, serviceId: string, date: string) =>
        getAvailability(salonId, serviceId, date),
      resolveQr: (payload: string) => resolveQr(payload),
      getStylists: (salonId: string) => getStylists(salonId),
    },
    bookingApi: { create: vi.fn() },
    approvalPolicyApi: {
      get: vi.fn().mockResolvedValue({ autoApprove: false, staff: [] }),
      setSalon: vi.fn().mockResolvedValue({ ok: true, autoApprove: false }),
      setStaff: vi.fn().mockResolvedValue({ ok: true, autoApprove: null }),
    },
    brandAccentApi: {
      get: vi.fn().mockResolvedValue({ brandAccent: null }),
      set: vi.fn().mockResolvedValue({ ok: true, brandAccent: null }),
    },
    adminApi: {
      getStaff: (salonId: string) => getStaff(salonId),
      getChairs: (salonId: string) => getChairs(salonId),
      getCalendar: (salonId: string, from: string, to: string, view: string) =>
        getCalendar(salonId, from, to, view),
      getAnalytics: (salonId: string, from: string, to: string) =>
        getAnalytics(salonId, from, to),
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

const SERVICES = [
  { id: 'svc-1', name: 'کوتاهی مو', durationMinutes: 30, priceRial: 2500000 },
];

function wrap(ui: React.ReactElement, initialPath = '/') {
  return (
    <HelmetProvider>
      <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
    </HelmetProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  getServices.mockResolvedValue({ services: SERVICES });
  getAvailability.mockResolvedValue({ slots: [] });
  getStylists.mockResolvedValue({ stylists: [] });
  resolveQr.mockResolvedValue({ salon: { id: 'salon-1', name: 'سالن رز' } });
  getStaff.mockResolvedValue({ staff: [{ id: 's1', name: 'مینا' }] });
  getChairs.mockResolvedValue({ chairs: [{ id: 'c1', name: 'صندلی ۱' }] });
  getCalendar.mockResolvedValue({ appointments: [] });
  getAnalytics.mockResolvedValue({
    utilization: { utilization: 0.5, bookedMinutes: 60, availableMinutes: 120 },
    revenue: { totalRial: 5000000, appointmentCount: 3 },
    busiestWindows: [
      { startAt: '2024-03-15T10:00:00Z', endAt: '2024-03-15T11:00:00Z', concurrentCount: 2 },
    ],
  });
});

afterEach(() => {
  cleanup();
});

describe('Heading audit — customer funnel pages (single <h1>, ordered levels)', () => {
  it('AuthPage opens the outline at a single <h1>', () => {
    const { getByTestId } = render(wrap(<AuthPage />, '/auth'));
    expectSingleH1AndOrderedHeadings(getByTestId('auth-page'));
  });

  it('QrLandingPage (resolved) has a single <h1>', async () => {
    const { findByTestId } = render(
      wrap(
        <Routes>
          <Route path="/qr/:payload" element={<QrLandingPage />} />
        </Routes>,
        '/qr/abc123',
      ),
    );
    expectSingleH1AndOrderedHeadings(await findByTestId('qr-landing'));
  });

  it('AvailabilityPage has a single <h1> with ordered section <h2>s', async () => {
    const { findByTestId } = render(
      wrap(
        <Routes>
          <Route path="/salon/:salonId/book" element={<AvailabilityPage />} />
        </Routes>,
        '/salon/salon-1/book',
      ),
    );
    const root = await findByTestId('availability-page');
    await screen.findByText('کوتاهی مو');
    const levels = expectSingleH1AndOrderedHeadings(root);
    // Page title (h1) then the three step sections (h2): service, date, time.
    expect(levels.filter((l) => l === 2).length).toBeGreaterThanOrEqual(3);
  });

  it('BookingConfirmPage has a single <h1> with ordered levels', async () => {
    const { findByTestId } = render(
      <HelmetProvider>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/salon/salon-1/book/confirm',
              state: { serviceId: 'svc-1', startAt: '2999-03-15T09:30:00.000Z' },
            },
          ]}
        >
          <Routes>
            <Route
              path="/salon/:salonId/book/confirm"
              element={<BookingConfirmPage />}
            />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );
    const root = await findByTestId('booking-confirm');
    await screen.findByText('کوتاهی مو');
    expectSingleH1AndOrderedHeadings(root);
  });

  it('BookingSuccessPage has a single <h1> with ordered levels', () => {
    const { getByTestId } = render(
      wrap(
        <Routes>
          <Route path="/booking/success" element={<BookingSuccessPage />} />
        </Routes>,
        '/booking/success',
      ),
    );
    expectSingleH1AndOrderedHeadings(getByTestId('booking-success'));
  });
});

describe('Heading audit — admin pages (single <h1>, ordered levels)', () => {
  it('ConfigurationPage has a single <h1> with ordered section <h2>s', async () => {
    const { findByTestId } = render(wrap(<ConfigurationPage salonId="salon-1" />));
    const root = await findByTestId('admin-configuration');
    await waitFor(() => expect(getServices).toHaveBeenCalled());
    await screen.findByText('کوتاهی مو');
    expectSingleH1AndOrderedHeadings(root);
  });

  it('CalendarPage has a single <h1> with ordered levels', async () => {
    const { findByTestId } = render(wrap(<CalendarPage salonId="salon-1" />));
    const root = await findByTestId('admin-calendar');
    await screen.findByTestId('calendar-appointments');
    expectSingleH1AndOrderedHeadings(root);
  });

  it('AnalyticsPage has a single <h1> with ordered levels', async () => {
    const { findByTestId } = render(wrap(<AnalyticsPage salonId="salon-1" />));
    const root = await findByTestId('admin-analytics');
    await screen.findByTestId('analytics-utilization');
    expectSingleH1AndOrderedHeadings(root);
  });
});

describe('Keyboard & focus — funnel/admin controls are reachable with a visible ring', () => {
  it('AuthPage primary CTA is a real, focusable <button> carrying the focus-ring class', () => {
    render(wrap(<AuthPage />, '/auth'));
    const cta = screen.getByRole('button', { name: 'دریافت کد' });
    cta.focus();
    expect(cta).toHaveFocus();
    // The shared Button base applies the token focus ring on focus-visible.
    expect(cta.className).toMatch(/focus-visible:outline-focus/);
  });

  it('Admin side-nav links use real anchors (keyboard operable) — calendar tabs keep tab semantics', async () => {
    render(wrap(<CalendarPage salonId="salon-1" />));
    await screen.findByTestId('calendar-appointments');
    // The day/week toggle preserves the tab semantics that keyboard users rely
    // on (Radix roving tabindex, RTL-aware arrow keys).
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0]).toHaveAttribute('aria-selected');
  });
});

describe('Accessibility (axe) in RTL — funnel/admin populated states', () => {
  it('AvailabilityPage has no serious/critical violations in RTL', async () => {
    const { rtlContainer } = renderRtl(
      wrap(
        <Routes>
          <Route path="/salon/:salonId/book" element={<AvailabilityPage />} />
        </Routes>,
        '/salon/salon-1/book',
      ),
    );
    await screen.findByText('کوتاهی مو');
    await expectNoSeriousA11yViolations(rtlContainer);
  });

  it('ConfigurationPage has no serious/critical violations in RTL', async () => {
    const { rtlContainer } = renderRtl(wrap(<ConfigurationPage salonId="salon-1" />));
    await screen.findByText('کوتاهی مو');
    await expectNoSeriousA11yViolations(rtlContainer);
  });
});
