import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '../../../components/theme';
import '../../../i18n';

/**
 * Component tests for the owner-panel section pages (task 5.2; R2.1, R7.1).
 *
 * Task 5.2 surfaces the *existing* admin pages — {@link AnalyticsPage},
 * {@link ConfigurationPage} — inside the owner panel. The calendar page has been
 * redesigned (task 7.4) as a standalone OwnerCalendarPage. These tests assert:
 *
 *  1. Each reused admin page renders inside the {@link OwnerShell} (its
 *     preserved root testID — `admin-analytics` /
 *     `admin-configuration` — is present alongside the panel's own
 *     `owner-*-page` section hook).
 *  2. The `dir="rtl"`/`lang="fa"` document contract (R2.9, R8.4) is preserved
 *     around the reused pages.
 *  3. The section routes stay consistent with the shell's role-aware nav
 *     (Owner = everything; Admin = no configuration; Stylist = calendar only):
 *     a role that can't see a section is redirected back to the calendar.
 *
 * The admin pages' own behavioural suites already cover their internals; here we
 * only verify the reuse + preserved hooks, so the admin API client is stubbed
 * with empty/lightweight payloads so every section mounts to its populated/empty
 * state.
 */

const bootstrapAuth = vi.fn();
const getAccessToken = vi.fn();
const getMe = vi.fn();
const signOut = vi.fn();
const getSalonWorkingHours = vi.fn();
const setSalonWorkingHours = vi.fn();
const getBookingPolicy = vi.fn();
const setBookingPolicy = vi.fn();

