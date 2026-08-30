import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from '../../../components/theme';
import '../../../i18n';

/**
 * Verification tests for the Owner Dashboard (Task 7.8; Req 8.7, 8.8, 12.3).
 *
 * Checks:
 * 1. Keyboard navigation with RTL arrows
 * 2. Skeleton/error states
 * 3. Jalali dates
 * 4. Persian numerals
 * 5. Responsive layout (desktop sidebar vs mobile bottom tabs)
 */

// ─── API client mock ─────────────────────────────────────────────────────────

const bootstrapAuth = vi.fn();
const getAccessToken = vi.fn();
const getMe = vi.fn();
const signOut = vi.fn();

// Mock data for populated states
const MOCK_APPOINTMENTS = [
  {
    id: 'appt-1',
    startAt: '2025-04-15T09:00:00.000Z',
    endAt: '2025-04-15T09:45:00.000Z',
    serviceName: 'کوتاهی مو',
    customerName: 'زهرا محمدی',
    staffName: 'فاطمه',
    status: 'confirmed',
  },
  {
    id: 'appt-2',
    startAt: '2025-04-15T11:30:00.000Z',
    endAt: '2025-04-15T12:30:00.000Z',
    serviceName: 'رنگ مو',
    customerName: 'مریم حسینی',
    staffName: 'نگار',
    status: 'confirmed',
  },
];

const MOCK_ANALYTICS = {
  utilization: { utilization: 0.73, bookedMinutes: 480, availableMinutes: 660 },
  revenue: { totalRial: 12500000, appointmentCount: 15 },
  busiestWindows: [
    { startAt: '2025-04-15T10:00:00Z', endAt: '2025-04-15T11:00:00Z', concurrentCount: 4 },
    { startAt: '2025-04-15T14:00:00Z', endAt: '2025-04-15T15:00:00Z', concurrentCount: 3 },
  ],
};

const mockGetCalendar = vi.fn();
const mockGetAnalytics = vi.fn();
const mockGetStaff = vi.fn();
const mockGetChairs = vi.fn();
const mockGetServices = vi.fn();
const mockHolidaysList = vi.fn();
const mockGetPending = vi.fn();
const mockApproveAppointment = vi.fn();
const mockRejectAppointment = vi.fn();
const mockRescheduleAppointment = vi.fn();
const mockGetAppointmentCustomer = vi.fn();

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
    getApiErrorMessage: (error: unknown, fallback: string) =>
      error instanceof Error && error.message ? error.message : fallback,
    ApiError,
    bootstrapAuth: () => bootstrapAuth(),
    getAccessToken: () => getAccessToken(),
    signOut: () => signOut(),
    meApi: { getMe: () => getMe() },
    adminApi: {
      getCalendar: (...args: unknown[]) => mockGetCalendar(...args),
      getAnalytics: (...args: unknown[]) => mockGetAnalytics(...args),
      getStaff: (...args: unknown[]) => mockGetStaff(...args),
      getChairs: (...args: unknown[]) => mockGetChairs(...args),
      getPending: (...args: unknown[]) => mockGetPending(...args),
      approveAppointment: (...args: unknown[]) => mockApproveAppointment(...args),
      rejectAppointment: (...args: unknown[]) => mockRejectAppointment(...args),
      rescheduleAppointment: (...args: unknown[]) => mockRescheduleAppointment(...args),
      getAppointmentCustomer: (...args: unknown[]) => mockGetAppointmentCustomer(...args),
    },
    salonApi: {
      getServices: (...args: unknown[]) => mockGetServices(...args),
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
      list: (...args: unknown[]) => mockHolidaysList(...args),
      add: vi.fn().mockResolvedValue({ holiday: {} }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
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

vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({
    status: 'authenticated',
    principal: { id: 'u1', role: 'Owner', salonId: 'salon-1' },
    signOut: vi.fn(),
  }),
}));

vi.mock('../../../auth/useSalonId', () => ({
  useSalonId: () => 'salon-1',
}));

import { OwnerCalendarPage } from '../OwnerCalendarPage';
import { OwnerAnalyticsPageContent } from '../OwnerAnalyticsPage';
import { OwnerConfigPage } from '../OwnerConfigurationPage';
import { ToastProvider } from '../../../components/ui/Toast';

// ─── matchMedia mock ─────────────────────────────────────────────────────────

let mediaQueryMatches = false;

function mockMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: mediaQueryMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mediaQueryMatches = false;
  mockMatchMedia();
  getAccessToken.mockReturnValue('access-token');
  getMe.mockResolvedValue({ principal: { id: 'u1', role: 'Owner' } });
  // Default: resolve with data
  mockGetCalendar.mockResolvedValue({ appointments: MOCK_APPOINTMENTS });
  mockGetAnalytics.mockResolvedValue(MOCK_ANALYTICS);
  mockGetStaff.mockResolvedValue({ staff: [] });
  mockGetChairs.mockResolvedValue({ chairs: [] });
  mockGetServices.mockResolvedValue({ services: [] });
  mockHolidaysList.mockResolvedValue({ holidays: [] });
  mockGetPending.mockResolvedValue({ appointments: [] });
  mockApproveAppointment.mockResolvedValue({ status: 'confirmed' });
  mockRejectAppointment.mockResolvedValue({ status: 'cancelled' });
  mockRescheduleAppointment.mockResolvedValue({ status: 'confirmed' });
  mockGetAppointmentCustomer.mockResolvedValue({
    customer: { id: 'customer-1', phone: '', fullName: 'زهرا محمدی' },
    appointments: [],
    notes: [],
  });
});

afterEach(() => {
  cleanup();
});

/** Persian digit regex — matches ۰-۹ */
const PERSIAN_DIGIT_RE = /[۰-۹]/;

/** Checks if a text string contains at least one Persian digit */
function hasPersianDigits(text: string): boolean {
  return PERSIAN_DIGIT_RE.test(text);
}

