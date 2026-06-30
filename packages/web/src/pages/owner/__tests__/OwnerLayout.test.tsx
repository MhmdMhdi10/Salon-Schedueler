import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '../../../components/theme';
import '../../../i18n';

/**
 * Tests for the owner panel layout / auth guard (task 5.1; R2.1, R2.2, R2.3).
 *
 * They cover the auth bootstrap (a stored refresh token restores a session on
 * load so a refresh keeps the owner signed in), the RBAC handoff (the role from
 * `GET /me` drives the panel), the redirect to the OTP login when no session can
 * be restored, and sign-out (clears tokens + returns to `/auth`).
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
    // The owner sections now reuse the admin pages (task 5.2), which read the
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
  };
});

import { OwnerLayout } from '../OwnerLayout';
import { AuthProvider } from '../../../auth/AuthContext';
import { HeaderAuthNav } from '../../../components/layout/HeaderAuthNav';
import {
  OwnerCalendarPage,
  OwnerConfigurationPage,
} from '..';

function renderOwnerApp(initialPath = '/owner/calendar') {
  return render(
    <HelmetProvider>
      <ThemeProvider defaultTheme="light">
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/owner" element={<OwnerLayout />}>
              <Route path="calendar" element={<OwnerCalendarPage />} />
              <Route path="config" element={<OwnerConfigurationPage />} />
            </Route>
            <Route path="/auth" element={<div data-testid="auth-surface">ورود</div>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

function robotsContent(): string | null {
  return (
    document.head
      .querySelector('meta[name="robots"]')
      ?.getAttribute('content') ?? null
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('OwnerLayout — auth bootstrap (R2.2)', () => {
  it('restores a session from the stored refresh token and renders the panel', async () => {
    // No in-memory access token, but the stored refresh token bootstraps one.
    getAccessToken.mockReturnValue(null);
    bootstrapAuth.mockResolvedValue(true);
    getMe.mockResolvedValue({ principal: { id: 'u1', role: 'Owner' } });

    renderOwnerApp();

    expect(await screen.findByTestId('owner-calendar-page')).toBeInTheDocument();
    expect(bootstrapAuth).toHaveBeenCalledTimes(1);
    // The owner area is private — never indexed.
    await waitFor(() => expect(robotsContent()).toBe('noindex,follow'));
  });

  it('reuses an in-memory access token without re-bootstrapping', async () => {
    getAccessToken.mockReturnValue('access-token');
    getMe.mockResolvedValue({ principal: { id: 'u1', role: 'Admin' } });

    renderOwnerApp();

    expect(await screen.findByTestId('owner-calendar-page')).toBeInTheDocument();
    expect(bootstrapAuth).not.toHaveBeenCalled();
  });

  it('redirects to the OTP login when no session can be restored', async () => {
    getAccessToken.mockReturnValue(null);
    bootstrapAuth.mockResolvedValue(false);

    renderOwnerApp();

    expect(await screen.findByTestId('auth-surface')).toBeInTheDocument();
    expect(getMe).not.toHaveBeenCalled();
  });

  it('clears the session and redirects when /me rejects (stale token)', async () => {
    getAccessToken.mockReturnValue('stale-token');
    getMe.mockRejectedValue(new Error('401'));

    renderOwnerApp();

    expect(await screen.findByTestId('auth-surface')).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('OwnerLayout — RBAC (R2.3)', () => {
  it('gives an Owner the full panel navigation', async () => {
    getAccessToken.mockReturnValue('t');
    getMe.mockResolvedValue({ principal: { id: 'u1', role: 'Owner' } });

    renderOwnerApp();

    await screen.findByTestId('owner-calendar-page');
    expect(
      screen.getAllByRole('link', { name: 'تنظیمات سالن' }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('limits a Stylist to the own-appointments view', async () => {
    getAccessToken.mockReturnValue('t');
    getMe.mockResolvedValue({ principal: { id: 'u1', role: 'Stylist' } });

    renderOwnerApp();

    await screen.findByTestId('owner-calendar-page');
    expect(
      screen.queryByRole('link', { name: 'تنظیمات سالن' }),
    ).not.toBeInTheDocument();
  });
});

describe('OwnerLayout — sign-out', () => {
  it('clears the app-wide session so the shared header shows signed-out', async () => {
    getAccessToken.mockReturnValue('t');
    getMe.mockResolvedValue({ principal: { id: 'u1', role: 'Owner' } });

    // Render inside a real AuthProvider with the app-shell header mounted at the
    // sign-out destination. Regression for the bug where the owner sign-out
    // dropped the tokens but not the AuthContext, so the header kept showing
    // «خروج» / the account nav. The sign-out must flip the shared state so the
    // header that reads `useAuth()` renders the signed-out «ورود» link instead.
    render(
      <HelmetProvider>
        <ThemeProvider defaultTheme="light">
          <MemoryRouter initialEntries={['/owner/calendar']}>
            <AuthProvider>
              <Routes>
                <Route path="/owner" element={<OwnerLayout />}>
                  <Route
                    path="calendar"
                    element={<div data-testid="owner-calendar-stub" />}
                  />
                </Route>
                <Route path="/auth" element={<HeaderAuthNav />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </ThemeProvider>
      </HelmetProvider>,
    );

    // The owner shell (and its sign-out control) renders once the session
    // resolves; a lightweight stub stands in for the heavy calendar page.
    fireEvent.click(await screen.findByTestId('owner-sign-out'));

    // The shared header now reflects the signed-out state: the «ورود» link is
    // shown and the «خروج» control is gone.
    expect(await screen.findByTestId('header-sign-in')).toBeInTheDocument();
    expect(screen.queryByTestId('header-sign-out')).not.toBeInTheDocument();
    // Token clearing still happens (via AuthContext.signOut → api signOut).
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