vi.mock('../../../api/client', () => {
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
    bootstrapAuth: () => bootstrapAuth(),
    getAccessToken: () => getAccessToken(),
    signOut: () => signOut(),
    meApi: {
      getMe: () => getMe(),
    },
    // The owner sections reuse the admin pages, which read the
    // calendar/analytics/config endpoints — stub them so the panel mounts.
    adminApi: {
      getCalendar: vi.fn().mockResolvedValue({ appointments: [] }),
      getAnalytics: vi.fn().mockResolvedValue({ utilization: {}, revenue: 0, busiestWindows: [] }),
      getStaff: vi.fn().mockResolvedValue({ staff: [] }),
      getChairs: vi.fn().mockResolvedValue({ chairs: [] }),
    },
    salonApi: {
      getServices: vi.fn().mockResolvedValue({ services: [] }),
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
    holidaysApi: {
      list: vi.fn().mockResolvedValue({ holidays: [] }),
      add: vi.fn().mockResolvedValue({ holiday: {} }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    },
    workingHoursApi: {
      getSalon: (...args: unknown[]) => getSalonWorkingHours(...args),
      setSalon: (...args: unknown[]) => setSalonWorkingHours(...args),
      getStaff: vi.fn().mockResolvedValue({ hours: [] }),
      setStaff: vi.fn().mockResolvedValue({ ok: true, hours: [] }),
    },
    bookingPolicyApi: {
      get: (...args: unknown[]) => getBookingPolicy(...args),
      set: (...args: unknown[]) => setBookingPolicy(...args),
    },
    emergencyScheduleApi: {
      closeDay: vi.fn().mockResolvedValue({ ok: true, cancelledCount: 0, failedCount: 0 }),
    },
    staffApi: {
      create: vi.fn().mockResolvedValue({ staff: {} }),
      update: vi.fn().mockResolvedValue({ staff: {} }),
    },
    staffAvailabilityApi: {
      list: vi.fn().mockResolvedValue({ blocks: [] }),
      add: vi.fn().mockResolvedValue({ block: {} }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
      setManageOwn: vi.fn().mockResolvedValue({ ok: true, allowed: false }),
    },
  };
});

import { OwnerLayout } from '../OwnerLayout';
import { OwnerCalendarPage, OwnerAnalyticsPage, OwnerConfigurationPage } from '..';
import type { OwnerRole } from '../../../api/client';
import { ToastProvider } from '../../../components/ui/Toast';

/**
 * Mounts the owner panel at `initialPath` for the given `role`. The app-root
 * wrapper carries the same `dir="rtl"`/`lang="fa"` contract that `App.tsx`
 * applies in production, so the reuse tests can assert it survives.
 */
function renderOwnerApp(role: OwnerRole, initialPath: string) {
  getAccessToken.mockReturnValue('access-token');
  getMe.mockResolvedValue({ principal: { id: 'u1', role } });

  return render(
    <HelmetProvider>
      <ThemeProvider defaultTheme="light">
        <div dir="rtl" lang="fa" className="app-root">
          <ToastProvider>
            <MemoryRouter initialEntries={[initialPath]}>
              <Routes>
                <Route path="/owner" element={<OwnerLayout />}>
                  <Route path="calendar" element={<OwnerCalendarPage />} />
                  <Route path="analytics" element={<OwnerAnalyticsPage />} />
                  <Route path="config" element={<OwnerConfigurationPage />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </div>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSalonWorkingHours.mockResolvedValue({
    hours: [{ weekday: 6, startTime: '09:00', endTime: '20:00' }],
  });
  setSalonWorkingHours.mockResolvedValue({ ok: true, hours: [] });
  getBookingPolicy.mockResolvedValue({ bookingWindowDays: 14 });
  setBookingPolicy.mockResolvedValue({ ok: true, bookingWindowDays: 14 });
});

afterEach(() => {
  cleanup();
});

describe('Owner panel — reused admin pages (R2.1, R7.1)', () => {
  it('renders the redesigned OwnerCalendarPage in the owner calendar section', async () => {
    renderOwnerApp('Owner', '/owner/calendar');

    // The redesigned page has its own testid (no longer wrapping admin CalendarPage).
    expect(await screen.findByTestId('owner-calendar-page')).toBeInTheDocument();

    // Rendered inside the owner shell's single <main>.
    expect(screen.getByRole('main')).toContainElement(screen.getByTestId('owner-calendar-page'));
  });

  it('opens recurring weekly hours directly from the calendar', async () => {
    renderOwnerApp('Owner', '/owner/calendar');
    fireEvent.click(await screen.findByRole('button', { name: 'ساعات کاری هفتگی' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('برنامه کاری هفتگی');
    await waitFor(() => expect(getSalonWorkingHours).toHaveBeenCalled());
    expect(screen.getByText('پنجشنبه و جمعه تعطیل')).toBeInTheDocument();
  });

  it('turns a recurring break into two bookable windows', async () => {
    renderOwnerApp('Owner', '/owner/calendar');
    fireEvent.click(await screen.findByRole('button', { name: 'ساعات کاری هفتگی' }));
    fireEvent.click(await screen.findByRole('switch', { name: /زمان استراحت تکرارشونده/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره برنامه هفتگی' }));
    await waitFor(() =>
      expect(setSalonWorkingHours).toHaveBeenCalledWith(expect.any(String), [
        { weekday: 6, startTime: '09:00', endTime: '13:00' },
        { weekday: 6, startTime: '14:00', endTime: '20:00' },
      ]),
    );
    expect(setBookingPolicy).toHaveBeenCalledWith(expect.any(String), 14);
  });

  it('selects working time from scrollable hour and minute wheels', async () => {
    renderOwnerApp('Owner', '/owner/calendar');
    fireEvent.click(await screen.findByRole('button', { name: 'ساعات کاری هفتگی' }));
    fireEvent.click(await screen.findByRole('button', { name: 'شروع 09:00' }));
    const wheels = await screen.findAllByRole('listbox');
    fireEvent.click(within(wheels[0]).getByRole('option', { name: '10' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأیید ساعت' }));
    expect(await screen.findByRole('button', { name: 'شروع 10:00' })).toBeInTheDocument();
  });

  it('renders the admin AnalyticsPage inside the owner analytics section', async () => {
    renderOwnerApp('Owner', '/owner/analytics');

    expect(await screen.findByTestId('owner-analytics-page')).toBeInTheDocument();
    expect(await screen.findByTestId('admin-analytics')).toBeInTheDocument();
  });

  it('renders the admin ConfigurationPage inside the owner config section', async () => {
    renderOwnerApp('Owner', '/owner/config');

    expect(await screen.findByTestId('owner-config-page')).toBeInTheDocument();
    expect(await screen.findByTestId('admin-configuration')).toBeInTheDocument();
  });
});

describe('Owner panel — dir/lang contract preserved (R2.9, R8.4)', () => {
  it('keeps dir="rtl"/lang="fa" around the reused admin pages', async () => {
    const { container } = renderOwnerApp('Owner', '/owner/calendar');

    await screen.findByTestId('owner-calendar-page');

    const root = container.querySelector('.app-root');
    expect(root).toHaveAttribute('dir', 'rtl');
    expect(root).toHaveAttribute('lang', 'fa');

    // The redesigned calendar page lives within that contract.
    expect(root).toContainElement(screen.getByTestId('owner-calendar-page'));
  });
});

describe('Owner panel — section routes mirror role-aware nav (R2.3)', () => {
  it('redirects a Stylist away from analytics to the calendar', async () => {
    renderOwnerApp('Stylist', '/owner/analytics');

    // Stylist sees calendar only — analytics redirects to the calendar.
    expect(await screen.findByTestId('owner-calendar-page')).toBeInTheDocument();
    expect(screen.queryByTestId('owner-analytics-page')).not.toBeInTheDocument();
  });

  it('redirects an Admin away from configuration to the calendar', async () => {
    renderOwnerApp('Admin', '/owner/config');

    // Configuration is Owner-only — an Admin is redirected to the calendar.
    expect(await screen.findByTestId('owner-calendar-page')).toBeInTheDocument();
    expect(screen.queryByTestId('owner-config-page')).not.toBeInTheDocument();
  });

  it('lets an Admin reach analytics', async () => {
    renderOwnerApp('Admin', '/owner/analytics');

    expect(await screen.findByTestId('owner-analytics-page')).toBeInTheDocument();
    expect(await screen.findByTestId('admin-analytics')).toBeInTheDocument();
  });
});
