import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import { AnalyticsPage } from './AnalyticsPage';
import { adminApi, ApiError } from '../../api/client';

/**
 * Component tests for the admin AnalyticsPage.
 * Verifies utilization/revenue/busiest-window figures are fetched via the
 * analytics endpoint and rendered, with loading/error states.
 * Requirements: 7.3, 7.5
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
  it('shows loading then renders utilization, revenue, and busiest windows', async () => {
    const analyticsD = deferred<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>();
    vi.mocked(adminApi.getAnalytics).mockReturnValue(analyticsD.promise);

    render(
      <MemoryRouter>
        <AnalyticsPage salonId="salon-3" />
      </MemoryRouter>
    );

    expect(screen.getByTestId('analytics-loading')).toBeTruthy();
    expect(adminApi.getAnalytics).toHaveBeenCalledWith(
      'salon-3',
      expect.any(String),
      expect.any(String)
    );

    analyticsD.resolve({
      utilization: { chair: 0.82, staff: 0.61 },
      revenue: 1234000,
      busiestWindows: [{ window: '09:00-12:00', count: 12 }],
    });

    await waitFor(() => expect(screen.getByTestId('analytics-utilization')).toBeTruthy());
    expect(screen.getByTestId('analytics-revenue')).toBeTruthy();
    expect(screen.getByTestId('analytics-busiest')).toBeTruthy();
    expect(screen.getByText('0.82')).toBeTruthy();
    expect(screen.getByText('1234000')).toBeTruthy();
  });

  it('shows an error state when analytics fails to load', async () => {
    const analyticsD = deferred<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>();
    vi.mocked(adminApi.getAnalytics).mockReturnValue(analyticsD.promise);

    render(
      <MemoryRouter>
        <AnalyticsPage salonId="salon-3" />
      </MemoryRouter>
    );

    expect(screen.getByTestId('analytics-loading')).toBeTruthy();

    analyticsD.reject(new ApiError(403, 'FORBIDDEN', 'Owner only'));

    await waitFor(() => expect(screen.getByTestId('analytics-error')).toBeTruthy());
    expect(screen.getByText('Owner only')).toBeTruthy();
  });
});
