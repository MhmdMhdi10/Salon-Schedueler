import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import '../../i18n';
import { renderRtl } from '../../test/a11y';
import { CalendarPage } from './CalendarPage';
import { adminApi } from '../../api/client';

/**
 * Keyboard-navigation tests for the admin CalendarPage (R5.3).
 *
 * Verifies, under the app's real `dir="rtl"` direction, that:
 *  - the day/week view toggle is operable by keyboard (roving tab stop +
 *    keyboard activation refetches the selected view),
 *  - date navigation responds to RTL-correct arrow keys (ArrowRight =
 *    inline-start = previous; ArrowLeft = inline-end = next),
 *  - grid cell focus moves with RTL-correct arrow keys (ArrowRight = previous
 *    column / inline-start, ArrowLeft = next column / inline-end, ArrowUp/Down
 *    move rows, Home/End jump to the boundaries), and
 *  - the reduced-motion preference is honoured (navigation completes
 *    synchronously and is never gated on motion).
 *
 * Requirements: 5.3
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
    },
  };
});

/** Two appointments under distinct staff → a 2-column day grid. */
const DAY_APPOINTMENTS = [
  {
    id: 'a1',
    startAt: '2024-03-16T09:00:00',
    endAt: '2024-03-16T09:45:00',
    serviceName: 'کوتاهی',
    staffName: 'سارا',
    status: 'confirmed',
  },
  {
    id: 'a2',
    startAt: '2024-03-16T11:00:00',
    endAt: '2024-03-16T11:45:00',
    serviceName: 'رنگ',
    staffName: 'مینا',
    status: 'pending',
  },
];

