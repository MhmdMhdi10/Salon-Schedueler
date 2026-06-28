import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import fc from 'fast-check';
import '../../i18n';
import { CalendarPage } from './CalendarPage';
import { AnalyticsPage } from './AnalyticsPage';
import { adminApi, ApiError } from '../../api/client';

/**
 * Property 11: Data-surface lifecycle shows skeleton then the resolved state
 *
 * **Validates: Requirements 5.4, 5.5, 7.1**
 *
 * For any data surface and any async lifecycle, while the request is pending or
 * existence-of-data is undetermined the surface renders a layout-matched skeleton
 * (never a centered spinner), the empty state is shown only after the request
 * settles with no data, and on settle the skeleton is replaced by the populated,
 * empty, or error state (never both skeleton + content simultaneously).
 */

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
    adminApi: {
      getCalendar: vi.fn(),
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

/* -------------------------------------------------------------------------- */
/* Arbitraries: generate different lifecycle outcomes                          */
/* -------------------------------------------------------------------------- */

/** Generates an appointment record for the calendar. */
const arbAppointment = fc.record({
  id: fc.uuid(),
  startAt: fc.constant('2024-03-15T09:00:00Z'),
  endAt: fc.constant('2024-03-15T09:45:00Z'),
  serviceName: fc.constantFrom('Haircut', 'Color', 'Manicure', 'Beard Trim'),
  status: fc.constantFrom('confirmed', 'pending', 'cancelled'),
});

/** Generates a populated calendar response (1–5 appointments). */
const arbCalendarPopulated = fc
  .array(arbAppointment, { minLength: 1, maxLength: 5 })
  .map((appointments) => ({ appointments }));

/** Empty calendar response. */
const arbCalendarEmpty = fc.constant({ appointments: [] as unknown[] });

/** Generates the analytics response with data. */
const arbAnalyticsPopulated = fc.record({
  utilization: fc.record({
    utilization: fc.double({ min: 0.01, max: 1, noNaN: true }),
    bookedMinutes: fc.integer({ min: 1, max: 480 }),
    availableMinutes: fc.integer({ min: 1, max: 480 }),
  }),
  revenue: fc.record({
    totalRial: fc.integer({ min: 1000, max: 50000000 }),
    appointmentCount: fc.integer({ min: 1, max: 100 }),
  }),
  busiestWindows: fc
    .array(
      fc.record({
        startAt: fc.constant('2024-03-15T09:00:00Z'),
        endAt: fc.constant('2024-03-15T12:00:00Z'),
        concurrentCount: fc.integer({ min: 1, max: 20 }),
      }),
      { minLength: 1, maxLength: 3 },
    ),
});

/** Analytics response with zero data. */
const arbAnalyticsEmpty = fc.constant({
  utilization: { utilization: 0, bookedMinutes: 0, availableMinutes: 0 },
  revenue: { totalRial: 0, appointmentCount: 0 },
  busiestWindows: [] as unknown[],
});

/** API error. */
const arbApiError = fc
  .record({
    status: fc.constantFrom(400, 403, 500, 502, 503),
    code: fc.constantFrom('FORBIDDEN', 'INTERNAL', 'TIMEOUT', 'NETWORK'),
    message: fc.constantFrom('Server error', 'Not allowed', 'Timeout'),
  })
  .map(({ status, code, message }) => new ApiError(status, code, message));

/* -------------------------------------------------------------------------- */
/* CalendarPage property tests                                                 */
/* -------------------------------------------------------------------------- */

describe('Feature: signature-ui-system, Property 11: Data-surface lifecycle — CalendarPage', () => {
  it('shows skeleton while pending, never shows empty state during loading', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        cleanup();
        const d = deferred<{ appointments: unknown[] }>();
        vi.mocked(adminApi.getCalendar).mockReturnValue(d.promise);

        const { container } = render(
          <HelmetProvider>
            <MemoryRouter>
              <CalendarPage salonId="salon-prop" />
            </MemoryRouter>
          </HelmetProvider>,
        );

        // While pending: skeleton IS shown
        expect(screen.getByTestId('calendar-loading')).toBeTruthy();
        // While pending: aria-busy is true on skeleton (layout-matched, not spinner)
        expect(screen.getByTestId('calendar-loading').getAttribute('aria-busy')).toBe('true');
        // While pending: empty state is NOT shown (R5.5)
        expect(screen.queryByTestId('calendar-empty')).toBeNull();
        // While pending: error state is NOT shown
        expect(screen.queryByTestId('calendar-error')).toBeNull();
        // While pending: populated content is NOT shown
        expect(screen.queryByTestId('calendar-appointments')).toBeNull();
      }),
      { numRuns: 20 },
    );
  });

  it('replaces skeleton with populated state on success with data (never both)', async () => {
    await fc.assert(
      fc.asyncProperty(arbCalendarPopulated, async (data) => {
        cleanup();
        const d = deferred<{ appointments: unknown[] }>();
        vi.mocked(adminApi.getCalendar).mockReturnValue(d.promise);

        render(
          <HelmetProvider>
            <MemoryRouter>
              <CalendarPage salonId="salon-prop" />
            </MemoryRouter>
          </HelmetProvider>,
        );

        // Phase 1: skeleton visible
        expect(screen.getByTestId('calendar-loading')).toBeTruthy();

        // Settle with data
        d.resolve(data);

        // Phase 2: populated replaces skeleton
        await waitFor(() => expect(screen.getByTestId('calendar-appointments')).toBeTruthy());
        // Skeleton gone
        expect(screen.queryByTestId('calendar-loading')).toBeNull();
        // No empty state (there IS data)
        expect(screen.queryByTestId('calendar-empty')).toBeNull();
        // No error state
        expect(screen.queryByTestId('calendar-error')).toBeNull();
      }),
      { numRuns: 10 },
    );
  });

  it('shows empty state ONLY after settle with zero data', async () => {
    await fc.assert(
      fc.asyncProperty(arbCalendarEmpty, async (data) => {
        cleanup();
        const d = deferred<{ appointments: unknown[] }>();
        vi.mocked(adminApi.getCalendar).mockReturnValue(d.promise);

        render(
          <HelmetProvider>
            <MemoryRouter>
              <CalendarPage salonId="salon-prop" />
            </MemoryRouter>
          </HelmetProvider>,
        );

        // Phase 1: skeleton, no empty
        expect(screen.getByTestId('calendar-loading')).toBeTruthy();
        expect(screen.queryByTestId('calendar-empty')).toBeNull();

        // Settle with empty data
        d.resolve(data);

        // Phase 2: empty state shown, skeleton gone
        await waitFor(() => expect(screen.getByTestId('calendar-appointments')).toBeTruthy());
        expect(screen.getByTestId('calendar-empty')).toBeTruthy();
        expect(screen.queryByTestId('calendar-loading')).toBeNull();
        expect(screen.queryByTestId('calendar-error')).toBeNull();
      }),
      { numRuns: 10 },
    );
  });

  it('replaces skeleton with error state (with retry) on failure', async () => {
    await fc.assert(
      fc.asyncProperty(arbApiError, async (error) => {
        cleanup();
        const d = deferred<{ appointments: unknown[] }>();
        vi.mocked(adminApi.getCalendar).mockReturnValue(d.promise);

        render(
          <HelmetProvider>
            <MemoryRouter>
              <CalendarPage salonId="salon-prop" />
            </MemoryRouter>
          </HelmetProvider>,
        );

        // Phase 1: skeleton visible
        expect(screen.getByTestId('calendar-loading')).toBeTruthy();

        // Settle with error
        d.reject(error);

        // Phase 2: error state replaces skeleton
        await waitFor(() => expect(screen.getByTestId('calendar-error')).toBeTruthy());
        expect(screen.queryByTestId('calendar-loading')).toBeNull();
        expect(screen.queryByTestId('calendar-appointments')).toBeNull();
        expect(screen.queryByTestId('calendar-empty')).toBeNull();

        // Error state has a retry button (R7.3, recoverable)
        const errorEl = screen.getByTestId('calendar-error');
        const retryBtn = within(errorEl).getByRole('button');
        expect(retryBtn).toBeTruthy();
      }),
      { numRuns: 10 },
    );
  });
});

