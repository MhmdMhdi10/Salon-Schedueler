import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import fc from 'fast-check';
import i18n from '../../i18n';
import { AnalyticsPage } from './AnalyticsPage';
import { adminApi } from '../../api/client';

/**
 * Property 13: Every metric has a non-color-only equivalent
 *
 * **Validates: Requirements 5.2**
 *
 * For any analytics dataset rendered, every metric/visualization is accompanied
 * by a labeled text or table equivalent, so no metric is conveyed by color alone:
 *
 *  1. Each KPI metric (utilization, revenue, busiest window) carries a visible
 *     text label AND a visible text value — not just a colored swatch.
 *  2. The busiest-windows chart is paired with an accessible table equivalent
 *     that lists every window with its text label and numeric count.
 *  3. The chart links to that table via `aria-describedby`, so assistive tech
 *     can reach the non-visual equivalent.
 *  4. Each bar in the chart carries a visible text label (window name) and a
 *     visible numeric value (the count) plus an accessible group label — the
 *     bar's meaning never depends on its fill color.
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
      getAnalytics: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

/* -------------------------------------------------------------------------- */
/* Arbitraries: generate arbitrary, populated analytics datasets               */
/* -------------------------------------------------------------------------- */

/** A busiest-window record with a valid, schedulable time range. */
const arbWindow = fc.record({
  startAt: fc.constantFrom(
    '2024-03-15T08:00:00Z',
    '2024-03-15T09:00:00Z',
    '2024-03-15T13:30:00Z',
    '2024-03-15T17:00:00Z',
  ),
  endAt: fc.constantFrom(
    '2024-03-15T11:00:00Z',
    '2024-03-15T12:30:00Z',
    '2024-03-15T16:00:00Z',
    '2024-03-15T20:00:00Z',
  ),
  // >= 1 so the window is a real, non-empty data point.
  concurrentCount: fc.integer({ min: 1, max: 40 }),
});

/**
 * A populated analytics dataset: a real utilization ratio, real revenue, and at
 * least one busiest window (so the chart + table render). Values vary widely so
 * the property holds across the whole input space, not just a happy example.
 */
const arbAnalyticsDataset = fc.record({
  utilization: fc.record({
    utilization: fc.double({ min: 0.01, max: 1, noNaN: true }),
    bookedMinutes: fc.integer({ min: 1, max: 480 }),
    availableMinutes: fc.integer({ min: 1, max: 480 }),
  }),
  revenue: fc.record({
    totalRial: fc.integer({ min: 1000, max: 90000000 }),
    appointmentCount: fc.integer({ min: 1, max: 200 }),
  }),
  busiestWindows: fc.array(arbWindow, { minLength: 1, maxLength: 6 }),
});

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <AnalyticsPage salonId="salon-prop" />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

/** Text label of a metric card must be present and the figure non-empty. */
function expectLabeledMetric(testId: string, label: string) {
  const card = screen.getByTestId(testId);
  // (1a) The metric carries a visible TEXT LABEL (not color alone).
  expect(card.textContent).toContain(label);
  // (1b) The metric carries a visible TEXT VALUE (the big figure paragraph),
  //      so meaning is encoded as text, never by color.
  const figure = card.querySelector('.tabular-nums');
  expect(figure).not.toBeNull();
  expect(figure!.textContent!.trim().length).toBeGreaterThan(0);
}

/* -------------------------------------------------------------------------- */
/* Property                                                                    */
/* -------------------------------------------------------------------------- */

describe('Feature: signature-ui-system, Property 13: Every metric has a non-color-only equivalent', () => {
  it('renders a labeled text/table equivalent for every metric across arbitrary datasets', async () => {
    await fc.assert(
      fc.asyncProperty(arbAnalyticsDataset, async (dataset) => {
        cleanup();
        vi.mocked(adminApi.getAnalytics).mockResolvedValue(dataset);

        renderPage();

        // Wait for the populated state (KPI cards) to replace the skeleton.
        await waitFor(() =>
          expect(screen.getByTestId('analytics-utilization')).toBeTruthy(),
        );

        /* --- (1) Each KPI metric has a text label + text value --- */
        expectLabeledMetric(
          'analytics-utilization',
          i18n.t('admin.analyticsPage.kpi.utilizationTitle'),
        );
        expectLabeledMetric(
          'analytics-revenue',
          i18n.t('admin.analyticsPage.kpi.revenueTitle'),
        );
        expectLabeledMetric(
          'analytics-busiest',
          i18n.t('admin.analyticsPage.kpi.busiestTitle'),
        );

        /* --- (2) An accessible TABLE equivalent exists for the chart data --- */
        const table = screen.getByTestId('analytics-table');
        // The table carries the same data as the chart: one labeled row per
        // window, each with a text window-label cell + a numeric count cell.
        const rows = table.querySelectorAll('tbody tr');
        expect(rows.length).toBe(dataset.busiestWindows.length);
        rows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          expect(cells.length).toBe(2);
          // Window label cell (text) is non-empty.
          expect(cells[0].textContent!.trim().length).toBeGreaterThan(0);
          // Concurrent-count cell (numeric text) is non-empty.
          expect(cells[1].textContent!.trim().length).toBeGreaterThan(0);
        });

        /* --- (3) The chart links to the table via aria-describedby --- */
        const chart = await screen.findByRole('img', {
          name: i18n.t('admin.analyticsPage.chart.label'),
        });
        expect(chart.getAttribute('aria-describedby')).toBe(
          'analytics-busiest-table',
        );
        // The referenced table actually exists in the document.
        expect(document.getElementById('analytics-busiest-table')).not.toBeNull();

        /* --- (4) Each bar carries a text label + numeric value (not color) --- */
        const bars = within(chart).getAllByRole('group');
        expect(bars.length).toBe(dataset.busiestWindows.length);
        bars.forEach((bar) => {
          // Accessible label combining window + count (non-color encoding).
          const ariaLabel = bar.getAttribute('aria-label');
          expect(ariaLabel).toBeTruthy();
          expect(ariaLabel!.trim().length).toBeGreaterThan(0);
          // Visible text content (window label + numeric value) is present.
          expect(bar.textContent!.trim().length).toBeGreaterThan(0);
        });
      }),
      { numRuns: 15 },
    );
  });
});