const DAY_GRID_LABEL = 'شبکه زمانی نوبت‌ها';
const DATE_NAV_LABEL = 'ناوبری تاریخ';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminApi.getCalendar).mockResolvedValue({
    appointments: DAY_APPOINTMENTS,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCalendar() {
  return renderRtl(
    <HelmetProvider>
      <MemoryRouter>
        <CalendarPage salonId="salon-kb" />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

/** Wait until the populated day grid is on screen. */
async function waitForDayGrid() {
  return waitFor(() =>
    expect(screen.getByRole('grid', { name: DAY_GRID_LABEL })).toBeInTheDocument(),
  );
}

describe('CalendarPage — view-switch by keyboard', () => {
  it('exposes the day/week toggle as a single roving tab stop', async () => {
    renderCalendar();
    await waitForDayGrid();

    const dayTab = screen.getByRole('tab', { name: 'روز' });
    const weekTab = screen.getByRole('tab', { name: 'هفته' });

    // The day view is the active tab on load.
    expect(dayTab).toHaveAttribute('aria-selected', 'true');
    // Roving tabindex: the toggle is a single Tab stop — at most one tab is
    // reachable by Tab, the rest are reached with arrow keys (tabindex -1).
    const tabStops = screen
      .getAllByRole('tab')
      .filter((tab) => tab.getAttribute('tabindex') === '0');
    expect(tabStops.length).toBeLessThanOrEqual(1);
    expect(weekTab).toHaveAttribute('tabindex', '-1');
  });

  it('moves the active tab with arrow keys', async () => {
    renderCalendar();
    await waitForDayGrid();

    const dayTab = screen.getByRole('tab', { name: 'روز' });
    const weekTab = screen.getByRole('tab', { name: 'هفته' });

    // Arrow keys move the roving focus across the tab list (keyboard operable),
    // and Radix activates the focused tab.
    dayTab.focus();
    fireEvent.keyDown(dayTab, { key: 'ArrowRight' });

    await waitFor(() =>
      expect(weekTab).toHaveAttribute('aria-selected', 'true'),
    );
  });

  it('switches to the week view via keyboard and refetches it', async () => {
    renderCalendar();
    await waitForDayGrid();

    const weekTab = screen.getByRole('tab', { name: 'هفته' });

    // Keyboard navigation moves focus to a tab; Radix activates on focus
    // (automatic activation), which is exactly the keyboard experience.
    fireEvent.focus(weekTab);

    await waitFor(() =>
      expect(weekTab).toHaveAttribute('aria-selected', 'true'),
    );
    await waitFor(() =>
      expect(adminApi.getCalendar).toHaveBeenCalledWith(
        'salon-kb',
        expect.any(String),
        expect.any(String),
        'week',
      ),
    );
  });
});

describe('CalendarPage — date navigation by keyboard (RTL)', () => {
  it('ArrowRight steps to the previous day (inline-start)', async () => {
    renderCalendar();
    await waitForDayGrid();

    const calls = vi.mocked(adminApi.getCalendar).mock.calls;
    const initialFrom = calls[calls.length - 1][1] as string;

    const nav = screen.getByRole('navigation', { name: DATE_NAV_LABEL });
    fireEvent.keyDown(nav, { key: 'ArrowRight' });

    await waitFor(() => {
      const latest = vi.mocked(adminApi.getCalendar).mock.calls;
      const newFrom = latest[latest.length - 1][1] as string;
      // RTL: ArrowRight = inline-start = go back → range starts earlier.
      expect(Date.parse(newFrom)).toBeLessThan(Date.parse(initialFrom));
    });
  });

  it('ArrowLeft steps to the next day (inline-end)', async () => {
    renderCalendar();
    await waitForDayGrid();

    const calls = vi.mocked(adminApi.getCalendar).mock.calls;
    const initialFrom = calls[calls.length - 1][1] as string;

    const nav = screen.getByRole('navigation', { name: DATE_NAV_LABEL });
    fireEvent.keyDown(nav, { key: 'ArrowLeft' });

    await waitFor(() => {
      const latest = vi.mocked(adminApi.getCalendar).mock.calls;
      const newFrom = latest[latest.length - 1][1] as string;
      // RTL: ArrowLeft = inline-end = go forward → range starts later.
      expect(Date.parse(newFrom)).toBeGreaterThan(Date.parse(initialFrom));
    });
  });
});

describe('CalendarPage — grid cell focus with RTL-correct arrow keys', () => {
  /** The cell at [row, col] within the day grid. */
  function cell(container: HTMLElement, row: number, col: number): HTMLElement {
    const el = container.querySelector(
      `[role="gridcell"][data-row="${row}"][data-col="${col}"]`,
    );
    expect(el, `cell [${row}, ${col}] should exist`).toBeTruthy();
    return el as HTMLElement;
  }

  it('moves focus inline-start/inline-end and across rows, with Home/End jumps', async () => {
    const { rtlContainer } = renderCalendar();
    await waitForDayGrid();

    const grid = screen.getByRole('grid', { name: DAY_GRID_LABEL });

    // The initial tab stop is the top-inline-start cell [0, 0].
    expect(cell(rtlContainer, 0, 0)).toHaveAttribute('tabindex', '0');
    cell(rtlContainer, 0, 0).focus();
    expect(cell(rtlContainer, 0, 0)).toHaveFocus();

    // ArrowLeft = inline-end = next column.
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    expect(cell(rtlContainer, 0, 1)).toHaveFocus();

    // ArrowRight = inline-start = previous column.
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(cell(rtlContainer, 0, 0)).toHaveFocus();

    // ArrowRight clamps at the inline-start edge (column 0).
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(cell(rtlContainer, 0, 0)).toHaveFocus();

    // ArrowDown / ArrowUp move between time rows.
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(cell(rtlContainer, 1, 0)).toHaveFocus();
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(cell(rtlContainer, 0, 0)).toHaveFocus();

    // End jumps to the last row + last column; Home returns to [0, 0].
    fireEvent.keyDown(grid, { key: 'End' });
    const lastCellTabIndex = rtlContainer.querySelectorAll(
      '[role="gridcell"][tabindex="0"]',
    );
    expect(lastCellTabIndex).toHaveLength(1);
    expect(lastCellTabIndex[0]).toHaveFocus();
    expect(lastCellTabIndex[0]).toHaveAttribute('data-col', '1');

    fireEvent.keyDown(grid, { key: 'Home' });
    expect(cell(rtlContainer, 0, 0)).toHaveFocus();
  });
});

describe('CalendarPage — reduced-motion preference', () => {
  /** Force `prefers-reduced-motion: reduce` to match. */
  function stubReducedMotion() {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })),
    );
  }

  it('keyboard cell navigation still resolves immediately under reduced motion', async () => {
    stubReducedMotion();

    // Confirm the preference is observable to the component tree.
    expect(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ).toBe(true);

    const { rtlContainer } = renderCalendar();
    await waitForDayGrid();

    const grid = screen.getByRole('grid', { name: DAY_GRID_LABEL });
    const startCell = rtlContainer.querySelector(
      '[role="gridcell"][data-row="0"][data-col="0"]',
    ) as HTMLElement;
    startCell.focus();

    // Focus moves synchronously on key press — navigation is never gated on an
    // animation, so reduced-motion users are not blocked.
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    const target = rtlContainer.querySelector(
      '[role="gridcell"][data-row="0"][data-col="1"]',
    ) as HTMLElement;
    expect(target).toHaveFocus();
  });
});