/* -------------------------------------------------------------------------- */
/* AnalyticsPage property tests                                                */
/* -------------------------------------------------------------------------- */

describe('Feature: signature-ui-system, Property 11: Data-surface lifecycle — AnalyticsPage', () => {
  it('shows skeleton while pending, never shows empty state during loading', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        cleanup();
        const d = deferred<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>();
        vi.mocked(adminApi.getAnalytics).mockReturnValue(d.promise);

        render(
          <HelmetProvider>
            <MemoryRouter>
              <AnalyticsPage salonId="salon-prop" />
            </MemoryRouter>
          </HelmetProvider>,
        );

        // While pending: skeleton IS shown (layout-matched, not spinner)
        expect(screen.getByTestId('analytics-loading')).toBeTruthy();
        expect(screen.getByTestId('analytics-loading').getAttribute('aria-busy')).toBe('true');
        // While pending: no empty, error, or populated state
        expect(screen.queryByTestId('analytics-table-empty')).toBeNull();
        expect(screen.queryByTestId('analytics-error')).toBeNull();
        expect(screen.queryByTestId('analytics-utilization')).toBeNull();
      }),
      { numRuns: 20 },
    );
  });

  it('replaces skeleton with populated state on success with data (never both)', async () => {
    await fc.assert(
      fc.asyncProperty(arbAnalyticsPopulated, async (data) => {
        cleanup();
        const d = deferred<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>();
        vi.mocked(adminApi.getAnalytics).mockReturnValue(d.promise);

        render(
          <HelmetProvider>
            <MemoryRouter>
              <AnalyticsPage salonId="salon-prop" />
            </MemoryRouter>
          </HelmetProvider>,
        );

        // Phase 1: skeleton visible
        expect(screen.getByTestId('analytics-loading')).toBeTruthy();

        // Settle with data
        d.resolve(data);

        // Phase 2: KPI cards replace skeleton
        await waitFor(() => expect(screen.getByTestId('analytics-utilization')).toBeTruthy());
        // Skeleton gone
        expect(screen.queryByTestId('analytics-loading')).toBeNull();
        // Populated state shown
        expect(screen.getByTestId('analytics-revenue')).toBeTruthy();
        expect(screen.getByTestId('analytics-busiest')).toBeTruthy();
        // No error
        expect(screen.queryByTestId('analytics-error')).toBeNull();
      }),
      { numRuns: 10 },
    );
  });

  it('shows empty table state ONLY after settle with zero busiest windows', async () => {
    await fc.assert(
      fc.asyncProperty(arbAnalyticsEmpty, async (data) => {
        cleanup();
        const d = deferred<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>();
        vi.mocked(adminApi.getAnalytics).mockReturnValue(d.promise);

        render(
          <HelmetProvider>
            <MemoryRouter>
              <AnalyticsPage salonId="salon-prop" />
            </MemoryRouter>
          </HelmetProvider>,
        );

        // Phase 1: skeleton, no empty
        expect(screen.getByTestId('analytics-loading')).toBeTruthy();
        expect(screen.queryByTestId('analytics-table-empty')).toBeNull();

        // Settle with empty data
        d.resolve(data);

        // Phase 2: empty table state visible, skeleton gone
        await waitFor(() => expect(screen.getByTestId('analytics-busiest')).toBeTruthy());
        expect(screen.getByTestId('analytics-table-empty')).toBeTruthy();
        expect(screen.queryByTestId('analytics-loading')).toBeNull();
        expect(screen.queryByTestId('analytics-error')).toBeNull();
      }),
      { numRuns: 10 },
    );
  });

  it('replaces skeleton with error state (with retry) on failure', async () => {
    await fc.assert(
      fc.asyncProperty(arbApiError, async (error) => {
        cleanup();
        const d = deferred<{ utilization: unknown; revenue: unknown; busiestWindows: unknown }>();
        vi.mocked(adminApi.getAnalytics).mockReturnValue(d.promise);

        render(
          <HelmetProvider>
            <MemoryRouter>
              <AnalyticsPage salonId="salon-prop" />
            </MemoryRouter>
          </HelmetProvider>,
        );

        // Phase 1: skeleton visible
        expect(screen.getByTestId('analytics-loading')).toBeTruthy();

        // Settle with error
        d.reject(error);

        // Phase 2: error state replaces skeleton
        await waitFor(() => expect(screen.getByTestId('analytics-error')).toBeTruthy());
        expect(screen.queryByTestId('analytics-loading')).toBeNull();
        expect(screen.queryByTestId('analytics-utilization')).toBeNull();

        // Error state has a retry button (R7.3, recoverable)
        const errorEl = screen.getByTestId('analytics-error');
        const retryBtn = within(errorEl).getByRole('button');
        expect(retryBtn).toBeTruthy();
      }),
      { numRuns: 10 },
    );
  });
});
