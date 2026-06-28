import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { AnalyticsPage } from './AnalyticsPage';
import { adminApi, ApiError } from '../../api/client';

/**
 * Component tests for the admin AnalyticsPage.
 *
 * Verifies the redesigned dashboard fetches utilization/revenue/busiest-window
 * figures via the analytics endpoint (wire contract unchanged) and renders them
 * as KPI cards + a busiest-windows table, with loading and error states. The
 * `admin-analytics` root testID and the `analytics-*` figure/state testIDs are
 * preserved so existing hooks stay green.
 *
 * Requirements: 5.3, 5.4, 7.5, 2.3
 */

vi.mock('../../api/client', () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return {
    ApiError,
    adminApi: {
      getAnalytics: vi.fn(),
    },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('AnalyticsPage', () => {
  it('shows loading then renders utilization, revenue, and busiest-window KPI cards', async () => {
    const analyticsD = deferred<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>();
    vi.mocked(adminApi.getAnalytics).mockReturnValue(analyticsD.promise);

    render(
      <HelmetProvider>
        <MemoryRouter>
          <AnalyticsPage salonId="salon-3" />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByTestId('analytics-loading')).toBeTruthy();
    expect(adminApi.getAnalytics).toHaveBeenCalledWith(
      'salon-3',
      expect.any(String),
      expect.any(String)
    );

    // The wire contract: utilization report, revenue { totalRial, count },
    // busiestWindows[]. The page localizes these for display only.
    analyticsD.resolve({
      utilization: { utilization: 0.82, bookedMinutes: 100, availableMinutes: 122 },
      revenue: { totalRial: 1234000, appointmentCount: 7 },
      busiestWindows: [
        { startAt: '2024-03-15T09:00:00Z', endAt: '2024-03-15T12:00:00Z', concurrentCount: 12 },
      ],
    });

    await waitFor(() => expect(screen.getByTestId('analytics-utilization')).toBeTruthy());
    expect(screen.getByTestId('analytics-revenue')).toBeTruthy();
    expect(screen.getByTestId('analytics-busiest')).toBeTruthy();

    // Utilization renders as a Persian-digit percentage (0.82 → ۸۲٪).
    expect(screen.getByTestId('analytics-utilization').textContent).toContain('۸۲');
    // Revenue renders as grouped Persian-digit Rial (1234000 → ۱٬۲۳۴٬۰۰۰).
    expect(screen.getByTestId('analytics-revenue').textContent).toContain('۱٬۲۳۴٬۰۰۰');
    // The busiest-windows table renders the numeric concurrent-count column.
    expect(screen.getByTestId('analytics-table')).toBeTruthy();
    expect(screen.getByTestId('analytics-table').textContent).toContain('۱۲');
  });

  it('renders empty figures and an empty table when there is no data', async () => {
    const analyticsD = deferred<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>();
    vi.mocked(adminApi.getAnalytics).mockReturnValue(analyticsD.promise);

    render(
      <HelmetProvider>
        <MemoryRouter>
          <AnalyticsPage salonId="salon-3" />
        </MemoryRouter>
      </HelmetProvider>
    );

    analyticsD.resolve({
      utilization: { utilization: 0, bookedMinutes: 0, availableMinutes: 0 },
      revenue: { totalRial: 0, appointmentCount: 0 },
      busiestWindows: [],
    });

    await waitFor(() => expect(screen.getByTestId('analytics-busiest')).toBeTruthy());
    expect(screen.getByTestId('analytics-table-empty')).toBeTruthy();
  });

  it('shows an error state when analytics fails to load', async () => {
    const analyticsD = deferred<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>();
    vi.mocked(adminApi.getAnalytics).mockReturnValue(analyticsD.promise);

    render(
      <HelmetProvider>
        <MemoryRouter>
          <AnalyticsPage salonId="salon-3" />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByTestId('analytics-loading')).toBeTruthy();

    analyticsD.reject(new ApiError(403, 'FORBIDDEN', 'Owner only'));

    await waitFor(() => expect(screen.getByTestId('analytics-error')).toBeTruthy());
    // R5.6: error description is a user-friendly Persian message, never raw API codes
    expect(screen.getByTestId('analytics-error').textContent).toContain('اتصال به سرور برقرار نشد');
  });
});