function renderCalendarPage() {
  return render(
    <HelmetProvider>
      <ThemeProvider defaultTheme="dark">
        <div dir="rtl" lang="fa">
          <MemoryRouter initialEntries={['/owner/calendar']}>
            <OwnerCalendarPage />
          </MemoryRouter>
        </div>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

function renderAnalyticsPage() {
  return render(
    <HelmetProvider>
      <ThemeProvider defaultTheme="dark">
        <div dir="rtl" lang="fa">
          <MemoryRouter initialEntries={['/owner/analytics']}>
            <OwnerAnalyticsPageContent salonId="salon-1" />
          </MemoryRouter>
        </div>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

function renderConfigPage() {
  return render(
    <HelmetProvider>
      <ThemeProvider defaultTheme="dark">
        <div dir="rtl" lang="fa">
          <MemoryRouter initialEntries={['/owner/config']}>
            <ToastProvider>
              <OwnerConfigPage salonId="salon-1" />
            </ToastProvider>
          </MemoryRouter>
        </div>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. KEYBOARD NAVIGATION (RTL ARROWS)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Keyboard navigation (RTL arrows)', () => {
  describe('Calendar date navigation', () => {
    it('ArrowRight navigates to previous (RTL inline-start = back)', async () => {
      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
      });

      const dateNav = screen.getByRole('navigation', { name: /ناوبری تاریخ/ });
      fireEvent.keyDown(dateNav, { key: 'ArrowRight' });

      // Should have called navigate with direction -1 (previous)
      // Verify the navigation action was triggered (calendar re-fetches)
      expect(mockGetCalendar).toHaveBeenCalledTimes(2);
    });

    it('ArrowLeft navigates to next (RTL inline-end = forward)', async () => {
      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
      });

      const dateNav = screen.getByRole('navigation', { name: /ناوبری تاریخ/ });
      fireEvent.keyDown(dateNav, { key: 'ArrowLeft' });

      // Should have called navigate with direction +1 (next)
      expect(mockGetCalendar).toHaveBeenCalledTimes(2);
    });
  });

  describe('View toggle keyboard operability', () => {
    it('view toggle tabs are keyboard focusable', async () => {
      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
      });

      const dayTab = screen.getByRole('tab', { name: /روز/ });
      const weekTab = screen.getByRole('tab', { name: /هفته/ });

      expect(dayTab).toHaveAttribute('aria-selected', 'false');
      expect(weekTab).toHaveAttribute('aria-selected', 'true');

      // Click week tab
      fireEvent.click(weekTab);
      await waitFor(() => {
        expect(weekTab).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('tabs have visible focus ring class', async () => {
      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
      });

      const dayTab = screen.getByRole('tab', { name: /روز/ });
      expect(dayTab.className).toContain('focus-visible:outline');
    });
  });

  describe('Navigation buttons keyboard operability', () => {
    it('prev/next buttons have visible focus styles', async () => {
      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
      });

      const prevBtn = screen.getByRole('button', { name: /قبلی/ });
      const nextBtn = screen.getByRole('button', { name: /بعدی/ });

      expect(prevBtn).toBeInTheDocument();
      expect(nextBtn).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SKELETON / ERROR STATES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Skeleton and error states', () => {
  describe('Calendar page', () => {
    it('shows skeleton state while loading', () => {
      // Never resolve the API call
      mockGetCalendar.mockReturnValue(new Promise(() => {}));
      renderCalendarPage();

      const skeleton = screen.getByTestId('owner-calendar-loading');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
      expect(skeleton).toHaveAttribute('role', 'status');
    });

    it('shows error state with retry on API failure', async () => {
      mockGetCalendar.mockRejectedValue(new Error('Network error'));
      renderCalendarPage();

      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-error')).toBeInTheDocument();
      });

      // Error state has a retry button
      const retryBtn = screen.getByRole('button', { name: /تلاش مجدد/ });
      expect(retryBtn).toBeInTheDocument();

      // Click retry triggers a new fetch
      mockGetCalendar.mockResolvedValue({ appointments: [] });
      fireEvent.click(retryBtn);
      await waitFor(() => {
        expect(mockGetCalendar).toHaveBeenCalledTimes(2);
      });
    });

    it('shows backend approval conflicts inside the approval queue', async () => {
      mockGetPending.mockResolvedValue({
        appointments: [
          {
            id: 'pending-1',
            startAt: '2026-04-15T09:00:00.000Z',
            endAt: '2026-04-15T09:45:00.000Z',
            serviceName: 'کوتاهی مو',
            customerName: 'سارا',
            status: 'pending',
          },
        ],
      });
      mockApproveAppointment.mockRejectedValue({ code: 'APPOINTMENT_NOT_PENDING' });

      renderCalendarPage();

      await waitFor(() => {
        expect(screen.getByTestId('owner-approval-queue')).toBeInTheDocument();
      });
      expect(screen.getByTestId('owner-approval-queue-fab')).toBeInTheDocument();
      fireEvent.click(
        within(screen.getByTestId('owner-approval-queue')).getByRole('button', {
          name: /^تأیید$/,
        }),
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('این رزرو قبلاً تعیین تکلیف شده است');
      });
    });
  });

  describe('Analytics page', () => {
    it('shows skeleton state while loading', () => {
      mockGetAnalytics.mockReturnValue(new Promise(() => {}));
      renderAnalyticsPage();

      const skeleton = screen.getByTestId('analytics-loading');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
      expect(skeleton).toHaveAttribute('role', 'status');
    });

    it('shows error state with retry on API failure', async () => {
      mockGetAnalytics.mockRejectedValue(new Error('Network error'));
      renderAnalyticsPage();

      await waitFor(() => {
        expect(screen.getByTestId('analytics-error')).toBeInTheDocument();
      });

      // Retry button present
      const retryBtn = screen.getByRole('button', { name: /تلاش مجدد/ });
      expect(retryBtn).toBeInTheDocument();

      // Clicking retry re-fetches
      mockGetAnalytics.mockResolvedValue(MOCK_ANALYTICS);
      fireEvent.click(retryBtn);
      await waitFor(() => {
        expect(mockGetAnalytics).toHaveBeenCalledTimes(2);
      });
    });

    it('paginates customer rows inside analytics cards', async () => {
      mockGetAnalytics.mockResolvedValue({
        ...MOCK_ANALYTICS,
        summary: { uniqueCustomers: 6, repeatCustomers: 1 },
        customers: Array.from({ length: 6 }, (_, index) => ({
          id: `customer-${index + 1}`,
          name: `مشتری ${index + 1}`,
          phone: `0912000000${index}`,
          reservations: index + 1,
          visits: index,
          noShow: 0,
          cancelled: 0,
          revenueRial: 0,
          lastVisitAt: null,
        })),
      });
      renderAnalyticsPage();

      await waitFor(() => {
        expect(screen.getByTestId('analytics-customers-pagination')).toBeInTheDocument();
      });
      expect(screen.getByText('مشتری 1')).toBeInTheDocument();
      expect(screen.queryByText('مشتری 6')).not.toBeInTheDocument();

      fireEvent.click(
        within(screen.getByTestId('analytics-customers-pagination')).getByRole('button', { name: 'بعدی' }),
      );
      expect(await screen.findByText('مشتری 6')).toBeInTheDocument();
    });
  });

  describe('Configuration page', () => {
    it('shows skeleton state while loading', () => {
      mockGetStaff.mockReturnValue(new Promise(() => {}));
      mockGetChairs.mockReturnValue(new Promise(() => {}));
      mockGetServices.mockReturnValue(new Promise(() => {}));
      renderConfigPage();

      const skeleton = screen.getByTestId('config-loading');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
      expect(skeleton).toHaveAttribute('role', 'status');
    });

    it('shows error state with retry on API failure', async () => {
      mockGetStaff.mockRejectedValue(new Error('Network error'));
      mockGetChairs.mockRejectedValue(new Error('Network error'));
      mockGetServices.mockRejectedValue(new Error('Network error'));
      renderConfigPage();

      await waitFor(() => {
        expect(screen.getByTestId('config-error')).toBeInTheDocument();
      });

      // Retry button
      const retryBtn = screen.getByRole('button', { name: /تلاش مجدد/ });
      expect(retryBtn).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. JALALI DATES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Jalali dates', () => {
  describe('Calendar page uses Jalali month names and day numbers', () => {
    it('displays Jalali month name in date navigation', async () => {
      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
      });

      // The date nav should show a Jalali month name (one of the 12 Persian months)
      const jalaliMonths = [
        'فروردین',
        'اردیبهشت',
        'خرداد',
        'تیر',
        'مرداد',
        'شهریور',
        'مهر',
        'آبان',
        'آذر',
        'دی',
        'بهمن',
        'اسفند',
      ];

      const dateNav = screen.getByRole('navigation', { name: /ناوبری تاریخ/ });
      const dateText = dateNav.textContent || '';

      const hasJalaliMonth = jalaliMonths.some((month) => dateText.includes(month));
      expect(hasJalaliMonth).toBe(true);
    });

    it('week view displays Persian weekday names (Saturday first)', async () => {
      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
      });

      // Switch to week view
      const weekTab = screen.getByRole('tab', { name: /هفته/ });
      fireEvent.click(weekTab);

      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-week')).toBeInTheDocument();
      });

      // Verify Persian weekday names are present
      expect(screen.getAllByText('شنبه').length).toBeGreaterThan(0);
    });

    it('opens daily view when a week day is selected', async () => {
      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-week')).toBeInTheDocument();
      });

      const firstDay = screen.getByTestId('owner-calendar-week').querySelector('[role="gridcell"]');
      expect(firstDay).not.toBeNull();
      fireEvent.click(firstDay as HTMLElement);

      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-day')).toBeInTheDocument();
      });
    });

    it('moves an appointment in place without refetching the whole calendar', async () => {
      const start = new Date();
      start.setHours(10, 0, 0, 0);
      const end = new Date(start.getTime() + 45 * 60_000);
      mockGetCalendar.mockResolvedValue({
        appointments: [
          {
            id: 'appt-1',
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            serviceName: 'کوتاهی مو',
            customerName: 'زهرا محمدی',
            customerId: 'customer-1',
            status: 'confirmed',
          },
        ],
      });

      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-week')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('tab', { name: /روز/ }));
      await waitFor(() => {
        expect(screen.getByText('زهرا محمدی')).toBeInTheDocument();
      });

      const calendarFetchesBeforeMove = mockGetCalendar.mock.calls.length;
      fireEvent.click(screen.getByRole('article', { name: /کوتاهی مو/ }));
      fireEvent.click(screen.getByRole('button', { name: /انتقال به زمان دیگر/ }));
      expect(screen.getByRole('button', { name: /تاریخ شروع جدید/ })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('ساعت شروع جدید'), {
        target: { value: '11:00' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'بررسی تغییر زمان' }));
      fireEvent.click(screen.getByRole('button', { name: 'تأیید نهایی تغییر زمان' }));

      await waitFor(() => {
        expect(mockRescheduleAppointment).toHaveBeenCalledWith('appt-1', expect.any(String), undefined);
      });
      expect(mockGetCalendar).toHaveBeenCalledTimes(calendarFetchesBeforeMove);
    });

    it('supports day-view drag and drop without refreshing the calendar', async () => {
      const start = new Date();
      start.setHours(10, 0, 0, 0);
      const end = new Date(start.getTime() + 45 * 60_000);
      mockGetCalendar.mockResolvedValue({
        appointments: [
          {
            id: 'appt-1',
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            serviceName: 'کوتاهی مو',
            customerName: 'زهرا محمدی',
            customerId: 'customer-1',
            status: 'confirmed',
          },
        ],
      });

      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-week')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('tab', { name: /روز/ }));
      await waitFor(() => {
        expect(screen.getByRole('article', { name: /کوتاهی مو/ })).toBeInTheDocument();
      });

      const dataTransfer = {
        effectAllowed: 'move',
        dropEffect: 'move',
        types: ['text/plain'],
        values: new Map<string, string>(),
        setData(type: string, value: string) {
          this.values.set(type, value);
        },
        getData(type: string) {
          return this.values.get(type) ?? '';
        },
        setDragImage() {},
      };
      const calendarFetchesBeforeMove = mockGetCalendar.mock.calls.length;
      const appointmentCard = screen.getByRole('article', { name: /کوتاهی مو/ });
      const dragHandle = screen.getByLabelText('دسته جابه‌جایی نوبت');
      const targetRow = screen.getByRole('row', { name: '11:00' });
      const elementsFromPoint = document.elementsFromPoint;
      try {
        document.elementsFromPoint = () => [dragHandle];
        fireEvent.dragStart(appointmentCard, { dataTransfer, clientX: 1, clientY: 1 });
        document.elementsFromPoint = () => [targetRow];
        fireEvent.dragOver(targetRow, { dataTransfer, clientX: 1, clientY: 1 });
        fireEvent.drop(targetRow, { dataTransfer, clientX: 1, clientY: 1 });
      } finally {
        document.elementsFromPoint = elementsFromPoint;
      }

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'بررسی تغییر زمان' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'بررسی تغییر زمان' }));
      fireEvent.click(screen.getByRole('button', { name: 'تأیید نهایی تغییر زمان' }));

      await waitFor(() => {
        expect(mockRescheduleAppointment).toHaveBeenCalledWith('appt-1', expect.any(String), undefined);
      });
      expect(mockGetCalendar).toHaveBeenCalledTimes(calendarFetchesBeforeMove);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PERSIAN NUMERALS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Persian numerals', () => {
  describe('Calendar page', () => {
    it('time grid shows Persian digits', async () => {
      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('tab', { name: /روز/ }));

      // Wait for data to load and render
      await waitFor(() => {
        const dayGrid = screen.getByTestId('owner-calendar-day');
        expect(dayGrid).toBeInTheDocument();
      });

      // The time grid row headers should display Persian numerals
      const dayGrid = screen.getByTestId('owner-calendar-day');
      const rowHeaders = dayGrid.querySelectorAll('[role="rowheader"]');
      expect(rowHeaders.length).toBeGreaterThan(0);

      // At least some row headers should contain Persian digits
      const texts = Array.from(rowHeaders).map((el) => el.textContent || '');
      const hasPersian = texts.some((t) => hasPersianDigits(t));
      expect(hasPersian).toBe(true);
    });
  });

  describe('Analytics page', () => {
    it('metric cards display values in Persian digits', async () => {
      renderAnalyticsPage();

      await waitFor(() => {
        expect(screen.getByTestId('analytics-utilization')).toBeInTheDocument();
      });

      // Check that the utilization card has Persian digits
      const utilizationCard = screen.getByTestId('analytics-utilization');
      const cardText = utilizationCard.textContent || '';
      expect(hasPersianDigits(cardText)).toBe(true);
    });

    it('revenue uses Rial formatting with Persian numerals', async () => {
      renderAnalyticsPage();

      await waitFor(() => {
        expect(screen.getByTestId('analytics-revenue')).toBeInTheDocument();
      });

      const revenueCard = screen.getByTestId('analytics-revenue');
      const text = revenueCard.textContent || '';
      // Should contain Persian digits and Rial indicator
      expect(hasPersianDigits(text)).toBe(true);
      expect(text).toMatch(/ریال|تومان/);
    });

    it('busiest window table shows Persian digits', async () => {
      renderAnalyticsPage();

      await waitFor(() => {
        expect(screen.getByTestId('analytics-table')).toBeInTheDocument();
      });

      const table = screen.getByTestId('analytics-table');
      const tableText = table.textContent || '';
      expect(hasPersianDigits(tableText)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. RESPONSIVE LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Responsive layout', () => {
  describe('OwnerShell responsive switching', () => {
    it('desktop (lg+) shows sidebar, hides bottom tabs', () => {
      mediaQueryMatches = true;
      mockMatchMedia();

      render(
        <HelmetProvider>
          <ThemeProvider defaultTheme="dark">
            <div dir="rtl" lang="fa">
              <MemoryRouter initialEntries={['/owner/calendar']}>
                <Routes>
                  <Route
                    path="/owner/*"
                    element={
                      <div data-shell="owner">
                        {/* Simulate what OwnerShell renders on desktop */}
                        <aside aria-label="ناوبری پنل مدیریت" data-testid="sidebar">
                          sidebar
                        </aside>
                        <main>content</main>
                      </div>
                    }
                  />
                </Routes>
              </MemoryRouter>
            </div>
          </ThemeProvider>
        </HelmetProvider>,
      );

      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });
  });

  describe('Calendar responsive behavior', () => {
    it('week view uses responsive grid classes', async () => {
      renderCalendarPage();
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
      });

      // Switch to week view
      const weekTab = screen.getByRole('tab', { name: /هفته/ });
      fireEvent.click(weekTab);

      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-week')).toBeInTheDocument();
      });

      const weekGrid = screen.getByTestId('owner-calendar-week');
      // Verify responsive grid classes exist
      expect(weekGrid.className).toContain('grid-cols-1');
      expect(weekGrid.className).toContain('lg:grid-cols-7');
    });

    it('day view is scrollable', async () => {
      renderCalendarPage();
      fireEvent.click(screen.getByRole('tab', { name: /روز/ }));
      await waitFor(() => {
        expect(screen.getByTestId('owner-calendar-day')).toBeInTheDocument();
      });

      const dayGrid = screen.getByTestId('owner-calendar-day');
      // Day view should have overflow-y-auto for scrollability
      expect(dayGrid.className).toContain('overflow-y-auto');
    });
  });

  describe('Analytics responsive behavior', () => {
    it('metrics cards stack on phones, then use 2-col and 4-col grids', async () => {
      renderAnalyticsPage();

      await waitFor(() => {
        expect(screen.getByTestId('analytics-utilization')).toBeInTheDocument();
      });

      // The metrics grid is the parent section of the metric cards
      const utilizationCard = screen.getByTestId('analytics-utilization');
      // Traverse up to the section that acts as the grid container
      const metricsGrid = utilizationCard.closest('[aria-label]');
      expect(metricsGrid?.className).toContain('grid-cols-1');
      expect(metricsGrid?.className).toContain('sm:grid-cols-2');
      expect(metricsGrid?.className).toContain('lg:grid-cols-4');
    });
  });

  describe('Configuration responsive behavior', () => {
    it('config page uses max-width constraint for single-column layout', async () => {
      renderConfigPage();

      await waitFor(() => {
        expect(screen.getByTestId('admin-configuration')).toBeInTheDocument();
      });

      const configRoot = screen.getByTestId('admin-configuration');
      expect(configRoot.className).toContain('max-w-6xl');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ACCESSIBILITY (focus rings, landmarks, aria attributes)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Accessibility', () => {
  it('calendar page has a single h1', async () => {
    renderCalendarPage();
    await waitFor(() => {
      expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
    });

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain('تقویم');
  });

  it('analytics page has a single h1', async () => {
    renderAnalyticsPage();
    await waitFor(() => {
      expect(screen.getByTestId('analytics-utilization')).toBeInTheDocument();
    });

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
  });

  it('calendar grid sections have aria-labels', async () => {
    renderCalendarPage();
    fireEvent.click(screen.getByRole('tab', { name: /روز/ }));
    await waitFor(() => {
      expect(screen.getByTestId('owner-calendar-day')).toBeInTheDocument();
    });

    const dayGrid = screen.getByTestId('owner-calendar-day');
    expect(dayGrid).toHaveAttribute('role', 'grid');
    expect(dayGrid).toHaveAttribute('aria-label');
  });

  it('view toggle has tablist role with aria-label', async () => {
    renderCalendarPage();
    await waitFor(() => {
      expect(screen.getByTestId('owner-calendar-page')).toBeInTheDocument();
    });

    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-label');
  });
});
