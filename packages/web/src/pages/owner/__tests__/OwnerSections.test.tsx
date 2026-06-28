import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '../../../components/theme';
import '../../../i18n';

/**
 * Component tests for the owner-panel section pages (task 5.2; R2.1, R7.1).
 *
 * Task 5.2 surfaces the *existing* admin pages — {@link CalendarPage},
 * {@link AnalyticsPage}, {@link ConfigurationPage} — inside the owner panel
 * rather than rewriting them. These tests assert that contract:
 *
 *  1. Each reused admin page renders inside the {@link OwnerShell} (its
 *     preserved root testID — `admin-calendar` / `admin-analytics` /
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
      getAnalytics: vi
        .fn()
        .mockResolvedValue({ utilization: {}, revenue: 0, busiestWindows: [] }),
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
  };
});

import { OwnerLayout } from '../OwnerLayout';
import {
  OwnerCalendarPage,
  OwnerAnalyticsPage,
  OwnerConfigurationPage,
} from '..';
import type { OwnerRole } from '../../../api/client';

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
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/owner" element={<OwnerLayout />}>
                <Route path="calendar" element={<OwnerCalendarPage />} />
                <Route path="analytics" element={<OwnerAnalyticsPage />} />
                <Route path="config" element={<OwnerConfigurationPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </div>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('Owner panel — reused admin pages (R2.1, R7.1)', () => {
  it('renders the admin CalendarPage inside the owner calendar section', async () => {
    renderOwnerApp('Owner', '/owner/calendar');

    // The panel's section wrapper and the reused admin page's preserved root
    // hook both resolve — the admin page is surfaced, not rewritten.
    expect(
      await screen.findByTestId('owner-calendar-page'),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('admin-calendar')).toBeInTheDocument();

    // Rendered inside the owner shell's single <main>.
    expect(screen.getByRole('main')).toContainElement(
      screen.getByTestId('admin-calendar'),
    );
  });

  it('renders the admin AnalyticsPage inside the owner analytics section', async () => {
    renderOwnerApp('Owner', '/owner/analytics');

    expect(
      await screen.findByTestId('owner-analytics-page'),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('admin-analytics')).toBeInTheDocument();
  });

  it('renders the admin ConfigurationPage inside the owner config section', async () => {
    renderOwnerApp('Owner', '/owner/config');

    expect(await screen.findByTestId('owner-config-page')).toBeInTheDocument();
    expect(
      await screen.findByTestId('admin-configuration'),
    ).toBeInTheDocument();
  });
});

describe('Owner panel — dir/lang contract preserved (R2.9, R8.4)', () => {
  it('keeps dir="rtl"/lang="fa" around the reused admin pages', async () => {
    const { container } = renderOwnerApp('Owner', '/owner/calendar');

    await screen.findByTestId('admin-calendar');

    const root = container.querySelector('.app-root');
    expect(root).toHaveAttribute('dir', 'rtl');
    expect(root).toHaveAttribute('lang', 'fa');

    // The reused admin page lives within that contract, undisturbed.
    expect(root).toContainElement(screen.getByTestId('admin-calendar'));
  });
});

describe('Owner panel — section routes mirror role-aware nav (R2.3)', () => {
  it('redirects a Stylist away from analytics to the calendar', async () => {
    renderOwnerApp('Stylist', '/owner/analytics');

    // Stylist sees calendar only — analytics redirects to the calendar.
    expect(await screen.findByTestId('admin-calendar')).toBeInTheDocument();
    expect(screen.queryByTestId('owner-analytics-page')).not.toBeInTheDocument();
  });

  it('redirects an Admin away from configuration to the calendar', async () => {
    renderOwnerApp('Admin', '/owner/config');

    // Configuration is Owner-only — an Admin is redirected to the calendar.
    expect(await screen.findByTestId('admin-calendar')).toBeInTheDocument();
    expect(screen.queryByTestId('owner-config-page')).not.toBeInTheDocument();
  });

  it('lets an Admin reach analytics', async () => {
    renderOwnerApp('Admin', '/owner/analytics');

    expect(
      await screen.findByTestId('owner-analytics-page'),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('admin-analytics')).toBeInTheDocument();
  });
});
